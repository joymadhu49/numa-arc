/**
 * ERC-8183 — Agent Job Escrow
 *
 * State machine: Open → Funded → Submitted → Terminal
 *
 *  client.createJob(description, evaluator)   // → jobId, state=Open
 *  client.setProvider(jobId, provider)
 *  client.setBudget(jobId, token, amount)
 *  client.fund(jobId)                         // → state=Funded
 *  provider.submit(jobId, deliverableHash)    // → state=Submitted
 *  evaluator.complete(jobId)                  // → state=Terminal, funds released
 *
 * ABI fragments are best-effort against the EIP-8183 text. TODO_VERIFY once
 * Arc publishes a canonical escrow deployment.
 *
 * Sources:
 *  - eips.ethereum.org/EIPS/eip-8183
 */

import {
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  getContract,
  parseAbi,
} from 'viem'
import { arcTestnet } from '@/chains/arc'

// ──────────────────────────────────────────────────────────────────────────────
// Job state enum (mirrors on-chain uint8)
// ──────────────────────────────────────────────────────────────────────────────

export const JobState = {
  Open: 0,
  Funded: 1,
  Submitted: 2,
  Terminal: 3,
} as const

export type JobStateValue = (typeof JobState)[keyof typeof JobState]

export const JOB_STATE_LABEL: Record<JobStateValue, string> = {
  [JobState.Open]: 'Open',
  [JobState.Funded]: 'Funded',
  [JobState.Submitted]: 'Submitted',
  [JobState.Terminal]: 'Terminal',
}

// ──────────────────────────────────────────────────────────────────────────────
// Address resolution
// ──────────────────────────────────────────────────────────────────────────────

const ZERO: Address = '0x0000000000000000000000000000000000000000'

function envAddress(key: string): Address {
  const value =
    typeof process !== 'undefined' ? process.env?.[key] : undefined
  if (value && /^0x[a-fA-F0-9]{40}$/.test(value)) {
    return value as Address
  }
  return ZERO
}

/**
 * ERC-8183 escrow contract address on Arc testnet.
 * TODO_DEPLOY: replace with canonical address once published. Until then,
 * set NEXT_PUBLIC_ERC8183_ESCROW in `.env.local`.
 */
export const ESCROW_ADDRESS: Address = envAddress(
  'NEXT_PUBLIC_ERC8183_ESCROW',
)

function requireEscrow(override?: Address): Address {
  const addr = override ?? ESCROW_ADDRESS
  if (addr === ZERO) {
    throw new Error(
      'ERC-8183 escrow address not configured. Set NEXT_PUBLIC_ERC8183_ESCROW.',
    )
  }
  return addr
}

// ──────────────────────────────────────────────────────────────────────────────
// ABI
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Canonical-best-effort ABI from EIP-8183. TODO_VERIFY against final spec.
 */
export const jobEscrowAbi = parseAbi([
  // Writes
  'function createJob(string description, address evaluator) returns (uint256 jobId)',
  'function setProvider(uint256 jobId, address provider)',
  'function setBudget(uint256 jobId, address token, uint256 amount)',
  'function fund(uint256 jobId)',
  'function submit(uint256 jobId, bytes32 deliverableHash)',
  'function complete(uint256 jobId)',
  'function cancel(uint256 jobId)',
  // Reads
  'function getJob(uint256 jobId) view returns (address client, address provider, address evaluator, address token, uint256 amount, uint8 state, string description, bytes32 deliverableHash)',
  'function nextJobId() view returns (uint256)',
  // Events
  'event JobCreated(uint256 indexed jobId, address indexed client, address indexed evaluator, string description)',
  'event ProviderSet(uint256 indexed jobId, address indexed provider)',
  'event BudgetSet(uint256 indexed jobId, address indexed token, uint256 amount)',
  'event JobFunded(uint256 indexed jobId, uint256 amount)',
  'event JobSubmitted(uint256 indexed jobId, bytes32 deliverableHash)',
  'event JobCompleted(uint256 indexed jobId)',
  'event JobCancelled(uint256 indexed jobId)',
])

// ──────────────────────────────────────────────────────────────────────────────
// Job record
// ──────────────────────────────────────────────────────────────────────────────

