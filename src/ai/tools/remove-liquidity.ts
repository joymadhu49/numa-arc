import type { Address } from 'viem'
import { createPublicClient, http } from 'viem'
import { arcTestnet } from '@/chains/arc'
import {
  buildDecreaseLiquidityCalldata,
  positionManagerAbi,
  UNIV3_POSITION_MANAGER,
} from '@/lib/univ3'

export interface RemoveLiquidityArgs {
  positionId: string
  percent?: number
  chain?: string
}

export interface RemoveLiquidityResult {
  ok: boolean
  error?: string
  data?: {
    prepared: { to: string; data: string; value: string }
    liquidityRemoved: string
  }
}

export async function removeLiquidity(args: RemoveLiquidityArgs): Promise<RemoveLiquidityResult> {
  try {
    if (UNIV3_POSITION_MANAGER === '0x0000000000000000000000000000000000000000') {
      return { ok: false, error: 'NEXT_PUBLIC_UNIV3_POSITION_MANAGER not configured' }
    }
    const tokenId = BigInt(args.positionId)
    const percent = Math.min(100, Math.max(1, args.percent ?? 100))

    const client = createPublicClient({ chain: arcTestnet, transport: http() })
    const position = await client.readContract({
      address: UNIV3_POSITION_MANAGER,
      abi: positionManagerAbi,
      functionName: 'positions',
      args: [tokenId],
    })
    const liquidity = position[7] as bigint
    const toRemove = (liquidity * BigInt(percent)) / 100n
    if (toRemove === 0n) return { ok: false, error: 'no liquidity to remove' }

    const prepared = buildDecreaseLiquidityCalldata({
      tokenId,
      liquidity: toRemove,
    })

    return {
      ok: true,
      data: {
        prepared,
        liquidityRemoved: toRemove.toString(),
      },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'remove_liquidity_failed' }
  }
}
