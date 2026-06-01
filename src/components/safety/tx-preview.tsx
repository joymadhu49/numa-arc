'use client'

import { useMemo, useRef, useState, type ReactElement } from 'react'
import type { Address, Hex } from 'viem'
import { formatUnits } from 'viem'
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Loader2, ShieldCheck } from 'lucide-react'
import { FocusTrap } from 'focus-trap-react'
import type { SimulateTxResult } from '@/lib/safety'
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

function formatGasUsdc(
  gasEstimate: string | undefined,
  gasPriceWei: string | undefined,
  gasPriceUsdc: number,
): string {
  if (!gasEstimate) return '—'
  try {
    const gas = BigInt(gasEstimate)
    const price = gasPriceWei ? BigInt(gasPriceWei) : 0n
    if (price === 0n) {
      return `${gas.toString()} gas units`
    }
    const feeRaw = gas * price
    const feeUsdc = Number(formatUnits(feeRaw, 6)) * gasPriceUsdc
    return `${feeUsdc.toFixed(4)} USDC`
  } catch {
    return '—'
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-fg">{label}</dt>
      <dd className="text-fg">{children}</dd>
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
        <div className="flex items-center justify-between border-b border-border-c px-5 py-4">
          <h2 id="tx-preview-title" className="text-base font-semibold text-fg">
            Review transaction
          </h2>
          <RiskBadge risk={risk} />
        </div>

        <div className="max-h-[70vh] overflow-y-auto numa-scroll px-5 py-4">
          {/* Plain-English action summary */}
          {summary.action ? (
            <div className="mb-4 rounded-lg border border-border-c bg-bg p-3 text-sm text-fg">
              {summary.action}
            </div>
          ) : null}

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
                <span className="font-mono">{shortenAddr(summary.from)}</span>
              </Row>
              <Row label="To">
                <span className="font-mono">{shortenAddr(summary.to)}</span>
              </Row>
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
                  <span className="font-mono">{shortenAddr(summary.approval.spender)}</span>
                </Row>
              ) : null}
              {summary.slippagePct != null ? (
                <Row label="Max slippage">{summary.slippagePct}%</Row>
              ) : null}
              <Row label="Network fee">{gasDisplay}</Row>
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
                        ? 'Unavailable'
                        : 'Pending'
                      : reverted
                        ? 'Will revert'
                        : 'OK'}
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
            <div className="flex items-start gap-1.5 rounded-lg border border-border-c bg-bg p-3 text-2xs leading-relaxed text-muted-fg">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <span>
                Pre-sign simulation is not available for this action — Circle App Kit
                executes it as a single abstracted call and does not expose raw
                calldata beforehand. Review the action, amount, and recipient above,
                then confirm in your wallet (your wallet shows the final signing
                details).
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
            className="rounded-lg border border-border-c bg-card px-4 py-2 text-sm text-fg transition hover:bg-muted-bg disabled:opacity-50"
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
              className="relative overflow-hidden rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-danger-fg transition hover:brightness-110 disabled:opacity-50"
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
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg transition hover:brightness-110 disabled:opacity-50"
            >
              {loading || signing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {signing ? 'Waiting for wallet…' : 'Confirm'}
            </button>
          )}
        </div>
      </div>
    </div>
    </FocusTrap>
  )
}
