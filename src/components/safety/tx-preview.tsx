'use client'

import { useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import type { Address, Hex } from 'viem'
import { formatUnits } from 'viem'
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  Info,
  Loader2,
  ShieldCheck,
  Wallet,
} from 'lucide-react'
import { FocusTrap } from 'focus-trap-react'
import type { SimulateTxResult } from '@/lib/safety'
import type { TxFlow } from '@/lib/use-tx-preview'
import { getChain } from '@/chains/registry'
import { ChainLogo } from '@/components/ui/chain-logo'
import { TokenLogo } from '@/components/chat/cards/_shared'
import { RiskBadge } from './risk-badge'
import { cn } from '@/lib/utils'

/** A simulated balance change row (negative out / positive in). */
export interface BalanceChange {
  symbol: string
  /** Signed human-readable amount. Negative = leaving wallet. */
  amount: number
  usd?: number | null
}

interface TxSummary {
  from: Address
  to: Address
  data?: Hex
  value?: string // wei as decimal string
  chainId?: number
  // Optional human context (filled in by the caller / AI tool result)
  action?: string // e.g. "Swap 100 USDC for ETH"
  tokenSymbol?: string
  /** Structured flow for the visual hero (swap / send / bridge). */
  flow?: TxFlow
  /** Optional simulated balance changes for the Rabby-grade preview. */
  balanceChanges?: BalanceChange[]
  /** Approval scope, if this tx is an ERC-20 approval. */
  approval?: { token: string; spender: string; unlimited: boolean; amount?: string }
  /** Slippage tolerance in percent, if applicable. */
  slippagePct?: number
}

interface TxPreviewProps {
  open: boolean
  summary: TxSummary
  simulation: SimulateTxResult | null
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
  /** USDC price of native gas token. On Arc, gas IS USDC, so price = 1. */
  gasPriceUsdc?: number
  /** Gas price in wei (decimal string) used to compute fee. */
  gasPriceWei?: string
  /**
   * When true, a true pre-sign simulation could not be produced (e.g. Circle
   * App Kit abstracts swap/send/bridge and exposes no raw calldata pre-sign).
   * We show the action summary honestly and label the simulation as unavailable
   * rather than fabricating balance deltas.
   */
  simUnavailable?: boolean
  /** Whether the underlying action is being broadcast (waiting for wallet). */
  signing?: boolean
}

function shortenAddr(a: string): string {
  if (a.length <= 12) return a
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return ''
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

/** Local token art (public/tokens); TokenLogo falls back to a monogram chip. */
function tokenLogoSrc(symbol: string): string | undefined {
  const s = symbol.toLowerCase()
  return s === 'usdc' || s === 'eurc' ? `/tokens/${s}.png` : undefined
}

function formatGasUsdc(
  gasEstimate: string | undefined,
  gasPriceWei: string | undefined,
  gasPriceUsdc: number,
): string | null {
  if (!gasEstimate) return null
  try {
    const gas = BigInt(gasEstimate)
    const price = gasPriceWei ? BigInt(gasPriceWei) : 0n
    if (price === 0n) {
      return `${gas.toString()} gas units`
    }
    const feeRaw = gas * price
    const feeUsdc = Number(formatUnits(feeRaw, 18)) * gasPriceUsdc
    return `${feeUsdc.toFixed(4)} USDC`
  } catch {
    return null
  }
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-fg">{label}</dt>
      <dd className="text-fg">{children}</dd>
    </div>
  )
}

/** Inline copy affordance for addresses/hashes, with a brief ✓ confirmation. */
function CopyChip({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1600)
        })
      }}
      className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 font-mono text-fg transition hover:bg-muted-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {shortenAddr(value)}
      {copied ? (
        <Check className="h-3 w-3 text-success" />
      ) : (
        <Copy className="h-3 w-3 text-muted-fg" />
      )}
    </button>
  )
}

/**
 * Visual hero for the action: what leaves the wallet, what arrives, where it
 * goes — at a glance, before any fine print.
 */
