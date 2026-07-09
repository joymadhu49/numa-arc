/**
 * AI SDK v6 typed tool module — single source of truth for Numa's tools.
 *
 * READ tools (get_prices, get_yield, get_trending, get_portfolio,
 * get_lp_positions, scan_token, scan_tx) include an async `execute` that calls
 * the EXISTING server-side logic (the same functions the /api/* routes use), so
 * they resolve on the server and stream their result back to the model.
 *
 * WRITE / SIGNING tools (swap, send, bridge, deposit, withdraw, add_liquidity,
 * remove_liquidity, create_job, register_agent, hire_agent) are defined with a
 * description + inputSchema and NO `execute`. With no execute, the AI SDK
 * surfaces them client-side as `input-available` tool parts so the UI can do
 * human-in-the-loop confirm-then-sign and supply the result via addToolResult().
 *
 * Tool names + input shapes follow the same shapes the model has always seen;
 * this module replaced the legacy OpenAI-function-calling JSON that used to live
 * in `@/ai/tools/index.ts` (now removed).
 */

import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import type { Address, Hex } from 'viem'

import { getPrices } from '@/ai/tools/prices'
import { getYield } from '@/ai/tools/yield'
import { getTrending } from '@/ai/tools/trending'
import { getPortfolio } from '@/ai/tools/portfolio'
import { getLpPositions } from '@/ai/tools/lp-positions'
import { scanToken, simulateTx, type ScanTokenResult } from '@/lib/safety'
import { irisBaseFor } from '@/lib/cctp-native'
import { ACTIVE_CHAINS, MAINNET_ENABLED, getChain, toAppKitChain } from '@/chains/registry'

const ARC_TESTNET_CHAIN_ID = 5042002

/**
 * Chains Circle App Kit can execute swap/send/bridge on right now (registry
 * keys). Arc mainnet is excluded automatically: it has no App Kit enum yet.
 */
const EXECUTABLE_KEYS = ACTIVE_CHAINS.filter((c) => toAppKitChain(c))
  .map((c) => c.key)
  .join(', ')

/** Appended to signing-tool descriptions when mainnet rows are enabled. */
const MAINNET_NOTE = MAINNET_ENABLED
  ? ` Mainnet chains are enabled. App Kit executable chains: ${EXECUTABLE_KEYS}. Arc MAINNET ("arc") IS bridgeable via the native CCTP path: the burn signs immediately, then once attested the user claims on the destination with claim_bridge. Swap and send on Arc mainnet are NOT available yet (no App Kit support); use "arc-testnet" for those.`
  : ''

// ---------------------------------------------------------------------------
// CCTP V2 bridge read-tool helpers (TASK D).
// ---------------------------------------------------------------------------


export type BridgeStatus =
  | 'pending_burn'
  | 'attesting'
  | 'ready_to_mint'
  | 'complete'
  | 'unknown'

export interface BridgeStatusResult {
  ok: boolean
  status: BridgeStatus
  srcDomain: number
  dstDomain?: number
  txHash: string
  attestation?: string
  error?: string
}

/** Map Circle iris message status → our BridgeCard-friendly status. */
function mapIrisStatus(raw: string | undefined, attestation: string | undefined): BridgeStatus {
  const s = (raw ?? '').toLowerCase()
  if (s === 'complete' || s === 'confirmed') return 'complete'
  if (s === 'pending_confirmations' || s === 'pending') {
    // Attestation present but not yet complete → ready to mint.
    return attestation && attestation !== 'PENDING' ? 'ready_to_mint' : 'attesting'
  }
  if (attestation && attestation !== 'PENDING') return 'ready_to_mint'
  return 'unknown'
}

interface IrisMessage {
  status?: string
  attestation?: string
  decodedMessage?: { destinationDomain?: number | string }
  destinationDomain?: number | string
}

interface IrisResponse {
  messages?: IrisMessage[]
}

/**
 * Query Circle's CCTP V2 attestation API for the status of a burn tx.
 * Endpoint: GET /v2/messages/{sourceDomain}?transactionHash={hash}
 * Handles non-200 / empty gracefully (status 'unknown').
 */
