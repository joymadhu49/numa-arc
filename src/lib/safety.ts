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

// ---------- Types ----------

export type RiskLevel = 'low' | 'med' | 'high'

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

// ---------- Client factory ----------

function getClient(chainId?: number): PublicClient {
  // For now, only Arc testnet is wired in. Cross-chain flows can extend this map.
  if (chainId !== undefined && chainId !== arcTestnet.id) {
    // Fall through with a generic public client using the same RPC for now.
    // TODO: register other chain RPCs (Eth/Base/Arb/etc) for cross-chain scanning.
  }
  const alchemyKey = process.env.ALCHEMY_KEY ?? process.env.NEXT_PUBLIC_ALCHEMY_KEY
  const transports = [http('https://rpc.testnet.arc.network')]
  if (alchemyKey) {
    transports.unshift(http(`https://arc-testnet.g.alchemy.com/v2/${alchemyKey}`))
  }
  return createPublicClient({
    chain: arcTestnet,
    transport: fallback(transports),
  }) as PublicClient
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

// ---------- scanToken ----------

export async function scanToken(
  params: ScanTokenParams
): Promise<ScanTokenResult> {
  const { address, chainId } = params
  const normalized = getAddress(address)
  const client = getClient(chainId)
  const flags: string[] = []
  let risk: RiskLevel = 'low'

  // Check it's actually a contract
  let isContract = false
  try {
    const code = await client.getCode({ address: normalized })
    isContract = !!code && code !== '0x'
    if (!isContract) {
      flags.push('Address is an EOA, not a token contract')
      risk = 'high'
    }
  } catch {
    flags.push('Unable to determine if address is a contract')
    risk = 'med'
  }

  // Try ERC-20 metadata
  let name: string | undefined
  let symbol: string | undefined
  let decimals: number | undefined
  let totalSupply: string | undefined

  if (isContract) {
    const reads = await Promise.allSettled([
      client.readContract({ address: normalized, abi: ERC20_ABI, functionName: 'name' }),
      client.readContract({ address: normalized, abi: ERC20_ABI, functionName: 'symbol' }),
      client.readContract({ address: normalized, abi: ERC20_ABI, functionName: 'decimals' }),
      client.readContract({ address: normalized, abi: ERC20_ABI, functionName: 'totalSupply' }),
    ])

    if (reads[0].status === 'fulfilled') name = reads[0].value as string
    if (reads[1].status === 'fulfilled') symbol = reads[1].value as string
    if (reads[2].status === 'fulfilled') decimals = Number(reads[2].value as number)
    if (reads[3].status === 'fulfilled') totalSupply = (reads[3].value as bigint).toString()

    if (!name && !symbol) {
      flags.push('Contract does not expose ERC-20 metadata (name/symbol)')
      risk = risk === 'low' ? 'med' : risk
    }
    if (decimals === undefined) {
      flags.push('Contract missing decimals() — not standards-compliant ERC-20')
      risk = risk === 'low' ? 'med' : risk
    }
  }

  // TODO: Explorer verification check — call Arcscan API once a public endpoint exists.
  // For now, mark verified as undefined and emit a flag.
  const verified: boolean | undefined = undefined
  if (verified === undefined) {
    flags.push('Source verification status unknown (explorer API not yet integrated)')
  }

  // TODO: GoPlus Security API integration (token security: honeypot, sell tax,
  // hidden owner, mintable). When available, surface sell tax > 10% as 'high'.
  // Placeholder heuristic only.
  flags.push('Honeypot/tax heuristics not yet wired (GoPlus integration pending)')

  // TODO: Holder concentration via explorer or Codex/Birdeye API.
  flags.push('Holder concentration check pending (top-holder API not integrated)')

  return {
    risk,
    flags,
    metadata: {
      address: normalized,
      chainId: chainId ?? arcTestnet.id,
      name,
      symbol,
      decimals,
      totalSupply,
      verified,
      isContract,
    },
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
