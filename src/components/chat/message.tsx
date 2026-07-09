'use client'

import type { ReactNode } from 'react'
import { memo, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  RotateCcw,
  XCircle,
  Wrench,
} from 'lucide-react'
import type { UIMessage } from 'ai'
import { isToolUIPart, getToolName, type ToolUIPart } from 'ai'
import type { InferUITools, UIDataTypes } from 'ai'
import { MintAgentCard } from './mint-agent-card'
import { NumaAvatar } from './numa-avatar'
import type { ErrorKind } from '@/lib/errors'
import { isSigningTool, type NumaTools } from '@/ai/tools'
import { getChainByDomain, resolveChainRef } from '@/chains/registry'
import { cn } from '@/lib/utils'

// Generative-UI cards.
import { PortfolioCard, type PortfolioCardData } from './cards/portfolio-card'
import { PriceCard, type PriceCardData } from './cards/price-card'
import { TrendingCard, type TrendingCardData } from './cards/trending-card'
import { YieldCard, type YieldCardData } from './cards/yield-card'
import { ScanResultCard, type ScanCardData } from './cards/scan-result-card'
import { SwapPreviewCard } from './cards/swap-preview-card'
import { TxStatusCard } from './cards/tx-status-card'
import { BridgeCard } from './cards/bridge-card'

/** Strongly-typed UI message for Numa's tool set. */
export type NumaUIMessage = UIMessage<unknown, UIDataTypes, InferUITools<NumaTools>>
type NumaToolPart = ToolUIPart<InferUITools<NumaTools>>

/** Output payload produced by the client confirm-then-sign flow. */
export interface SignToolOutput {
  ok: boolean
  status?: 'broadcast'
  hash?: string
  explorerUrl?: string
  error?: string
  errorKind?: ErrorKind
  errorHint?: string
  errorDetail?: string
}

interface MessageProps {
  message: NumaUIMessage
  /** Whether this assistant message is still streaming. */
  active?: boolean
  /** Called when the user confirms a signing tool call. */
  onConfirm?: (toolName: string, toolCallId: string, input: unknown) => void
  /** toolCallId currently awaiting a wallet signature. */
  confirmingId?: string | null
  /** When set (last assistant turn, idle), shows a Regenerate action. */
  onRegenerate?: () => void
}

