import {
  createPublicClient,
  http,
  fallback,
  encodeFunctionData,
  parseAbi,
  parseAbiItem,
  formatUnits,
  getAddress,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem'
import { arcTestnet } from '@/chains/arc'
import { ACTIVE_CHAINS, getChain, toViemChain } from '@/chains/registry'

// ---------- Types ----------

export type RiskLevel = 'low' | 'med' | 'high'

/** Risk level used by the shared ScanCardData contract. */
export type ScanRisk = 'low' | 'medium' | 'high' | 'unknown'

/** Structured flag for the shared ScanCardData contract. */
export interface ScanFlag {
  label: string
  severity: 'info' | 'warn' | 'danger'
}

export interface SimulateTxParams {
  from: Address
  to: Address
  data?: Hex
  value?: string // decimal string of wei to keep JSON-serializable
  chainId?: number
}

export interface SimulateTxResult {
  ok: boolean
  revertReason?: string
  gasEstimate?: string // string for JSON safety
  warnings: string[]
  risk: RiskLevel
}

export interface ScanTokenParams {
  address: Address
  chainId?: number
}

/**
 * Token scan result. PRESERVES the legacy fields (`risk: RiskLevel`,
 * `flags: string[]`, `metadata`) for existing consumers, and ADDS the richer
 * fields the shared ScanCardData contract needs (cardRisk, structuredFlags,
 * honeypot, taxes, holderCount, verified, source).
 */
export interface ScanTokenResult {
  risk: RiskLevel
  flags: string[]
  metadata: {
    address: Address
    chainId: number
    name?: string
    symbol?: string
    decimals?: number
    totalSupply?: string
    verified?: boolean
    isContract?: boolean
  }
  // ----- richer fields for ScanCardData -----
  /** Risk in the shared contract's vocabulary. */
  cardRisk: ScanRisk
  /** Structured flags ({label, severity}) for the card. */
  structuredFlags: ScanFlag[]
  /** Where the data came from. */
  source: 'goplus' | 'onchain' | 'mixed'
  verified?: boolean
  honeypot?: boolean
  buyTaxPct?: number
  sellTaxPct?: number
  holderCount?: number
}

export interface ScanApprovalsParams {
  owner: Address
  chainId?: number
  fromBlock?: string // bigint as decimal string
  toBlock?: string | 'latest'
}

export interface ApprovalEntry {
  token: Address
  spender: Address
  amount: string // decimal string (may be max uint256)
  isUnlimited: boolean
  risk: RiskLevel
  reason?: string
}

export interface ScanApprovalsResult {
  approvals: ApprovalEntry[]
  owner: Address
  chainId: number
}

export interface RevokeApprovalParams {
  token: Address
  spender: Address
}

export interface RevokeApprovalResult {
  to: Address
  data: Hex
  value: string
  description: string
}

// ---------- Constants ----------

const MAX_UINT256 =
  115792089237316195423570985008687907853269984665640564039457584007913129639935n

const ERC20_ABI = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
])

const APPROVAL_EVENT = parseAbiItem(
  'event Approval(address indexed owner, address indexed spender, uint256 value)'
)

/**
 * GoPlus token-security supported chains (numeric chainId). GoPlus uses the EVM
 * chainId directly. Arc + Arc-testnet are NOT covered → on-chain fallback.
 * Source: https://docs.gopluslabs.io (token_security supported chains).
 */
const GOPLUS_SUPPORTED_CHAIN_IDS = new Set<number>([
  1, // Ethereum
  10, // Optimism
  56, // BSC
  137, // Polygon
  8453, // Base
  42161, // Arbitrum
  43114, // Avalanche
  59144, // Linea
  130, // Unichain
  // (testnets are largely unsupported by GoPlus → on-chain fallback)
])

// ---------- Client factory (multichain) ----------

const clientCache = new Map<number, PublicClient>()

/**
 * Build (and cache) a viem public client for ANY active chain, keyed by
 * chainId, using the registry's PUBLIC rpc. Falls back to Arc testnet when the
 * chainId is unknown. For Arc, an optional Alchemy key (if present in env) is
 * prepended as a faster transport — but the public RPC is always available.
 */
