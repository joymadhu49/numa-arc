import { appkit } from '@/lib/appkit'
import { arcTestnet } from '@/chains/arc'
import type { TokenSymbol } from '@/lib/tokens'

export interface SwapArgs {
  fromToken: TokenSymbol
  toToken: TokenSymbol
  amount: string
  chain?: string
  slippageBps?: number
}

export interface SwapPrepared {
  intent: 'swap'
  chain: string
  tokenIn: TokenSymbol
  tokenOut: TokenSymbol
  amount: string
  slippageBps: number
  note: string
}

export interface SwapExecuted {
  hash: `0x${string}`
  status: 'pending' | 'success' | 'failed'
  explorerUrl: string
}

export type SwapResponse =
  | { ok: true; data: SwapPrepared | SwapExecuted }
  | { ok: false; error: string }

interface AppKitSwapReturn {
  hash?: string
  transactionHash?: string
  status?: string
}

interface AppKitWithSwap {
  swap: (params: {
    from: { adapter: unknown; chain: string }
    tokenIn: string
    tokenOut: string
    amount: string
  }) => Promise<AppKitSwapReturn>
}

function explorerUrlFor(hash: string): string {
  return `${arcTestnet.blockExplorers.default.url}/tx/${hash}`
}

function normalizeStatus(s: string | undefined): SwapExecuted['status'] {
  if (s === 'success' || s === 'confirmed' || s === 'mined') return 'success'
  if (s === 'failed' || s === 'reverted' || s === 'error') return 'failed'
  return 'pending'
}

export async function executeSwap(args: SwapArgs): Promise<SwapResponse> {
  const chain = args.chain ?? 'Arc_Testnet'
  const slippageBps = args.slippageBps ?? 50

  const prepared: SwapPrepared = {
    intent: 'swap',
    chain,
    tokenIn: args.fromToken,
    tokenOut: args.toToken,
    amount: args.amount,
    slippageBps,
    note: `Swap ${args.amount} ${args.fromToken} for ${args.toToken} on ${chain} via Circle App Kit.`,
  }

  const adapter = (globalThis as { __ARCWISE_ADAPTER__?: unknown }).__ARCWISE_ADAPTER__
  if (!adapter) {
    return { ok: true, data: prepared }
  }

  try {
    const client = appkit as unknown as AppKitWithSwap
    if (typeof client.swap !== 'function') {
      return { ok: false, error: 'App Kit swap unavailable in this version' }
    }
    const result = await client.swap({
      from: { adapter, chain },
      tokenIn: args.fromToken,
      tokenOut: args.toToken,
      amount: args.amount,
    })
    const hash = (result.hash ?? result.transactionHash ?? '') as `0x${string}`
    if (!hash) return { ok: false, error: 'Swap returned no transaction hash' }
    return {
      ok: true,
      data: {
        hash,
        status: normalizeStatus(result.status),
        explorerUrl: explorerUrlFor(hash),
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown swap error'
    return { ok: false, error: message }
  }
}
