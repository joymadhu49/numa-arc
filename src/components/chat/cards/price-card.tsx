'use client'

import { LineChart } from 'lucide-react'
import { CardShell, Delta, fmtUsd, CardError } from './_shared'

/** Matches SHARED contract: get_prices -> PriceCardData. */
export type PriceCardData =
  | { ok: true; prices: Array<{ symbol: string; usd: number | null; change24hPct: number | null }> }
  | { ok: false; error: string }

export function PriceCard({ data }: { data: PriceCardData }) {
  if (!data.ok) return <CardError message={data.error} />

  if (data.prices.length === 0) {
    return (
      <CardShell icon={<LineChart className="h-4 w-4" />} title="Prices">
        <div className="px-4 py-4 text-xs text-muted-fg">No prices available.</div>
      </CardShell>
    )
  }

  return (
    <CardShell icon={<LineChart className="h-4 w-4" />} title="Prices">
      <div className="divide-y divide-border-c/60">
        {data.prices.map((p, i) => (
          <div key={`${p.symbol}-${i}`} className="flex items-center justify-between gap-2 px-4 py-2.5">
            <span className="text-sm font-medium text-fg">{p.symbol}</span>
            <div className="flex items-baseline gap-3">
              <span className="text-sm tabular-nums text-fg">{fmtUsd(p.usd)}</span>
              <Delta pct={p.change24hPct} className="w-16 text-right tabular-nums" />
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  )
}
