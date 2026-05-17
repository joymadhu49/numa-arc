import type { Address } from 'viem'
import { createPublicClient, http } from 'viem'
import { arcTestnet } from '@/chains/arc'
import { positionManagerAbi, UNIV3_POSITION_MANAGER } from '@/lib/univ3'

export interface LpPositionsArgs {
  address: Address
  chain?: string
}

export interface LpPosition {
  tokenId: string
  token0: Address
  token1: Address
  fee: number
  tickLower: number
  tickUpper: number
  liquidity: string
  tokensOwed0: string
  tokensOwed1: string
}

export interface LpPositionsResult {
  ok: boolean
  error?: string
  data?: {
    positions: LpPosition[]
  }
}

export async function getLpPositions(args: LpPositionsArgs): Promise<LpPositionsResult> {
  try {
    if (UNIV3_POSITION_MANAGER === '0x0000000000000000000000000000000000000000') {
      return { ok: false, error: 'NEXT_PUBLIC_UNIV3_POSITION_MANAGER not configured' }
    }
    const client = createPublicClient({ chain: arcTestnet, transport: http() })
    const balance = await client.readContract({
      address: UNIV3_POSITION_MANAGER,
      abi: positionManagerAbi,
      functionName: 'balanceOf',
      args: [args.address],
    })
    const count = Number(balance)
    if (count === 0) return { ok: true, data: { positions: [] } }

    const positions: LpPosition[] = []
    for (let i = 0; i < count; i++) {
      const tokenId = await client.readContract({
        address: UNIV3_POSITION_MANAGER,
        abi: positionManagerAbi,
        functionName: 'tokenOfOwnerByIndex',
        args: [args.address, BigInt(i)],
      })
      const p = await client.readContract({
        address: UNIV3_POSITION_MANAGER,
        abi: positionManagerAbi,
        functionName: 'positions',
        args: [tokenId],
      })
      positions.push({
        tokenId: tokenId.toString(),
        token0: p[2] as Address,
        token1: p[3] as Address,
        fee: Number(p[4]),
        tickLower: Number(p[5]),
        tickUpper: Number(p[6]),
        liquidity: (p[7] as bigint).toString(),
        tokensOwed0: (p[10] as bigint).toString(),
        tokensOwed1: (p[11] as bigint).toString(),
      })
    }

    return { ok: true, data: { positions } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'lp_positions_failed' }
  }
}
