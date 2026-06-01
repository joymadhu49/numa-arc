/**
 * AI tool: register_agent
 *
 * Thin wrapper around `lib/erc8004.registerAgent` for use by the Claude
 * function-calling layer.
 */

import type { Hex, PublicClient, WalletClient } from 'viem'
import { registerAgent } from '@/lib/erc8004'

export interface RegisterAgentToolInput {
  /**
   * URI of the Agent Registration File (HTTPS or IPFS) per ERC-8004 schema.
   * Example: "https://numa-arc.vercel.app/agent.json"
   */
  agentURI: string
}

export interface RegisterAgentToolOutput {
  txHash: Hex
  agentId: string | null
}

export interface RegisterAgentToolDeps {
  walletClient: WalletClient
  publicClient: PublicClient
}

export const registerAgentTool = {
  name: 'register_agent',
  description:
    'Mint an ERC-8004 agent identity NFT on Arc. Stores the Registration File URI (agentURI) on-chain and returns the assigned agentId.',
  inputSchema: {
    type: 'object',
    required: ['agentURI'],
    properties: {
      agentURI: {
        type: 'string',
        description:
          'HTTPS or IPFS URI of the agent Registration File JSON (ERC-8004 schema).',
      },
    },
  },
} as const

export async function runRegisterAgent(
  input: RegisterAgentToolInput,
  deps: RegisterAgentToolDeps,
): Promise<RegisterAgentToolOutput> {
  const { txHash, agentId } = await registerAgent({
    agentURI: input.agentURI,
    walletClient: deps.walletClient,
    publicClient: deps.publicClient,
  })

  return {
    txHash,
    agentId: agentId === null ? null : agentId.toString(),
  }
}