async function fetchBridgeStatus(
  srcDomain: number,
  txHash: string,
  testnet = true,
): Promise<BridgeStatusResult> {
  const base: BridgeStatusResult = { ok: false, status: 'unknown', srcDomain, txHash }
  try {
    const url = `${irisBaseFor(testnet)}/${srcDomain}?transactionHash=${txHash}`
    const res = await fetch(url, { headers: { accept: 'application/json' } })
    if (res.status === 404) {
      // Burn not yet indexed by Circle → still in the burn/indexing phase.
      return { ...base, ok: true, status: 'pending_burn' }
    }
    if (!res.ok) return base
    const json = (await res.json()) as IrisResponse
    const msg = json.messages?.[0]
    if (!msg) return { ...base, ok: true, status: 'pending_burn' }
    const attestation =
      msg.attestation && msg.attestation !== 'PENDING' ? msg.attestation : undefined
    const dstRaw = msg.decodedMessage?.destinationDomain ?? msg.destinationDomain
    const dstDomain = dstRaw == null ? undefined : Number(dstRaw)
    return {
      ok: true,
      status: mapIrisStatus(msg.status, msg.attestation),
      srcDomain,
      dstDomain: Number.isFinite(dstDomain) ? dstDomain : undefined,
      txHash,
      attestation,
    }
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : 'iris fetch failed' }
  }
}

/**
 * Status lookup with environment disambiguation. CCTP domains are SHARED
 * between testnet and mainnet (Arc is 26 on both), so when the caller could
 * not name the chain we probe the sandbox first and, with mainnet enabled,
 * fall through to the mainnet Iris if the sandbox has no record of the burn.
 */
async function fetchBridgeStatusAuto(
  domain: number,
  txHash: string,
  resolved: { testnet: boolean } | undefined,
): Promise<BridgeStatusResult> {
  if (resolved) return fetchBridgeStatus(domain, txHash, resolved.testnet)
  const sandbox = await fetchBridgeStatus(domain, txHash, true)
  if (MAINNET_ENABLED && sandbox.status === 'pending_burn') {
    const main = await fetchBridgeStatus(domain, txHash, false)
    if (main.ok && main.status !== 'pending_burn') return main
  }
  return sandbox
}

export interface RouteLeg {
  available: boolean
  etaSeconds: number
  feeBps?: number
}

export interface EstimateRouteResult {
  ok: boolean
  fromChain: string
  toChain: string
  fast: RouteLeg
  standard: RouteLeg
  note: string
  error?: string
}

/**
 * Estimate Fast vs Standard CCTP V2 transfer characteristics between two
 * registry chains. Uses the registry's fastTransfer flag + documented CCTP
 * guidance. All figures are LABELLED estimates (no live quote).
 */
function estimateRoute(fromRef: string, toRef: string): EstimateRouteResult {
  const from = getChain(fromRef)
  const to = getChain(toRef)
  if (!from || !to) {
    return {
      ok: false,
      fromChain: fromRef,
      toChain: toRef,
      fast: { available: false, etaSeconds: 0 },
      standard: { available: true, etaSeconds: 0 },
      note: 'Unknown chain in route',
      error: 'unknown_chain',
    }
  }
  if (from.chainId === to.chainId) {
    return {
      ok: false,
      fromChain: from.key,
      toChain: to.key,
      fast: { available: false, etaSeconds: 0 },
      standard: { available: false, etaSeconds: 0 },
      note: 'Source and destination are the same chain',
      error: 'same_chain',
    }
  }
  // Fast Transfer requires BOTH chains to support it (and uses a small fee).
  const fastAvailable = from.fastTransfer && to.fastTransfer
  return {
    ok: true,
    fromChain: from.key,
    toChain: to.key,
    // Fast Transfer: soft finality, ~8-20s typical; ~1 bps fee (estimate).
    fast: { available: fastAvailable, etaSeconds: fastAvailable ? 20 : 0, feeBps: fastAvailable ? 1 : undefined },
    // Standard Transfer: hard finality on source; minutes (estimate, varies by chain).
    standard: { available: true, etaSeconds: 900, feeBps: 0 },
    note: 'Estimates only — CCTP V2 Fast Transfer is soft-finality (~seconds, small fee); Standard waits for source-chain hard finality (minutes). No fee is charged by the protocol for Standard.',
  }
}

// ---------------------------------------------------------------------------
// Output reshapers — map lib function results to the SHARED card data contracts
// the chat cards consume. Used by BOTH the request-path factory and the static
// type-only instances so the inferred tool-output types match the cards.
// ---------------------------------------------------------------------------

