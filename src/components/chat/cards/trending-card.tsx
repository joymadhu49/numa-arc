'use client'

import { TrendingUp } from 'lucide-react'
import { CardShell, Delta, fmtUsd, CardError } from './_shared'

/** Matches SHARED contract: get_trending -> TrendingCardData. */
export type TrendingCardData =
  | {
      ok: true
      tokens: Array<{
        symbol: string
        name: string
        rank?: number
        priceUsd?: number
        change24hPct?: number
      }>
    }
  | { ok: false; error: string }

export function TrendingCard({ data }: { data: TrendingCardData }) {
  if (!data.ok) return <CardError message={data.error} />

  if (data.tokens.length === 0) {
    return (
      <CardShell icon={<TrendingUp className="h-4 w-4" />} title="Trending">
        <div className="px-4 py-4 text-xs text-muted-fg">Nothing trending right now.</div>
      </CardShell>
    )
  }

  return (
    <CardShell icon={<TrendingUp className="h-4 w-4" />} title="Trending">
      <div className="divide-y divide-border-c/60">
        {data.tokens.map((t, i) => (
          <div key={`${t.symbol}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-fg">
              {t.rank ?? i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-fg">{t.symbol}</div>
              <div className="truncate text-[11px] text-muted-fg">{t.name}</div>
            </div>
            <div className="shrink-0 text-right">
              {t.priceUsd != null ? (
                <div className="text-sm tabular-nums text-fg">{fmtUsd(t.priceUsd)}</div>
              ) : null}
              <Delta pct={t.change24hPct ?? null} />
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  )
}
