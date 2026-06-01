'use client'

import { useEffect, useState, type ReactElement } from 'react'
import { useAccount } from 'wagmi'
import { PortfolioCard, type PortfolioCardData } from '@/components/chat/cards/portfolio-card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Loads the connected wallet's MULTICHAIN portfolio (grouped by chain, dust
 * filtered, live USD) and renders the shared chain-grouped PortfolioCard — the
 * same polished card used in chat, so the page and chat never diverge.
 */
export function PortfolioLoader(): ReactElement {
  const { address, isConnected } = useAccount()
  const [data, setData] = useState<PortfolioCardData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!address) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const res = await fetch('/api/tools', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          // grouped:true → API returns the multichain PortfolioCardData directly.
          body: JSON.stringify({ tool: 'getPortfolio', args: { address, grouped: true }, address }),
        })
        const json = (await res.json()) as PortfolioCardData
        if (cancelled) return
        setData(json)
      } catch (e) {
        if (cancelled) return
        setData({ ok: false, error: e instanceof Error ? e.message : 'Failed to load portfolio' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [address])

  if (!isConnected || !address) {
    return (
      <div className="rounded-2xl border border-border-c bg-card p-8 text-center">
        <p className="text-sm text-fg">Connect a wallet to view your portfolio.</p>
        <p className="mt-2 text-xs text-muted-fg">Use the connect button in the bottom-left.</p>
      </div>
    )
  }

  if (loading || !data) {
    return <PortfolioSkeleton />
  }

  return <PortfolioCard data={data} />
}

/** Skeleton that mirrors the PortfolioCard shape (header + chain/token rows). */
function PortfolioSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-xl border border-border-c bg-card"
      aria-busy="true"
      aria-label="Loading portfolio"
    >
      <div className="border-b border-border-c px-4 py-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-7 w-40" />
      </div>
      <div className="space-y-3 p-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}