function getClient(chainId?: number): PublicClient {
  const id = chainId ?? arcTestnet.id
  const cached = clientCache.get(id)
  if (cached) return cached

  // Arc testnet: preserve existing behaviour (optional Alchemy + public RPC).
  if (id === arcTestnet.id) {
    const alchemyKey = process.env.ALCHEMY_KEY ?? process.env.NEXT_PUBLIC_ALCHEMY_KEY
    const transports = [http('https://rpc.testnet.arc.network')]
    if (alchemyKey) {
      transports.unshift(http(`https://arc-testnet.g.alchemy.com/v2/${alchemyKey}`))
    }
    const client = createPublicClient({
      chain: arcTestnet,
      transport: fallback(transports),
    }) as PublicClient
    clientCache.set(id, client)
    return client
  }

  // Any other active/registry chain: build from the registry's public rpc.
  const entry = getChain(id) ?? ACTIVE_CHAINS.find((c) => c.chainId === id)
  if (entry) {
    const client = createPublicClient({
      chain: toViemChain(entry),
      transport: http(entry.rpcUrl),
    }) as PublicClient
    clientCache.set(id, client)
    return client
  }

  // Unknown chain → Arc testnet default (preserves old fall-through behaviour).
  return getClient(arcTestnet.id)
}

// ---------- Helpers ----------

function safeBigInt(value: string | undefined): bigint | undefined {
  if (value === undefined || value === null || value === '') return undefined
  try {
    return BigInt(value)
  } catch {
    return undefined
  }
}

function decodeRevert(err: unknown): string {
  if (err instanceof Error) {
    // viem CallExecutionError exposes shortMessage/details on subclasses
    const anyErr = err as { shortMessage?: string; details?: string; message: string }
    return anyErr.shortMessage ?? anyErr.details ?? anyErr.message
  }
  return 'unknown revert'
}

// ---------- simulateTx ----------

export async function simulateTx(
  params: SimulateTxParams
): Promise<SimulateTxResult> {
  const { from, to, data, value, chainId } = params
  const client = getClient(chainId)
  const warnings: string[] = []
  let risk: RiskLevel = 'low'

  const valueBig = safeBigInt(value) ?? 0n

  // Pre-flight: verify destination is a contract when calldata is present
  if (data && data !== '0x') {
    try {
      const code = await client.getCode({ address: to })
      if (!code || code === '0x') {
        warnings.push('Destination has no bytecode but calldata supplied; call will revert')
        risk = 'high'
      }
    } catch {
      warnings.push('Unable to fetch destination bytecode')
      if (risk === 'low') risk = 'med'
    }
  }

  // Dry-run via eth_call
  try {
    await client.call({
      account: from,
      to,
      data,
      value: valueBig,
    })
  } catch (err) {
    const reason = decodeRevert(err)
    return {
      ok: false,
      revertReason: reason,
      warnings: [...warnings, `Simulation reverted: ${reason}`],
      risk: 'high',
    }
  }

  // Gas estimate (best-effort; some chains require it via different route)
  let gasEstimate: string | undefined
  try {
    const gas = await client.estimateGas({
      account: from,
      to,
      data,
      value: valueBig,
    })
    gasEstimate = gas.toString()
  } catch (err) {
    warnings.push(`Gas estimate failed: ${decodeRevert(err)}`)
    if (risk === 'low') risk = 'med'
  }

  return {
    ok: true,
    gasEstimate,
    warnings,
    risk,
  }
}

// ---------- GoPlus token security ----------

/** Subset of the GoPlus token_security result we consume (all fields optional). */
interface GoPlusTokenResult {
  token_name?: string
  token_symbol?: string
  is_honeypot?: string
  cannot_sell_all?: string
  buy_tax?: string
  sell_tax?: string
  holder_count?: string
  is_open_source?: string
  is_mintable?: string
  can_take_back_ownership?: string
  owner_change_balance?: string
  is_blacklisted?: string
  hidden_owner?: string
  is_proxy?: string
  selfdestruct?: string
  trading_cooldown?: string
  is_anti_whale?: string
  transfer_pausable?: string
}

interface GoPlusResponse {
  code?: number
  message?: string
  result?: Record<string, GoPlusTokenResult>
}

function ynToBool(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined
  if (v === '1') return true
  if (v === '0') return false
  return undefined
}

function pctOrUndef(v: string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined
  const n = Number(v)
  if (!Number.isFinite(n)) return undefined
  // GoPlus returns tax as a fraction (e.g. "0.1" = 10%).
  return n <= 1 ? n * 100 : n
}

