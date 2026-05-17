import { scanToken, type ScanTokenParams, type ScanTokenResult } from '@/lib/safety'
import type { Address } from 'viem'

export const scanTokenTool = {
  name: 'scan_token',
  description:
    'Scan an ERC-20 token contract for risk signals before recommending or trading it. Returns risk level (low/med/high) and human-readable flags. Always call this before suggesting a swap into an unknown token.',
  input_schema: {
    type: 'object' as const,
    properties: {
      address: {
        type: 'string',
        description: 'Token contract address (0x-prefixed, EIP-55 checksum tolerated)',
      },
      chainId: {
        type: 'number',
        description:
          'EVM chain id. Defaults to Arc testnet (5042002). Pass other ids for cross-chain checks.',
      },
    },
    required: ['address'],
  },
  async run(input: { address: string; chainId?: number }): Promise<ScanTokenResult> {
    const params: ScanTokenParams = {
      address: input.address as Address,
      chainId: input.chainId,
    }
    return scanToken(params)
  },
} as const

export type ScanTokenTool = typeof scanTokenTool
