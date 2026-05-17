/**
 * ERC-8004 — Agent Identity / Reputation / Validation registries
 *
 * Three singleton registries per chain:
 *  - IdentityRegistry      (ERC-721 + URIStorage) mints an agent token whose
 *                          tokenURI points to the agent's Registration File JSON
 *  - ReputationRegistry    accepts signed numeric feedback (score, decimals, tags)
 *  - ValidationRegistry    request/record validator hooks (zkML, TEE, restakers)
 *
 * ABI fragments below are derived from the EIP-8004 text and the
 * `erc-8004/erc-8004-contracts` reference repo. Signatures marked TODO must be
 * re-verified once Circle/Arc publishes canonical deployment addresses on the
 * Arc testnet (chainId 5042002).
 *
 * Sources:
 *  - eips.ethereum.org/EIPS/eip-8004
 *  - github.com/erc-8004/erc-8004-contracts
 *  - OpenZeppelin ERC721URIStorage interface
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
// Registry addresses
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Placeholder addresses for the three ERC-8004 registries on Arc testnet.
 *
 * TODO_DEPLOY: Replace with canonical deployments once Circle publishes the
 * official ERC-8004 registry addresses on Arc testnet (chainId 5042002), OR
 * deploy the reference `erc-8004-contracts` ourselves and pin the addresses
 * here. Until then, env vars override:
 *   - NEXT_PUBLIC_ERC8004_IDENTITY
 *   - NEXT_PUBLIC_ERC8004_REPUTATION
 *   - NEXT_PUBLIC_ERC8004_VALIDATION
 */
const ZERO: Address = '0x0000000000000000000000000000000000000000'

function envAddress(key: string): Address {
  const value =
    typeof process !== 'undefined' ? process.env?.[key] : undefined
  if (value && /^0x[a-fA-F0-9]{40}$/.test(value)) {
    return value as Address
  }
  return ZERO
}

export const REGISTRIES: {
  identity: Address
  reputation: Address
  validation: Address
} = {
  identity: envAddress('NEXT_PUBLIC_ERC8004_IDENTITY'),
  reputation: envAddress('NEXT_PUBLIC_ERC8004_REPUTATION'),
  validation: envAddress('NEXT_PUBLIC_ERC8004_VALIDATION'),
}

// ──────────────────────────────────────────────────────────────────────────────
// ABI fragments
// ──────────────────────────────────────────────────────────────────────────────

/**
 * IdentityRegistry — ERC-721 + ERC-721URIStorage extension.
 * `register(string agentURI)` mints a new agent token to msg.sender, sets
 * tokenURI to `agentURI`, and returns the new agentId.
 * `updateAgent(uint256 agentId, string agentURI)` updates the tokenURI.
 * TODO_VERIFY signatures once canonical interface is published.
 */
export const identityRegistryAbi = parseAbi([
  // Writes
  'function register(string agentURI) returns (uint256 agentId)',
  'function updateAgent(uint256 agentId, string agentURI)',
  // Reads (ERC-721 + URIStorage)
  'function ownerOf(uint256 agentId) view returns (address)',
  'function tokenURI(uint256 agentId) view returns (string)',
  'function balanceOf(address owner) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  // Events
  'event AgentRegistered(uint256 indexed agentId, address indexed owner, string agentURI)',
  'event AgentUpdated(uint256 indexed agentId, string agentURI)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
])

/**
 * ReputationRegistry — agents accumulate signed numeric feedback.
 * `submitFeedback(uint256 agentId, int256 score, uint8 decimals, bytes32[] tags)`
 * appends an entry; aggregate score is computed off-chain or via view helper.
 * TODO_VERIFY exact tag encoding (bytes32[] vs string[]).
 */
export const reputationRegistryAbi = parseAbi([
  'function submitFeedback(uint256 agentId, int256 score, uint8 decimals, bytes32[] tags)',
  'function getScore(uint256 agentId) view returns (int256 score, uint8 decimals, uint256 count)',
  'function feedbackCount(uint256 agentId) view returns (uint256)',
  'event FeedbackSubmitted(uint256 indexed agentId, address indexed from, int256 score, uint8 decimals, bytes32[] tags)',
])

/**
 * ValidationRegistry — request a validator to attest to an agent action,
 * and record the validator's response.
 * TODO_VERIFY: EIP-8004 specifies request/record patterns for zkML, TEE and
 * restaking validators; exact selector list pending final EIP text.
 */
export const validationRegistryAbi = parseAbi([
  'function requestValidation(uint256 agentId, bytes32 dataHash, address validator) returns (uint256 requestId)',
  'function recordValidation(uint256 requestId, bool ok, bytes proof)',
  'function getValidation(uint256 requestId) view returns (uint256 agentId, bytes32 dataHash, address validator, bool ok, bool recorded)',
  'event ValidationRequested(uint256 indexed requestId, uint256 indexed agentId, address indexed validator, bytes32 dataHash)',
  'event ValidationRecorded(uint256 indexed requestId, bool ok)',
])

