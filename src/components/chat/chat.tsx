'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowUp, AlertTriangle, RotateCcw, Square, Wallet, ShieldCheck, Network } from 'lucide-react'
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from 'ai'
import { useChat } from '@ai-sdk/react'
import { ExampleChips } from './example-chips'
import { Message, ThinkingRow, type NumaUIMessage, type SignToolOutput } from './message'
import { NumaAvatar } from './numa-avatar'
import { useAuth } from '@/lib/use-auth'
import { AuthGate } from '@/components/auth/auth-gate'
import { useTxExecutor } from '@/lib/tx-executor'
import dynamic from 'next/dynamic'
import { useTxPreview, type TxPreviewData } from '@/lib/use-tx-preview'

// Loaded on first confirm — keeps the review modal (and its focus-trap dep)
// out of the initial chat bundle.
const TxPreview = dynamic(
  () => import('@/components/safety/tx-preview').then((m) => m.TxPreview),
  { ssr: false },
)
import { WalletPill } from '@/components/sidebar/wallet-pill'
import { NetworkSwitcher } from '@/components/sidebar/network-switcher'
import { ChainLogo } from '@/components/ui/chain-logo'
import { getActiveChains, getChain, resolveChainRef } from '@/chains/registry'
import { isSigningTool } from '@/ai/tools'
import { classifyError } from '@/lib/errors'
import { switchWalletChain } from '@/lib/chain-switch'
import {
  latestConversationId,
  loadConversation,
  saveConversation,
} from '@/lib/chat-history'
import { useTxTracker } from '@/lib/tx-tracker'
import { useTestnetPrefs } from '@/lib/network-prefs'
import { cn } from '@/lib/utils'
import { TxIndicator } from './tx-indicator'
import { toast } from 'sonner'

/** A write action pending in the simulate→review→confirm modal. */
interface PendingAction {
  toolName: string
  toolCallId: string
  input: Record<string, unknown>
}

/**
 * Follow-up suggestion chips shown after an assistant reply. Intentionally
 * disjoint from the welcome EXAMPLES — those advertise capabilities, these
 * nudge toward likely next actions after a successful turn.
 */
