import type { Address } from 'viem'
import { getToken, type TokenSymbol } from '@/lib/tokens'
import {
  type FeeTier,
  type RangePreset,
  buildMintCalldata,
  presetToTicks,
  UNIV3_POSITION_MANAGER,
} from '@/lib/univ3'
import { arcTestnet } from '@/chains/arc'

export interface AddLiquidityArgs {
  tokenA: string
  tokenB: string
  amountA: string
  amountB: string
  feeTier: FeeTier
  rangePreset?: RangePreset
  tickLower?: number
  tickUpper?: number
  chain?: string
  recipient?: Address
  slippageBps?: number
}

export interface AddLiquidityResult {
  ok: boolean
  error?: string
  data?: {
    prepared: { to: string; data: string; value: string }
    token0: Address
    token1: Address
    fee: FeeTier
    tickLower: number
    tickUpper: number
    positionManager: Address
    explorerHint: string
  }
}

function sortTokens(a: Address, b: Address): [Address, Address, boolean] {
  const flipped = a.toLowerCase() > b.toLowerCase()
  return flipped ? [b, a, true] : [a, b, false]
}

export async function addLiquidity(args: AddLiquidityArgs): Promise<AddLiquidityResult> {
  try {
    if (UNIV3_POSITION_MANAGER === '0x0000000000000000000000000000000000000000') {
      return { ok: false, error: 'NEXT_PUBLIC_UNIV3_POSITION_MANAGER not configured for Arc Testnet' }
    }
    const recipient = args.recipient
    if (!recipient) return { ok: false, error: 'recipient address required (connected wallet)' }

    const tokA = getToken(arcTestnet.id, args.tokenA as TokenSymbol)
    const tokB = getToken(arcTestnet.id, args.tokenB as TokenSymbol)
    if (!tokA || !tokB) {
      return { ok: false, error: `unknown token: ${!tokA ? args.tokenA : args.tokenB}` }
    }
    const addrA = (tokA.address ?? '0x0000000000000000000000000000000000000000') as Address
    const addrB = (tokB.address ?? '0x0000000000000000000000000000000000000000') as Address
    if (addrA === addrB) return { ok: false, error: 'tokenA and tokenB are the same' }

    const [token0, token1, flipped] = sortTokens(addrA, addrB)
    const dec0 = flipped ? tokB.decimals : tokA.decimals
    const dec1 = flipped ? tokA.decimals : tokB.decimals
    const amt0 = flipped ? args.amountB : args.amountA
    const amt1 = flipped ? args.amountA : args.amountB

    const preset: RangePreset = args.rangePreset ?? 'wide'
    let tickLower: number
    let tickUpper: number
    if (preset === 'custom') {
      if (args.tickLower === undefined || args.tickUpper === undefined) {
        return { ok: false, error: 'tickLower and tickUpper required for custom range' }
      }
      tickLower = args.tickLower
      tickUpper = args.tickUpper
    } else {
      const r = presetToTicks(preset, args.feeTier)
      tickLower = r.tickLower
      tickUpper = r.tickUpper
    }

    const prepared = buildMintCalldata({
      token0,
      token1,
      fee: args.feeTier,
      tickLower,
      tickUpper,
      amount0: amt0,
      amount1: amt1,
      decimals0: dec0,
      decimals1: dec1,
      recipient,
      slippageBps: args.slippageBps,
    })

    return {
      ok: true,
      data: {
        prepared,
        token0,
        token1,
        fee: args.feeTier,
        tickLower,
        tickUpper,
        positionManager: UNIV3_POSITION_MANAGER,
        explorerHint: `${arcTestnet.blockExplorers.default.url}/address/${UNIV3_POSITION_MANAGER}`,
      },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'add_liquidity_failed' }
  }
}
