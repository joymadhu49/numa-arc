'use client'

import { useCallback } from 'react'
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  numberToHex,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem'
import { baseSepolia, sepolia } from 'viem/chains'
import { useAccount, useConfig } from 'wagmi'
import { getConnectorClient, getWalletClient, switchChain } from 'wagmi/actions'
import { ViemAdapter } from '@circle-fin/adapter-viem-v2'
import { ArcTestnet, BaseSepolia, EthereumSepolia } from '@circle-fin/app-kit/chains'
import { appkit } from '@/lib/appkit'
import { arcTestnet } from '@/chains/arc'

export interface TxExecResult {
  ok: boolean
  hash?: string
  explorerUrl?: string
  error?: string
  data?: unknown
}

interface AppKitTxApi {
  swap: (params: {
    from: { adapter: unknown; chain: string }
    tokenIn: string
    tokenOut: string
    amountIn: string
    config?: { kitKey?: string }
  }) => Promise<{ txHash?: string; hash?: string; transactionHash?: string; explorerUrl?: string }>
  bridge: (params: {
    from: { adapter: unknown; chain: string }
    to: { adapter: unknown; chain: string }
    amount: string
    token?: 'USDC'
    config?: { kitKey?: string }
  }) => Promise<{
    state?: string
    steps?: Array<{ name?: string; state?: string; txHash?: string; explorerUrl?: string }>
  }>
  send: (params: {
    from: { adapter: unknown; chain: string }
    to: string
    amount: string
    token?: string
    config?: { kitKey?: string }
  }) => Promise<{ txHash?: string; hash?: string; explorerUrl?: string }>
}

const KIT_KEY = process.env.NEXT_PUBLIC_KIT_KEY ?? ''
const SUPPORTED_CHAINS = [ArcTestnet, BaseSepolia, EthereumSepolia]

interface ChainInfo {
  viem: Chain
  wagmiId: number
}

const CHAIN_MAP: Record<string, ChainInfo> = {
  Arc_Testnet: { viem: arcTestnet, wagmiId: arcTestnet.id },
  Base_Sepolia: { viem: baseSepolia, wagmiId: baseSepolia.id },
  Ethereum_Sepolia: { viem: sepolia, wagmiId: sepolia.id },
}

function resolveChain(
  rawChain: unknown,
): ChainInfo {
  if (typeof rawChain === 'string') {
    return CHAIN_MAP[rawChain] ?? { viem: arcTestnet, wagmiId: arcTestnet.id }
  }
  if (rawChain && typeof rawChain === 'object') {
    const c = rawChain as { chain?: string; name?: string; chainId?: number; id?: number }
    const enumName = c.chain
    if (enumName && CHAIN_MAP[enumName]) return CHAIN_MAP[enumName]
    const cid = c.chainId ?? c.id
    if (typeof cid === 'number') {
      for (const info of Object.values(CHAIN_MAP)) {
        if (info.wagmiId === cid) return info
      }
    }
  }
  return { viem: arcTestnet, wagmiId: arcTestnet.id }
}

function explorerFor(hash: string, chain: Chain = arcTestnet): string {
  return `${chain.blockExplorers?.default.url ?? arcTestnet.blockExplorers.default.url}/tx/${hash}`
}

function buildAdapter(
  config: ReturnType<typeof useConfig>,
): ViemAdapter {
  const adapterOptions = {
    getPublicClient: ({ chain }: { chain: unknown }): PublicClient => {
      const info = resolveChain(chain)
      if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
        console.debug('[arcwise] getPublicClient', { rawChain: chain, resolved: info.viem.name })
      }
      return createPublicClient({ chain: info.viem, transport: http() })
    },
    getWalletClient: async ({ chain }: { chain: unknown }): Promise<WalletClient> => {
      const info = resolveChain(chain)
      const connection = config.state.connections.get(config.state.current ?? '')
      const connector = connection?.connector ?? config.connectors[0]
      if (!connector) throw new Error('no wallet connector')
      const provider = (await connector.getProvider()) as {
        request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
      }
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: numberToHex(info.wagmiId) }],
        })
      } catch (e: unknown) {
        // 4902 = chain not added; try add then switch
        const errCode = (e as { code?: number })?.code
        if (errCode === 4902) {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: numberToHex(info.wagmiId),
                chainName: info.viem.name,
                nativeCurrency: info.viem.nativeCurrency,
                rpcUrls: info.viem.rpcUrls.default.http,
                blockExplorerUrls: info.viem.blockExplorers
                  ? [info.viem.blockExplorers.default.url]
                  : undefined,
              },
            ],
          })
        } else if (errCode !== 4001) {
          // 4001 = user rejected; surface anything else, ignore otherwise
        }
      }
      const account = connection?.accounts[0]
      if (!account) throw new Error('no account')
      const walletClient: WalletClient = createWalletClient({
        account,
        chain: info.viem,
        transport: custom(provider as unknown as Parameters<typeof custom>[0]),
      })
      return walletClient
    },
  }
  const capabilities = {
    addressContext: 'user-controlled' as const,
    supportedChains: SUPPORTED_CHAINS,
  }
  return new ViemAdapter(
    adapterOptions as unknown as ConstructorParameters<typeof ViemAdapter>[0],
    capabilities as unknown as ConstructorParameters<typeof ViemAdapter>[1],
  )
}

