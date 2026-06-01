'use client'

import { useEffect, useState, type ReactElement } from 'react'
import { useAccount } from 'wagmi'
import { PortfolioCard, type PortfolioCardData } from '@/components/chat/cards/portfolio-card'

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

  if (loading && !data) {
    return (
      <div className="space-y-2" aria-busy="true">
        <div className="numa-shimmer h-20 rounded-xl" aria-hidden />
        <div className="numa-shimmer h-32 rounded-xl" aria-hidden />
      </div>
    )
  }

  if (!data) {
    return <div className="numa-shimmer h-32 rounded-xl" aria-hidden />
  }

  return <PortfolioCard data={data} />
}
