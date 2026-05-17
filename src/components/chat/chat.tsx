'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { ExampleChips } from './example-chips'
import { Message, type ChatMessage, type ToolCall } from './message'
import { execTool } from '@/lib/exec-tools'
import { useAuth } from '@/lib/use-auth'
import { AuthGate } from '@/components/auth/auth-gate'
import { useTxExecutor } from '@/lib/tx-executor'
import { WalletPill } from '@/components/sidebar/wallet-pill'
import { NetworkSwitcher } from '@/components/sidebar/network-switcher'

interface ApiMessage {
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
  name?: string
}

interface PendingToolCall {
  id: string
  name: string
  input: unknown
}

interface SsePayload {
  delta?: string
  message?: string
  id?: string
  name?: string
  input?: unknown
}

const MAX_TOOL_ROUNDS = 6

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function actionTitle(tool: string): string {
  const map: Record<string, string> = {
    swap: 'Swap',
    bridge: 'Bridge',
    send: 'Transfer',
    deposit: 'Deposit',
    withdraw: 'Withdrawal',
    add_liquidity: 'Add liquidity',
    remove_liquidity: 'Remove liquidity',
  }
  return map[tool] ?? tool
}

async function readSse(
  response: Response,
  onEvent: (event: string, data: SsePayload) => void,
): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''
    for (const chunk of chunks) {
      const lines = chunk.split('\n')
      let event = 'message'
      let dataStr = ''
      for (const line of lines) {
        if (line.startsWith('event: ')) event = line.slice(7).trim()
        else if (line.startsWith('data: ')) dataStr += line.slice(6)
      }
      if (!dataStr) continue
      let parsed: SsePayload = {}
      try {
        parsed = JSON.parse(dataStr) as SsePayload
      } catch {
        parsed = { delta: dataStr }
      }
      onEvent(event, parsed)
    }
  }
}