export interface ExecInput {
  tool: string
  input: Record<string, unknown>
  address?: Address
}

export function useTxExecutor(): (e: ExecInput) => Promise<TxExecResult> {
  const config = useConfig()

  return useCallback(
    async ({ tool, input, address }: ExecInput): Promise<TxExecResult> => {
      try {
        const adapter = buildAdapter(config)
        const kit = appkit as unknown as AppKitTxApi
        const cfg = KIT_KEY ? { config: { kitKey: KIT_KEY } } : {}

        if (tool === 'swap') {
          const tokenIn = String(input.fromToken ?? input.tokenIn ?? 'USDC')
          const tokenOut = String(input.toToken ?? input.tokenOut ?? 'EURC')
          const amount = String(input.amount ?? '0')
          const r = await kit.swap({
            from: { adapter, chain: 'Arc_Testnet' },
            tokenIn,
            tokenOut,
            amountIn: amount,
            ...cfg,
          })
          const hash = r.txHash ?? r.hash ?? r.transactionHash
          if (!hash) return { ok: false, error: 'no tx hash returned' }
          return { ok: true, hash, explorerUrl: r.explorerUrl ?? explorerFor(hash) }
        }

        if (tool === 'bridge') {
          const fromChain = String(input.fromChain ?? 'Arc_Testnet')
          const toChain = String(input.toChain ?? 'Arc_Testnet')
          const amount = String(input.amount ?? '0')
          const r = await kit.bridge({
            from: { adapter, chain: fromChain },
            to: { adapter, chain: toChain },
            amount,
            token: 'USDC',
            ...cfg,
          })
          const steps = r.steps ?? []
          const burn = steps.find(
            (s) => s.txHash && (s.name?.toLowerCase().includes('burn') || s.state === 'success'),
          )
          const anyHash = burn ?? steps.find((s) => s.txHash)
          const hash = anyHash?.txHash
          if (!hash) {
            const errStep = steps.find((s) => s.state === 'error')
            return {
              ok: false,
              error: errStep
                ? `bridge step "${errStep.name}" failed`
                : `bridge ${r.state ?? 'returned no tx hash'}`,
            }
          }
          return {
            ok: true,
            hash,
            explorerUrl: anyHash?.explorerUrl ?? explorerFor(hash),
            data: { state: r.state, steps },
          }
        }

        if (tool === 'send') {
          const to = String(input.to ?? '')
          const amount = String(input.amount ?? '0')
          const token = String(input.token ?? 'USDC')
          if (!to.startsWith('0x')) return { ok: false, error: 'invalid recipient address' }
          const r = await kit.send({
            from: { adapter, chain: 'Arc_Testnet' },
            to,
            amount,
            token,
            ...cfg,
          })
          const hash = r.txHash ?? r.hash
          if (!hash) return { ok: false, error: 'no tx hash returned' }
          return { ok: true, hash, explorerUrl: r.explorerUrl ?? explorerFor(hash) }
        }

        // Tools that build their own calldata server-side
        const dispatchMap: Record<string, string> = {
          deposit: 'deposit',
          withdraw: 'withdraw',
          add_liquidity: 'add_liquidity',
          remove_liquidity: 'remove_liquidity',
        }
        const serverTool = dispatchMap[tool]
        if (serverTool) {
          const connection = config.state.connections.get(config.state.current ?? '')
          const connector = connection?.connector ?? config.connectors[0]
          if (!connector) return { ok: false, error: 'no wallet connector' }
          const provider = (await connector.getProvider()) as {
            request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
          }
          try {
            await provider.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: numberToHex(arcTestnet.id) }],
            })
          } catch {
            // already on chain or rejected
          }
          const account = connection?.accounts[0]
          if (!account) return { ok: false, error: 'no account' }
          const walletClient = createWalletClient({
            account,
            chain: arcTestnet,
            transport: custom(provider as unknown as Parameters<typeof custom>[0]),
          })
          const res = await fetch('/api/tools', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ tool: serverTool, args: input, address }),
          })
          const json = (await res.json()) as {
            ok: boolean
            data?: { prepared?: { to: string; data: string; value: string } }
            error?: string
          }
          if (!json.ok || !json.data?.prepared) {
            return { ok: false, error: json.error ?? 'tool returned no prepared tx' }
          }
          const prepared = json.data.prepared
          const hash = await walletClient.sendTransaction({
            account: walletClient.account!,
            chain: arcTestnet,
            to: prepared.to as Address,
            data: prepared.data as Hex,
            value: BigInt(prepared.value ?? '0'),
          })
          return { ok: true, hash, explorerUrl: explorerFor(hash) }
        }

        if (tool === 'register_agent' || tool === 'hire_agent' || tool === 'create_job') {
          return {
            ok: false,
            error:
              'ERC-8004 agent registry not yet deployed on Arc Testnet. This action will be enabled once the registry contracts are published.',
          }
        }

        return { ok: false, error: `tool ${tool} not executable from client` }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'tx_exec_failed' }
      }
    },
    [config],
  )
}