function FlowHero({ flow, action }: { flow?: TxFlow; action?: string }) {
  if (!flow) {
    return action ? (
      <div className="mb-4 rounded-xl border border-border-c bg-bg px-4 py-3 text-sm font-medium text-fg">
        {action}
      </div>
    ) : null
  }

  if (flow.kind === 'swap') {
    return (
      <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-border-c bg-bg px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <TokenLogo src={tokenLogoSrc(flow.token)} alt={flow.token} size={32} />
          <div className="min-w-0">
            <div className="text-2xs font-medium uppercase tracking-wide text-muted-fg">You pay</div>
            <div className="truncate text-sm font-semibold tabular-nums text-fg">
              {flow.amount} {flow.token}
            </div>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-fg" aria-hidden />
        <div className="flex min-w-0 items-center gap-2.5">
          <TokenLogo src={tokenLogoSrc(flow.toToken ?? '')} alt={flow.toToken ?? ''} size={32} />
          <div className="min-w-0">
            <div className="text-2xs font-medium uppercase tracking-wide text-muted-fg">
              You receive
            </div>
            <div className="truncate text-sm font-semibold text-fg">{flow.toToken}</div>
          </div>
        </div>
      </div>
    )
  }

  if (flow.kind === 'bridge') {
    const fromChain = flow.fromChainKey ? getChain(flow.fromChainKey) : undefined
    const toChain = flow.toChainKey ? getChain(flow.toChainKey) : undefined
    return (
      <div className="mb-4 rounded-xl border border-border-c bg-bg px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <TokenLogo src={tokenLogoSrc(flow.token)} alt={flow.token} size={32} />
          <div>
            <div className="text-2xs font-medium uppercase tracking-wide text-muted-fg">Bridge</div>
            <div className="text-sm font-semibold tabular-nums text-fg">
              {flow.amount} {flow.token}
            </div>
          </div>
        </div>
        {fromChain && toChain ? (
          <div className="mt-3 flex items-center gap-2 border-t border-border-c/60 pt-3 text-xs text-fg">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <ChainLogo src={fromChain.logo} name={fromChain.name} chainKey={fromChain.key} size={16} />
              <span className="truncate">{fromChain.name}</span>
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-fg" aria-hidden />
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <ChainLogo src={toChain.logo} name={toChain.name} chainKey={toChain.key} size={16} />
              <span className="truncate">{toChain.name}</span>
            </span>
          </div>
        ) : null}
      </div>
    )
  }

  // send
  return (
    <div className="mb-4 rounded-xl border border-border-c bg-bg px-4 py-3.5">
      <div className="flex items-center gap-2.5">
        <TokenLogo src={tokenLogoSrc(flow.token)} alt={flow.token} size={32} />
        <div>
          <div className="text-2xs font-medium uppercase tracking-wide text-muted-fg">Send</div>
          <div className="text-sm font-semibold tabular-nums text-fg">
            {flow.amount} {flow.token}
          </div>
        </div>
      </div>
      {flow.recipient ? (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border-c/60 pt-3 text-xs">
          <span className="text-muted-fg">To recipient</span>
          <CopyChip value={flow.recipient} label="recipient address" />
        </div>
      ) : null}
    </div>
  )
}

