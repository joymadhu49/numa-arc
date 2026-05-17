/**
 * Token registry for Arc Testnet and common chains.
 *
 * TODO(downstream): Replace placeholder addresses below with verified deployments.
 * - USDC on Arc Testnet is the native gas token; bridged ERC-20 representations
 *   on other chains use canonical Circle deployments where known.
 * - Confirm USDC ERC-20 wrapper address on Arc (if any) once Circle publishes it
 *   on https://developers.circle.com/stablecoins/usdc-on-test-networks.
 */

import type { Address } from 'viem'

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

/**
 * Token registry. Keyed implicitly by (chainId, symbol).
 *
 * NOTE: USDC on Arc Testnet is the native gas token (decimals 6). It has no
 * canonical ERC-20 representation in the standard sense — balance is read via
 * `getBalance` rather than ERC-20 `balanceOf`. For interop with the rest of
 * the codebase we keep it in the registry with `address: null`.
 */
export const TOKENS: readonly TokenInfo[] = [
  // Arc Testnet ---------------------------------------------------------------
  // Native USDC gas uses 18-decimal wei via eth_getBalance, but the ERC-20
  // interface at 0x3600... exposes the canonical 6-decimal balance. Use ERC-20
  // path for clean display.
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
  // Ethereum mainnet (chainId 1) ---------------------------------------------
  {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
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
  // Base (chainId 8453) -------------------------------------------------------
  {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    chainId: 8453,
    coingeckoId: 'usd-coin',
  },
] as const

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
