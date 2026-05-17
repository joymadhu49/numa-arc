/**
 * Portfolio tool. Prefers App Kit's Unified Balance method if available,
 * else falls back to viem multicall ERC-20 balanceOf + native getBalance
 * for the tokens registered in `@/lib/tokens`.
 */

import { createPublicClient, http, formatUnits, type Address } from 'viem'
import { appkit } from '@/lib/appkit'
import { arcTestnet } from '@/chains/arc'
import { ERC20_ABI, getTokensForChain, ARC_TESTNET_CHAIN_ID, type TokenInfo } from '@/lib/tokens'

export interface PortfolioArgs {
  address: Address
  /** Chain id to query. Defaults to Arc Testnet. */
  chainId?: number
}

export interface TokenBalance {
  symbol: string
  name: string
  decimals: number
  /** Raw balance as a decimal string (post-formatUnits). */
  amount: string
  /** Optional USD value (when price lookup is wired). */
  usdValue?: number
  /** ERC-20 address, or `null` for native asset. */
  address: Address | null
  chainId: number
}

export interface PortfolioResult {
  address: Address
  chainId: number
  balances: TokenBalance[]
  totalUsd: number
  source: 'appkit-unified' | 'viem-multicall'
}

export type PortfolioResponse =
  | { ok: true; data: PortfolioResult }
  | { ok: false; error: string }

interface AppKitWithUnifiedBalance {
  getUnifiedBalance?: (args: { address: Address }) => Promise<{
    balances: Array<{
      symbol: string
      name?: string
      decimals: number
      amount: string
      usdValue?: number
      address?: Address | null
      chainId: number
    }>
    totalUsd?: number
  }>
}

async function tryUnifiedBalance(address: Address): Promise<PortfolioResult | null> {
  const client = appkit as unknown as AppKitWithUnifiedBalance
  if (typeof client.getUnifiedBalance !== 'function') return null
  try {
    const res = await client.getUnifiedBalance({ address })
    const balances: TokenBalance[] = res.balances.map((b) => ({
      symbol: b.symbol,
      name: b.name ?? b.symbol,
      decimals: b.decimals,
      amount: b.amount,
      usdValue: b.usdValue,
      address: b.address ?? null,
      chainId: b.chainId,
    }))
    const totalUsd =
      res.totalUsd ?? balances.reduce((sum, b) => sum + (b.usdValue ?? 0), 0)
    return {
      address,
      chainId: ARC_TESTNET_CHAIN_ID,
      balances,
      totalUsd,
      source: 'appkit-unified',
    }
  } catch {
    return null
  }
}

async function fetchViaMulticall(
  address: Address,
  chainId: number,
): Promise<PortfolioResult> {
  if (chainId !== ARC_TESTNET_CHAIN_ID) {
    // Only Arc Testnet is wired into viem here. Downstream agents can extend
    // with additional chain clients via wagmi config.
    throw new Error(`Unsupported chainId for multicall fallback: ${chainId}`)
  }

  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(),
  })

  const tokens = getTokensForChain(chainId)
  const erc20Tokens: TokenInfo[] = tokens.filter((t): t is TokenInfo & { address: Address } =>
    t.address !== null,
  )

  const erc20Results = await Promise.all(
    erc20Tokens.map((t) =>
      publicClient
        .readContract({
          address: t.address as Address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        })
        .catch(() => 0n),
    ),
  )

  const balances: TokenBalance[] = []

  for (let i = 0; i < erc20Tokens.length; i++) {
    const token = erc20Tokens[i]
    const raw = erc20Results[i] as bigint
    balances.push({
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      amount: formatUnits(raw, token.decimals),
      address: token.address,
      chainId,
    })
  }

  // Stable USD value: USDC = $1 per unit, EURC ~ $1.08 (rough, no live price wiring).
  const totalUsd = balances.reduce((sum, b) => {
    const amt = Number(b.amount)
    if (!Number.isFinite(amt)) return sum
    if (b.symbol === 'USDC') return sum + amt
    if (b.symbol === 'EURC') return sum + amt * 1.08
    return sum
  }, 0)

  return {
    address,
    chainId,
    balances,
    totalUsd,
    source: 'viem-multicall',
  }
}

export async function getPortfolio(args: PortfolioArgs): Promise<PortfolioResponse> {
  try {
    if (!/^0x[a-fA-F0-9]{40}$/.test(args.address)) {
      return { ok: false, error: 'Invalid address' }
    }
    // Force Arc-only. Skip unified balance (mixes chains).
    const chainId = ARC_TESTNET_CHAIN_ID
    void tryUnifiedBalance
    const data = await fetchViaMulticall(args.address, chainId)
    return { ok: true, data }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown portfolio error'
    return { ok: false, error: message }
  }
}