export function Chat() {
  const { address, signedIn } = useAuth()
  const execTx = useTxExecutor()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const onConfirmSwap = useCallback(
    async (toolCallId: string, toolName: string, rawInput: unknown) => {
      if (confirmingId) return
      const args = (rawInput && typeof rawInput === 'object' ? rawInput : {}) as Record<string, unknown>
      setConfirmingId(toolCallId)
      const result = await execTx({ tool: toolName, input: args, address })
      setMessages((prev) =>
        prev.map((m) => {
          if (!m.toolCalls) return m
          const next = m.toolCalls.map((tc) =>
            tc.id === toolCallId
              ? {
                  ...tc,
                  status: (result.ok ? 'success' : 'error') as 'success' | 'error',
                  result: result.ok
                    ? { status: 'broadcast', hash: result.hash, explorerUrl: result.explorerUrl }
                    : tc.result,
                  error: result.ok ? undefined : result.error,
                }
              : tc,
          )
          return { ...m, toolCalls: next }
        }),
      )
      if (result.ok) {
        const summary = `Sent. ${actionTitle(toolName)} settled on Arc. Tx: ${result.hash?.slice(0, 10)}…`
        setMessages((prev) => [
          ...prev,
          { id: newId(), role: 'assistant', content: summary, pending: false },
        ])
      }
      setConfirmingId(null)
    },
    [execTx, confirmingId, address],
  )

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = '0px'
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`
  }, [input])

  const runChatRound = useCallback(
    async (
      apiHistory: ApiMessage[],
      assistantId: string,
    ): Promise<{ apiHistory: ApiMessage[]; tools: PendingToolCall[]; text: string }> => {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: apiHistory }),
      })
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '')
        throw new Error(errText || `request_failed_${res.status}`)
      }

      const tools: PendingToolCall[] = []
      const seenIds = new Set<string>()
      let text = ''

      await readSse(res, (event, data) => {
        if (event === 'text' && typeof data.delta === 'string') {
          text += data.delta
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + data.delta!, pending: false } : m,
            ),
          )
        } else if (event === 'tool_use' && data.id && data.name) {
          if (seenIds.has(data.id)) return
          seenIds.add(data.id)
          tools.push({ id: data.id, name: data.name, input: data.input ?? {} })
        } else if (event === 'error') {
          const msg = typeof data.message === 'string' ? data.message : 'unknown_error'
          text = text || `Error: ${msg}`
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: text, pending: false } : m,
            ),
          )
        }
      })

      const assistantApi: ApiMessage =
        tools.length > 0
          ? {
              role: 'assistant',
              content: text.length > 0 ? text : '',
              tool_calls: tools.map((t) => ({
                id: t.id,
                type: 'function' as const,
                function: { name: t.name, arguments: JSON.stringify(t.input) },
              })),
            }
          : { role: 'assistant', content: text }
      return { apiHistory: [...apiHistory, assistantApi], tools, text }
    },
    [],
  )

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim()
      if (!text || loading || !signedIn) return
      setInput('')
      const userMsg: ChatMessage = { id: newId(), role: 'user', content: text }
      const assistantId = newId()
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        pending: true,
      }
      const uiHistory = [...messages, userMsg]
      setMessages([...uiHistory, assistantMsg])
      setLoading(true)

      try {
        let apiHistory: ApiMessage[] = uiHistory.map((m) => ({
          role: m.role,
          content: m.content,
        }))

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const result = await runChatRound(apiHistory, assistantId)
          apiHistory = result.apiHistory

          if (result.tools.length === 0) break

          const toolCalls: ToolCall[] = result.tools.map((t) => ({
            id: t.id,
            name: t.name,
            input: t.input,
            status: 'pending' as const,
          }))
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, toolCalls: [...(m.toolCalls ?? []), ...toolCalls] }
                : m,
            ),
          )

          const results = await Promise.all(
            result.tools.map(async (t) => ({
              id: t.id,
              name: t.name,
              exec: await execTool(t.name, t.input, address),
            })),
          )

          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId || !m.toolCalls) return m
              const next = m.toolCalls.map((tc) => {
                const r = results.find((x) => x.id === tc.id)
                if (!r) return tc
                return {
                  ...tc,
                  status: r.exec.ok ? ('success' as const) : ('error' as const),
                  result: r.exec.data,
                  error: r.exec.error,
                }
              })
              return { ...m, toolCalls: next }
            }),
          )

          for (const r of results) {
            const payload = r.exec.ok
              ? (r.exec.data ?? r.exec)
              : { error: r.exec.error ?? 'unknown_error' }
            apiHistory.push({
              role: 'tool',
              tool_call_id: r.id,
              name: r.name,
              content: JSON.stringify(payload) || '{}',
            })
          }

          if (round === MAX_TOOL_ROUNDS - 1) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content:
                        (m.content ? m.content + '\n\n' : '') +
                        `(Stopped after ${MAX_TOOL_ROUNDS} tool rounds.)`,
                      pending: false,
                    }
                  : m,
              ),
            )
          }
        }

        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, pending: false } : m)),
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'request_failed'
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: `Error: ${msg}`, pending: false } : m,
          ),
        )
      } finally {
        setLoading(false)
      }
    },
    [loading, messages, address, runChatRound, signedIn],
  )

  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      void send(input)
    },
    [input, send],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void send(input)
      }
    },
    [input, send],
  )

  const empty = messages.length === 0

  return (
    <div className="flex h-[100dvh] flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-900 px-6 py-3">
        <div className="flex items-baseline gap-3">
          <span className="text-base font-semibold tracking-tight text-neutral-50">Numa</span>
          <span className="text-xs text-neutral-500">stablecoin copilot on Arc</span>
        </div>
        <div className="flex items-center gap-3">
          <NetworkSwitcher />
          <div className="w-44">
            <WalletPill />
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {!signedIn ? (
          <AuthGate>
            <div />
          </AuthGate>
        ) : (
        <div className="mx-auto w-full max-w-2xl px-4 py-6">
          {empty ? (
            <div className="flex flex-col items-start gap-5 pt-10">
              <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">
                Welcome to Numa — the simplest way to use DeFi on Arc.
              </h1>
              <div className="space-y-4 text-sm leading-relaxed text-neutral-300">
                <p>
                  New to Arc? You can ask me anything. Remember I&apos;m an AI, I don&apos;t judge.
                  Whenever you&apos;re ready, I&apos;m here to help you do transactions with ease and
                  confidence.
                </p>
                <p>
                  Already a pro? You are about to experience a stablecoin-native L1 with USDC gas
                  and sub-second finality. You can also bridge in from:
                </p>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-neutral-200">
                  <span className="inline-flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="https://pbs.twimg.com/profile_images/1955238194443849732/sHyVRItm_400x400.jpg"
                      alt="Arc"
                      className="h-6 w-6 rounded-full"
                    />
                    Arc Testnet
                  </span>
                  <span className="inline-flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="https://coin-images.coingecko.com/coins/images/279/large/ethereum.png?1696501628"
                      alt="Ethereum"
                      className="h-6 w-6 rounded-full"
                    />
                    Ethereum Sepolia
                  </span>
                  <span className="inline-flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="https://pbs.twimg.com/profile_images/1945608199500910592/rnk6ixxH_400x400.jpg"
                      alt="Base"
                      className="h-6 w-6 rounded-full"
                    />
                    Base Sepolia
                  </span>
                </div>
              </div>
              <div className="w-full rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2.5 text-xs text-neutral-300">
                <span className="font-medium text-neutral-200">Warning:</span> Only bridge USDC
                from the supported source chains above. Other chains are not routed.
              </div>
              <ExampleChips onPick={(p) => void send(p)} disabled={loading} />
            </div>
          ) : (
            <div className="space-y-4 pb-4">
              {messages.map((m) => (
                <Message
                  key={m.id}
                  message={m}
                  onConfirmSwap={onConfirmSwap}
                  confirmingId={confirmingId}
                />
              ))}
            </div>
          )}
        </div>
        )}
      </div>

      <div className="border-t border-neutral-900 bg-neutral-950">
        <div className="mx-auto w-full max-w-2xl px-4 py-4">
          <form
            onSubmit={onSubmit}
            className="flex items-end gap-2 rounded-2xl border border-neutral-800 bg-neutral-900 px-3 py-2 focus-within:border-neutral-700 focus-within:ring-1 focus-within:ring-neutral-700"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder={signedIn ? 'Ask Numa anything about Arc, stablecoins, or your portfolio' : 'Sign in with your wallet to chat'}
              className="min-h-[28px] flex-1 resize-none border-0 bg-transparent py-1.5 text-sm leading-6 text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-0 disabled:cursor-not-allowed"
              disabled={loading || !signedIn}
            />
            <button
              type="submit"
              disabled={loading || !signedIn || input.trim().length === 0}
              aria-label="Send"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-neutral-900 shadow-sm transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-600"
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </form>
          <p className="mt-2 text-center text-[11px] text-neutral-600">
            Numa checks every transaction with scan_tx before signing.
          </p>
        </div>
      </div>
    </div>
  )
}
