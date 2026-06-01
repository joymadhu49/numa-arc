'use client'

import { useCallback } from 'react'
import { getAddress, isAddress, zeroAddress, type Address, type Hex } from 'viem'
import type { SimulateTxResult } from '@/lib/safety'
import { getChain, resolveChainRef } from '@/chains/registry'

/**
 * Pre-sign transaction PREVIEW builder (PHASE 2 / TASK B).
 *
 * Given a pending write action {tool, input, address}, this hook produces the
 * props <TxPreview/> needs: a plain-English summary, recipient/contract,
 * slippage, and — WHERE POSSIBLE — a real eth_call simulation via /api/scan
 * (which wraps safety.simulateTx).
 *
 * HONEST LIMITATION (documented): Circle App Kit performs swap/send/bridge as a
 * single abstracted call and does NOT expose the raw calldata before signing.
 * So for swap / send / bridge we CANNOT run a true pre-sign eth_call; we return
 * a best-effort summary with `simUnavailable: true` and `simulation: null`
 * rather than fabricating balance deltas. For the server-calldata tools
 * (deposit / withdraw / add_liquidity / remove_liquidity) we DO have the
 * prepared {to,data,value} from /api/tools, so those get a real simulation.
 */

const ARC_TESTNET_CHAIN_ID = 5042002

/** Subset of TxPreview's TxSummary we build here (kept structurally compatible). */
export interface TxPreviewSummary {
  from: Address
  to: Address
  data?: Hex
  value?: string
  chainId?: number
  action?: string
  tokenSymbol?: string
  slippagePct?: number
}

export interface TxPreviewData {
  summary: TxPreviewSummary
  simulation: SimulateTxResult | null
  /** True when a true pre-sign simulation is not possible (App Kit abstraction). */
  simUnavailable: boolean
}

const APPKIT_NATIVE = new Set(['swap', 'send', 'bridge'])
const SERVER_CALLDATA = new Set(['deposit', 'withdraw', 'add_liquidity', 'remove_liquidity'])

function rec(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
}

function str(v: unknown, fallback = ''): string {
  return v == null ? fallback : String(v)
}

/** Resolve a token symbol/address to a contract on a chain via the registry. */
function resolveToken(symbolOrAddr: string, chainId: number): Address | undefined {
  if (isAddress(symbolOrAddr)) return getAddress(symbolOrAddr)
  const entry = getChain(chainId)
  const up = symbolOrAddr.toUpperCase()
  if (up === 'USDC') return entry?.usdc
  if (up === 'EURC') return entry?.eurc ?? undefined
  return undefined
}

/** Build a plain-English action line for the preview header. */
function describe(tool: string, o: Record<string, unknown>): string {
  switch (tool) {
    case 'swap':
      return `Swap ${str(o.amount)} ${str(o.fromToken ?? o.tokenIn, 'USDC')} for ${str(o.toToken ?? o.tokenOut, 'EURC')}`
    case 'send':
      return `Send ${str(o.amount)} ${str(o.token, 'USDC')} to ${str(o.to)}`
    case 'bridge':
      return `Bridge ${str(o.amount)} ${str(o.token, 'USDC')} from ${str(o.fromChain)} to ${str(o.toChain)}`
    case 'deposit':
      return `Deposit ${str(o.amount)} ${str(o.token, 'USDC')} into ${str(o.protocol)}`
    case 'withdraw':
      return `Withdraw ${str(o.amount)} ${str(o.token)} from ${str(o.protocol)}`
    case 'add_liquidity':
      return `Add liquidity: ${str(o.amountA)} ${str(o.tokenA)} + ${str(o.amountB)} ${str(o.tokenB)}`
    case 'remove_liquidity':
      return `Remove ${str(o.percent, '100')}% of LP position #${str(o.positionId)}`
    default:
      return tool
  }
}

export interface PreviewInput {
  tool: string
  input: Record<string, unknown>
  address?: Address
}

export function useTxPreview(): (e: PreviewInput) => Promise<TxPreviewData> {
  return useCallback(async ({ tool, input, address }: PreviewInput): Promise<TxPreviewData> => {
    const o = rec(input)
    const from = (address ?? zeroAddress) as Address
    const chainEntry = resolveChainRef(o.chain ?? o.fromChain)
    const chainId = chainEntry.chainId
    const action = describe(tool, o)

    // ----- App-Kit-native: no raw pre-sign calldata available -----
    if (APPKIT_NATIVE.has(tool)) {
      let to: Address = from
      let tokenSymbol: string | undefined
      if (tool === 'send') {
        const toRaw = str(o.to)
        if (isAddress(toRaw)) to = getAddress(toRaw)
        tokenSymbol = str(o.token, 'USDC')
      } else if (tool === 'swap') {
        tokenSymbol = str(o.fromToken ?? o.tokenIn, 'USDC')
      } else if (tool === 'bridge') {
        tokenSymbol = str(o.token, 'USDC')
      }
      const slippageBps = Number(o.slippageBps)
      return {
        summary: {
          from,
          to,
          chainId,
          action,
          tokenSymbol,
          slippagePct: Number.isFinite(slippageBps) && slippageBps > 0 ? slippageBps / 100 : undefined,
        },
        simulation: null,
        simUnavailable: true,
      }
    }

    // ----- Server-calldata tools: fetch prepared {to,data,value} then simulate -----
    if (SERVER_CALLDATA.has(tool)) {
      try {
        const res = await fetch('/api/tools', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tool, args: input, address }),
        })
        const json = (await res.json()) as {
          ok: boolean
          data?: { prepared?: { to: string; data: string; value: string } }
          error?: string
        }
        const prepared = json.data?.prepared
        if (!json.ok || !prepared || !isAddress(prepared.to)) {
          // No calldata → fall back to summary-only, simulation unavailable.
          return {
            summary: { from, to: from, chainId: ARC_TESTNET_CHAIN_ID, action },
            simulation: null,
            simUnavailable: true,
          }
        }
        const to = getAddress(prepared.to)
        // Real eth_call simulation via /api/scan (wraps safety.simulateTx).
        const scanRes = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            kind: 'tx',
            from,
            to,
            data: prepared.data,
            value: prepared.value,
            chainId: ARC_TESTNET_CHAIN_ID,
          }),
        })
        const scanJson = (await scanRes.json()) as {
          ok: boolean
          result?: SimulateTxResult
        }
        return {
          summary: {
            from,
            to,
            data: prepared.data as Hex,
            value: prepared.value,
            chainId: ARC_TESTNET_CHAIN_ID,
            action,
          },
          simulation: scanJson.ok && scanJson.result ? scanJson.result : null,
          simUnavailable: !(scanJson.ok && scanJson.result),
        }
      } catch {
        return {
          summary: { from, to: from, chainId: ARC_TESTNET_CHAIN_ID, action },
          simulation: null,
          simUnavailable: true,
        }
      }
    }

    // ----- Everything else (create_job/hire_agent): summary only -----
    void resolveToken
    return {
      summary: { from, to: from, chainId, action },
      simulation: null,
      simUnavailable: true,
    }
  }, [])
}
