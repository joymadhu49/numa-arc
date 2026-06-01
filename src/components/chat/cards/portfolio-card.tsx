'use client'

import { useState } from 'react'
import { ChevronDown, Wallet } from 'lucide-react'
import { CardShell, TokenLogo, Delta, fmtUsd, CardError } from './_shared'
import { ChainLogo } from '@/components/ui/chain-logo'
import { cn } from '@/lib/utils'

/** Matches SHARED contract: get_portfolio -> PortfolioCardData. */
export interface PortfolioToken {
  symbol: string
  name: string
  balance: string
  usd: number | null
  priceUsd: number | null
  change24hPct: number | null
  logo?: string
}
export interface PortfolioChain {
  chainKey: string
  chainName: string
  logo: string
  tokens: PortfolioToken[]
}
export type PortfolioCardData =
  | {
      ok: true
      address: string
      totalUsd: number
      change24hPct: number | null
      chains: PortfolioChain[]
    }
  | { ok: false; error: string }

/** Hide token rows worth less than this (dust). Unpriced tokens (usd === null) are always kept. */
const DUST_USD = 0.01

function visibleTokens(tokens: PortfolioToken[]): PortfolioToken[] {
  return tokens.filter((t) => t.usd === null || t.usd >= DUST_USD)
}

/** Chains shown above the fold before the "show N more" affordance kicks in. */
const COLLAPSE_AFTER = 4

export function PortfolioCard({ data }: { data: PortfolioCardData }) {
  const [expanded, setExpanded] = useState(false)
  if (!data.ok) return <CardError message={data.error} />

  const { totalUsd, change24hPct, chains } = data
  const up = (change24hPct ?? 0) >= 0

  const nonEmpty = chains
    .map((c) => ({ ...c, tokens: visibleTokens(c.tokens) }))
    .filter((c) => c.tokens.length > 0)

  const hiddenCount = nonEmpty.length - COLLAPSE_AFTER
  const shown = expanded ? nonEmpty : nonEmpty.slice(0, COLLAPSE_AFTER)

  return (
    <CardShell icon={<Wallet className="h-4 w-4" />} title="Portfolio">
      <div className="border-b border-border-c px-3 py-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-fg">Net worth</div>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-xl font-semibold tabular-nums text-fg sm:text-2xl">{fmtUsd(totalUsd)}</span>
          {change24hPct != null ? (
            <span className={cn('text-xs font-medium', up ? 'text-success' : 'text-danger')}>
              {up ? '+' : ''}{change24hPct.toFixed(2)}% <span className="text-muted-fg">24h</span>
            </span>
          ) : null}
        </div>
      </div>

      {nonEmpty.length === 0 ? (
        <div className="px-3 py-3 text-xs text-muted-fg">No funded balances.</div>
      ) : (
        <>
          <div className="divide-y divide-border-c/60">
            {shown.map((chain) => (
              <div key={chain.chainKey} className="px-3 py-2">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <ChainLogo src={chain.logo} name={chain.chainName} chainKey={chain.chainKey} size={14} />
                  <span className="text-[11px] font-medium text-muted-fg">{chain.chainName}</span>
                </div>
                <div className="space-y-1">
                  {chain.tokens.map((t, i) => (
                    <div key={`${t.symbol}-${i}`} className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <TokenLogo src={t.logo} alt={t.symbol} size={18} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13px] font-medium text-fg">{t.symbol}</span>
                            {t.change24hPct != null ? <Delta pct={t.change24hPct} /> : null}
                          </div>
                          <div className="truncate text-[11px] tabular-nums text-muted-fg">{t.balance} {t.symbol}</div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[13px] tabular-nums text-fg">{fmtUsd(t.usd)}</div>
                        {t.priceUsd != null ? (
                          <div className="text-[11px] tabular-nums text-muted-fg">{fmtUsd(t.priceUsd)}</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {hiddenCount > 0 ? (
            <button type="button" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}
              className="flex w-full items-center justify-center gap-1 border-t border-border-c px-3 py-2 text-[11px] font-medium text-muted-fg transition hover:bg-muted-bg hover:text-fg">
              {expanded ? 'Show less' : `Show ${hiddenCount} more ${hiddenCount === 1 ? 'chain' : 'chains'}`}
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded ? 'rotate-180' : '')} />
            </button>
          ) : null}
        </>
      )}
    </CardShell>
  )
}
