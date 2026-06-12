'use client'

import { LineChart } from 'lucide-react'
import { CardShell, Delta, fmtUsd, CardError, CardEmpty } from './_shared'

/** Matches SHARED contract: get_prices -> PriceCardData. */
export type PriceCardData =
  | { ok: true; prices: Array<{ symbol: string; usd: number | null; change24hPct: number | null }> }
  | { ok: false; error: string }

export function PriceCard({ data }: { data: PriceCardData }) {
  if (!data.ok) return <CardError message={data.error} />

  if (data.prices.length === 0) {
    return (
      <CardShell icon={<LineChart className="h-4 w-4" />} title="Prices">
        <CardEmpty
          title="No prices found"
          hint="The token may not be listed yet — try a different symbol, e.g. “price of USDC” or “ETH price”."
        />
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
