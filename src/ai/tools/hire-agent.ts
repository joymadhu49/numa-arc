/**
 * AI tool: hire_agent
 *
 * Full ERC-8183 onboarding flow for hiring a single agent:
 *   1. createJob(description, evaluator)
 *   2. setProvider(jobId, providerAgent)
 *   3. setBudget(jobId, USDC, amount)
 *   4. fund(jobId)
 *
 * Returns the final tx hash and jobId. USDC is the default budget token on Arc
 * since gas + stablecoin rails are USDC-native.
 */

import type { Address, Hex, PublicClient, WalletClient } from 'viem'
import {
  createJob,
  fund,
  setBudget,
  setProvider,
} from '@/lib/erc8183'

/**
 * USDC token address on Arc testnet.
 * TODO_DEPLOY: Confirm canonical USDC address on Arc testnet. Until then we
 * fall back to env var. On Arc USDC is also the native gas token but may also
 * exist as an ERC-20 surface — see Arc docs.
 */
function usdcAddress(): Address {
  const env =
    typeof process !== 'undefined'
      ? process.env?.NEXT_PUBLIC_ARC_USDC
      : undefined
  if (env && /^0x[a-fA-F0-9]{40}$/.test(env)) {
    return env as Address
  }
  // Placeholder — must be set in env before any hire-agent call succeeds.
  return '0x0000000000000000000000000000000000000000'
}

export interface HireAgentToolInput {
  /** Plain-English description of the job (stored on-chain). */
  description: string
  /** Address of the provider agent that will execute the job. */
  provider: Address
  /** Address of the evaluator that will release funds on completion. */
  evaluator: Address
  /** USDC budget in atomic units (6 decimals). e.g. 10 USDC = 10_000_000. */
  amount: string
  /** Optional override for the budget token (defaults to Arc USDC). */
  token?: Address
}

export interface HireAgentToolOutput {
  jobId: string | null
  txHash: Hex
  steps: {
    createJob: Hex
    setProvider: Hex
    setBudget: Hex
    fund: Hex
  }
}

export interface HireAgentToolDeps {
  walletClient: WalletClient
  publicClient: PublicClient
}

export const hireAgentTool = {
  name: 'hire_agent',
  description:
    'Hire an agent via ERC-8183: create a job, set provider + USDC budget, and fund the escrow. Returns the jobId.',
  inputSchema: {
    type: 'object',
    required: ['description', 'provider', 'evaluator', 'amount'],
    properties: {
      description: { type: 'string' },
      provider: { type: 'string', description: 'Provider agent address' },
      evaluator: { type: 'string', description: 'Evaluator address' },
      amount: {
        type: 'string',
        description: 'USDC budget in atomic units (6 decimals)',
      },
      token: {
        type: 'string',
        description: 'Optional budget token override (defaults to USDC)',
      },
    },
  },
} as const

export async function runHireAgent(
  input: HireAgentToolInput,
  deps: HireAgentToolDeps,
): Promise<HireAgentToolOutput> {
  const token = input.token ?? usdcAddress()
  const amount = BigInt(input.amount)

  const created = await createJob({
    description: input.description,
    evaluator: input.evaluator,
    walletClient: deps.walletClient,
    publicClient: deps.publicClient,
  })

  if (created.jobId === null) {
    throw new Error(
      'hire_agent: createJob succeeded but jobId could not be parsed from logs',
    )
  }

  const setProviderTx = await setProvider({
    jobId: created.jobId,
    provider: input.provider,
    walletClient: deps.walletClient,
  })

  const setBudgetTx = await setBudget({
    jobId: created.jobId,
    token,
    amount,
    walletClient: deps.walletClient,
  })

  const fundTx = await fund({
    jobId: created.jobId,
    walletClient: deps.walletClient,
  })

  return {
    jobId: created.jobId.toString(),
    txHash: fundTx,
    steps: {
      createJob: created.txHash,
      setProvider: setProviderTx,
      setBudget: setBudgetTx,
      fund: fundTx,
    },
  }
}
