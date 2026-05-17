/**
 * Bridge tool. Wraps Circle App Kit's bridge method (CCTP-backed).
 *
 * Destination defaults to `Arc_Testnet` per the App Kit
 * supported-blockchains enum (case-sensitive, see PLAN §1).
 */

import { appkit } from '@/lib/appkit'
import { arcTestnet } from '@/chains/arc'
import type { TokenSymbol } from '@/lib/tokens'

export interface BridgeArgs {
  /** Source chain key (App Kit enum, e.g. `Ethereum`, `Base`). */
  fromChain: string
  /** Destination chain key. Defaults to `Arc_Testnet`. */
  toChain?: string
  token: TokenSymbol
  /** Human-readable amount, e.g. "100". */
  amount: string
}

export interface BridgeResult {
  hash: `0x${string}`
  status: 'pending' | 'success' | 'failed'
  explorerUrl: string
}

export type BridgeResponse =
  | { ok: true; data: BridgeResult }
  | { ok: false; error: string }

interface AppKitBridgeReturn {
  hash?: string
  transactionHash?: string
  status?: string
}

interface AppKitWithBridge {
  bridge: (args: {
    fromChain: string
    toChain: string
    token: string
    amount: string
  }) => Promise<AppKitBridgeReturn>
}

function normalizeStatus(s: string | undefined): BridgeResult['status'] {
  if (s === 'success' || s === 'confirmed' || s === 'mined') return 'success'
  if (s === 'failed' || s === 'reverted' || s === 'error') return 'failed'
  return 'pending'
}

export async function executeBridge(args: BridgeArgs): Promise<BridgeResponse> {
  try {
    const toChain = args.toChain ?? 'Arc_Testnet'
    const client = appkit as unknown as AppKitWithBridge
    if (typeof client.bridge !== 'function') {
      return { ok: false, error: 'App Kit bridge method unavailable in this version' }
    }
    const result = await client.bridge({
      fromChain: args.fromChain,
      toChain,
      token: args.token,
      amount: args.amount,
    })
    const hash = (result.hash ?? result.transactionHash ?? '') as `0x${string}`
    if (!hash) {
      return { ok: false, error: 'Bridge returned no transaction hash' }
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
    const message = err instanceof Error ? err.message : 'Unknown bridge error'
    return { ok: false, error: message }
  }
}
