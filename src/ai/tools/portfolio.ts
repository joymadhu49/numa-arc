/**
 * Portfolio tool — REAL multichain valuation.
 *
 * Combines multichain ERC-20 balance reads (`getMultichainBalances`, which walks
 * every ACTIVE_CHAIN and reads USDC + EURC via viem) with LIVE prices
 * (`priceSymbols` → CoinGecko + DefiLlama, no hardcoded $1 / *1.08).
 *
 * Output is the SHARED PortfolioCardData contract the chat card consumes:
 *   { ok, address, totalUsd, change24hPct, chains: [{ chainKey, chainName, logo,
 *     tokens: [{ symbol, name, balance, usd, priceUsd, change24hPct, logo? }] }] }
 *
 * Valuation notes:
 *   - per-token usd  = balance * priceUsd
 *   - totalUsd       = sum of per-token usd across all chains
 *   - change24hPct   = price-weighted 24h change across tokens that have one
 *
 * TODO(pnl): true cost-basis PnL needs tx history (entry prices). This implements
 * LIVE valuation + 24h price change only — NOT realized/unrealized PnL.
 */

import type { Address } from 'viem'
import { getMultichainBalances } from '@/lib/balances'
import { priceSymbols, type TokenPrice } from '@/ai/tools/prices'
import { ARC_TESTNET_CHAIN_ID } from '@/lib/tokens'

/**
 * Local TOKEN logos (served from /public/tokens), keyed by upper-case symbol.
 * Token ROWS use these (USDC/EURC marks); the CHAIN logo is used only for the
 * per-chain group header. Missing → the card falls back to a monogram chip.
 */
const TOKEN_LOGOS: Record<string, string> = {
  USDC: '/tokens/usdc.png',
  EURC: '/tokens/eurc.png',
}

function tokenLogo(symbol: string): string | undefined {
  return TOKEN_LOGOS[symbol.toUpperCase()]
}

export interface PortfolioArgs {
  address: Address
  /** Accepted for back-compat with existing callers; portfolio is multichain. */
  chainId?: number
}

/** One token row in the shared portfolio card. */
export interface PortfolioCardToken {
  symbol: string
  name: string
  balance: string
  usd: number | null
  priceUsd: number | null
  change24hPct: number | null
  logo?: string
}

/** One chain group in the shared portfolio card. */
export interface PortfolioCardChain {
  chainKey: string
  chainName: string
  logo: string
  tokens: PortfolioCardToken[]
}

/** SHARED PortfolioCardData contract (what the chat card renders). */
export type PortfolioCardData =
  | {
      ok: true
      address: string
      totalUsd: number
      change24hPct: number | null
      chains: PortfolioCardChain[]
    }
  | { ok: false; error: string }

export type PortfolioResponse = PortfolioCardData

// ---------------------------------------------------------------------------
// Back-compat type exports. The portfolio result shape changed to the shared
// PortfolioCardData contract above, but these names were previously exported,
// so they are retained (as best-effort aliases) for any out-of-ownership
// importer. New code should use PortfolioCardData / PortfolioCardToken.
// ---------------------------------------------------------------------------

/** @deprecated legacy shape — kept for back-compat; use PortfolioCardToken. */
export interface TokenBalance {
  symbol: string
  name: string
  decimals: number
  amount: string
  usdValue?: number
  address: Address | null
  chainId: number
}

/** @deprecated legacy shape — kept for back-compat; use PortfolioCardData. */
export interface PortfolioResult {
  address: Address
  chainId: number
  balances: TokenBalance[]
  totalUsd: number
  source: 'appkit-unified' | 'viem-multicall'
}

export async function getPortfolio(args: PortfolioArgs): Promise<PortfolioCardData> {
  try {
    if (!/^0x[a-fA-F0-9]{40}$/.test(args.address)) {
      return { ok: false, error: 'Invalid address' }
    }

    void ARC_TESTNET_CHAIN_ID // multichain now; arg kept only for back-compat.

    const chainBalances = await getMultichainBalances(args.address)

    // Collect the distinct symbols we actually hold so we price in one batch.
    const symbols = new Set<string>()
    for (const c of chainBalances) {
      for (const t of c.tokens) symbols.add(t.symbol.toUpperCase())
    }

    const priceMap: Record<string, TokenPrice> =
      symbols.size > 0 ? await priceSymbols(Array.from(symbols)) : {}

    let totalUsd = 0
    // Price-weighted 24h: sum(usd * pct) / sum(usd over tokens that HAVE a pct).
    let weightedChangeNum = 0
    let weightedChangeDen = 0

    const chains: PortfolioCardChain[] = chainBalances.map((c) => {
      const tokens: PortfolioCardToken[] = c.tokens.map((t) => {
        const price = priceMap[t.symbol.toUpperCase()] ?? {
          usd: null,
          change24hPct: null,
        }
        const amount = Number(t.balance)
        const priceUsd = price.usd
        const usd =
          priceUsd !== null && Number.isFinite(amount) ? amount * priceUsd : null

        if (usd !== null) {
          totalUsd += usd
          if (price.change24hPct !== null) {
            weightedChangeNum += usd * price.change24hPct
            weightedChangeDen += usd
          }
        }

        return {
          symbol: t.symbol,
          name: t.name,
          balance: t.balance,
          usd,
          priceUsd,
          change24hPct: price.change24hPct,
          // Token ROW uses the USDC/EURC token logo (NOT the chain logo).
          logo: tokenLogo(t.symbol),
        }
      })
      return {
        chainKey: c.chainKey,
        chainName: c.chainName,
        logo: c.logo,
        tokens,
      }
    })

    const change24hPct =
      weightedChangeDen > 0 ? weightedChangeNum / weightedChangeDen : null

    return {
      ok: true,
      address: args.address,
      totalUsd,
      change24hPct,
      chains,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown portfolio error'
    return { ok: false, error: message }
  }
}
