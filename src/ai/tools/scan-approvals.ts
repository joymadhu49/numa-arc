import {
  scanApprovals,
  type ScanApprovalsParams,
  type ScanApprovalsResult,
} from '@/lib/safety'
import type { Address } from 'viem'

export const scanApprovalsTool = {
  name: 'scan_approvals',
  description:
    'Audit a wallet for outstanding ERC-20 approvals. Returns spenders, amounts, and risk classification (max-uint approvals are flagged as high). Use when the user asks about token authorizations or after risky DeFi interactions.',
  input_schema: {
    type: 'object' as const,
    properties: {
      owner: {
        type: 'string',
        description: 'Owner wallet address whose approvals to audit (0x...)',
      },
      chainId: {
        type: 'number',
        description: 'EVM chain id. Defaults to Arc testnet (5042002).',
      },
      fromBlock: {
        type: 'string',
        description: 'Decimal block number to scan from. Default "0" (full history).',
      },
      toBlock: {
        type: 'string',
        description: 'Decimal block number or "latest". Default "latest".',
      },
    },
    required: ['owner'],
  },
  async run(input: {
    owner: string
    chainId?: number
    fromBlock?: string
    toBlock?: string
  }): Promise<ScanApprovalsResult> {
    const params: ScanApprovalsParams = {
      owner: input.owner as Address,
      chainId: input.chainId,
      fromBlock: input.fromBlock,
      toBlock: input.toBlock,
    }
    return scanApprovals(params)
  },
} as const

export type ScanApprovalsTool = typeof scanApprovalsTool
