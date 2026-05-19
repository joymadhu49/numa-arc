'use client'

import type { ReactNode } from 'react'
import { CheckCircle2, ExternalLink, Loader2, PartyPopper, XCircle, Wrench } from 'lucide-react'
import { MintAgentCard } from './mint-agent-card'
import { NumaAvatar } from './numa-avatar'

export type ChatRole = 'user' | 'assistant'

export type ToolStatus = 'pending' | 'success' | 'error'

export interface ToolCall {
  id: string
  name: string
  input: unknown
  status?: ToolStatus
  result?: unknown
  error?: string
}

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  toolCalls?: ToolCall[]
  pending?: boolean
}

interface MessageProps {
  message: ChatMessage
  onConfirmSwap?: (toolCallId: string, toolName: string, input: unknown) => void
  confirmingId?: string | null
}

const EXECUTABLE_TOOLS = new Set([
  'swap',
  'bridge',
  'send',
  'deposit',
  'withdraw',
  'add_liquidity',
  'remove_liquidity',
])

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index))
    const token = match[0]
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={`b-${key++}`} className="font-semibold text-neutral-50">
          {token.slice(2, -2)}
        </strong>,
      )
    } else if (token.startsWith('`')) {
      nodes.push(
        <code
          key={`c-${key++}`}
          className="rounded bg-neutral-800 px-1 py-0.5 font-mono text-[0.85em] break-all text-neutral-100"
        >
          {token.slice(1, -1)}
        </code>,
      )
    } else if (token.startsWith('*')) {
      nodes.push(
        <em key={`i-${key++}`} className="italic">
          {token.slice(1, -1)}
        </em>,
      )
    }
    lastIndex = match.index + token.length
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}

