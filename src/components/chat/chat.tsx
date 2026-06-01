'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowUp, AlertTriangle, RotateCcw, Wallet, ShieldCheck } from 'lucide-react'
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from 'ai'
import { useChat } from '@ai-sdk/react'
import { ExampleChips } from './example-chips'
import { Message, ThinkingRow, type NumaUIMessage, type SignToolOutput } from './message'
import { useAuth } from '@/lib/use-auth'
import { AuthGate } from '@/components/auth/auth-gate'
import { useTxExecutor } from '@/lib/tx-executor'
import { useTxPreview, type TxPreviewData } from '@/lib/use-tx-preview'
import { TxPreview } from '@/components/safety/tx-preview'
import { WalletPill } from '@/components/sidebar/wallet-pill'
import { NetworkSwitcher } from '@/components/sidebar/network-switcher'
import { ChainLogo } from '@/components/ui/chain-logo'
import { getActiveChains } from '@/chains/registry'
import { isSigningTool } from '@/ai/tools'
import { classifyError } from '@/lib/errors'

/** A write action pending in the simulate→review→confirm modal. */
interface PendingAction {
  toolName: string
  toolCallId: string
  input: Record<string, unknown>
}

/** Follow-up suggestion chips shown after an assistant reply. */
const FOLLOW_UPS: readonly string[] = [
  'Show my portfolio',
  'Top stablecoin yields',
  'Trending tokens on Arc',
  "What's the ETH price?",
]

/** True when a chat request failed because there's no valid wallet session
 * (the server /api/chat gate returns 401 {"error":"unauthorized"}). */
function isAuthError(error: Error): boolean {
  return /unauthorized|401/i.test(error.message)
}

/**
 * Inline "connect your wallet" prompt — shown in the chat thread when a prompt
 * is attempted without a valid wallet session, instead of a scary server error.
 * Drives the connect → sign flow right there (fast wallet connect).
 */
