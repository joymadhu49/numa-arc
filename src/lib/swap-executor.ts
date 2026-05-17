'use client'

import { useCallback } from 'react'
import { createPublicClient, http, type WalletClient } from 'viem'
import { useWalletClient } from 'wagmi'
import { ViemAdapter } from '@circle-fin/adapter-viem-v2'
import { ArcTestnet } from '@circle-fin/app-kit/chains'
import { appkit } from '@/lib/appkit'
import { arcTestnet } from '@/chains/arc'

export interface SwapExecuteInput {
  tokenIn: string
  tokenOut: string
  amount: string
}

export interface SwapExecuteResult {
  ok: boolean
  hash?: string
  explorerUrl?: string
  error?: string
}

interface AppKitSwap {
  swap: (params: {
    from: { adapter: unknown; chain: string }
    tokenIn: string
    tokenOut: string
    amountIn: string
    config?: { kitKey?: string }
  }) => Promise<{
    txHash?: string
    hash?: string
    transactionHash?: string
    explorerUrl?: string
    amountOut?: string
  }>
}

export function useSwapExecutor(): (input: SwapExecuteInput) => Promise<SwapExecuteResult> {
  const { data: walletClient } = useWalletClient({ chainId: arcTestnet.id })

  return useCallback(
    async (input: SwapExecuteInput): Promise<SwapExecuteResult> => {
      try {
        if (!walletClient) {
          return { ok: false, error: 'wallet not connected on Arc Testnet' }
        }
        const adapterOptions = {
          getPublicClient: () => createPublicClient({ chain: arcTestnet, transport: http() }),
          getWalletClient: (): WalletClient => walletClient,
        }
        const capabilities = {
          addressContext: 'user-controlled' as const,
          supportedChains: [ArcTestnet],
        }
        const adapter = new ViemAdapter(
          adapterOptions as unknown as ConstructorParameters<typeof ViemAdapter>[0],
          capabilities as unknown as ConstructorParameters<typeof ViemAdapter>[1],
        )

        const client = appkit as unknown as AppKitSwap
        const kitKey = process.env.NEXT_PUBLIC_KIT_KEY ?? ''
        const result = await client.swap({
          from: { adapter, chain: 'Arc_Testnet' },
          tokenIn: input.tokenIn,
          tokenOut: input.tokenOut,
          amountIn: input.amount,
          ...(kitKey ? { config: { kitKey } } : {}),
        })
        const hash = result.txHash ?? result.hash ?? result.transactionHash
        if (!hash) return { ok: false, error: 'swap returned no transaction hash' }
        return {
          ok: true,
          hash,
          explorerUrl: result.explorerUrl ?? `${arcTestnet.blockExplorers.default.url}/tx/${hash}`,
        }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'swap_exec_failed' }
      }
    },
    [walletClient],
  )
}
