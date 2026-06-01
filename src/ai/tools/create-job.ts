/**
 * AI tool: create_job
 *
 * Alias of `hire_agent` with defaults tuned for recurring tasks (e.g. weekly
 * portfolio rebalances). Conceptually the user is creating a job *spec* that
 * the Numa agent itself will fulfill — the provider defaults to the
 * Numa agent address.
 */

import type { Address, Hex, PublicClient, WalletClient } from 'viem'
import { runHireAgent, type HireAgentToolOutput } from './hire-agent'

/**
 * Default provider — the Arcwise agent's own wallet/account address.
 * TODO_DEPLOY: replace with the canonical Arcwise agent address after the
 * first ERC-8004 registration. Override via env.
 */
function arcwiseAgentAddress(): Address {
  const env =
    typeof process !== 'undefined'
      ? process.env?.NEXT_PUBLIC_ARCWISE_AGENT_ADDRESS
      : undefined
  if (env && /^0x[a-fA-F0-9]{40}$/.test(env)) {
    return env as Address
  }
  return '0x0000000000000000000000000000000000000000'
}

/**
 * Default evaluator — defaults to the user (client) auto-approving for now.
 * In production this should point to an oracle/DAO/zkML validator.
 */
function defaultEvaluator(): Address {
  const env =
    typeof process !== 'undefined'
      ? process.env?.NEXT_PUBLIC_DEFAULT_EVALUATOR
      : undefined
  if (env && /^0x[a-fA-F0-9]{40}$/.test(env)) {
    return env as Address
  }
  return '0x0000000000000000000000000000000000000000'
}

export interface CreateJobToolInput {
  description: string
  /** USDC budget in atomic units (6 decimals). */
  amount: string
  /** Optional provider override. Defaults to the Numa agent. */
  provider?: Address
  /** Optional evaluator override. */
  evaluator?: Address
  /** Optional budget token (defaults to USDC). */
  token?: Address
}

export interface CreateJobToolDeps {
  walletClient: WalletClient
  publicClient: PublicClient
}

export const createJobTool = {
  name: 'create_job',
  description:
    'Create a recurring ERC-8183 job (e.g. weekly portfolio rebalance). Defaults the provider to the Numa agent and funds the escrow in USDC.',
  inputSchema: {
    type: 'object',
    required: ['description', 'amount'],
    properties: {
      description: { type: 'string' },
      amount: {
        type: 'string',
        description: 'USDC budget in atomic units (6 decimals)',
      },
      provider: { type: 'string' },
      evaluator: { type: 'string' },
      token: { type: 'string' },
    },
  },
} as const

export async function runCreateJob(
  input: CreateJobToolInput,
  deps: CreateJobToolDeps,
): Promise<HireAgentToolOutput> {
  const provider = input.provider ?? arcwiseAgentAddress()
  const evaluator = input.evaluator ?? defaultEvaluator()

  return runHireAgent(
    {
      description: input.description,
      provider,
      evaluator,
      amount: input.amount,
      token: input.token,
    },
    deps,
  )
}

export type CreateJobToolOutput = HireAgentToolOutput
export type { Hex }
