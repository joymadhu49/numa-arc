'use client'

import { Sprout } from 'lucide-react'
import { CardShell, fmtUsd, fmtPct, CardError } from './_shared'

/** Matches SHARED contract: get_yield -> YieldCardData. */
export type YieldCardData =
  | {
      ok: true
      pools: Array<{
        project: string
        symbol: string
        chain: string
        apy: number
        tvlUsd: number
      }>
    }
  | { ok: false; error: string }

export function YieldCard({ data }: { data: YieldCardData }) {
  if (!data.ok) return <CardError message={data.error} />

  if (data.pools.length === 0) {
    return (
      <CardShell icon={<Sprout className="h-4 w-4" />} title="Yield">
        <div className="px-4 py-4 text-xs text-muted-fg">No matching pools.</div>
      </CardShell>
    )
  }

  return (
    <CardShell icon={<Sprout className="h-4 w-4" />} title="Yield opportunities">
      <div className="divide-y divide-border-c/60">
        {data.pools.map((p, i) => (
          <div key={`${p.project}-${p.symbol}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-fg">{p.symbol}</span>
                <span className="rounded bg-muted-bg px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-fg">
                  {p.chain}
                </span>
              </div>
              <div className="truncate text-[11px] text-muted-fg">{p.project}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm font-semibold tabular-nums text-success">
                {fmtPct(p.apy)}
              </div>
              <div className="text-[11px] tabular-nums text-muted-fg">
                {fmtUsd(p.tvlUsd, { compact: true })} TVL
              </div>
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  )
}