const FOLLOW_UPS: readonly string[] = [
  'Check my token approvals',
  'Bridge USDC to Base Sepolia',
  'Show my LP positions',
  'Scan a token for risk',
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
  onSignedIn,
}: {
  auth: ReturnType<typeof useAuth>
  onSignedIn?: () => void
}) {
  // The wallet being connected and the session being signed-in are distinct.
  // Only call for a "connect" when there's genuinely no wallet; otherwise the
  // wallet is already connected and just needs a fresh session signature.
  const needsConnect = !auth.isConnected
  return (
    <div className="flex gap-2.5 numa-card-in sm:gap-3" role="status" aria-live="polite">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        {needsConnect ? <Wallet className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1 rounded-xl border border-border-c bg-card px-3.5 py-3">
        <p className="text-sm font-medium text-fg">
          {needsConnect ? 'Connect your wallet to chat' : 'Sign in to continue'}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-fg">
          {needsConnect
            ? 'Connect a wallet to start a secure session. It is free and moves no funds.'
            : 'Your wallet is connected. Sign a quick message to start your session. It is free and moves no funds.'}
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
              onClick={async () => {
                if (await auth.signIn()) onSignedIn?.()
              }}
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
  const arcChain = getChain('arc-testnet')
  return (
    <div
      className="flex gap-2.5 numa-card-in sm:gap-3"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-danger/40 bg-danger/10">
        <AlertTriangle className="h-4 w-4 text-danger" />
      </div>
      <div className="min-w-0 flex-1 rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-3">
        <p className="text-sm font-medium text-fg">{c.headline}</p>
        {c.hint ? (
          <p className="mt-1 text-xs leading-relaxed text-muted-fg">{c.hint}</p>
        ) : null}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {c.kind === 'chain_mismatch' && arcChain ? (
            <button
              type="button"
              onClick={async () => {
                try {
                  await switchWalletChain(arcChain)
                  toast.success(`Switched to ${arcChain.name}`)
                } catch (err) {
                  toast.error('Couldn’t switch network', {
                    description: classifyError(err).hint,
                  })
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg transition hover:brightness-110"
            >
              <Network className="h-3.5 w-3.5" />
              Switch to {arcChain.name}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-c bg-card px-3 py-1.5 text-xs font-medium text-fg transition hover:bg-muted-bg"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Try again
          </button>
        </div>
      </div>
    </div>
  )
}

export function Chat() {
  const auth = useAuth()
  const { hideTestnets } = useTestnetPrefs()
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
  const convParam = searchParams?.get('c') ?? null
  // Current conversation id for local persistence (assigned on first save).
  const convIdRef = useRef<string | null>(null)
  // Tracks which address we already restored history for (once per wallet).
  const restoredFor = useRef<string | null>(null)
  const trackTx = useTxTracker((s) => s.track)

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

  const { messages, sendMessage, setMessages, addToolResult, regenerate, stop, status, error } =
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
    convIdRef.current = null
    setMessages([])
    setInput('')
    setConfirmingId(null)
    setPending(null)
    setPreview(null)
    setPreviewLoading(false)
  }, [newKey, setMessages])

  // Restore the last conversation once per wallet on mount (unless the URL
  // explicitly asks for a fresh chat or a specific conversation).
  useEffect(() => {
    if (!address || !signedIn || restoredFor.current === address) return
    restoredFor.current = address
    if (newKey) return
    const id = convParam ?? latestConversationId(address)
    if (!id) return
    const msgs = loadConversation<NumaUIMessage>(address, id)
    if (msgs && msgs.length > 0) {
      convIdRef.current = id
      setMessages(msgs)
    }
  }, [address, signedIn, newKey, convParam, setMessages])

  // Open a specific conversation when navigated to from /history.
  useEffect(() => {
    if (!address || !signedIn || !convParam || convParam === convIdRef.current) return
    const msgs = loadConversation<NumaUIMessage>(address, convParam)
    if (msgs && msgs.length > 0) {
      convIdRef.current = convParam
      setMessages(msgs)
    }
  }, [convParam, address, signedIn, setMessages])

  // Persist the conversation locally whenever a turn settles (not mid-stream).
  useEffect(() => {
    if (!address || messages.length === 0 || loading) return
    if (!convIdRef.current) convIdRef.current = crypto.randomUUID()
    saveConversation(address, convIdRef.current, messages)
  }, [messages, loading, address])

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
      if (result.ok) {
        if (result.hash) {
          // Register with the header tracker so progress stays visible after
          // the toast dismisses or the in-chat card scrolls away.
          trackTx({
            hash: result.hash,
            // Normalize through the registry: the model may pass an App Kit
            // enum ("Base_Sepolia") which getChain() can't resolve — the
            // tracker would then never find a receipt and sit "pending".
            // claim_bridge broadcasts its mint on the DESTINATION chain.
            chainKey: resolveChainRef(
              toolName === 'claim_bridge' ? args.toChain : (args.chain ?? args.fromChain),
            ).key,
            action: toolName,
            explorerUrl: result.explorerUrl,
          })
        }
        toast.success('Transaction submitted', {
          description: 'Broadcast to the network. Track progress in the chat.',
          action: result.explorerUrl
            ? {
                label: 'Explorer',
                onClick: () => window.open(result.explorerUrl, '_blank', 'noopener,noreferrer'),
              }
            : undefined,
        })
      } else {
        toast.error(result.error || 'Transaction failed', {
          description: result.errorHint || undefined,
        })
      }
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
      toast.error(c.headline, { description: c.hint || undefined })
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
  }, [pending, confirmingId, execTx, address, addSignResult, trackTx])

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

  // Stable identity so the memoized last <Message> doesn't re-render per keystroke.
  const onRegenerate = useCallback(() => void regenerate(), [regenerate])

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
          <TxIndicator />
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
              <div className="flex flex-col items-start gap-4 pt-4 sm:gap-5 sm:pt-8">
                <NumaAvatar size={48} />
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
                      Welcome to Numa
                    </h1>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-medium uppercase tracking-wide',
                        hideTestnets
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'border-border-c bg-muted-bg/40 text-muted-fg',
                      )}
                    >
                      {hideTestnets ? 'Mainnet' : 'Testnet'}
                    </span>
                  </div>
                  <p className="text-base font-medium text-muted-fg">
                    Your stablecoin copilot on Arc
                  </p>
                </div>
                <p className="text-sm leading-relaxed text-muted-fg">
                  Ask in plain English to check balances, swap, send, bridge USDC across{' '}
                  {hideTestnets ? 'chains' : 'testnets'}, and find yields. Every transaction
                  previews and simulates before you sign.
                </p>
                <div className="w-full rounded-xl border border-border-c bg-card px-4 py-3">
                  <p
                    id="numa-networks-heading"
                    className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-fg"
                  >
                    Bridge USDC in or out across
                  </p>
                  <ul
                    role="list"
                    aria-labelledby="numa-networks-heading"
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-fg sm:gap-x-4 sm:text-sm"
                  >
                    {getActiveChains()
                      .filter((c) => !hideTestnets || !c.testnet)
                      .map((c) => (
                        <li key={c.key} className="inline-flex items-center gap-2">
                          <ChainLogo src={c.logo} name={c.name} chainKey={c.key} size={18} />
                          <span className="break-words">{c.name}</span>
                        </li>
                      ))}
                  </ul>
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
                    onRegenerate={
                      !loading && i === lastIndex && m.role === 'assistant'
                        ? onRegenerate
                        : undefined
                    }
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
                    <ConnectPrompt auth={auth} onSignedIn={() => void regenerate()} />
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
              aria-label="Message Numa"
              rows={1}
              placeholder={
                loading
                  ? 'Numa is thinking… press Stop to interrupt'
                  : signedIn
                    ? 'Try: swap 10 USDC for EURC, or bridge to Base Sepolia'
                    : 'Sign in with your wallet to chat'
              }
              aria-busy={loading}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="send"
              className="min-h-[28px] flex-1 resize-none border-0 bg-transparent py-1.5 text-sm leading-6 text-fg placeholder:text-muted-fg focus:outline-none focus:ring-0 disabled:cursor-not-allowed"
              disabled={loading || !signedIn}
            />
            {loading ? (
              <button
                type="button"
                onClick={() => void stop()}
                aria-label="Stop generating"
                title="Stop generating"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border-c bg-card text-fg shadow-sm transition hover:bg-muted-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!signedIn || input.trim().length === 0}
                aria-label="Send"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-fg shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-muted-bg disabled:text-muted-fg"
              >
                <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
              </button>
            )}
          </form>
          <p className="mt-2 text-center text-2xs leading-relaxed text-muted-fg">
            Numa can make mistakes and is not financial advice. Always review transactions before
            signing.{' '}
            {hideTestnets ? 'Mainnet transactions move real funds.' : 'Testnet only.'}
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
