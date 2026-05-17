import { simulateTx, type SimulateTxParams, type SimulateTxResult } from '@/lib/safety'
import type { Address, Hex } from 'viem'

/**
 * scan_tx — REQUIRED pre-flight before any swap/send/bridge.
 * The Arcwise system prompt mandates the AI call this tool before broadcasting
 * any value-moving transaction. Returns simulation outcome plus risk warnings.
 */
export const scanTxTool = {
  name: 'scan_tx',
  description:
    'Dry-run a transaction via eth_call and report success/revert, gas estimate, and risk warnings. MUST be called before any swap, send, or bridge. If risk is high, surface to the user and require explicit confirmation.',
  input_schema: {
    type: 'object' as const,
    properties: {
      from: { type: 'string', description: 'Sender address (0x...)' },
      to: { type: 'string', description: 'Recipient or contract address (0x...)' },
      data: {
        type: 'string',
        description: 'Hex-encoded calldata (0x...). Omit for plain native transfers.',
      },
      value: {
        type: 'string',
        description:
          'Native value in wei as a decimal string (avoids JS number precision loss). Default "0".',
      },
      chainId: {
        type: 'number',
        description: 'EVM chain id. Defaults to Arc testnet (5042002).',
      },
    },
    required: ['from', 'to'],
  },
  async run(input: {
    from: string
    to: string
    data?: string
    value?: string
    chainId?: number
  }): Promise<SimulateTxResult> {
    const params: SimulateTxParams = {
      from: input.from as Address,
      to: input.to as Address,
      data: input.data as Hex | undefined,
      value: input.value,
      chainId: input.chainId,
    }
    return simulateTx(params)
  },
} as const

export type ScanTxTool = typeof scanTxTool