/** Reshape getPrices' Record output → shared PriceCardData (array). */
function toPriceCardData(
  res: Awaited<ReturnType<typeof getPrices>>,
):
  | { ok: true; prices: Array<{ symbol: string; usd: number | null; change24hPct: number | null }> }
  | { ok: false; error: string } {
  if (!res.ok) return res
  const prices = Object.entries(res.prices).map(([symbol, entry]) => ({
    symbol,
    usd: entry.usd,
    change24hPct: entry.change24h,
  }))
  return { ok: true as const, prices }
}

/** Reshape getTrending' output → shared TrendingCardData, applying an optional limit. */
function toTrendingCardData(
  res: Awaited<ReturnType<typeof getTrending>>,
  limit?: number,
):
  | {
      ok: true
      tokens: Array<{
        symbol: string
        name: string
        rank?: number
        priceUsd?: number
        change24hPct?: number
      }>
    }
  | { ok: false; error: string } {
  if (!res.ok) return res
  const mapped = res.tokens.map((t) => ({
    symbol: t.symbol,
    name: t.name,
    rank: t.rank ?? undefined,
    priceUsd: t.price ?? undefined,
    change24hPct: t.change24h ?? undefined,
  }))
  const tokens = typeof limit === 'number' ? mapped.slice(0, limit) : mapped
  return { ok: true as const, tokens }
}

/** Reshape a ScanTokenResult → shared ScanCardData for a given chainId. */
function toScanCardData(
  res: ScanTokenResult,
  address: string,
  chainId: number,
):
  | {
      ok: true
      address: string
      chainKey: string
      name?: string
      symbol?: string
      decimals?: number
      verified?: boolean
      risk: 'low' | 'medium' | 'high' | 'unknown'
      flags: Array<{ label: string; severity: 'info' | 'warn' | 'danger' }>
      honeypot?: boolean
      buyTaxPct?: number
      sellTaxPct?: number
      holderCount?: number
      source: 'goplus' | 'onchain' | 'mixed'
    }
  | { ok: false; error: string } {
  const chainKey = getChain(chainId)?.key ?? String(chainId)
  return {
    ok: true as const,
    address,
    chainKey,
    name: res.metadata.name,
    symbol: res.metadata.symbol,
    decimals: res.metadata.decimals,
    verified: res.verified,
    risk: res.cardRisk,
    flags: res.structuredFlags,
    honeypot: res.honeypot,
    buyTaxPct: res.buyTaxPct,
    sellTaxPct: res.sellTaxPct,
    holderCount: res.holderCount,
    source: res.source,
  }
}

/**
 * Per-request context for tool execution. The connected wallet address is
 * supplied by the chat route from the request body; read tools that need it
 * (portfolio, LP positions, tx simulation) close over it.
 */
export interface NumaToolContext {
  address?: string
}

/**
 * Build the Numa tool set for one request, closing over the wallet address.
 * READ tools execute server-side; WRITE/SIGNING tools have no execute.
 */
