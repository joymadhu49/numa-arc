'use client'

import { useEffect, useState, type ReactElement } from 'react'
import { useAccount } from 'wagmi'
import { PortfolioCard } from './portfolio-card'
import type { TokenBalance } from '@/ai/tools/portfolio'
import { ARC_TESTNET_CHAIN_ID } from '@/lib/tokens'

interface PortfolioState {
  balances: TokenBalance[]
  totalUsd: number
  loading: boolean
  error?: string
}

export function PortfolioLoader(): ReactElement {
  const { address, isConnected } = useAccount()
  const [state, setState] = useState<PortfolioState>({
    balances: [],
    totalUsd: 0,
    loading: false,
  })

  useEffect(() => {
    if (!address) {
      setState({ balances: [], totalUsd: 0, loading: false })
      return
    }
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: undefined }))
    ;(async () => {
      try {
        const res = await fetch('/api/tools', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            tool: 'getPortfolio',
            args: { address, chainId: ARC_TESTNET_CHAIN_ID },
            address,
          }),
        })
        const json = (await res.json()) as
          | { ok: true; data: { balances: TokenBalance[]; totalUsd: number } }
          | { ok: false; error: string }
        if (cancelled) return
        if (json.ok) {
          setState({
            balances: json.data.balances,
            totalUsd: json.data.totalUsd,
            loading: false,
          })
        } else {
          setState({ balances: [], totalUsd: 0, loading: false, error: json.error })
        }
      } catch (e) {
        if (cancelled) return
        setState({
          balances: [],
          totalUsd: 0,
          loading: false,
          error: e instanceof Error ? e.message : 'Failed to load portfolio',
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [address])

  if (!isConnected || !address) {
    return (
      <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-8 text-center">
        <p className="text-sm text-neutral-300">
          Connect a wallet to view your portfolio.
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          Use the connect button in the bottom-left.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <PortfolioCard
        address={address}
        balances={state.balances}
        totalUsd={state.totalUsd}
        loading={state.loading}
      />
      {state.error ? <p className="text-xs text-red-400">{state.error}</p> : null}
    </div>
  )
}
