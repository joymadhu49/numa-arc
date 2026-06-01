/**
 * Multichain ERC-20 balance reads via viem.
 *
 * For every entry in ACTIVE_CHAINS we build a PUBLIC viem client (from the
 * registry rpcUrl — NEVER an API key) and read the address's USDC (and EURC
 * where the chain has one) via ERC-20 `balanceOf` + `decimals`.
 *
 * Arc's quirk: USDC is the native gas token at the 0x3600… precompile address
 * with 6 decimals. `balanceOf` on that precompile works like a normal ERC-20,
 * so we read it the same way (and pin decimals=6 as a safe default).
 *
 * Per-chain failures are swallowed (a chain that errors is skipped) so one dead
 * RPC never fails the whole portfolio call. SECURITY: public RPC only.
 */

import {
  createPublicClient,
  http,
  formatUnits,
  getAddress,
  type Address,
  type PublicClient,
} from 'viem'
import { ACTIVE_CHAINS, toViemChain, type ChainEntry } from '@/chains/registry'
import { ERC20_ABI } from '@/lib/tokens'

/** A single token balance on one chain. */
export interface ChainTokenBalance {
  symbol: string
  name: string
  /** ERC-20 contract address (Arc USDC uses its native precompile address). */
  address: Address
  /** Human-readable balance (post-formatUnits). */
  balance: string
  decimals: number
}

/** Balances grouped per chain (only chains with a successful read appear). */
export interface ChainBalances {
  chainKey: string
  chainName: string
  logo: string
  tokens: ChainTokenBalance[]
}

/** Per-chain public-client cache so repeated calls reuse transports. */
const clientCache = new Map<number, PublicClient>()

function clientForEntry(entry: ChainEntry): PublicClient {
  const cached = clientCache.get(entry.chainId)
  if (cached) return cached
  const client = createPublicClient({
    chain: toViemChain(entry),
    transport: http(entry.rpcUrl),
  }) as PublicClient
  clientCache.set(entry.chainId, client)
  return client
}

/** Token spec to read on a given chain. */
interface TokenSpec {
  symbol: string
  name: string
  address: Address
  /** Fallback decimals if the on-chain `decimals()` read fails. */
  fallbackDecimals: number
}

/** Derive the token specs (USDC + optional EURC) for a chain from the registry. */
function tokenSpecsForChain(entry: ChainEntry): TokenSpec[] {
  const specs: TokenSpec[] = [
    { symbol: 'USDC', name: 'USD Coin', address: entry.usdc, fallbackDecimals: 6 },
  ]
  if (entry.eurc) {
    specs.push({ symbol: 'EURC', name: 'Euro Coin', address: entry.eurc, fallbackDecimals: 6 })
  }
  return specs
}

/** Read one token's balance + decimals on a chain. Returns null on failure. */
async function readTokenBalance(
  client: PublicClient,
  owner: Address,
  spec: TokenSpec,
): Promise<ChainTokenBalance | null> {
  try {
    const [rawBalance, rawDecimals] = await Promise.all([
      client.readContract({
        address: spec.address,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [owner],
      }) as Promise<bigint>,
      client
        .readContract({
          address: spec.address,
          abi: ERC20_ABI,
          functionName: 'decimals',
        })
        .then((d) => Number(d))
        .catch(() => spec.fallbackDecimals),
    ])

    const decimals = Number.isFinite(rawDecimals) ? rawDecimals : spec.fallbackDecimals
    return {
      symbol: spec.symbol,
      name: spec.name,
      address: spec.address,
      balance: formatUnits(rawBalance, decimals),
      decimals,
    }
  } catch {
    return null
  }
}

/** Read all token balances for one chain. Returns null if the chain fully fails. */
async function readChainBalances(
  entry: ChainEntry,
  owner: Address,
): Promise<ChainBalances | null> {
  try {
    const client = clientForEntry(entry)
    const specs = tokenSpecsForChain(entry)
    const results = await Promise.all(specs.map((s) => readTokenBalance(client, owner, s)))
    const tokens = results.filter((t): t is ChainTokenBalance => t !== null)
    if (tokens.length === 0) return null
    return {
      chainKey: entry.key,
      chainName: entry.name,
      logo: entry.logo,
      tokens,
    }
  } catch {
    return null
  }
}

/**
 * Read USDC (and EURC where present) balances for `address` across every active
 * chain. Chains that error are skipped; the call never throws on per-chain
 * failure. Throws only on an invalid address.
 */
export async function getMultichainBalances(address: Address): Promise<ChainBalances[]> {
  const owner = getAddress(address)
  const results = await Promise.all(ACTIVE_CHAINS.map((entry) => readChainBalances(entry, owner)))
  return results.filter((c): c is ChainBalances => c !== null)
}
