/**
 * Native CCTP V2 helpers, used when Circle App Kit cannot execute a route
 * (today: any bridge with Arc MAINNET as one end; App Kit has no Arc-mainnet
 * enum). The CCTP V2 contracts ARE live on Arc mainnet (verified on-chain:
 * TokenMessenger/MessageTransmitter at the standard addresses, localDomain 26),
 * so we encode depositForBurn / receiveMessage directly and let the user sign.
 *
 * Flow: burn on source (this module) → Circle attests (Iris API) → claim on
 * destination via receiveMessage. Pure module (viem only), safe on client and
 * server.
 */

import {
  type Address,
  type Hex,
  encodeFunctionData,
  pad,
  parseAbi,
  parseUnits,
} from 'viem'

/** Circle Iris attestation API hosts (V2 message endpoints). */
export const IRIS_MAINNET_BASE = 'https://iris-api.circle.com/v2/messages'
export const IRIS_TESTNET_BASE = 'https://iris-api-sandbox.circle.com/v2/messages'

export function irisBaseFor(testnet: boolean): string {
  return testnet ? IRIS_TESTNET_BASE : IRIS_MAINNET_BASE
}

/** CCTP V2 standard-transfer finality threshold (fast transfer uses 1000). */
const STANDARD_FINALITY_THRESHOLD = 2000

export const tokenMessengerV2Abi = parseAbi([
  'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold)',
])

export const messageTransmitterV2Abi = parseAbi([
  'function receiveMessage(bytes message, bytes attestation)',
])

export const erc20ApproveAbi = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
])

/** Left-pad an EVM address into the bytes32 CCTP recipient encoding. */
export function addressToBytes32(addr: Address): Hex {
  return pad(addr.toLowerCase() as Address, { size: 32 })
}

export interface DepositForBurnInput {
  /** Human-readable USDC amount, e.g. "10.5". */
  amount: string
  destinationDomain: number
  /** Recipient on the destination chain (usually the sender). */
  mintRecipient: Address
  /** USDC address on the SOURCE chain. */
  burnToken: Address
  /** Max fee (base units) Circle may deduct. See fetchStandardMaxFee. */
  maxFee: bigint
}

/** Encode a standard (non-fast) CCTP V2 burn. Amount is 6-decimal USDC. */
export function buildDepositForBurnCalldata(input: DepositForBurnInput): {
  data: Hex
  amountBase: bigint
} {
  const amountBase = parseUnits(input.amount, 6)
  const data = encodeFunctionData({
    abi: tokenMessengerV2Abi,
    functionName: 'depositForBurn',
    args: [
      amountBase,
      input.destinationDomain,
      addressToBytes32(input.mintRecipient),
      input.burnToken,
      pad('0x', { size: 32 }), // destinationCaller: anyone may claim
      input.maxFee,
      STANDARD_FINALITY_THRESHOLD,
    ],
  })
  return { data, amountBase }
}

/**
 * Resolve the maxFee to authorize for a STANDARD transfer from Circle's fee
 * schedule (GET /v2/burn/USDC/fees/{src}/{dst}; minimumFee is in bps). A
 * maxFee below the current fee means Iris never attests and the burn strands,
 * so on any lookup failure fall back to a bounded 10 bps cap rather than 0 —
 * maxFee is only an authorization ceiling; Circle charges the actual fee.
 */
export async function fetchStandardMaxFee(
  srcDomain: number,
  dstDomain: number,
  amountBase: bigint,
  testnet: boolean,
): Promise<bigint> {
  const fallback = amountBase / 1000n + 1n // ~10 bps ceiling
  try {
    const host = irisBaseFor(testnet).replace('/v2/messages', '')
    const res = await fetch(`${host}/v2/burn/USDC/fees/${srcDomain}/${dstDomain}`, {
      headers: { accept: 'application/json' },
    })
    if (!res.ok) return fallback
    const json = (await res.json()) as Array<{ finalityThreshold?: number; minimumFee?: number }>
    const rows = Array.isArray(json) ? json : []
    const standard = rows.find((r) => Number(r.finalityThreshold) >= 2000) ?? rows[rows.length - 1]
    const bps = Number(standard?.minimumFee ?? 0)
    if (!Number.isFinite(bps) || bps < 0) return fallback
    // Authorize the schedule fee plus 1 bps headroom, floor at the fallback.
    const fee = (amountBase * BigInt(Math.ceil(bps + 1))) / 10_000n + 1n
    return fee > fallback ? fee : fallback
  } catch {
    return fallback
  }
}

export function buildApproveCalldata(spender: Address, amountBase: bigint): Hex {
  return encodeFunctionData({
    abi: erc20ApproveAbi,
    functionName: 'approve',
    args: [spender, amountBase],
  })
}

export function buildReceiveMessageCalldata(message: Hex, attestation: Hex): Hex {
  return encodeFunctionData({
    abi: messageTransmitterV2Abi,
    functionName: 'receiveMessage',
    args: [message, attestation],
  })
}

export interface IrisV2Message {
  message?: string
  attestation?: string
  status?: string
  decodedMessage?: { destinationDomain?: number | string }
}

/**
 * Fetch the first CCTP V2 message for a burn tx from Circle's Iris API.
 * Returns null when the burn is not indexed yet. Throws on network failure.
 */
export async function fetchIrisMessage(
  srcDomain: number,
  txHash: string,
  testnet: boolean,
): Promise<IrisV2Message | null> {
  const url = `${irisBaseFor(testnet)}/${srcDomain}?transactionHash=${txHash}`
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Iris API responded ${res.status}`)
  const json = (await res.json()) as { messages?: IrisV2Message[] }
  return json.messages?.[0] ?? null
}
