'use client'

import { useCallback, useState } from 'react'
import { Shuffle, ExternalLink, Sparkles, Loader2 } from 'lucide-react'
import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeFunctionData,
  http,
  numberToHex,
  decodeEventLog,
  type Address,
} from 'viem'
import { useAccount, useConfig } from 'wagmi'
import { arcTestnet } from '@/chains/arc'
import { generateAgent, saveAgent, type GeneratedAgent } from '@/lib/agent-generator'

const NUMA_AGENT_NFT = process.env.NEXT_PUBLIC_NUMA_AGENT_NFT as Address | undefined

const NUMA_AGENT_ABI = [
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentName', type: 'string' },
      { name: 'seed', type: 'string' },
      { name: 'rarity', type: 'string' },
      { name: 'imageUrl', type: 'string' },
    ],
    outputs: [{ name: 'tokenId', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'Mint',
    inputs: [
      { name: 'to', type: 'address', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'agentName', type: 'string', indexed: false },
      { name: 'seed', type: 'string', indexed: false },
      { name: 'rarity', type: 'string', indexed: false },
    ],
  },
] as const

interface MintAgentCardProps {
  onMinted?: (agent: GeneratedAgent) => void
}

export function MintAgentCard({ onMinted }: MintAgentCardProps) {
  const [agent, setAgent] = useState<GeneratedAgent>(() => generateAgent())
  const [minting, setMinting] = useState(false)
  const [minted, setMinted] = useState<GeneratedAgent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { address } = useAccount()
  const config = useConfig()

  const reroll = useCallback(() => {
    setAgent(generateAgent())
    setMinted(null)
    setError(null)
  }, [])

  const onMint = useCallback(async () => {
    if (minting || !address) return
    if (!NUMA_AGENT_NFT) {
      setError('NumaAgent contract not configured. Run npm run deploy:numa-agent first.')
      return
    }
    setMinting(true)
    setError(null)
    try {
      const connection = config.state.connections.get(config.state.current ?? '')
      const connector = connection?.connector ?? config.connectors[0]
      if (!connector) throw new Error('No wallet connector available')
      const provider = (await connector.getProvider()) as {
        request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
      }
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: numberToHex(arcTestnet.id) }],
        })
      } catch (e: unknown) {
        const code = (e as { code?: number })?.code
        if (code === 4902) {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: numberToHex(arcTestnet.id),
                chainName: arcTestnet.name,
                nativeCurrency: arcTestnet.nativeCurrency,
                rpcUrls: arcTestnet.rpcUrls.default.http,
                blockExplorerUrls: [arcTestnet.blockExplorers.default.url],
              },
            ],
          })
        }
      }

      const walletClient = createWalletClient({
        account: address as Address,
        chain: arcTestnet,
        transport: custom(provider as unknown as Parameters<typeof custom>[0]),
      })
      const publicClient = createPublicClient({ chain: arcTestnet, transport: http() })

      const data = encodeFunctionData({
        abi: NUMA_AGENT_ABI,
        functionName: 'mint',
        args: [agent.name, agent.seed, agent.rarity, agent.imageUrl],
      })

      const hash = await walletClient.sendTransaction({
        account: address as Address,
        chain: arcTestnet,
        to: NUMA_AGENT_NFT,
        value: 0n,
        data,
      })

      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      let tokenId: string | undefined
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: NUMA_AGENT_ABI, data: log.data, topics: log.topics })
          if (decoded.eventName === 'Mint') {
            tokenId = (decoded.args as { tokenId: bigint }).tokenId.toString()
            break
          }
        } catch {
          // not our event
        }
      }

      const explorerUrl = `${arcTestnet.blockExplorers.default.url}/tx/${hash}`
      const final: GeneratedAgent = {
        ...agent,
        txHash: hash,
        explorerUrl,
        ownerAddress: address,
        id: tokenId ?? agent.id,
      }
      saveAgent(final)
      setMinted(final)
      onMinted?.(final)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'mint_failed'
      setError(
        msg.toLowerCase().includes('rejected') || msg.toLowerCase().includes('denied')
          ? 'Mint cancelled'
          : msg,
      )
    } finally {
      setMinting(false)
    }
  }, [agent, address, config, minting, onMinted])

  return (
    <div className="numa-card-in overflow-hidden rounded-2xl border border-border-c bg-card">
      <div className="grid gap-4 p-4 sm:gap-5 sm:p-5 md:grid-cols-[200px_1fr]">
        <div className="relative mx-auto w-full max-w-[180px] md:max-w-none">
          <div className="grid aspect-square w-full place-items-center rounded-xl bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={agent.imageUrl}
              alt={agent.name}
              className="h-full w-full rounded-xl"
            />
          </div>
          <button
            type="button"
            onClick={reroll}
            disabled={minting || minted !== null}
            aria-label="Reroll character"
            className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-full bg-bg/80 text-fg backdrop-blur transition hover:bg-muted-bg disabled:opacity-50"
          >
            <Shuffle className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <div>
            <h3 className="break-words text-lg font-bold tracking-tight text-fg sm:text-xl">{agent.name}</h3>
            <p className="mt-1 text-xs text-muted-fg">
              Numa Agent — on-chain attestation on Arc Testnet. Unlimited supply. Each
              character is unique and bound to your wallet via a soulbound mint tx.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-primary/30 bg-primary/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
              {agent.rarity}
            </span>
            {agent.capabilities.map((c) => (
              <span
                key={c}
                className="rounded-full border border-border-c px-2 py-0.5 text-[10px] text-muted-fg"
              >
                {c}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border border-border-c bg-bg px-3 py-2">
              <div className="text-muted-fg">Mint cost</div>
              <div className="mt-0.5 font-semibold text-fg">Gas only</div>
            </div>
            <div className="rounded-lg border border-border-c bg-bg px-3 py-2">
              <div className="text-muted-fg">Chain</div>
              <div className="mt-0.5 font-semibold text-fg">Arc Testnet</div>
            </div>
          </div>

          {minted ? (
            <div className="flex flex-col gap-2 rounded-lg border border-success/40 bg-success/10 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-fg">
                <Sparkles className="h-4 w-4 text-success" />
                Minted on-chain. {minted.name} is yours.
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px]">
                <a
                  href={minted.explorerUrl ?? '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-[36px] items-center gap-1 break-all text-muted-fg underline decoration-border-c underline-offset-4 hover:text-fg"
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  {minted.txHash?.slice(0, 14)}…
                </a>
                <a
                  href="/agent"
                  className="inline-flex min-h-[36px] items-center gap-1 text-muted-fg underline decoration-border-c underline-offset-4 hover:text-fg"
                >
                  View profile
                </a>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={minting || !address}
              onClick={() => void onMint()}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-fg transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-muted-bg disabled:text-muted-fg"
            >
              {minting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Confirm in wallet…
                </>
              ) : address ? (
                <>Mint on Arc Testnet</>
              ) : (
                <>Connect wallet to mint</>
              )}
            </button>
          )}

          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      </div>
    </div>
  )
}