export function buildNumaTools(ctx: NumaToolContext = {}): NumaTools {
  const getPricesTool = tool({
    description:
      'Fetch current USD spot price + 24h change for tokens from CoinGecko (e.g. BTC, ETH, SOL, USDC). Use when user asks "what is the price of X" or "BTC price today".',
    inputSchema: z.object({
      symbols: z
        .array(z.string())
        .min(1)
        .describe('Symbols to price (e.g. ["BTC", "ETH"]).'),
    }),
    execute: async ({ symbols }) => toPriceCardData(await getPrices({ symbols })),
  })

  const getYieldTool = tool({
    description:
      'Find yield opportunities (lending APYs, LP APRs, staking) from DefiLlama and Arc-native pools. Stablecoin pools first.',
    inputSchema: z.object({
      token: z.string().optional().describe('Optional token filter (e.g. USDC).'),
      minApy: z.number().optional().describe('Optional min APY in percent.'),
      chain: z.string().optional().describe('Optional chain filter. Default Arc.'),
      stablecoinOnly: z.boolean().optional().describe('Default true.'),
    }),
    execute: async ({ token, minApy, chain }) => {
      const res = await getYield({ symbol: token, chain })
      if (!res.ok) return res
      if (typeof minApy === 'number') {
        return { ok: true as const, pools: res.pools.filter((p) => p.apy >= minApy) }
      }
      return res
    },
  })

  const getTrendingTool = tool({
    description: 'Trending tokens by volume / holders / price movement.',
    inputSchema: z.object({
      chain: z.string().optional().describe('Chain filter. Default Arc_Testnet.'),
      window: z.enum(['1h', '24h', '7d']).optional().describe('Default 24h.'),
      limit: z.number().optional().describe('Max tokens. Default 10.'),
    }),
    execute: async ({ limit }) => toTrendingCardData(await getTrending(), limit),
  })

  const getPortfolioTool = tool({
    description:
      "Fetch the connected wallet's token balances and total USD value across Arc.",
    inputSchema: z.object({
      address: z.string().optional().describe('Optional address override.'),
    }),
    execute: async ({ address }) => {
      const resolved = (address ?? ctx.address) as Address | undefined
      if (!resolved) {
        return { ok: false as const, error: 'No wallet address available. Connect a wallet.' }
      }
      return getPortfolio({ address: resolved, chainId: ARC_TESTNET_CHAIN_ID })
    },
  })

  const getLpPositionsTool = tool({
    description:
      "List the connected wallet's open Uniswap V3 LP positions on Arc Testnet, with current value, fees earned, and in-range status.",
    inputSchema: z.object({
      address: z.string().optional().describe('Optional wallet override.'),
      chain: z.string().optional().describe('Chain enum. Default Arc_Testnet.'),
    }),
    execute: async ({ address }) => {
      const resolved = (address ?? ctx.address) as Address | undefined
      if (!resolved) {
        return { ok: false as const, error: 'No wallet address available. Connect a wallet.' }
      }
      return getLpPositions({ address: resolved })
    },
  })

  const scanTokenTool = tool({
    description:
      'Safety-scan a token: honeypot patterns, mint authority, owner privileges, tax, liquidity. Call before quoting unknown tokens.',
    inputSchema: z.object({
      address: z.string().describe('Token contract address.'),
      chain: z.string().optional().describe('Chain enum. Default Arc_Testnet.'),
    }),
    execute: async ({ address }) => {
      const res = await scanToken({ address: address as Address, chainId: ARC_TESTNET_CHAIN_ID })
      return toScanCardData(res, address, ARC_TESTNET_CHAIN_ID)
    },
  })

  const scanTxTool = tool({
    description:
      'MANDATORY pre-execution simulation for any arbitrary calldata the user pastes. Decodes calldata, simulates via eth_call, surfaces approval risk and asset deltas. Only call with a real "to" address AND "data" hex — never with placeholders.',
    inputSchema: z.object({
      to: z.string().describe('Contract or recipient address.'),
      data: z.string().describe('Hex-encoded calldata.'),
      value: z.string().optional().describe('Native value (wei). Default 0.'),
      from: z.string().optional().describe('Optional from. Defaults connected wallet.'),
      chain: z.string().optional().describe('Chain enum. Default Arc_Testnet.'),
    }),
    execute: async ({ to, data, value, from }) => {
      const fromAddr = (from ?? ctx.address) as Address | undefined
      if (!fromAddr) {
        return { ok: false as const, error: 'No "from" address available. Connect a wallet.' }
      }
      return simulateTx({
        from: fromAddr,
        to: to as Address,
        data: data as Hex,
        value,
        chainId: ARC_TESTNET_CHAIN_ID,
      })
    },
  })

  const estimateRouteTool = tool({
    description:
      'Estimate a USDC bridge route between two chains: Fast vs Standard CCTP V2 transfer (availability, ETA, fee). ALWAYS call this BEFORE proposing a bridge so the user sees the route + timing. Pass registry chain keys (e.g. "arc-testnet", "base-sepolia"; mainnet keys like "ethereum", "base" when enabled). Any pair of supported chains works.',
    inputSchema: z.object({
      fromChain: z.string().describe('Source chain key (e.g. base-sepolia).'),
      toChain: z.string().describe('Destination chain key (e.g. arc-testnet).'),
      amount: z.string().optional().describe('USDC amount (for context; estimates are amount-independent).'),
    }),
    execute: async ({ fromChain, toChain }) => estimateRoute(fromChain, toChain),
  })

  const getBridgeStatusTool = tool({
    description:
      'Check the status of an in-flight CCTP V2 bridge using the source chain + burn tx hash. Call this AFTER a bridge is broadcast to track Burn → Attestation → Mint. Prefer passing fromChain (chain key) so the correct attestation service (testnet vs mainnet) is used; srcDomain alone assumes testnet.',
    inputSchema: z.object({
      txHash: z.string().describe('The burn transaction hash (0x…).'),
      fromChain: z.string().optional().describe('Source chain key or chainId (e.g. base-sepolia).'),
      srcDomain: z.number().optional().describe('CCTP source domain (alternative to fromChain).'),
    }),
    execute: async ({ txHash, fromChain, srcDomain }) => {
      let domain = srcDomain
      let resolved: { testnet: boolean } | undefined
      if (fromChain) {
        const asNum = Number(fromChain)
        const entry = Number.isFinite(asNum) ? getChain(asNum) : getChain(fromChain)
        if (entry) {
          domain = domain ?? entry.cctpDomain
          resolved = { testnet: entry.testnet }
        }
      }
      if (domain == null) {
        return {
          ok: false as const,
          status: 'unknown' as const,
          srcDomain: -1,
          txHash,
          error: 'Could not resolve a CCTP source domain. Provide fromChain or srcDomain.',
        }
      }
      return fetchBridgeStatusAuto(domain, txHash, resolved)
    },
  })

  return {
    get_prices: getPricesTool,
    get_yield: getYieldTool,
    get_trending: getTrendingTool,
    get_portfolio: getPortfolioTool,
    get_lp_positions: getLpPositionsTool,
    scan_token: scanTokenTool,
    scan_tx: scanTxTool,
    estimate_route: estimateRouteTool,
    get_bridge_status: getBridgeStatusTool,
    swap: swapTool,
    send: sendTool,
    bridge: bridgeTool,
    claim_bridge: claimBridgeTool,
    deposit: depositTool,
    withdraw: withdrawTool,
    add_liquidity: addLiquidityTool,
    remove_liquidity: removeLiquidityTool,
    create_job: createJobTool,
    register_agent: registerAgentTool,
    hire_agent: hireAgentTool,
  }
}

