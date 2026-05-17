'use client'

import { useMemo, type ReactElement } from 'react'
import type { Address, Hex } from 'viem'
import { formatUnits } from 'viem'
import type { SimulateTxResult } from '@/lib/safety'
import { RiskBadge } from './risk-badge'

interface TxSummary {
  from: Address
  to: Address
  data?: Hex
  value?: string // wei as decimal string
  chainId?: number
  // Optional human context (filled in by the caller / AI tool result)
  action?: string // e.g. "Swap 100 USDC for ETH"
  tokenSymbol?: string
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
}

function shortenAddr(a: string): string {
  if (a.length <= 12) return a
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

function formatGasUsdc(
  gasEstimate: string | undefined,
  gasPriceWei: string | undefined,
  gasPriceUsdc: number
): string {
  if (!gasEstimate) return '—'
  try {
    const gas = BigInt(gasEstimate)
    const price = gasPriceWei ? BigInt(gasPriceWei) : 0n
    if (price === 0n) {
      // Without a price, surface the raw gas units.
      return `${gas.toString()} gas units`
    }
    // Arc native gas token is USDC (6 decimals).
    const feeRaw = gas * price
    const feeUsdc = Number(formatUnits(feeRaw, 6)) * gasPriceUsdc
    return `${feeUsdc.toFixed(4)} USDC`
  } catch {
    return '—'
  }
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
}: TxPreviewProps): ReactElement | null {
  const risk = simulation?.risk ?? 'low'
  const warnings = simulation?.warnings ?? []
  const reverted = simulation?.ok === false

  const gasDisplay = useMemo(
    () => formatGasUsdc(simulation?.gasEstimate, gasPriceWei, gasPriceUsdc),
    [simulation?.gasEstimate, gasPriceWei, gasPriceUsdc]
  )

  if (!open) return null

  const confirmDisabled = loading || reverted

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tx-preview-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="tx-preview-title" className="text-base font-semibold text-neutral-100">
            Confirm transaction
          </h2>
          <RiskBadge risk={risk} />
        </div>

        {summary.action && (
          <div className="mb-3 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-sm text-neutral-200">
            {summary.action}
          </div>
        )}

        <dl className="mb-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-neutral-400">From</dt>
            <dd className="font-mono text-neutral-200">{shortenAddr(summary.from)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-neutral-400">To</dt>
            <dd className="font-mono text-neutral-200">{shortenAddr(summary.to)}</dd>
          </div>
          {summary.value && summary.value !== '0' && (
            <div className="flex justify-between">
              <dt className="text-neutral-400">Value</dt>
              <dd className="font-mono text-neutral-200">{summary.value} wei</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-neutral-400">Network fee</dt>
            <dd className="text-neutral-200">{gasDisplay}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-neutral-400">Simulation</dt>
            <dd className={reverted ? 'text-red-400' : 'text-emerald-400'}>
              {loading
                ? 'Running…'
                : simulation === null
                ? 'Pending'
                : reverted
                ? 'Will revert'
                : 'OK'}
            </dd>
          </div>
        </dl>

        {reverted && simulation?.revertReason && (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
            <div className="mb-1 font-semibold">Revert reason</div>
            <div className="font-mono break-all">{simulation.revertReason}</div>
          </div>
        )}

        {warnings.length > 0 && (
          <ul className="mb-4 space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
            {warnings.map((w, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden="true">!</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className={[
              'rounded-lg px-4 py-2 text-sm font-medium',
              risk === 'high'
                ? 'bg-red-500 text-white hover:bg-red-400'
                : 'bg-emerald-500 text-neutral-950 hover:bg-emerald-400',
              'disabled:opacity-50',
            ].join(' ')}
          >
            {risk === 'high' ? 'Confirm anyway' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