function ConnectPrompt({
  auth,
}: {
  auth: ReturnType<typeof useAuth>
}) {
  return (
    <div className="flex gap-2.5 numa-card-in sm:gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Wallet className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 rounded-xl border border-border-c bg-card px-3.5 py-3">
        <p className="text-sm font-medium text-fg">Connect your wallet to chat</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-fg">
          Numa needs a one-time wallet signature to start a session. It&apos;s free — no funds move.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {!auth.isConnected ? (
            auth.connectors.length === 0 ? (
              <span className="text-xs text-muted-fg">No wallet detected.</span>
            ) : (
              auth.connectors.slice(0, 2).map((c, i) => (
                <button
                  key={c.uid}
                  type="button"
                  disabled={auth.connectPending}
                  onClick={() => auth.connect(i)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg transition hover:brightness-110 disabled:opacity-60"
                >
                  <Wallet className="h-3.5 w-3.5" />
                  {auth.connectPending ? 'Connecting…' : `Connect ${c.name}`}
                </button>
              ))
            )
          ) : (
            <button
              type="button"
              disabled={auth.signing}
              onClick={() => void auth.signIn()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg transition hover:brightness-110 disabled:opacity-60"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {auth.signing ? 'Waiting for signature…' : 'Sign in to continue'}
            </button>
          )}
        </div>
        {auth.error ? <p className="mt-2 text-xs text-danger">{auth.error}</p> : null}
      </div>
    </div>
  )
}

/** Professional, retryable error card shown when a chat request fails. */
function ChatError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const c = classifyError(error)
  return (
    <div className="flex gap-2.5 numa-card-in sm:gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-danger/40 bg-danger/10">
        <AlertTriangle className="h-4 w-4 text-danger" />
      </div>
      <div className="min-w-0 flex-1 rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-3">
        <p className="text-sm font-medium text-fg">{c.headline}</p>
        {c.hint ? (
          <p className="mt-1 text-xs leading-relaxed text-muted-fg">{c.hint}</p>
        ) : null}
        <button
          type="button"
          onClick={onRetry}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-border-c bg-card px-3 py-1.5 text-xs font-medium text-fg transition hover:bg-muted-bg"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Try again
        </button>
      </div>
    </div>
  )
}

export function Chat() {
  const auth = useAuth()
  const { address, signedIn } = auth
  const execTx = useTxExecutor()
  const buildPreview = useTxPreview()
  const [input, setInput] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  // simulate → review → confirm modal state.
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [preview, setPreview] = useState<TxPreviewData | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  // Autoscroll pauses when the user scrolls up; resumes when near the bottom.
  const stickToBottom = useRef(true)
  const searchParams = useSearchParams()
  const newKey = searchParams?.get('new') ?? null

  // Keep latest address available to the transport body without re-creating it.
  const addressRef = useRef<string | undefined>(address)
  addressRef.current = address

  const transportRef = useRef(
    new DefaultChatTransport<NumaUIMessage>({
      api: '/api/chat',
      prepareSendMessagesRequest: ({ messages, body }) => ({
        body: { ...body, messages, address: addressRef.current },
      }),
    }),
  )

  const { messages, sendMessage, setMessages, addToolResult, regenerate, status, error } =
    useChat<NumaUIMessage>({
      transport: transportRef.current,
      // Resume the model after a client tool result is supplied.
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    })

  // Signing tools have no output schema (no server execute), so the typed
  // addToolResult collapses their output to `undefined`. We supply our own
  // SignToolOutput, so widen the call here.
  const addSignResult = useCallback(
    (tool: string, toolCallId: string, output: SignToolOutput): Promise<void> =>
      addToolResult({
        tool,
        toolCallId,
        output,
      } as unknown as Parameters<typeof addToolResult>[0]) as Promise<void>,
    [addToolResult],
  )

  const loading = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    if (!newKey) return
    setMessages([])
    setInput('')
    setConfirmingId(null)
    setPending(null)
    setPreview(null)
    setPreviewLoading(false)
  }, [newKey, setMessages])

  useEffect(() => {
    const el = scrollRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [messages])

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    stickToBottom.current = distance < 80
  }, [])

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = '0px'
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`
  }, [input])

  // STAGE 1 — user clicks "Confirm" on the tool card → build a simulated
  // preview and OPEN the review modal. We do NOT execute yet.
  const onConfirm = useCallback(
    async (toolName: string, toolCallId: string, rawInput: unknown) => {
      if (confirmingId || pending || !isSigningTool(toolName)) return
      // register_agent is handled entirely by <MintAgentCard/>; no preview path.
      if (toolName === 'register_agent') return
      const args = (rawInput && typeof rawInput === 'object' ? rawInput : {}) as Record<
        string,
        unknown
      >
      setPending({ toolName, toolCallId, input: args })
      setPreview(null)
      setPreviewLoading(true)
      try {
        const data = await buildPreview({
          tool: toolName,
          input: args,
          address: address as `0x${string}` | undefined,
        })
        setPreview(data)
      } catch {
        // Preview build failed → show a summary-only modal so the user can
        // still cancel or proceed (the executor re-validates before signing).
        setPreview({
          summary: {
            from: (address ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
            to: (address ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
            action: toolName,
          },
          simulation: null,
          simUnavailable: true,
        })
      } finally {
        setPreviewLoading(false)
      }
    },
    [confirmingId, pending, address, buildPreview],
  )

  const cancelPreview = useCallback(() => {
    if (confirmingId) return // don't cancel mid-signing
    setPending(null)
    setPreview(null)
    setPreviewLoading(false)
  }, [confirmingId])

  // STAGE 2 — user confirms inside the review modal → EXECUTE + addToolResult.
  const runExecution = useCallback(async () => {
    if (!pending || confirmingId) return
    const { toolName, toolCallId, input: args } = pending
    setConfirmingId(toolCallId)
    try {
      const result = await execTx({
        tool: toolName,
        input: args,
        address: address as `0x${string}` | undefined,
      })
      const output: SignToolOutput = result.ok
        ? {
            ok: true,
            status: 'broadcast',
            hash: result.hash,
            explorerUrl: result.explorerUrl,
          }
        : {
            ok: false,
            error: result.error,
            errorKind: result.errorKind,
            errorHint: result.errorHint,
            errorDetail: result.errorDetail,
          }
      await addSignResult(toolName, toolCallId, output)
    } catch (e) {
      const c = classifyError(e)
      await addSignResult(toolName, toolCallId, {
        ok: false,
        error: c.headline,
        errorKind: c.kind,
        errorHint: c.hint,
        errorDetail: c.detail,
      })
    } finally {
      setConfirmingId(null)
      setPending(null)
      setPreview(null)
    }
  }, [pending, confirmingId, execTx, address, addSignResult])

  const submit = useCallback(
    (raw: string) => {
      const text = raw.trim()
      if (!text || loading || !signedIn) return
      setInput('')
      void sendMessage({ text })
    },
    [loading, signedIn, sendMessage],
  )

  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      submit(input)
    },
    [input, submit],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        submit(input)
      }
    },
    [input, submit],
  )

  const empty = messages.length === 0
  const lastIndex = messages.length - 1

  return (
    <div className="flex h-[100dvh] flex-col bg-bg text-fg">
      <header className="flex items-center justify-between gap-2 border-b border-border-c px-3 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="text-base font-semibold tracking-tight text-fg">Numa</span>
          <span className="hidden truncate text-xs text-muted-fg sm:inline">
            stablecoin copilot on Arc
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <NetworkSwitcher />
          <div className="w-auto sm:w-44">
            <WalletPill />
          </div>
        </div>
      </header>

      <div ref={scrollRef} onScroll={onScroll} className="numa-scroll flex-1 overflow-y-auto">
        {!signedIn ? (
          <AuthGate>
            <div />
          </AuthGate>
        ) : (
          <div className="mx-auto w-full max-w-xl px-3 py-4 sm:max-w-2xl sm:px-4 sm:py-5">
            {empty ? (
              <div className="flex flex-col items-start gap-3 pt-4 sm:gap-4 sm:pt-8">
                <h1 className="text-lg font-semibold tracking-tight text-fg sm:text-2xl">
                  Welcome to Numa — the simplest way to use DeFi on Arc.
                </h1>
                <div className="space-y-3 text-xs leading-relaxed text-muted-fg sm:space-y-4 sm:text-sm">
                  <p>
                    New to Arc? You can ask me anything. Remember I&apos;m an AI, I don&apos;t judge.
                    Whenever you&apos;re ready, I&apos;m here to help you do transactions with ease
                    and confidence.
                  </p>
                  <p>
                    Already a pro? You are about to experience a stablecoin-native L1 with USDC gas
                    and sub-second finality. You can also bridge in from:
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-fg sm:gap-x-5 sm:text-sm">
                    {getActiveChains().map((c) => (
                      <span key={c.key} className="inline-flex items-center gap-2">
                        <ChainLogo src={c.logo} name={c.name} chainKey={c.key} size={22} />
                        {c.name}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="w-full rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] leading-relaxed text-warning sm:text-xs">
                  <span className="font-semibold">Warning:</span> Only bridge USDC
                  from the supported source chains above. Other chains are not routed.
                </div>
                <ExampleChips onPick={(p) => submit(p)} disabled={loading} />
              </div>
            ) : (
              <div className="space-y-3 pb-4">
                {messages.map((m, i) => (
                  <Message
                    key={m.id}
                    message={m}
                    active={loading && i === lastIndex && m.role === 'assistant'}
                    onConfirm={onConfirm}
                    confirmingId={confirmingId}
                  />
                ))}
                {status === 'submitted' && messages[lastIndex]?.role === 'user' ? (
                  <ThinkingRow />
                ) : null}
                {!loading && !error && messages[lastIndex]?.role === 'assistant' ? (
                  <div className="pl-9 sm:pl-12">
                    <ExampleChips
                      variant="pills"
                      label=""
                      prompts={FOLLOW_UPS}
                      onPick={(p) => submit(p)}
                      disabled={loading}
                    />
                  </div>
                ) : null}
                {error && !loading ? (
                  isAuthError(error) ? (
                    <ConnectPrompt auth={auth} />
                  ) : (
                    <ChatError error={error} onRetry={() => void regenerate()} />
                  )
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border-c bg-bg">
        <div className="mx-auto w-full max-w-xl px-3 py-2.5 sm:max-w-2xl sm:px-4 sm:py-3">
          <form
            onSubmit={onSubmit}
            className="flex items-end gap-2 rounded-2xl border border-border-c bg-card px-2 py-2 transition focus-within:border-ring focus-within:ring-1 focus-within:ring-ring sm:px-3"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder={
                signedIn
                  ? 'Ask Numa anything about Arc, stablecoins, or your portfolio'
                  : 'Sign in with your wallet to chat'
              }
              className="min-h-[28px] flex-1 resize-none border-0 bg-transparent py-1.5 text-sm leading-6 text-fg placeholder:text-muted-fg focus:outline-none focus:ring-0 disabled:cursor-not-allowed"
              disabled={loading || !signedIn}
            />
            <button
              type="submit"
              disabled={loading || !signedIn || input.trim().length === 0}
              aria-label="Send"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-fg shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-muted-bg disabled:text-muted-fg"
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </form>
          <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-fg">
            Numa can make mistakes and is not financial advice. Always review transactions before
            signing. Testnet only.
          </p>
        </div>
      </div>

      {/* simulate → review → confirm modal (PHASE 2 / TASK B) */}
      {pending ? (
        <TxPreview
          open
          summary={
            preview?.summary ?? {
              from: (address ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
              to: (address ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
              action: pending.toolName,
            }
          }
          simulation={preview?.simulation ?? null}
          simUnavailable={preview?.simUnavailable ?? false}
          loading={previewLoading}
          signing={confirmingId === pending.toolCallId}
          onConfirm={runExecution}
          onCancel={cancelPreview}
        />
      ) : null}
    </div>
  )
}