// ---------------------------------------------------------------------------
// Mini-markdown renderer (preserved from the previous implementation).
// ---------------------------------------------------------------------------

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  // Order matters: links before italics so `[a](b)` isn't mis-split on `*`.
  const pattern = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index))
    const token = match[0]
    if (token.startsWith('[')) {
      const m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)
      // Only allow http(s) links — never render javascript:/data: URIs.
      const href = m && /^https?:\/\//i.test(m[2]) ? m[2] : null
      if (m && href) {
        nodes.push(
          <a
            key={`a-${key++}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline decoration-primary/40 underline-offset-2 transition hover:decoration-primary"
          >
            {m[1]}
          </a>,
        )
      } else {
        nodes.push(token)
      }
    } else if (token.startsWith('**')) {
      nodes.push(
        <strong key={`b-${key++}`} className="font-semibold text-fg">
          {token.slice(2, -2)}
        </strong>,
      )
    } else if (token.startsWith('`')) {
      nodes.push(
        <code
          key={`c-${key++}`}
          className="rounded bg-muted-bg px-1 py-0.5 font-mono text-[0.85em] break-all text-fg"
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
  let ul: string[] | null = null
  let ol: string[] | null = null
  let key = 0

  const flushUl = () => {
    if (ul && ul.length > 0) {
      blocks.push(
        <ul key={`ul-${key++}`} className="ml-5 list-disc space-y-1">
          {ul.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>,
      )
    }
    ul = null
  }
  const flushOl = () => {
    if (ol && ol.length > 0) {
      blocks.push(
        <ol key={`ol-${key++}`} className="ml-5 list-decimal space-y-1">
          {ol.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ol>,
      )
    }
    ol = null
  }
  const flushLists = () => {
    flushUl()
    flushOl()
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd()

    // Fenced code block ``` … ``` (optionally with a language tag).
    if (/^\s*```(\w+)?\s*$/.test(line)) {
      flushLists()
      const code: string[] = []
      i++
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        code.push(lines[i])
        i++
      }
      blocks.push(
        <pre
          key={`pre-${key++}`}
          className="my-1 overflow-x-auto rounded-lg border border-border-c bg-bg px-3 py-2 font-mono text-xs leading-relaxed text-fg numa-scroll"
        >
          <code>{code.join('\n')}</code>
        </pre>,
      )
      continue
    }

    // Heading (#, ##, ###).
    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      flushLists()
      const level = heading[1].length
      const cls =
        level === 1
          ? 'text-base font-semibold'
          : level === 2
            ? 'text-sm font-semibold'
            : 'text-sm font-medium'
      blocks.push(
        <p key={`h-${key++}`} className={cn('mt-1 text-fg', cls)}>
          {renderInline(heading[2])}
        </p>,
      )
      continue
    }

    // Ordered list item (1. …).
    const olItem = /^\s*\d+\.\s+(.*)$/.exec(line)
    if (olItem) {
      flushUl()
      if (!ol) ol = []
      ol.push(olItem[1])
      continue
    }

    // Unordered list item (- … / * …).
    const ulItem = /^\s*[-*]\s+(.*)$/.exec(line)
    if (ulItem) {
      flushOl()
      if (!ul) ul = []
      ul.push(ulItem[1])
      continue
    }

    flushLists()
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
  flushLists()
  return blocks
}

// ---------------------------------------------------------------------------
// Tool helpers.
// ---------------------------------------------------------------------------

const EXECUTABLE_TOOLS = new Set([
  'swap',
  'bridge',
  'claim_bridge',
  'send',
  'deposit',
  'withdraw',
  'add_liquidity',
  'remove_liquidity',
])

// Read tools that render a dedicated generative card on output-available.
const CARD_TOOLS = new Set([
  'get_portfolio',
  'get_prices',
  'get_yield',
  'get_trending',
  'scan_token',
])

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
}

function summarizeInput(name: string, input: unknown): string {
  const o = asRecord(input)
  switch (name) {
    case 'swap':
      return `${o.amount ?? ''} ${o.fromToken ?? o.tokenIn ?? ''} → ${o.toToken ?? o.tokenOut ?? ''}`
    case 'send':
      return `${o.amount ?? ''} ${o.token ?? ''} → ${o.to ?? ''}`
    case 'bridge':
      return `${o.amount ?? ''} ${o.token ?? ''} ${o.fromChain ?? ''} → ${o.toChain ?? ''}`
    case 'claim_bridge':
      return `mint on ${o.toChain ?? ''} (burn ${String(o.txHash ?? '').slice(0, 10)}…)`
    case 'deposit':
      return `${o.amount ?? ''} ${o.token ?? 'USDC'} into ${o.protocol ?? ''}`
    case 'withdraw':
      return `${o.amount ?? ''} ${o.token ?? ''} from ${o.protocol ?? ''}`
    case 'add_liquidity':
      return `${o.amountA ?? ''} ${o.tokenA ?? ''} + ${o.amountB ?? ''} ${o.tokenB ?? ''} (fee ${o.feeTier ?? ''})`
    case 'remove_liquidity':
      return `position #${o.positionId ?? ''} ${o.percent ?? 100}%`
    case 'register_agent':
      return `${o.name ?? ''}: ${o.description ?? ''}`
    case 'hire_agent':
      return `agent ${o.agentId ?? ''}, budget ${o.budgetUsdc ?? ''} USDC`
    case 'create_job':
      return `${o.description ?? ''} (budget ${o.budgetUsdc ?? ''} USDC)`
    case 'scan_token':
      return `${o.address ?? ''}`
    case 'scan_tx':
      return `${o.to ?? ''}`
    case 'estimate_route':
      return `${o.fromChain ?? ''} → ${o.toChain ?? ''}`
    case 'get_bridge_status':
      return `${String(o.txHash ?? '').slice(0, 10)}…`
    case 'get_portfolio':
      return o.address ? String(o.address) : 'connected wallet'
    case 'get_yield':
      return `${o.token ?? 'any'} ${o.stablecoinOnly === false ? '' : 'stable'} min ${o.minApy ?? 0}%`
    case 'get_trending':
      return `${o.chain ?? 'Arc'} ${o.window ?? '24h'}`
    case 'get_lp_positions':
      return 'list V3 positions'
    case 'get_prices':
      return Array.isArray(o.symbols) ? (o.symbols as unknown[]).join(', ') : ''
    default:
      return ''
  }
}

function actionLabel(name: string): string {
  const map: Record<string, string> = {
    swap: 'Swap',
    send: 'Send',
    bridge: 'Bridge',
    claim_bridge: 'Claim Bridge',
    deposit: 'Deposit',
    withdraw: 'Withdraw',
    add_liquidity: 'Add Liquidity',
    remove_liquidity: 'Remove Liquidity',
    get_lp_positions: 'LP Positions',
    get_portfolio: 'Portfolio',
    get_yield: 'Yield Search',
    get_trending: 'Trending',
    get_prices: 'Prices',
    scan_token: 'Token Scan',
    scan_tx: 'Tx Simulation',
    estimate_route: 'Bridge Route',
    get_bridge_status: 'Bridge Status',
    register_agent: 'Mint Agent ID',
    hire_agent: 'Hire Agent',
    create_job: 'Create Job',
  }
  return map[name] ?? name
}

function outputRecord(part: NumaToolPart): Record<string, unknown> | null {
  if (part.state !== 'output-available') return null
  return asRecord(part.output)
}

function isBroadcast(part: NumaToolPart): boolean {
  const out = outputRecord(part)
  return !!out && out.status === 'broadcast' && typeof out.hash === 'string'
}

function getHash(part: NumaToolPart): string | null {
  const out = outputRecord(part)
  return out && typeof out.hash === 'string' ? out.hash : null
}

function getExplorer(part: NumaToolPart): string | null {
  const out = outputRecord(part)
  return out && typeof out.explorerUrl === 'string' ? out.explorerUrl : null
}

// ---------------------------------------------------------------------------
// Success summary builders (preserved; reused by the TxStatusCard / BridgeCard).
// ---------------------------------------------------------------------------

function buildSuccessSubline(
  name: string,
  input: unknown,
): { left: string; arrow?: string; right?: string } {
  const o = asRecord(input)
  const amount = String(o.amount ?? '')
  switch (name) {
    case 'swap':
      return {
        left: `${amount} ${String(o.fromToken ?? o.tokenIn ?? 'USDC')}`,
        arrow: '→',
        right: String(o.toToken ?? o.tokenOut ?? 'EURC'),
      }
    case 'bridge':
      return {
        left: `${amount} ${String(o.token ?? 'USDC')}`,
        arrow: '→',
        right: `${String(o.fromChain ?? '')} → ${String(o.toChain ?? 'Arc_Testnet')}`,
      }
    case 'claim_bridge':
      return { left: `claim USDC on ${String(o.toChain ?? '')}` }
    case 'send':
      return { left: `${amount} ${String(o.token ?? 'USDC')} to ${String(o.to ?? '').slice(0, 10)}…` }
    case 'deposit':
      return { left: `${amount} ${String(o.token ?? 'USDC')} into ${String(o.protocol ?? '')}` }
    case 'withdraw':
      return { left: `${amount} ${String(o.token ?? '')} from ${String(o.protocol ?? '')}` }
    case 'add_liquidity':
      return {
        left: `${String(o.amountA ?? '')} ${String(o.tokenA ?? '')}`,
        arrow: '+',
        right: `${String(o.amountB ?? '')} ${String(o.tokenB ?? '')}`,
      }
    case 'remove_liquidity':
      return { left: `position #${String(o.positionId ?? '')}` }
    default:
      return { left: '' }
  }
}

// ---------------------------------------------------------------------------
// Error block (preserved styling, retoned to semantic danger token).
// ---------------------------------------------------------------------------

function ErrorBlock({
  headline,
  hint,
  detail,
  kind,
}: {
  headline?: string
  hint?: string
  detail?: string
  kind?: ErrorKind
}) {
  const showRetryNote = kind === 'rate_limit' || kind === 'timeout' || kind === 'network'
  return (
    <div
      className="mt-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
      role="alert"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-[2px] h-3.5 w-3.5 shrink-0 text-danger" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="font-medium text-danger">{headline || 'Something went wrong'}</div>
          {hint ? <div className="text-2xs leading-relaxed text-danger/80">{hint}</div> : null}
          {showRetryNote ? (
            <div className="text-2xs uppercase tracking-wider text-danger/70">
              Retry usually succeeds
            </div>
          ) : null}
          {detail && detail !== headline ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-2xs uppercase tracking-wider text-danger/60 hover:text-danger">
                technical detail
              </summary>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-bg px-2 py-1.5 font-mono text-2xs leading-snug text-danger/90 break-all whitespace-pre-wrap numa-scroll">
                {detail}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Compact tool-call chip (used inside the collapsible timeline for
// non-card tools, and as the live "calling…" indicator).
// ---------------------------------------------------------------------------

function ToolChip({
  part,
  onConfirm,
  confirmingId,
}: {
  part: NumaToolPart
  onConfirm?: (toolName: string, toolCallId: string, input: unknown) => void
  confirmingId?: string | null
}) {
  const name = getToolName(part) as string
  const { state, toolCallId } = part
  const pending = state === 'input-streaming' || state === 'input-available'
  const isSigning = isSigningTool(name)
  const awaitingConfirm = isSigning && state === 'input-available' && !!onConfirm

  const icon =
    state === 'output-available' ? (
      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
    ) : state === 'output-error' ? (
      <XCircle className="h-3.5 w-3.5 text-danger" />
    ) : awaitingConfirm ? (
      <Wrench className="h-3.5 w-3.5 text-muted-fg" />
    ) : (
      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-fg" />
    )

  const summary = summarizeInput(name, part.input)

  const out = outputRecord(part)
  const outFailed = !!out && out.ok === false
  const errorHeadline =
    state === 'output-error'
      ? part.errorText
      : outFailed
        ? String(out.error ?? out.errorHeadline ?? '')
        : undefined
  const errorHint = outFailed && typeof out.errorHint === 'string' ? out.errorHint : undefined
  const errorDetail = outFailed && typeof out.errorDetail === 'string' ? out.errorDetail : undefined
  const errorKind =
    outFailed && typeof out.errorKind === 'string' ? (out.errorKind as ErrorKind) : undefined

  const isWaitingWallet = confirmingId === toolCallId

  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2 text-xs transition',
        pending && !awaitingConfirm
          ? 'animate-pulse border-border-c bg-card/80'
          : 'border-border-c bg-bg/70',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="shrink-0">{icon}</span>
        <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-fg" />
        <span className="font-medium text-fg">
          {pending && !awaitingConfirm ? `Calling ${actionLabel(name)}…` : actionLabel(name)}
        </span>
        {summary ? <span className="break-all text-muted-fg">· {summary}</span> : null}
      </div>

      {errorHeadline ? (
        <ErrorBlock headline={errorHeadline} hint={errorHint} detail={errorDetail} kind={errorKind} />
      ) : null}

      {awaitingConfirm ? (
        <div className="mt-2 flex items-center gap-2">
          <ConfirmButton
            waiting={isWaitingWallet}
            onClick={() => onConfirm?.(name, toolCallId, part.input)}
          />
        </div>
      ) : null}

      {getHash(part) ? (
        <a
          href={getExplorer(part) ?? '#'}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 break-all text-2xs text-muted-fg underline decoration-border-c underline-offset-4 hover:text-fg"
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          {getHash(part)?.slice(0, 10)}…
        </a>
      ) : null}

      {state === 'output-available' && !outFailed ? (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-2xs text-muted-fg hover:text-fg">
            view result
          </summary>
          <pre className="mt-1 overflow-x-auto rounded bg-bg px-2 py-1.5 font-mono text-2xs text-muted-fg numa-scroll">
            {JSON.stringify(part.output, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  )
}

/** Confirm-in-wallet button (preserves the existing confirm flow). */
function ConfirmButton({ waiting, onClick }: { waiting: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={waiting}
      onClick={onClick}
      aria-label={waiting ? 'Waiting for wallet confirmation' : 'Confirm transaction in wallet'}
      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-fg shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {waiting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {waiting ? 'Waiting for wallet…' : 'Confirm in wallet'}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Tool part router — routes each part to the right card while preserving every
// part.state code path (input-streaming / input-available / output-available /
// output-error) and the confirm-then-sign + register_agent short-circuit.
// ---------------------------------------------------------------------------

/** Map a CCTP bridge status → BridgeCard 3-stage states. */
function bridgeStagesFor(status: string): {
  burn: 'pending' | 'active' | 'done'
  attest: 'pending' | 'active' | 'done'
  mint: 'pending' | 'active' | 'done'
} {
  switch (status) {
    case 'pending_burn':
      return { burn: 'active', attest: 'pending', mint: 'pending' }
    case 'attesting':
      return { burn: 'done', attest: 'active', mint: 'pending' }
    case 'ready_to_mint':
      return { burn: 'done', attest: 'done', mint: 'active' }
    case 'complete':
      return { burn: 'done', attest: 'done', mint: 'done' }
    default:
      return { burn: 'pending', attest: 'pending', mint: 'pending' }
  }
}

function ToolPart({
  part,
  onConfirm,
  confirmingId,
}: {
  part: NumaToolPart
  onConfirm?: (toolName: string, toolCallId: string, input: unknown) => void
  confirmingId?: string | null
}) {
  const name = getToolName(part) as string
  const { state, toolCallId } = part

  // register_agent always short-circuits to the mint card.
  if (name === 'register_agent') {
    return <MintAgentCard />
  }

  const out = outputRecord(part)
  const outFailed = !!out && out.ok === false

  // ---- get_bridge_status → BridgeCard 3-stage stepper ----
  if (name === 'get_bridge_status' && state === 'output-available' && !outFailed && out) {
    const status = String(out.status ?? 'unknown')
    const srcDomain = typeof out.srcDomain === 'number' ? out.srcDomain : undefined
    const dstDomain = typeof out.dstDomain === 'number' ? out.dstDomain : undefined
    const srcName =
      (srcDomain != null ? getChainByDomain(srcDomain)?.name : undefined) ?? 'Source'
    const dstName = (dstDomain != null ? getChainByDomain(dstDomain)?.name : undefined) ?? 'Arc'
    const stages = bridgeStagesFor(status)
    return (
      <BridgeCard
        source={{ name: srcName }}
        dest={{ name: dstName }}
        burn={stages.burn}
        attest={stages.attest}
        mint={stages.mint}
        hash={typeof out.txHash === 'string' ? out.txHash : undefined}
      />
    )
  }

  // ---- Read tools with a dedicated card on success ----
  if (CARD_TOOLS.has(name) && state === 'output-available' && !outFailed) {
    switch (name) {
      case 'get_portfolio':
        return <PortfolioCard data={part.output as PortfolioCardData} />
      case 'get_prices':
        return <PriceCard data={part.output as PriceCardData} />
      case 'get_yield':
        return <YieldCard data={part.output as YieldCardData} />
      case 'get_trending':
        return <TrendingCard data={part.output as TrendingCardData} />
      case 'scan_token':
        return <ScanResultCard data={part.output as ScanCardData} />
    }
  }

  // ---- Executable tools ----
  if (EXECUTABLE_TOOLS.has(name)) {
    const subline = buildSuccessSubline(name, part.input)
    const o = asRecord(part.input)

    // Broadcast success → status / bridge card.
    if (isBroadcast(part)) {
      if (name === 'bridge') {
        return (
          <BridgeCard
            amount={o.amount ? String(o.amount) : undefined}
            token={String(o.token ?? 'USDC')}
            source={{ name: String(o.fromChain ?? 'Source') }}
            dest={{ name: String(o.toChain ?? 'Arc') }}
            burn="done"
            attest="active"
            mint="pending"
            hash={getHash(part)}
            explorerUrl={getExplorer(part)}
          />
        )
      }
      return (
        <TxStatusCard
          action={actionLabel(name)}
          status="success"
          summary={subline}
          hash={getHash(part)}
          explorerUrl={getExplorer(part)}
          explorerLabel="View on Arcscan"
        />
      )
    }

    // Failed result from the confirm flow (ok:false) → error status card.
    // Forward the executor's full classification (hint + raw detail + kind) so
    // the failure is diagnosable instead of a dead-end "Something went wrong".
    if (state === 'output-available' && outFailed) {
      return (
        <TxStatusCard
          action={actionLabel(name)}
          status="error"
          summary={subline}
          error={String(out?.error ?? 'Transaction failed')}
          errorHint={typeof out?.errorHint === 'string' ? out.errorHint : undefined}
          errorDetail={typeof out?.errorDetail === 'string' ? out.errorDetail : undefined}
          errorKind={typeof out?.errorKind === 'string' ? out.errorKind : undefined}
        />
      )
    }
    if (state === 'output-error') {
      return (
        <TxStatusCard
          action={actionLabel(name)}
          status="error"
          summary={subline}
          error="Transaction failed"
          errorDetail={part.errorText || undefined}
        />
      )
    }

    // Awaiting confirmation → preview card with the preserved confirm button.
    const isSigning = isSigningTool(name)
    const awaitingConfirm = isSigning && state === 'input-available' && !!onConfirm
    if (awaitingConfirm) {
      const isWaitingWallet = confirmingId === toolCallId
      if (name === 'bridge') {
        return (
          <div className="space-y-2">
            <BridgeCard
              amount={o.amount ? String(o.amount) : undefined}
              token={String(o.token ?? 'USDC')}
              source={{ name: String(o.fromChain ?? 'Source') }}
              dest={{ name: String(o.toChain ?? 'Arc') }}
              burn="pending"
              attest="pending"
              mint="pending"
            />
            <ConfirmButton
              waiting={isWaitingWallet}
              onClick={() => onConfirm?.(name, toolCallId, part.input)}
            />
          </div>
        )
      }
      return (
        <SwapPreviewCard
          action={actionLabel(name)}
          summary={subline}
          network={resolveChainRef(
            name === 'claim_bridge' ? o.toChain : (o.chain ?? o.fromChain),
          ).name}
          confirmSlot={
            <ConfirmButton
              waiting={isWaitingWallet}
              onClick={() => onConfirm?.(name, toolCallId, part.input)}
            />
          }
        />
      )
    }

    // input-streaming (args still arriving) → compact pending chip.
    return <ToolChip part={part} onConfirm={onConfirm} confirmingId={confirmingId} />
  }

  // ---- Failed read-tool output / output-error / everything else → chip ----
  return <ToolChip part={part} onConfirm={onConfirm} confirmingId={confirmingId} />
}

// ---------------------------------------------------------------------------
// Collapsible tool-call timeline (chips for non-card tools).
// ---------------------------------------------------------------------------

function ToolTimeline({
  parts,
  onConfirm,
  confirmingId,
}: {
  parts: NumaToolPart[]
  onConfirm?: (toolName: string, toolCallId: string, input: unknown) => void
  confirmingId?: string | null
}) {
  const [open, setOpen] = useState(false)
  const allDone = parts.every((p) => p.state === 'output-available' || p.state === 'output-error')

  // While work is in-flight, keep it expanded so the user sees progress.
  const expanded = open || !allDone

  return (
    <div className="rounded-lg border border-border-c bg-bg/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-2xs font-medium text-muted-fg transition hover:text-fg"
      >
        <span className="inline-flex items-center gap-1.5">
          <Wrench className="h-3 w-3" />
          {parts.length} tool {parts.length === 1 ? 'step' : 'steps'}
        </span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 transition-transform', expanded ? 'rotate-180' : '')}
        />
      </button>
      {expanded ? (
        <div className="space-y-1.5 px-2 pb-2">
          {parts.map((part) => (
            <ToolChip
              key={part.toolCallId}
              part={part}
              onConfirm={onConfirm}
              confirmingId={confirmingId}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function TypingIndicator({ label }: { label: string }) {
  return (
    <div
      className="inline-flex items-center gap-2 text-xs text-muted-fg"
      role="status"
      aria-label={label}
    >
      {label !== 'Thinking' ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
      ) : null}
      <span className="font-medium tracking-wide">{label}</span>
      <span className="inline-flex items-center gap-1" aria-hidden="true">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
      </span>
    </div>
  )
}

/**
 * Standalone assistant "thinking" row (avatar + bubble), shown from the moment
 * the user sends a message until the first assistant token streams back. Without
 * this, the `submitted` phase (no assistant message exists yet) shows nothing —
 * so a slow upstream looks frozen.
 */
export function ThinkingRow() {
  return (
    <div className="flex justify-start gap-1 numa-card-in sm:gap-2" role="status" aria-label="Numa is thinking">
      <NumaAvatar active size={36} className="self-end" />
      <div className="flex min-w-0 flex-col gap-1 sm:gap-2">
        <div className="rounded-2xl rounded-bl-sm bg-card/80 px-3 py-2 ring-1 ring-border-c sm:px-3.5 sm:py-2.5">
          <TypingIndicator label="Thinking" />
        </div>
      </div>
    </div>
  )
}

/**
 * Fallback for an assistant turn that finished with no content (e.g. an upstream
 * timeout/empty stream). Prevents a bare, mysterious empty bubble.
 */
function EmptyAssistantNote() {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-2xl rounded-bl-sm bg-card/80 px-3 py-2 text-xs text-muted-fg ring-1 ring-border-c sm:px-3.5 sm:py-2.5"
      role="status"
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
      <span>No response came back. Resend your message or tap &ldquo;Try again&rdquo;.</span>
    </div>
  )
}

/** Copy-message hover action. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  if (!text) return null
  return (
    <button
      type="button"
      aria-label="Copy message"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          toast.success('Copied to clipboard')
          setTimeout(() => setCopied(false), 1500)
        } catch {
          toast.error('Couldn’t copy to clipboard')
        }
      }}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-fg opacity-100 transition hover:bg-muted-bg hover:text-fg focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Message.
// ---------------------------------------------------------------------------

function MessageImpl({
  message,
  active = false,
  onConfirm,
  confirmingId,
  onRegenerate,
}: MessageProps) {
  const isUser = message.role === 'user'

  const textContent = message.parts
    .filter((p) => p.type === 'text')
    .map((p) => (p as { text: string }).text)
    .join('')

  if (isUser) {
    return (
      <div className="group flex items-start justify-end gap-1 sm:gap-2">
        <div className="order-2 max-w-[92%] break-words rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-fg sm:max-w-[80%] sm:px-3.5 sm:py-2.5">
          <div className="space-y-2">{renderContent(textContent)}</div>
        </div>
        <div className="order-1 mt-1">
          <CopyButton text={textContent} />
        </div>
      </div>
    )
  }

  const toolParts = message.parts.filter(isToolUIPart) as NumaToolPart[]
  const hasPendingTool = toolParts.some(
    (p) => p.state === 'input-streaming' || p.state === 'input-available',
  )
  const isActive = active || hasPendingTool
  const showTyping = active && textContent.length === 0 && toolParts.length === 0

  const activeToolName = toolParts.find(
    (p) => p.state === 'input-streaming' || p.state === 'input-available',
  )
  const typingLabel = activeToolName
    ? `Using ${actionLabel(getToolName(activeToolName) as string)}`
    : 'Thinking'

  // Split tool parts: those that render a rich card vs. those that go into the
  // collapsible timeline. register_agent always renders its own card.
  const cardParts: NumaToolPart[] = []
  const chipParts: NumaToolPart[] = []
  for (const p of toolParts) {
    const n = getToolName(p) as string
    const out = p.state === 'output-available' ? asRecord(p.output) : null
    const failed = !!out && out.ok === false
    const rendersCard =
      n === 'register_agent' ||
      (CARD_TOOLS.has(n) && p.state === 'output-available' && !failed) ||
      (n === 'get_bridge_status' && p.state === 'output-available' && !failed) ||
      EXECUTABLE_TOOLS.has(n)
    if (rendersCard) cardParts.push(p)
    else chipParts.push(p)
  }

  // A "data card" (portfolio/prices/yield/trending/scan) already shows every
  // figure. When one rendered, suppress a long trailing text bubble so the model
  // can't dump the same numbers again. A short line (<= 240 chars) is allowed
  // through as a one-line takeaway; anything longer is dropped.
  const hasDataCard = toolParts.some((p) => {
    const n = getToolName(p) as string
    if (!CARD_TOOLS.has(n) || p.state !== 'output-available') return false
    const out = asRecord(p.output)
    return out.ok !== false
  })
  const trimmedText = textContent.trim()
  const showText = trimmedText.length > 0 && (!hasDataCard || trimmedText.length <= 240)

  return (
    <div className="group flex justify-start gap-1 sm:gap-2" aria-live="polite">
      <NumaAvatar active={isActive} size={36} className="self-end" />
      <div className="flex min-w-0 max-w-[calc(100%-2.75rem)] flex-col gap-1 sm:max-w-[calc(85%-2.75rem)] sm:gap-2">
        {showTyping ? (
          <div className="rounded-2xl rounded-bl-sm bg-card/80 px-3 py-2 ring-1 ring-border-c sm:px-3.5 sm:py-2.5">
            <TypingIndicator label={typingLabel} />
          </div>
        ) : null}

        {!isActive && textContent.length === 0 && toolParts.length === 0 ? (
          <EmptyAssistantNote />
        ) : null}

        {chipParts.length > 0 ? (
          <ToolTimeline parts={chipParts} onConfirm={onConfirm} confirmingId={confirmingId} />
        ) : null}

        {cardParts.length > 0 ? (
          <div className="space-y-1.5">
            {cardParts.map((part) => (
              <ToolPart
                key={part.toolCallId}
                part={part}
                onConfirm={onConfirm}
                confirmingId={confirmingId}
              />
            ))}
          </div>
        ) : null}

        {showText ? (
          <div className="flex items-start gap-1">
            <div className="min-w-0 flex-1 break-words rounded-2xl rounded-bl-sm bg-card/80 px-3 py-2 text-sm text-fg ring-1 ring-border-c sm:px-3.5 sm:py-2.5">
              <div className="space-y-2">{renderContent(textContent)}</div>
            </div>
            <div className="mt-1">
              <CopyButton text={textContent} />
            </div>
          </div>
        ) : null}

        {onRegenerate ? (
          <button
            type="button"
            onClick={onRegenerate}
            className="inline-flex w-fit items-center gap-1.5 rounded-md px-1.5 py-1 text-2xs font-medium text-muted-fg transition hover:bg-muted-bg hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RotateCcw className="h-3 w-3" /> Regenerate
          </button>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Memoized: during streaming the messages array changes on every token, but
 * completed messages keep their object identity — memoizing skips re-running
 * the markdown renderer and card trees for the whole back-scroll on each
 * chunk, so long threads stay smooth.
 */
export const Message = memo(MessageImpl)
