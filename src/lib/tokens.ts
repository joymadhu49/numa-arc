/**
 * Token registry for Arc Testnet and common chains.
 *
 * Per-chain USDC/EURC entries are now DERIVED from the single network registry
 * (see '@/chains/registry') so that tokens for every active chain exist and stay
 * in sync with chain config. The Arc Testnet USDC/EURC entries are kept as
 * native-gas style entries (address driven by env, may be null) because USDC is
 * Arc's native gas token and balance is read via `getBalance`, not ERC-20
 * `balanceOf`. A few extra Ethereum-mainnet tokens (USDT/DAI/WETH/ETH) are kept
 * for portfolio display.
 *
 * NOTE: all existing exports/signatures are preserved exactly — TOKENS,
 * TokenInfo, TokenSymbol, getToken, getTokensForChain, ARC_TESTNET_CHAIN_ID,
 * ERC20_ABI, PLACEHOLDER_ADDRESS.
 */

import type { Address } from 'viem'
import { ACTIVE_CHAINS, MAINNET_ENABLED, getChain } from '@/chains/registry'

export const ARC_TESTNET_CHAIN_ID = 5042002 as const

/** Canonical short symbol used across the app. */
export type TokenSymbol = 'USDC' | 'EURC' | 'ETH' | 'WETH' | 'USDT' | 'DAI'

export interface TokenInfo {
  symbol: TokenSymbol
  name: string
  decimals: number
  /** EVM ERC-20 address; `null` indicates native gas asset on that chain. */
  address: Address | null
  /** Chain id this entry applies to. */
  chainId: number
  /** Optional CoinGecko id for USD price lookups. */
  coingeckoId?: string
  /** Optional logo URI for UI rendering. */
  logoURI?: string
}

/**
 * Placeholder zero address used when a real deployment isn't known yet.
 * Calls using this address MUST short-circuit with a clear error.
 */
export const PLACEHOLDER_ADDRESS = '0x0000000000000000000000000000000000000000' as const

// ---------------------------------------------------------------------------
// Arc Testnet entries (native-gas style; address may be null / env-driven).
//
// USDC on Arc Testnet is the native gas token (decimals 6). It has no canonical
// ERC-20 representation in the standard sense — balance is read via `getBalance`
// rather than ERC-20 `balanceOf`. For interop with the rest of the codebase we
// keep it in the registry with `address: null` unless an env override is set.
// ---------------------------------------------------------------------------

const ARC_TOKENS: readonly TokenInfo[] = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    address: (process.env.NEXT_PUBLIC_ARC_USDC ?? null) as Address | null,
    chainId: ARC_TESTNET_CHAIN_ID,
    coingeckoId: 'usd-coin',
  },
  {
    symbol: 'EURC',
    name: 'Euro Coin',
    decimals: 6,
    address: (process.env.NEXT_PUBLIC_ARC_EURC ?? null) as Address | null,
    chainId: ARC_TESTNET_CHAIN_ID,
    coingeckoId: 'euro-coin',
  },
]

// Arc MAINNET: USDC uses the same 0x3600… precompile surface as testnet
// (6-decimal ERC-20 reads; native gas via eth_getBalance is 18-decimal).
// EURC is omitted until Circle publishes the official Arc-mainnet address.
// Gated on the mainnet flag so testnet-only deployments never resolve it.
const ARC_MAINNET_TOKENS: readonly TokenInfo[] = (() => {
  const arc = getChain('arc')
  if (!MAINNET_ENABLED || !arc || arc.testnet) return []
  return [
    {
      symbol: 'USDC' as const,
      name: 'USD Coin',
      decimals: 6,
      address: arc.usdc,
      chainId: arc.chainId,
      coingeckoId: 'usd-coin',
    },
  ]
})()

// ---------------------------------------------------------------------------
// Registry-derived ERC-20 stablecoin entries for the OTHER active chains.
// USDC/EURC addresses come from the network registry (source of truth).
// ---------------------------------------------------------------------------

const REGISTRY_TOKENS: readonly TokenInfo[] = ACTIVE_CHAINS.filter((c) => !c.isArc).flatMap(
  (c): TokenInfo[] => {
    const entries: TokenInfo[] = [
      {
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        address: c.usdc,
        chainId: c.chainId,
        coingeckoId: 'usd-coin',
      },
    ]
    if (c.eurc) {
      entries.push({
        symbol: 'EURC',
        name: 'Euro Coin',
        decimals: 6,
        address: c.eurc,
        chainId: c.chainId,
        coingeckoId: 'euro-coin',
      })
    }
    return entries
  },
)

// ---------------------------------------------------------------------------
// Ethereum-mainnet extras kept for portfolio display (USDC retained via the
// mainnet registry row for consistency; USDT/DAI/WETH/ETH are app-specific).
// ---------------------------------------------------------------------------

const ETHEREUM_USDC = getChain('ethereum')?.usdc ?? '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const BASE_USDC = getChain('base')?.usdc ?? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

const EXTRA_TOKENS: readonly TokenInfo[] = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    address: ETHEREUM_USDC,
    chainId: 1,
    coingeckoId: 'usd-coin',
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    chainId: 1,
    coingeckoId: 'tether',
  },
  {
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    decimals: 18,
    address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    chainId: 1,
    coingeckoId: 'dai',
  },
  {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    chainId: 1,
    coingeckoId: 'weth',
  },
  {
    symbol: 'ETH',
    name: 'Ether',
    decimals: 18,
    address: null,
    chainId: 1,
    coingeckoId: 'ethereum',
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    address: BASE_USDC,
    chainId: 8453,
    coingeckoId: 'usd-coin',
  },
]

/**
 * Token registry. Keyed implicitly by (chainId, symbol).
 * Arc native entries first (default chain), then registry-derived ERC-20
 * stablecoins for other active chains, then mainnet display extras.
 * Deduped by (chainId, symbol) — with mainnet enabled the registry-derived
 * rows (chainId 1, 8453) would otherwise collide with EXTRA_TOKENS.
 */
export const TOKENS: readonly TokenInfo[] = (() => {
  const seen = new Set<string>()
  return [...ARC_TOKENS, ...ARC_MAINNET_TOKENS, ...REGISTRY_TOKENS, ...EXTRA_TOKENS].filter(
    (t) => {
      const k = `${t.chainId}:${t.symbol}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    },
  )
})()

/** Lookup a token by chain + symbol. */
export function getToken(chainId: number, symbol: TokenSymbol): TokenInfo | undefined {
  return TOKENS.find((t) => t.chainId === chainId && t.symbol === symbol)
}

/** All tokens for a given chain (for portfolio multicall). */
export function getTokensForChain(chainId: number): TokenInfo[] {
  return TOKENS.filter((t) => t.chainId === chainId)
}

/** ERC-20 ABI fragments used by portfolio/balance reads. */
export const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const