async function fetchGoPlus(
  chainId: number,
  address: Address,
): Promise<GoPlusTokenResult | null> {
  try {
    const url = `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${address.toLowerCase()}`
    const res = await fetch(url, {
      next: { revalidate: 300 },
      headers: { accept: 'application/json' },
    })
    if (!res.ok) return null
    const json = (await res.json()) as GoPlusResponse
    if (json.code !== 1 || !json.result) return null
    // GoPlus keys the result map by lowercased address.
    const entry =
      json.result[address.toLowerCase()] ?? Object.values(json.result)[0]
    return entry ?? null
  } catch {
    return null
  }
}

// ---------- scanToken ----------

export async function scanToken(
  params: ScanTokenParams
): Promise<ScanTokenResult> {
  const { address } = params
  const chainId = params.chainId ?? arcTestnet.id
  const normalized = getAddress(address)

  // Legacy outputs (preserved).
  const flags: string[] = []
  let risk: RiskLevel = 'low'

  // Rich outputs (for ScanCardData).
  const structuredFlags: ScanFlag[] = []
  let cardRisk: ScanRisk = 'unknown'
  let source: 'goplus' | 'onchain' | 'mixed' = 'onchain'

  let name: string | undefined
  let symbol: string | undefined
  let decimals: number | undefined
  let totalSupply: string | undefined
  let verified: boolean | undefined
  let honeypot: boolean | undefined
  let buyTaxPct: number | undefined
  let sellTaxPct: number | undefined
  let holderCount: number | undefined

  // ----- 1) GoPlus (when chain is supported) -----
  let goplusOk = false
  if (GOPLUS_SUPPORTED_CHAIN_IDS.has(chainId)) {
    const gp = await fetchGoPlus(chainId, normalized)
    if (gp) {
      goplusOk = true
      source = 'goplus'

      name = gp.token_name || name
      symbol = gp.token_symbol || symbol
      honeypot = ynToBool(gp.is_honeypot)
      const cannotSell = ynToBool(gp.cannot_sell_all)
      buyTaxPct = pctOrUndef(gp.buy_tax)
      sellTaxPct = pctOrUndef(gp.sell_tax)
      verified = ynToBool(gp.is_open_source)
      const holders = gp.holder_count ? Number(gp.holder_count) : undefined
      holderCount = Number.isFinite(holders) ? holders : undefined

      const mintable = ynToBool(gp.is_mintable)
      const blacklist = ynToBool(gp.is_blacklisted)
      const hiddenOwner = ynToBool(gp.hidden_owner)
      const ownerChangeBal = ynToBool(gp.owner_change_balance)
      const takeBackOwnership = ynToBool(gp.can_take_back_ownership)
      const selfdestruct = ynToBool(gp.selfdestruct)
      const pausable = ynToBool(gp.transfer_pausable)
      const cooldown = ynToBool(gp.trading_cooldown)

      // Build flags.
      if (honeypot) {
        structuredFlags.push({ label: 'Honeypot detected', severity: 'danger' })
        flags.push('Honeypot detected (GoPlus)')
      }
      if (cannotSell) {
        structuredFlags.push({ label: 'Cannot sell all tokens', severity: 'danger' })
        flags.push('Cannot sell all (GoPlus)')
      }
      if (typeof sellTaxPct === 'number' && sellTaxPct > 10) {
        structuredFlags.push({
          label: `High sell tax (${sellTaxPct.toFixed(1)}%)`,
          severity: 'danger',
        })
        flags.push(`Sell tax ${sellTaxPct.toFixed(1)}%`)
      } else if (typeof sellTaxPct === 'number' && sellTaxPct > 0) {
        structuredFlags.push({
          label: `Sell tax ${sellTaxPct.toFixed(1)}%`,
          severity: 'warn',
        })
      }
      if (typeof buyTaxPct === 'number' && buyTaxPct > 0) {
        structuredFlags.push({
          label: `Buy tax ${buyTaxPct.toFixed(1)}%`,
          severity: buyTaxPct > 10 ? 'danger' : 'warn',
        })
      }
      if (mintable) {
        structuredFlags.push({ label: 'Owner can mint new tokens', severity: 'warn' })
        flags.push('Mintable by owner')
      }
      if (blacklist) {
        structuredFlags.push({ label: 'Owner can blacklist addresses', severity: 'warn' })
        flags.push('Blacklist function present')
      }
      if (hiddenOwner) {
        structuredFlags.push({ label: 'Hidden owner', severity: 'warn' })
        flags.push('Hidden owner')
      }
      if (ownerChangeBal) {
        structuredFlags.push({ label: 'Owner can change balances', severity: 'danger' })
        flags.push('Owner can change balances')
      }
      if (takeBackOwnership) {
        structuredFlags.push({ label: 'Ownership can be reclaimed', severity: 'warn' })
      }
      if (selfdestruct) {
        structuredFlags.push({ label: 'Self-destruct present', severity: 'danger' })
      }
      if (pausable) {
        structuredFlags.push({ label: 'Transfers can be paused', severity: 'warn' })
      }
      if (cooldown) {
        structuredFlags.push({ label: 'Trading cooldown', severity: 'info' })
      }
      if (verified === true) {
        structuredFlags.push({ label: 'Source code verified', severity: 'info' })
      } else if (verified === false) {
        structuredFlags.push({ label: 'Source code NOT verified', severity: 'warn' })
        flags.push('Unverified source')
      }

      // ----- risk decision -----
      const sellTaxHigh = typeof sellTaxPct === 'number' && sellTaxPct > 10
      if (honeypot === true || cannotSell === true || sellTaxHigh) {
        cardRisk = 'high'
        risk = 'high'
      } else if (
        mintable === true ||
        blacklist === true ||
        ownerChangeBal === true ||
        hiddenOwner === true ||
        verified === false
      ) {
        cardRisk = 'medium'
        risk = 'med'
      } else {
        cardRisk = 'low'
        risk = 'low'
      }
    }
  }

  // ----- 2) On-chain checks (always run; primary when GoPlus unavailable) -----
  // These also fill in metadata that GoPlus may not provide (decimals, supply).
  let isContract = false
  try {
    const client = getClient(chainId)
    const code = await client.getCode({ address: normalized })
    isContract = !!code && code !== '0x'

    if (!isContract) {
      structuredFlags.push({
        label:
          'No token contract found at this address on this chain (it may be an EOA, or the token isn’t deployed here).',
        severity: 'info',
      })
      flags.push('No token contract found at this address on this chain')
      if (!goplusOk) {
        risk = 'med'
        cardRisk = 'unknown'
      }
    } else {
      const reads = await Promise.allSettled([
        client.readContract({ address: normalized, abi: ERC20_ABI, functionName: 'name' }),
        client.readContract({ address: normalized, abi: ERC20_ABI, functionName: 'symbol' }),
        client.readContract({ address: normalized, abi: ERC20_ABI, functionName: 'decimals' }),
        client.readContract({ address: normalized, abi: ERC20_ABI, functionName: 'totalSupply' }),
      ])
      if (reads[0].status === 'fulfilled') name = name ?? (reads[0].value as string)
      if (reads[1].status === 'fulfilled') symbol = symbol ?? (reads[1].value as string)
      if (reads[2].status === 'fulfilled') decimals = Number(reads[2].value as number)
      if (reads[3].status === 'fulfilled') totalSupply = (reads[3].value as bigint).toString()

      if (!goplusOk) {
        if (!name && !symbol) {
          structuredFlags.push({
            label: 'No ERC-20 metadata (name/symbol)',
            severity: 'warn',
          })
          flags.push('Contract does not expose ERC-20 metadata (name/symbol)')
          if (risk === 'low') risk = 'med'
        }
        if (decimals === undefined) {
          structuredFlags.push({
            label: 'Missing decimals() — non-standard ERC-20',
            severity: 'warn',
          })
          flags.push('Contract missing decimals() — not standards-compliant ERC-20')
          if (risk === 'low') risk = 'med'
        }
      }
    }
  } catch {
    structuredFlags.push({ label: 'Unable to read contract bytecode', severity: 'warn' })
    flags.push('Unable to determine if address is a contract')
    if (!goplusOk && risk === 'low') risk = 'med'
  }

  // If GoPlus also ran and on-chain added metadata, mark mixed.
  if (goplusOk && isContract) source = 'mixed'

  // ----- 3) Finalize cardRisk when GoPlus did not run -----
  if (!goplusOk) {
    if (!isContract) {
      // A missing contract is NEUTRAL, not scary: there is simply nothing to
      // assess here (no bytecode to scan). Keep cardRisk 'unknown'.
      cardRisk = 'unknown'
      structuredFlags.push({
        label: 'Token-security API unavailable on this chain (on-chain checks only)',
        severity: 'info',
      })
    } else {
      // Map legacy RiskLevel → ScanRisk. Without GoPlus we only have weak
      // signals; treat a clean-but-unverifiable ERC-20 as 'unknown'.
      if (risk === 'high') cardRisk = 'high'
      else if (risk === 'med') cardRisk = 'medium'
      else cardRisk = 'unknown'
      structuredFlags.push({
        label: 'Honeypot/tax data unavailable on this chain (on-chain checks only)',
        severity: 'info',
      })
      flags.push('GoPlus token-security unavailable on this chain; on-chain checks only')
    }
  }

  if (verified === undefined) {
    flags.push('Source verification status unknown')
  }

  return {
    risk,
    flags,
    metadata: {
      address: normalized,
      chainId,
      name,
      symbol,
      decimals,
      totalSupply,
      verified,
      isContract,
    },
    cardRisk,
    structuredFlags,
    source,
    verified,
    honeypot,
    buyTaxPct,
    sellTaxPct,
    holderCount,
  }
}

