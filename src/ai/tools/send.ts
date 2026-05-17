/**
 * Send tool. Wraps Circle App Kit's send method.
 */

import { appkit } from '@/lib/appkit'
import { arcTestnet } from '@/chains/arc'
import type { Address } from 'viem'
import type { TokenSymbol } from '@/lib/tokens'

export interface SendArgs {
  to: Address
  token: TokenSymbol
  /** Human-readable amount, e.g. "1.25". */
  amount: string
  /** Chain key understood by App Kit. Defaults to `Arc_Testnet`. */
  chain?: string
}

export interface SendResult {
  hash: `0x${string}`
  status: 'pending' | 'success' | 'failed'
  explorerUrl: string
}

export type SendResponse = { ok: true; data: SendResult } | { ok: false; error: string }

interface AppKitSendReturn {
  hash?: string
  transactionHash?: string
  status?: string
}

interface AppKitWithSend {
  send: (args: {
    to: Address
    token: string
    amount: string
    chain: string
  }) => Promise<AppKitSendReturn>
}

function normalizeStatus(s: string | undefined): SendResult['status'] {
  if (s === 'success' || s === 'confirmed' || s === 'mined') return 'success'
  if (s === 'failed' || s === 'reverted' || s === 'error') return 'failed'
  return 'pending'
}

export async function executeSend(args: SendArgs): Promise<SendResponse> {
  try {
    const chain = args.chain ?? 'Arc_Testnet'
    if (!args.to || !/^0x[a-fA-F0-9]{40}$/.test(args.to)) {
      return { ok: false, error: 'Invalid recipient address' }
    }
    const client = appkit as unknown as AppKitWithSend
    if (typeof client.send !== 'function') {
      return { ok: false, error: 'App Kit send method unavailable in this version' }
    }
    const result = await client.send({
      to: args.to,
      token: args.token,
      amount: args.amount,
      chain,
    })
    const hash = (result.hash ?? result.transactionHash ?? '') as `0x${string}`
    if (!hash) {
      return { ok: false, error: 'Send returned no transaction hash' }
    }
    return {
      ok: true,
      data: {
        hash,
        status: normalizeStatus(result.status),
        explorerUrl: `${arcTestnet.blockExplorers.default.url}/tx/${hash}`,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown send error'
    return { ok: false, error: message }
  }
}