// ──────────────────────────────────────────────────────────────────────────────
// Helper functions
// ──────────────────────────────────────────────────────────────────────────────

export interface RegisterAgentArgs {
  agentURI: string
  walletClient: WalletClient
  publicClient: PublicClient
  identityAddress?: Address
}

export interface RegisterAgentResult {
  txHash: Hex
  agentId: bigint | null
}

/**
 * Mint an ERC-8004 agent identity. Returns the tx hash and (best-effort) the
 * parsed agentId from the Transfer log.
 */
export async function registerAgent(
  args: RegisterAgentArgs,
): Promise<RegisterAgentResult> {
  const address = args.identityAddress ?? REGISTRIES.identity
  if (address === ZERO) {
    throw new Error(
      'ERC-8004 IdentityRegistry address not configured. Set NEXT_PUBLIC_ERC8004_IDENTITY.',
    )
  }

  const account = args.walletClient.account
  if (!account) {
    throw new Error('walletClient.account is required to register an agent')
  }

  const txHash = await args.walletClient.writeContract({
    account,
    chain: arcTestnet,
    address,
    abi: identityRegistryAbi,
    functionName: 'register',
    args: [args.agentURI],
  })

  const receipt = await args.publicClient.waitForTransactionReceipt({
    hash: txHash,
  })

  // Best-effort parse: the ERC-721 Transfer log carries the new tokenId in
  // topics[3]. We avoid eventName decoding to keep this resilient against
  // signature drift.
  let agentId: bigint | null = null
  for (const log of receipt.logs) {
    if (
      log.address.toLowerCase() === address.toLowerCase() &&
      log.topics.length === 4 &&
      log.topics[0] !== undefined &&
      log.topics[3] !== undefined
    ) {
      try {
        agentId = BigInt(log.topics[3])
        break
      } catch {
        // ignore and continue
      }
    }
  }

  return { txHash, agentId }
}

export interface GetAgentArgs {
  agentId: bigint
  publicClient: PublicClient
  identityAddress?: Address
}

export interface AgentRecord {
  agentId: bigint
  owner: Address
  agentURI: string
}

/**
 * Read an agent's owner and tokenURI (Registration File pointer).
 */
export async function getAgent(args: GetAgentArgs): Promise<AgentRecord> {
  const address = args.identityAddress ?? REGISTRIES.identity
  if (address === ZERO) {
    throw new Error(
      'ERC-8004 IdentityRegistry address not configured. Set NEXT_PUBLIC_ERC8004_IDENTITY.',
    )
  }

  const contract = getContract({
    address,
    abi: identityRegistryAbi,
    client: args.publicClient,
  })

  const [owner, agentURI] = await Promise.all([
    contract.read.ownerOf([args.agentId]),
    contract.read.tokenURI([args.agentId]),
  ])

  return {
    agentId: args.agentId,
    owner,
    agentURI,
  }
}

export interface SubmitFeedbackArgs {
  agentId: bigint
  score: bigint
  decimals: number
  tags: Hex[]
  walletClient: WalletClient
  reputationAddress?: Address
}

/**
 * Submit signed reputation feedback for an agent.
 *  - `score` is an int256 in raw units (e.g. 8500 with decimals=2 → 85.00)
 *  - `tags` are bytes32 categorical labels (e.g. keccak256("swap"))
 */
export async function submitFeedback(
  args: SubmitFeedbackArgs,
): Promise<Hex> {
  const address = args.reputationAddress ?? REGISTRIES.reputation
  if (address === ZERO) {
    throw new Error(
      'ERC-8004 ReputationRegistry address not configured. Set NEXT_PUBLIC_ERC8004_REPUTATION.',
    )
  }

  const account = args.walletClient.account
  if (!account) {
    throw new Error('walletClient.account is required to submit feedback')
  }

  return args.walletClient.writeContract({
    account,
    chain: arcTestnet,
    address,
    abi: reputationRegistryAbi,
    functionName: 'submitFeedback',
    args: [args.agentId, args.score, args.decimals, args.tags],
  })
}

export interface GetScoreArgs {
  agentId: bigint
  publicClient: PublicClient
  reputationAddress?: Address
}

export interface ReputationScore {
  score: bigint
  decimals: number
  count: bigint
}

/**
 * Read the aggregate reputation score for an agent.
 */
export async function getScore(
  args: GetScoreArgs,
): Promise<ReputationScore> {
  const address = args.reputationAddress ?? REGISTRIES.reputation
  if (address === ZERO) {
    throw new Error(
      'ERC-8004 ReputationRegistry address not configured. Set NEXT_PUBLIC_ERC8004_REPUTATION.',
    )
  }

  const contract = getContract({
    address,
    abi: reputationRegistryAbi,
    client: args.publicClient,
  })

  const [score, decimals, count] = await contract.read.getScore([args.agentId])
  return { score, decimals, count }
}