export function TxPreview({
  open,
  summary,
  simulation,
  loading,
  onConfirm,
  onCancel,
  gasPriceUsdc = 1,
  gasPriceWei,
  simUnavailable = false,
  signing = false,
}: TxPreviewProps): ReactElement | null {
  const risk = simulation?.risk ?? 'low'
  const warnings = simulation?.warnings ?? []
  const reverted = simulation?.ok === false

  const gasDisplay = useMemo(
    () => formatGasUsdc(simulation?.gasEstimate, gasPriceWei, gasPriceUsdc),
    [simulation?.gasEstimate, gasPriceWei, gasPriceUsdc],
  )
  const chain = summary.chainId != null ? getChain(summary.chainId) : undefined

  // High-risk → require a brief press-and-hold before the confirm fires.
  const [holdProgress, setHoldProgress] = useState(0)
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const highRisk = risk === 'high'

  function startHold() {
    if (!highRisk) return
    if (holdTimer.current) clearInterval(holdTimer.current)
    holdTimer.current = setInterval(() => {
      setHoldProgress((p) => {
        const next = p + 4
        if (next >= 100) {
          if (holdTimer.current) clearInterval(holdTimer.current)
          onConfirm()
          return 0
        }
        return next
      })
    }, 30)
  }
  function endHold() {
    if (holdTimer.current) clearInterval(holdTimer.current)
    setHoldProgress(0)
  }

  if (!open) return null

  const confirmDisabled = loading || reverted || signing
  const changes = summary.balanceChanges ?? []
  // A swap/bridge "to" that's just the user's own wallet is plumbing, not a
  // recipient — showing the same address twice reads like a bug.
  const showTo = summary.to.toLowerCase() !== summary.from.toLowerCase()

  return (
    // Trap focus while reviewing; Esc cancels (but not mid-sign), and focus
    // returns to the Confirm button that opened the modal on close.
    <FocusTrap
      focusTrapOptions={{
        escapeDeactivates: () => !signing && !loading,
        returnFocusOnDeactivate: true,
        onDeactivate: onCancel,
        fallbackFocus: '[data-tx-panel]',
      }}
    >
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tx-preview-title"
    >
      <div
        data-tx-panel
        tabIndex={-1}
        className="numa-card-in w-full max-w-md overflow-hidden rounded-2xl border border-border-c bg-popover shadow-2xl focus:outline-none"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border-c px-5 py-4">
          <div className="min-w-0">
            <h2 id="tx-preview-title" className="text-base font-semibold text-fg">
              Review transaction
            </h2>
            {chain ? (
              <span className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-fg">
                <ChainLogo src={chain.logo} name={chain.name} chainKey={chain.key} size={14} />
                {chain.name}
              </span>
            ) : null}
          </div>
          <RiskBadge risk={risk} />
        </div>

        <div className="max-h-[70vh] overflow-y-auto numa-scroll px-5 py-4">
          {/* What moves, at a glance. */}
          <FlowHero flow={summary.flow} action={summary.action} />

          {/* Simulated balance-change rows */}
          {changes.length > 0 ? (
            <div className="mb-4">
              <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-fg">
                Balance changes
              </div>
              <div className="space-y-1 rounded-lg border border-border-c bg-bg p-3">
                {changes.map((c, i) => {
                  const out = c.amount < 0
                  return (
                    <div key={i} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-1.5">
                        {out ? (
                          <ArrowUpRight className="h-3.5 w-3.5 text-danger" />
                        ) : (
                          <ArrowDownLeft className="h-3.5 w-3.5 text-success" />
                        )}
                        <span className={out ? 'text-danger' : 'text-success'}>
                          {out ? '' : '+'}
                          {c.amount} {c.symbol}
                        </span>
                      </span>
                      {c.usd != null ? (
                        <span className="text-xs tabular-nums text-muted-fg">{fmtUsd(c.usd)}</span>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {/* Risk panel: recipient / contract, approval scope, slippage, fee */}
          <div className="mb-4">
            <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-fg">
              Details
            </div>
            <dl className="space-y-2 rounded-lg border border-border-c bg-bg p-3 text-sm">
              <Row label="From">
                <span className="inline-flex items-center gap-1.5">
                  <span className="rounded-full bg-muted-bg px-1.5 py-0.5 text-2xs font-medium text-muted-fg">
                    Your wallet
                  </span>
                  <CopyChip value={summary.from} label="your wallet address" />
                </span>
              </Row>
              {showTo ? (
                <Row label="To">
                  <CopyChip value={summary.to} label="destination address" />
                </Row>
              ) : null}
              {summary.value && summary.value !== '0' ? (
                <Row label="Value">
                  <span className="font-mono">{summary.value} wei</span>
                </Row>
              ) : null}
              {summary.approval ? (
                <Row label="Approval">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1',
                      summary.approval.unlimited ? 'text-danger' : 'text-fg',
                    )}
                  >
                    {summary.approval.unlimited
                      ? 'Unlimited'
                      : (summary.approval.amount ?? 'Exact')}{' '}
                    {summary.approval.token}
                  </span>
                </Row>
              ) : null}
              {summary.approval ? (
                <Row label="Spender">
                  <CopyChip value={summary.approval.spender} label="spender address" />
                </Row>
              ) : null}
              {summary.slippagePct != null ? (
                <Row label="Max slippage">{summary.slippagePct}%</Row>
              ) : null}
              {gasDisplay ? <Row label="Network fee">{gasDisplay}</Row> : null}
              <Row label="Simulation">
                <span
                  className={
                    reverted
                      ? 'text-danger'
                      : simUnavailable && simulation === null
                        ? 'text-muted-fg'
                        : 'text-success'
                  }
                >
                  {loading
                    ? 'Running…'
                    : simulation === null
                      ? simUnavailable
                        ? 'Wallet verifies on sign'
                        : 'Pending'
                      : reverted
                        ? 'Will revert'
                        : 'Passed'}
                </span>
              </Row>
            </dl>
          </div>

          {reverted && simulation?.revertReason ? (
            <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
              <div className="mb-1 font-semibold">Revert reason</div>
              <div className="break-all font-mono">{simulation.revertReason}</div>
            </div>
          ) : null}

          {warnings.length > 0 ? (
            <ul className="mb-1 space-y-1.5 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
              {warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="leading-relaxed">{w}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {simUnavailable && simulation === null ? (
            <div className="flex items-start gap-2 rounded-lg border border-border-c bg-bg p-3 text-2xs leading-relaxed text-muted-fg">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                This action runs as a single abstracted call, so Numa can’t simulate it ahead
                of time. Check the amount and recipient above. Your wallet shows the final
                signing details before anything moves.
              </span>
            </div>
          ) : !highRisk && warnings.length === 0 && !reverted && simulation !== null ? (
            <div className="flex items-center gap-1.5 text-2xs text-muted-fg">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-success" />
              Simulated safe. No risky permissions detected.
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-border-c px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg border border-border-c bg-card px-4 py-2 text-sm text-fg transition hover:bg-muted-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            Cancel
          </button>
          {highRisk ? (
            <button
              type="button"
              onMouseDown={startHold}
              onMouseUp={endHold}
              onMouseLeave={endHold}
              onTouchStart={startHold}
              onTouchEnd={endHold}
              disabled={confirmDisabled}
              className="relative overflow-hidden rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-danger-fg transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <span
                className="absolute inset-0 bg-black/25"
                style={{ width: `${holdProgress}%` }}
                aria-hidden
              />
              <span className="relative inline-flex items-center gap-1.5">
                {loading || signing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {signing ? 'Waiting for wallet…' : 'Hold to confirm'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirmDisabled}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {loading || signing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wallet className="h-3.5 w-3.5" />
              )}
              {signing ? 'Waiting for wallet…' : 'Confirm in wallet'}
            </button>
          )}
        </div>
      </div>
    </div>
    </FocusTrap>
  )
}