function renderContent(content: string): ReactNode {
  if (!content) return null
  const lines = content.split('\n')
  const blocks: ReactNode[] = []
  let list: string[] | null = null
  let key = 0

  const flushList = () => {
    if (list && list.length > 0) {
      blocks.push(
        <ul key={`ul-${key++}`} className="ml-5 list-disc space-y-1">
          {list.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>,
      )
    }
    list = null
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
    if (bullet) {
      if (!list) list = []
      list.push(bullet[1])
      continue
    }
    flushList()
    if (line.length === 0) {
      blocks.push(<div key={`sp-${key++}`} className="h-2" />)
    } else {
      blocks.push(
        <p key={`p-${key++}`} className="whitespace-pre-wrap leading-relaxed">
          {renderInline(line)}
        </p>,
      )
    }
  }
  flushList()
  return blocks
}

function summarizeInput(name: string, input: unknown): string {
  if (input === null || typeof input !== 'object') return ''
  const o = input as Record<string, unknown>
  switch (name) {
    case 'swap':
      return `${o.amount ?? ''} ${o.fromToken ?? o.tokenIn ?? ''} → ${o.toToken ?? o.tokenOut ?? ''}`
    case 'send':
      return `${o.amount ?? ''} ${o.token ?? ''} → ${o.to ?? ''}`
    case 'bridge':
      return `${o.amount ?? ''} ${o.token ?? ''} ${o.fromChain ?? ''} → ${o.toChain ?? ''}`
    case 'deposit':
      return `${o.amount ?? ''} ${o.token ?? 'USDC'} into ${o.protocol ?? ''}`
    case 'withdraw':
      return `${o.amount ?? ''} ${o.token ?? ''} from ${o.protocol ?? ''}`
    case 'add_liquidity':
      return `${o.amountA ?? ''} ${o.tokenA ?? ''} + ${o.amountB ?? ''} ${o.tokenB ?? ''} (fee ${o.feeTier ?? ''})`
    case 'remove_liquidity':
      return `position #${o.positionId ?? ''} ${o.percent ?? 100}%`
    case 'register_agent':
      return `${o.name ?? ''} — ${o.description ?? ''}`
    case 'hire_agent':
      return `agent ${o.agentId ?? ''} — budget ${o.budgetUsdc ?? ''} USDC`
    case 'create_job':
      return `${o.description ?? ''} (budget ${o.budgetUsdc ?? ''} USDC)`
    case 'scan_token':
      return `${o.address ?? ''}`
    case 'scan_tx':
      return `${o.to ?? ''}`
    case 'get_portfolio':
      return o.address ? String(o.address) : 'connected wallet'
    case 'get_yield':
      return `${o.token ?? 'any'} ${o.stablecoinOnly === false ? '' : 'stable'} min ${o.minApy ?? 0}%`
    case 'get_trending':
      return `${o.chain ?? 'Arc'} ${o.window ?? '24h'}`
    case 'get_lp_positions':
      return 'list V3 positions'
    default:
      return ''
  }
}

function actionLabel(name: string): string {
  const map: Record<string, string> = {
    swap: 'Swap',
    send: 'Send',
    bridge: 'Bridge',
    deposit: 'Deposit',
    withdraw: 'Withdraw',
    add_liquidity: 'Add Liquidity',
    remove_liquidity: 'Remove Liquidity',
    get_lp_positions: 'LP Positions',
    get_portfolio: 'Portfolio',
    get_yield: 'Yield Search',
    get_trending: 'Trending',
    scan_token: 'Token Scan',
    scan_tx: 'Tx Simulation',
    register_agent: 'Mint Agent ID',
    hire_agent: 'Hire Agent',
    create_job: 'Create Job',
  }
  return map[name] ?? name
}

function isAwaitingSignature(tc: ToolCall): boolean {
  if (tc.status !== 'success' || !tc.result || typeof tc.result !== 'object') return false
  const r = tc.result as Record<string, unknown>
  return r.status === 'awaiting_wallet_signature'
}

function isBroadcast(tc: ToolCall): boolean {
  if (tc.status !== 'success' || !tc.result || typeof tc.result !== 'object') return false
  const r = tc.result as Record<string, unknown>
  return r.status === 'broadcast' && typeof r.hash === 'string'
}

function getHash(tc: ToolCall): string | null {
  if (!tc.result || typeof tc.result !== 'object') return null
  const r = tc.result as Record<string, unknown>
  if (typeof r.hash === 'string') return r.hash
  return null
}

function getExplorer(tc: ToolCall): string | null {
  if (!tc.result || typeof tc.result !== 'object') return null
  const r = tc.result as Record<string, unknown>
  if (typeof r.explorerUrl === 'string') return r.explorerUrl
  return null
}

function buildSuccessHeadline(tc: ToolCall): string {
  const input = (tc.input ?? {}) as Record<string, unknown>
  const amount = String(input.amount ?? input.amountA ?? '')
  switch (tc.name) {
    case 'swap':
      return `Swap confirmed on Arc.`
    case 'bridge':
      return `Bridge submitted via CCTP.`
    case 'send': {
      const token = String(input.token ?? 'USDC')
      return `Sent ${amount} ${token}.`
    }
    case 'deposit':
      return `Deposit confirmed.`
    case 'withdraw':
      return `Withdrawal confirmed.`
    case 'add_liquidity':
      return `Liquidity added.`
    case 'remove_liquidity':
      return `Liquidity removed.`
    default:
      return `Done.`
  }
}

function buildSuccessSubline(tc: ToolCall): { left: string; arrow?: string; right?: string } {
  const input = (tc.input ?? {}) as Record<string, unknown>
  const amount = String(input.amount ?? '')
  switch (tc.name) {
    case 'swap':
      return {
        left: `${amount} ${String(input.fromToken ?? input.tokenIn ?? 'USDC')}`,
        arrow: '→',
        right: String(input.toToken ?? input.tokenOut ?? 'EURC'),
      }
    case 'bridge':
      return {
        left: `${amount} ${String(input.token ?? 'USDC')}`,
        arrow: '→',
        right: `${String(input.fromChain ?? '')} → ${String(input.toChain ?? 'Arc_Testnet')}`,
      }
    case 'send':
      return { left: `to ${String(input.to ?? '').slice(0, 10)}…` }
    case 'deposit':
      return { left: `${amount} ${String(input.token ?? 'USDC')} into ${String(input.protocol ?? '')}` }
    case 'withdraw':
      return { left: `${amount} ${String(input.token ?? '')} from ${String(input.protocol ?? '')}` }
    case 'add_liquidity':
      return {
        left: `${String(input.amountA ?? '')} ${String(input.tokenA ?? '')}`,
        arrow: '+',
        right: `${String(input.amountB ?? '')} ${String(input.tokenB ?? '')}`,
      }
    case 'remove_liquidity':
      return { left: `position #${String(input.positionId ?? '')}` }
    default:
      return { left: '' }
  }
}

function SuccessSwapBanner({ tc }: { tc: ToolCall }) {
  const headline = buildSuccessHeadline(tc)
  const subline = buildSuccessSubline(tc)
  const hash = getHash(tc) ?? ''
  const explorer = getExplorer(tc) ?? '#'
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 p-3">
      <div className="flex items-center gap-2">
        <PartyPopper className="h-4 w-4 shrink-0 text-neutral-100" />
        <span className="text-sm font-semibold text-neutral-100">Done. {headline}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <span className="font-mono break-all text-neutral-100">{subline.left}</span>
        {subline.arrow ? <span className="text-neutral-500">{subline.arrow}</span> : null}
        {subline.right ? <span className="font-mono break-all text-neutral-100">{subline.right}</span> : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="font-mono break-all text-neutral-400">{hash.slice(0, 14)}…{hash.slice(-6)}</span>
        <a
          href={explorer}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 font-medium text-neutral-100 transition hover:bg-neutral-700"
        >
          <ExternalLink className="h-3 w-3 shrink-0" /> View on Arcscan
        </a>
      </div>
    </div>
  )
}

function ToolCallCard({
  tc,
  onConfirmSwap,
  confirmingId,
}: {
  tc: ToolCall
  onConfirmSwap?: (toolCallId: string, toolName: string, input: unknown) => void
  confirmingId?: string | null
}) {
  const status = tc.status ?? 'pending'
  if (tc.name === 'register_agent') {
    return <MintAgentCard />
  }
  const icon =
    status === 'success' ? (
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
    ) : status === 'error' ? (
      <XCircle className="h-3.5 w-3.5 text-red-400" />
    ) : (
      <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-400" />
    )
  const summary = summarizeInput(tc.name, tc.input)
  if (EXECUTABLE_TOOLS.has(tc.name) && isBroadcast(tc)) {
    return <SuccessSwapBanner tc={tc} />
  }
  const pending = status === 'pending'
  return (
    <div
      className={
        'rounded-lg border px-3 py-2 text-xs transition ' +
        (pending
          ? 'animate-pulse border-neutral-700 bg-neutral-900/80'
          : 'border-neutral-800 bg-neutral-950/70')
      }
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="shrink-0">{icon}</span>
        <Wrench className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
        <span className="font-medium text-neutral-100">
          {pending ? `Calling ${actionLabel(tc.name)}…` : actionLabel(tc.name)}
        </span>
        {summary ? <span className="break-all text-neutral-400">— {summary}</span> : null}
      </div>
      {status === 'error' && tc.error ? (
        <div className="mt-1.5 rounded bg-red-950/40 px-2 py-1 text-[11px] text-red-300">
          {tc.error}
        </div>
      ) : null}
      {status === 'success' &&
      EXECUTABLE_TOOLS.has(tc.name) &&
      isAwaitingSignature(tc) &&
      onConfirmSwap ? (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            disabled={confirmingId === tc.id}
            onClick={() => onConfirmSwap(tc.id, tc.name, tc.input)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md bg-white px-3 py-2 text-xs font-medium text-neutral-900 shadow-sm transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
          >
            {confirmingId === tc.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            {confirmingId === tc.id ? 'Waiting for wallet…' : 'Confirm in wallet'}
          </button>
        </div>
      ) : null}
      {getHash(tc) ? (
        <a
          href={getExplorer(tc) ?? '#'}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 break-all text-[11px] text-neutral-300 underline decoration-neutral-600 underline-offset-4 hover:text-white hover:decoration-neutral-300"
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          {getHash(tc)?.slice(0, 10)}…
        </a>
      ) : null}
      {status === 'success' && tc.result ? (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[11px] text-neutral-500 hover:text-neutral-300">
            view result
          </summary>
          <pre className="mt-1 overflow-x-auto rounded bg-neutral-900 px-2 py-1.5 font-mono text-[10px] text-neutral-300">
            {JSON.stringify(tc.result, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  )
}

function TypingIndicator({ message }: { message: ChatMessage }) {
  const activeTool = message.toolCalls?.find((tc) => (tc.status ?? 'pending') === 'pending')
  const label = activeTool ? `Using ${actionLabel(activeTool.name)}` : 'Thinking'
  return (
    <div className="inline-flex items-center gap-2 text-xs text-neutral-400">
      {activeTool ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-neutral-300" />
      ) : null}
      <span className="font-medium tracking-wide">{label}</span>
      <span className="inline-flex items-center gap-1">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400 [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400 [animation-delay:300ms]" />
      </span>
    </div>
  )
}

export function Message({ message, onConfirmSwap, confirmingId }: MessageProps) {
  const isUser = message.role === 'user'
  const showTyping =
    message.pending &&
    message.content.length === 0 &&
    !message.toolCalls?.length

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[92%] break-words rounded-2xl rounded-br-sm bg-neutral-100 px-3 py-2.5 text-sm text-neutral-900 sm:max-w-[80%] sm:px-4 sm:py-3">
          <div className="space-y-2">{renderContent(message.content)}</div>
        </div>
      </div>
    )
  }

  const hasPendingTool = message.toolCalls?.some((tc) => (tc.status ?? 'pending') === 'pending') ?? false
  const isActive = (message.pending ?? false) || hasPendingTool
  return (
    <div className="flex justify-start gap-2 sm:gap-3">
      <NumaAvatar active={isActive} size={36} />
      <div className="flex min-w-0 max-w-[calc(100%-2.75rem)] flex-col gap-1.5 sm:max-w-[calc(85%-2.75rem)]">
        {showTyping ? (
          <div className="rounded-2xl rounded-bl-sm bg-neutral-900/80 px-3 py-2.5 ring-1 ring-neutral-800 sm:px-4 sm:py-3">
            <TypingIndicator message={message} />
          </div>
        ) : null}
        {message.content.length > 0 ? (
          <div className="break-words rounded-2xl rounded-bl-sm bg-neutral-900/80 px-3 py-2.5 text-sm text-neutral-100 ring-1 ring-neutral-800 sm:px-4 sm:py-3">
            <div className="space-y-2">{renderContent(message.content)}</div>
          </div>
        ) : null}
        {message.toolCalls && message.toolCalls.length > 0 ? (
          <div className="space-y-1.5">
            {message.toolCalls.map((tc) => (
              <ToolCallCard
                key={tc.id}
                tc={tc}
                onConfirmSwap={onConfirmSwap}
                confirmingId={confirmingId}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