// ---------------------------------------------------------------------------
// Static tool instances. These exist ONLY to derive the `NumaTools` type, which
// the client uses via `InferUITools<NumaTools>` to type message tool parts. The
// request path uses `buildNumaTools()` above (which closes over the wallet
// address); these static instances are never executed server-side.
// ---------------------------------------------------------------------------

const getPricesTool = tool({
  description:
    'Fetch current USD spot price + 24h change for tokens from CoinGecko (e.g. BTC, ETH, SOL, USDC). Use when user asks "what is the price of X" or "BTC price today".',
  inputSchema: z.object({
    symbols: z
      .array(z.string())
      .min(1)
      .describe('Symbols to price (e.g. ["BTC", "ETH"]).'),
  }),
  execute: async ({ symbols }) => {
    return toPriceCardData(await getPrices({ symbols }))
  },
})

const getYieldTool = tool({
  description:
    'Find yield opportunities (lending APYs, LP APRs, staking) from DefiLlama and Arc-native pools. Stablecoin pools first.',
  inputSchema: z.object({
    token: z.string().optional().describe('Optional token filter (e.g. USDC).'),
    minApy: z.number().optional().describe('Optional min APY in percent.'),
    chain: z.string().optional().describe('Optional chain filter. Default Arc.'),
    stablecoinOnly: z.boolean().optional().describe('Default true.'),
  }),
  execute: async ({ token, minApy, chain }) => {
    const res = await getYield({ symbol: token, chain })
    if (!res.ok) return res
    if (typeof minApy === 'number') {
      return { ok: true as const, pools: res.pools.filter((p) => p.apy >= minApy) }
    }
    return res
  },
})

const getTrendingTool = tool({
  description: 'Trending tokens by volume / holders / price movement.',
  inputSchema: z.object({
    chain: z.string().optional().describe('Chain filter. Default Arc_Testnet.'),
    window: z.enum(['1h', '24h', '7d']).optional().describe('Default 24h.'),
    limit: z.number().optional().describe('Max tokens. Default 10.'),
  }),
  execute: async ({ limit }) => {
    return toTrendingCardData(await getTrending(), limit)
  },
})

const getPortfolioTool = tool({
  description:
    "Fetch the connected wallet's token balances and total USD value across Arc.",
  inputSchema: z.object({
    address: z.string().optional().describe('Optional address override.'),
  }),
  execute: async ({ address }) => {
    const resolved = address as Address | undefined
    if (!resolved) {
      return { ok: false as const, error: 'No wallet address available. Connect a wallet.' }
    }
    return getPortfolio({ address: resolved, chainId: ARC_TESTNET_CHAIN_ID })
  },
})