// ---------- scanApprovals ----------

export async function scanApprovals(
  params: ScanApprovalsParams
): Promise<ScanApprovalsResult> {
  const { owner, chainId, fromBlock, toBlock } = params
  const normalized = getAddress(owner)
  const client = getClient(chainId)

  const fromBlockBig = safeBigInt(fromBlock) ?? 0n
  const toBlockArg: bigint | 'latest' =
    toBlock === undefined || toBlock === 'latest'
      ? 'latest'
      : (safeBigInt(toBlock) ?? 'latest')

  // Fetch all ERC-20 Approval logs originating from owner.
  // Note: scanning from block 0 on a busy chain is expensive; in production,
  // chunk this or query the explorer's indexed approval API. For Arc testnet
  // (young chain) this is fine. TODO: paginate/chunk on mature chains.
  const logs = await client.getLogs({
    event: APPROVAL_EVENT,
    args: { owner: normalized },
    fromBlock: fromBlockBig,
    toBlock: toBlockArg,
  })

  // Reduce to latest amount per (token, spender)
  const latest = new Map<string, { token: Address; spender: Address; amount: bigint; blockNumber: bigint; logIndex: number }>()
  for (const log of logs) {
    const token = getAddress(log.address)
    const spender = log.args.spender ? getAddress(log.args.spender) : undefined
    const amount = log.args.value
    if (!spender || amount === undefined) continue
    const key = `${token}-${spender}`
    const existing = latest.get(key)
    const block = log.blockNumber ?? 0n
    const idx = log.logIndex ?? 0
    if (
      !existing ||
      block > existing.blockNumber ||
      (block === existing.blockNumber && idx > existing.logIndex)
    ) {
      latest.set(key, { token, spender, amount, blockNumber: block, logIndex: idx })
    }
  }

  const approvals: ApprovalEntry[] = []
  for (const entry of latest.values()) {
    if (entry.amount === 0n) continue // already revoked
    const isUnlimited = entry.amount === MAX_UINT256
    let risk: RiskLevel = 'low'
    let reason: string | undefined
    if (isUnlimited) {
      risk = 'high'
      reason = 'Unlimited approval (max uint256) — spender can drain entire balance'
    } else if (entry.amount > 10n ** 30n) {
      // Astronomical but not max — still suspicious
      risk = 'med'
      reason = 'Very large approval — review spender carefully'
    }
    approvals.push({
      token: entry.token,
      spender: entry.spender,
      amount: entry.amount.toString(),
      isUnlimited,
      risk,
      reason,
    })
  }

  // Sort: high risk first, then by amount desc
  approvals.sort((a, b) => {
    const order: Record<RiskLevel, number> = { high: 0, med: 1, low: 2 }
    if (order[a.risk] !== order[b.risk]) return order[a.risk] - order[b.risk]
    const aBig = BigInt(a.amount)
    const bBig = BigInt(b.amount)
    if (aBig === bBig) return 0
    return aBig > bBig ? -1 : 1
  })

  return {
    approvals,
    owner: normalized,
    chainId: chainId ?? arcTestnet.id,
  }
}

// ---------- revokeApproval ----------

export function revokeApproval(
  params: RevokeApprovalParams
): RevokeApprovalResult {
  const token = getAddress(params.token)
  const spender = getAddress(params.spender)
  const data = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spender, 0n],
  })
  return {
    to: token,
    data,
    value: '0',
    description: `Revoke ERC-20 approval for spender ${spender} on token ${token}`,
  }
}

// ---------- Formatting helpers (exported for UI use) ----------

export function formatApprovalAmount(
  entry: ApprovalEntry,
  decimals?: number
): string {
  if (entry.isUnlimited) return 'Unlimited'
  if (decimals === undefined) return entry.amount
  try {
    return formatUnits(BigInt(entry.amount), decimals)
  } catch {
    return entry.amount
  }
}
