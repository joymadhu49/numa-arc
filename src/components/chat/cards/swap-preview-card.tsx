'use client'

import { ArrowRight, Repeat, Loader2, ShieldCheck } from 'lucide-react'
import { CardShell } from './_shared'

/**
 * Compact, professional confirm card for an executable tool awaiting wallet
 * signature (input-available). Prop-driven; the confirm control is injected by
 * the caller (confirmSlot) so the useTxExecutor/addToolResult flow is preserved.
 */
export interface SwapPreviewCardProps {
  action: string
  summary: { left: string; arrow?: string; right?: string }
  /** Optional detail rows (slippage, fee, route, etc.). */
  details?: Array<{ label: string; value: string }>
  /** Network chip label (e.g. "Arc Testnet"). */
  network?: string
  /** Render the confirm control (kept in the caller to preserve v6 logic). */
  confirmSlot?: React.ReactNode
  waiting?: boolean
  note?: string
}

/** A token "amount + symbol" pill, e.g. "1 USDC" or just "EURC". */
function AssetPill({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center rounded-lg border border-border-c bg-bg px-2.5 py-1.5 text-sm font-semibold tabular-nums text-fg">
      {text || '—'}
    </span>
  )
}

export function SwapPreviewCard({
  action,
  summary,
  details,
  network,
  confirmSlot,
  waiting,
  note = 'Non-custodial. You review and approve in your wallet.',
}: SwapPreviewCardProps) {
  return (
    <CardShell
      icon={<Repeat className="h-4 w-4" />}
      title={action}
      right={
        network ? (
          <span className="rounded-full border border-border-c bg-bg px-2 py-0.5 text-2xs font-medium text-muted-fg">
            {network}
          </span>
        ) : undefined
      }
    >
      <div className="px-4 py-3">
        {/* from → to */}
        <div className="flex items-center gap-2">
          <AssetPill text={summary.left} />
          {summary.right ? (
            <>
              <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
              <AssetPill text={summary.right} />
            </>
          ) : summary.arrow ? (
            <span className="text-sm text-muted-fg">{summary.arrow}</span>
          ) : null}
        </div>

        {/* meta: detail rows only when provided (no hardcoded slippage — it
            would misstate the value the user is about to approve) */}
        {details && details.length > 0 ? (
          <div className="mt-3 space-y-1 border-t border-border-c pt-2.5">
            {details.map((d, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-fg">{d.label}</span>
                <span className="font-medium tabular-nums text-fg">{d.value}</span>
              </div>
            ))}
          </div>
        ) : null}

        {/* security note */}
        <div className="mt-3 flex items-center gap-1.5 text-2xs text-muted-fg">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-success" />
          {note}
        </div>

        {confirmSlot ? (
          <div className="mt-3">{confirmSlot}</div>
        ) : waiting ? (
          <div className="mt-3 inline-flex items-center gap-2 text-xs text-muted-fg">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Waiting for wallet…
          </div>
        ) : null}
      </div>
    </CardShell>
  )
}