const getLpPositionsTool = tool({
  description:
    "List the connected wallet's open Uniswap V3 LP positions on Arc Testnet, with current value, fees earned, and in-range status.",
  inputSchema: z.object({
    address: z.string().optional().describe('Optional wallet override.'),
    chain: z.string().optional().describe('Chain enum. Default Arc_Testnet.'),
  }),
  execute: async ({ address }) => {
    const resolved = address as Address | undefined
    if (!resolved) {
      return { ok: false as const, error: 'No wallet address available. Connect a wallet.' }
    }
    return getLpPositions({ address: resolved })
  },
})

const scanTokenTool = tool({
  description:
    'Safety-scan a token: honeypot patterns, mint authority, owner privileges, tax, liquidity. Call before quoting unknown tokens.',
  inputSchema: z.object({
    address: z.string().describe('Token contract address.'),
    chain: z.string().optional().describe('Chain enum. Default Arc_Testnet.'),
  }),
  execute: async ({ address }) => {
    const res = await scanToken({ address: address as Address, chainId: ARC_TESTNET_CHAIN_ID })
    return toScanCardData(res, address, ARC_TESTNET_CHAIN_ID)
  },
})

const scanTxTool = tool({
  description:
    'MANDATORY pre-execution simulation for any arbitrary calldata the user pastes. Decodes calldata, simulates via eth_call, surfaces approval risk and asset deltas. Only call with a real "to" address AND "data" hex — never with placeholders.',
  inputSchema: z.object({
    to: z.string().describe('Contract or recipient address.'),
    data: z.string().describe('Hex-encoded calldata.'),
    value: z.string().optional().describe('Native value (wei). Default 0.'),
    from: z.string().optional().describe('Optional from. Defaults connected wallet.'),
    chain: z.string().optional().describe('Chain enum. Default Arc_Testnet.'),
  }),
  execute: async ({ to, data, value, from }) => {
    const fromAddr = from as Address | undefined
    if (!fromAddr) {
      return { ok: false as const, error: 'No "from" address available. Connect a wallet.' }
    }
    return simulateTx({
      from: fromAddr,
      to: to as Address,
      data: data as Hex,
      value,
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  },
})

const estimateRouteTool = tool({
  description:
    'Estimate a USDC bridge route between two chains: Fast vs Standard CCTP V2 transfer (availability, ETA, fee). ALWAYS call this BEFORE proposing a bridge so the user sees the route + timing. Pass registry chain keys (e.g. "arc-testnet", "base-sepolia"; mainnet keys like "ethereum", "base" when enabled). Any pair of supported chains works.',
  inputSchema: z.object({
    fromChain: z.string().describe('Source chain key (e.g. base-sepolia).'),
    toChain: z.string().describe('Destination chain key (e.g. arc-testnet).'),
    amount: z.string().optional().describe('USDC amount (for context; estimates are amount-independent).'),
  }),
  execute: async ({ fromChain, toChain }) => estimateRoute(fromChain, toChain),
})

const getBridgeStatusTool = tool({
  description:
    'Check the status of an in-flight CCTP V2 bridge using the source chain + burn tx hash. Call this AFTER a bridge is broadcast to track Burn → Attestation → Mint. Prefer passing fromChain (chain key) so the correct attestation service (testnet vs mainnet) is used; srcDomain alone assumes testnet.',
  inputSchema: z.object({
    txHash: z.string().describe('The burn transaction hash (0x…).'),
    fromChain: z.string().optional().describe('Source chain key or chainId (e.g. base-sepolia).'),
    srcDomain: z.number().optional().describe('CCTP source domain (alternative to fromChain).'),
  }),
  execute: async ({ txHash, fromChain, srcDomain }) => {
    let domain = srcDomain
    let resolved: { testnet: boolean } | undefined
    if (fromChain) {
      const asNum = Number(fromChain)
      const entry = Number.isFinite(asNum) ? getChain(asNum) : getChain(fromChain)
      if (entry) {
        domain = domain ?? entry.cctpDomain
        resolved = { testnet: entry.testnet }
      }
    }
    if (domain == null) {
      return {
        ok: false as const,
        status: 'unknown' as const,
        srcDomain: -1,
        txHash,
        error: 'Could not resolve a CCTP source domain. Provide fromChain or srcDomain.',
      }
    }
    return fetchBridgeStatusAuto(domain, txHash, resolved)
  },
})

// ---------------------------------------------------------------------------
// WRITE / SIGNING tools — NO execute. Surface client-side for confirm-then-sign.
// ---------------------------------------------------------------------------

const swapTool = tool({
  description:
    'Swap one token for another via Circle App Kit. Both tokens must be on the same chain. On Arc, gas is paid in USDC.' +
    MAINNET_NOTE,
  inputSchema: z.object({
    fromToken: z.string().describe('Symbol or address of token to sell.'),
    toToken: z.string().describe('Symbol or address of token to buy.'),
    amount: z.string().describe('Human-readable amount of fromToken.'),
    chain: z
      .string()
      .optional()
      .describe('Chain enum or registry key (e.g. Arc_Testnet, Base_Sepolia, "base"). Default Arc_Testnet.'),
    slippageBps: z
      .number()
      .optional()
      .describe(
        'Max slippage in bps. Default 1000 (10%) on testnets: thin pools over-estimate output, so tighter values revert with InsufficientAmountOut. Mainnet swaps are clamped to a 300 bps cap. Only set lower if the user explicitly asks.',
      ),
  }),
})

const sendTool = tool({
  description:
    'Send a token to an address on a supported chain. Confirm recipient with user first.' +
    MAINNET_NOTE,
  inputSchema: z.object({
    token: z.string().describe('Symbol or address. Defaults USDC.'),
    to: z.string().describe('Destination EVM address (0x…).'),
    amount: z.string().describe('Human-readable amount.'),
    chain: z
      .string()
      .optional()
      .describe('Chain enum or registry key (e.g. Arc_Testnet, "base"). Default Arc_Testnet.'),
  }),
})

const bridgeTool = tool({
  description:
    'Bridge USDC between any two supported CCTP chains via Circle App Kit. Any pair of supported chains works; Arc does NOT need to be one end.' +
    MAINNET_NOTE,
  inputSchema: z.object({
    token: z.string().describe('Token symbol. Strongly prefer USDC.'),
    amount: z.string().describe('Human-readable amount.'),
    fromChain: z
      .string()
      .describe(
        'Source chain enum or registry key (e.g. Arc_Testnet, Ethereum_Sepolia; mainnet keys like "ethereum", "base" when enabled).',
      ),
    toChain: z.string().describe('Destination chain enum or registry key.'),
    recipient: z.string().optional().describe('Optional recipient. Defaults connected wallet.'),
  }),
})

const claimBridgeTool = tool({
  description:
    'Claim (mint) USDC on the destination chain of a NATIVE CCTP bridge, i.e. a bridge where Arc mainnet was one end. Call ONLY after get_bridge_status reads ready_to_mint or complete for the burn tx. App Kit bridges mint automatically and never need this.',
  inputSchema: z.object({
    fromChain: z.string().describe('Chain the burn happened on (key or enum).'),
    toChain: z.string().describe('Chain to mint on (key or enum).'),
    txHash: z.string().describe('Burn transaction hash (0x…).'),
  }),
})

const depositTool = tool({
  description:
    'Deposit USDC (or other supported asset) into a yield-bearing DeFi protocol on Arc Testnet (lending market, vault, or staking). Returns receipt token. Use this for "earn yield", "deposit into Aave", "stake USDC".',
  inputSchema: z.object({
    protocol: z
      .string()
      .describe('Protocol slug (e.g. "aave-v3", "compound-v3", "morpho", "yearn"). Required.'),
    token: z.string().optional().describe('Token symbol or address. Default USDC.'),
    amount: z.string().describe('Human-readable amount.'),
    chain: z.string().optional().describe('Chain enum. Default Arc_Testnet.'),
  }),
})

const withdrawTool = tool({
  description: 'Withdraw a previously deposited position from a lending market or vault.',
  inputSchema: z.object({
    protocol: z.string().describe('Protocol slug.'),
    token: z.string().describe('Underlying token symbol.'),
    amount: z.string().describe('Amount of underlying to withdraw, or "max".'),
    chain: z.string().optional().describe('Chain enum. Default Arc_Testnet.'),
  }),
})

const addLiquidityTool = tool({
  description:
    'Add liquidity to a Uniswap V3 concentrated liquidity pool on Arc Testnet. Mints an LP NFT position. Use for "add liquidity", "create LP position", "provide liquidity to USDC/ETH pool". Caller chooses tick range or selects "full" / "narrow" / "wide" presets.',
  inputSchema: z.object({
    tokenA: z.string().describe('First token symbol or address.'),
    tokenB: z.string().describe('Second token symbol or address.'),
    amountA: z.string().describe('Human-readable amount of tokenA to deposit.'),
    amountB: z.string().describe('Human-readable amount of tokenB to deposit.'),
    feeTier: z
      .union([z.literal(100), z.literal(500), z.literal(3000), z.literal(10000)])
      .describe(
        'Uniswap V3 fee tier in bps. 100=0.01% (stable), 500=0.05%, 3000=0.30%, 10000=1%. Default 500 for stable pairs, 3000 for volatile.',
      ),
    rangePreset: z
      .enum(['full', 'wide', 'narrow', 'custom'])
      .optional()
      .describe(
        'Tick range preset. "full"=full range, "wide"=±50%, "narrow"=±5%, "custom"=use tickLower/tickUpper.',
      ),
    tickLower: z.number().optional().describe('Required if rangePreset=custom.'),
    tickUpper: z.number().optional().describe('Required if rangePreset=custom.'),
    chain: z.string().optional().describe('Chain enum. Default Arc_Testnet.'),
  }),
})

const removeLiquidityTool = tool({
  description:
    'Burn or decrease a Uniswap V3 LP position. Collects fees and returns underlying tokens.',
  inputSchema: z.object({
    positionId: z.string().describe('NFT tokenId of the LP position.'),
    percent: z.number().optional().describe('Percent of liquidity to remove (1-100). Default 100.'),
    chain: z.string().optional().describe('Chain enum. Default Arc_Testnet.'),
  }),
})

const createJobTool = tool({
  description:
    'Create an ERC-8183 job escrow on Arc for a recurring task (e.g. weekly rebalance, auto-compound LP fees). Funds USDC up front; deliverables released by evaluator.',
  inputSchema: z.object({
    description: z.string().describe('Job description + acceptance criteria.'),
    provider: z.string().optional().describe('Provider agent address. Default Numa.'),
    evaluator: z.string().optional().describe('Evaluator address (oracle, DAO, or self).'),
    budgetUsdc: z.string().describe('Total USDC budget to escrow.'),
    schedule: z.string().optional().describe('Optional cron-like schedule.'),
  }),
})

const registerAgentTool = tool({
  description:
    'Register the user as an ERC-8004 agent on Arc. Mints identity NFT + pins agentURI JSON.',
  inputSchema: z.object({
    name: z.string(),
    description: z.string(),
    image: z.string().optional().describe('URL or ipfs://.'),
    capabilities: z.array(z.string()).optional(),
  }),
})

const hireAgentTool = tool({
  description:
    'Hire another ERC-8004 agent. Reads reputation, then opens an ERC-8183 job funded in USDC.',
  inputSchema: z.object({
    agentId: z.string(),
    task: z.string(),
    budgetUsdc: z.string(),
    deadline: z.string().optional().describe('Optional ISO 8601.'),
  }),
})

/** Tool names that require a wallet signature (no server-side execute). */
export const SIGNING_TOOL_NAMES = [
  'swap',
  'send',
  'bridge',
  'claim_bridge',
  'deposit',
  'withdraw',
  'add_liquidity',
  'remove_liquidity',
  'create_job',
  'register_agent',
  'hire_agent',
] as const

export type SigningToolName = (typeof SIGNING_TOOL_NAMES)[number]

const SIGNING_TOOL_SET = new Set<string>(SIGNING_TOOL_NAMES)

export function isSigningTool(name: string): name is SigningToolName {
  return SIGNING_TOOL_SET.has(name)
}

export const numaTools = {
  // read
  get_prices: getPricesTool,
  get_yield: getYieldTool,
  get_trending: getTrendingTool,
  get_portfolio: getPortfolioTool,
  get_lp_positions: getLpPositionsTool,
  scan_token: scanTokenTool,
  scan_tx: scanTxTool,
  estimate_route: estimateRouteTool,
  get_bridge_status: getBridgeStatusTool,
  // write / signing (no execute)
  swap: swapTool,
  send: sendTool,
  bridge: bridgeTool,
  claim_bridge: claimBridgeTool,
  deposit: depositTool,
  withdraw: withdrawTool,
  add_liquidity: addLiquidityTool,
  remove_liquidity: removeLiquidityTool,
  create_job: createJobTool,
  register_agent: registerAgentTool,
  hire_agent: hireAgentTool,
} satisfies ToolSet

export type NumaTools = typeof numaTools
export type NumaToolName = keyof NumaTools
