'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { numberToHex } from 'viem'
import { baseSepolia, sepolia } from 'viem/chains'
import { useAccount, useChainId, useConfig } from 'wagmi'
import { arcTestnet } from '@/chains/arc'
import { cn } from '@/lib/utils'

interface ChainOption {
  id: number
  name: string
  short: string
  logo: string
  chain: typeof arcTestnet | typeof baseSepolia | typeof sepolia
}

const CHAINS: ChainOption[] = [
  {
    id: arcTestnet.id,
    name: 'Arc Testnet',
    short: 'Arc',
    logo: 'https://pbs.twimg.com/profile_images/1955238194443849732/sHyVRItm_400x400.jpg',
    chain: arcTestnet,
  },
  {
    id: sepolia.id,
    name: 'Ethereum Sepolia',
    short: 'Sepolia',
    logo: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png?1696501628',
    chain: sepolia,
  },
  {
    id: baseSepolia.id,
    name: 'Base Sepolia',
    short: 'Base',
    logo: 'https://pbs.twimg.com/profile_images/1945608199500910592/rnk6ixxH_400x400.jpg',
    chain: baseSepolia,
  },
]

export function NetworkSwitcher() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const config = useConfig()
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const current = CHAINS.find((c) => c.id === chainId) ?? CHAINS[0]

  async function switchTo(target: ChainOption) {
    setSwitching(target.id)
    try {
      const connection = config.state.connections.get(config.state.current ?? '')
      const connector = connection?.connector ?? config.connectors[0]
      if (!connector) return
      const provider = (await connector.getProvider()) as {
        request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
      }
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: numberToHex(target.id) }],
        })
      } catch (e: unknown) {
        const code = (e as { code?: number })?.code
        if (code === 4902) {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: numberToHex(target.id),
                chainName: target.chain.name,
                nativeCurrency: target.chain.nativeCurrency,
                rpcUrls: target.chain.rpcUrls.default.http,
                blockExplorerUrls: target.chain.blockExplorers
                  ? [target.chain.blockExplorers.default.url]
                  : undefined,
              },
            ],
          })
        }
      }
    } finally {
      setSwitching(null)
      setOpen(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!isConnected}
        className="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs font-medium text-neutral-200 transition-colors hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2 sm:px-2.5"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current.logo} alt={current.name} className="h-4 w-4 rounded-full" />
        <span className="hidden uppercase tracking-wider sm:inline">{current.short}</span>
        <ChevronDown className="h-3 w-3 text-neutral-400" />
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-md border border-neutral-800 bg-neutral-950 shadow-lg">
          <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-neutral-500">
            Switch network
          </div>
          {CHAINS.map((c) => {
            const active = c.id === chainId
            const pending = switching === c.id
            return (
              <button
                key={c.id}
                type="button"
                disabled={pending}
                onClick={() => void switchTo(c)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors',
                  active ? 'bg-neutral-900 text-white' : 'text-neutral-200 hover:bg-neutral-900',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.logo} alt={c.name} className="h-5 w-5 rounded-full" />
                <span className="flex-1">{c.name}</span>
                {active ? <Check className="h-3.5 w-3.5 text-white" /> : null}
                {pending ? (
                  <span className="text-[10px] text-neutral-400">switching…</span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