export interface JobRecord {
  jobId: bigint
  client: Address
  provider: Address
  evaluator: Address
  token: Address
  amount: bigint
  state: JobStateValue
  description: string
  deliverableHash: Hex
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

interface BaseWrite {
  walletClient: WalletClient
  escrowAddress?: Address
}

function requireAccount(wc: WalletClient) {
  if (!wc.account) {
    throw new Error('walletClient.account is required')
  }
  return wc.account
}

export interface CreateJobArgs extends BaseWrite {
  description: string
  evaluator: Address
  publicClient?: PublicClient
}

export interface CreateJobResult {
  txHash: Hex
  jobId: bigint | null
}

export async function createJob(
  args: CreateJobArgs,
): Promise<CreateJobResult> {
  const address = requireEscrow(args.escrowAddress)
  const account = requireAccount(args.walletClient)

  const txHash = await args.walletClient.writeContract({
    account,
    chain: arcTestnet,
    address,
    abi: jobEscrowAbi,
    functionName: 'createJob',
    args: [args.description, args.evaluator],
  })

  let jobId: bigint | null = null
  if (args.publicClient) {
    const receipt = await args.publicClient.waitForTransactionReceipt({
      hash: txHash,
    })
    // JobCreated topic[1] is the indexed jobId
    for (const log of receipt.logs) {
      if (
        log.address.toLowerCase() === address.toLowerCase() &&
        log.topics.length >= 2 &&
        log.topics[1] !== undefined
      ) {
        try {
          jobId = BigInt(log.topics[1])
          break
        } catch {
          // ignore
        }
      }
    }
  }

  return { txHash, jobId }
}

export interface SetProviderArgs extends BaseWrite {
  jobId: bigint
  provider: Address
}

export async function setProvider(args: SetProviderArgs): Promise<Hex> {
  const address = requireEscrow(args.escrowAddress)
  const account = requireAccount(args.walletClient)

  return args.walletClient.writeContract({
    account,
    chain: arcTestnet,
    address,
    abi: jobEscrowAbi,
    functionName: 'setProvider',
    args: [args.jobId, args.provider],
  })
}

export interface SetBudgetArgs extends BaseWrite {
  jobId: bigint
  token: Address
  amount: bigint
}

export async function setBudget(args: SetBudgetArgs): Promise<Hex> {
  const address = requireEscrow(args.escrowAddress)
  const account = requireAccount(args.walletClient)

  return args.walletClient.writeContract({
    account,
    chain: arcTestnet,
    address,
    abi: jobEscrowAbi,
    functionName: 'setBudget',
    args: [args.jobId, args.token, args.amount],
  })
}

export interface FundArgs extends BaseWrite {
  jobId: bigint
}

export async function fund(args: FundArgs): Promise<Hex> {
  const address = requireEscrow(args.escrowAddress)
  const account = requireAccount(args.walletClient)

  return args.walletClient.writeContract({
    account,
    chain: arcTestnet,
    address,
    abi: jobEscrowAbi,
    functionName: 'fund',
    args: [args.jobId],
  })
}

export interface SubmitArgs extends BaseWrite {
  jobId: bigint
  deliverableHash: Hex
}

export async function submit(args: SubmitArgs): Promise<Hex> {
  const address = requireEscrow(args.escrowAddress)
  const account = requireAccount(args.walletClient)

  return args.walletClient.writeContract({
    account,
    chain: arcTestnet,
    address,
    abi: jobEscrowAbi,
    functionName: 'submit',
    args: [args.jobId, args.deliverableHash],
  })
}

export interface CompleteArgs extends BaseWrite {
  jobId: bigint
}

export async function complete(args: CompleteArgs): Promise<Hex> {
  const address = requireEscrow(args.escrowAddress)
  const account = requireAccount(args.walletClient)

  return args.walletClient.writeContract({
    account,
    chain: arcTestnet,
    address,
    abi: jobEscrowAbi,
    functionName: 'complete',
    args: [args.jobId],
  })
}

export interface GetJobArgs {
  jobId: bigint
  publicClient: PublicClient
  escrowAddress?: Address
}

export async function getJob(args: GetJobArgs): Promise<JobRecord> {
  const address = requireEscrow(args.escrowAddress)

  const contract = getContract({
    address,
    abi: jobEscrowAbi,
    client: args.publicClient,
  })

  const [
    client,
    provider,
    evaluator,
    token,
    amount,
    state,
    description,
    deliverableHash,
  ] = await contract.read.getJob([args.jobId])

  return {
    jobId: args.jobId,
    client,
    provider,
    evaluator,
    token,
    amount,
    state: state as JobStateValue,
    description,
    deliverableHash,
  }
}
