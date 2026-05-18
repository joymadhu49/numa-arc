'use client'

import type { ReactElement } from 'react'
import type { TokenBalance } from '@/ai/tools/portfolio'

export interface PortfolioCardProps {
  address: string
  balances: TokenBalance[]
  totalUsd: number
  loading?: boolean
}

const TOKEN_LOGOS: Record<string, string> = {
  USDC: 'https://assets.coingecko.com/coins/images/6319/standard/usdc.png',
  EURC: 'https://assets.coingecko.com/coins/images/26045/standard/euro.png',
}

function fmtAmount(amount: string, decimals = 4): string {
  const num = Number(amount)
  if (!Number.isFinite(num)) return amount
  if (num === 0) return '0.00'
  if (num < 0.0001) return num.toExponential(2)
  return num.toLocaleString(undefined, { maximumFractionDigits: decimals })
}

function fmtUsd(n: number): string {
  return n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

function shortAddress(addr: string): string {
  if (addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function PortfolioCard(props: PortfolioCardProps): ReactElement {
  const { address, balances, totalUsd, loading = false } = props

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4 shadow-lg sm:p-6">
      <header className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm text-zinc-400">{shortAddress(address)}</p>
          <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-300">
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-300" />
            Arc Testnet
          </span>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Total</p>
          <p className="text-xl font-semibold text-white sm:text-2xl">
            {loading ? '—' : fmtUsd(totalUsd)}
          </p>
        </div>
      </header>

      {loading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-lg bg-white/5"
              aria-hidden
            />
          ))}
        </div>
      ) : balances.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">No balances found.</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {balances.map((b) => {
            const logo = TOKEN_LOGOS[b.symbol]
            return (
              <li
                key={`${b.symbol}-${b.address ?? 'native'}`}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {logo ? (
                    <img
                      src={logo}
                      alt={b.symbol}
                      className="h-8 w-8 shrink-0 rounded-full ring-1 ring-white/10"
                    />
                  ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-semibold text-zinc-300">
                      {b.symbol.slice(0, 3)}
                    </div>
                  )}
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium text-white">{b.symbol}</span>
                    <span className="truncate text-xs text-zinc-500">{b.name}</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-sm text-white">{fmtAmount(b.amount)}</div>
                  {typeof b.usdValue === 'number' && b.usdValue > 0 && (
                    <div className="text-xs text-zinc-500">{fmtUsd(b.usdValue)}</div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
