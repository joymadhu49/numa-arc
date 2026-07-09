import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  http,
  type Address,
} from 'viem'
import { arcTestnet } from '@/chains/arc'
import {
  buildRemoveLiquidityCalldata,
  positionManagerAbi,
  UNIV3_POSITION_MANAGER,
} from '@/lib/univ3'

export interface RemoveLiquidityArgs {
  positionId: string
  percent?: number
  chain?: string
  /** Owner the withdrawn tokens go to — injected server-side from the session. */
  recipient?: Address
  /** Slippage floor for the withdrawn amounts, in basis points. Default 100 (1%). */
  slippageBps?: number
}

export interface RemoveLiquidityResult {
  ok: boolean
  error?: string
  data?: {
    prepared: { to: string; data: string; value: string }
    liquidityRemoved: string
  }
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export async function removeLiquidity(args: RemoveLiquidityArgs): Promise<RemoveLiquidityResult> {
  try {
    if (UNIV3_POSITION_MANAGER === ZERO_ADDRESS) {
      return { ok: false, error: 'NEXT_PUBLIC_UNIV3_POSITION_MANAGER not configured' }
    }
    const recipient = args.recipient
    if (!recipient || recipient === ZERO_ADDRESS) {
      return { ok: false, error: 'recipient address required (connected wallet)' }
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

    // Slippage floor: simulate the decrease (as the owner) to learn the
    // expected token amounts, then haircut by slippageBps. A CONTRACT revert
    // here means the real tx would revert too (wrong owner / no approval), so
    // abort with the reason instead of shipping a doomed signature. Only a
    // transport/RPC failure degrades to a 0n floor.
    let amount0Min = 0n
    let amount1Min = 0n
    try {
      const sim = await client.simulateContract({
        address: UNIV3_POSITION_MANAGER,
        abi: positionManagerAbi,
        functionName: 'decreaseLiquidity',
        args: [
          {
            tokenId,
            liquidity: toRemove,
            amount0Min: 0n,
            amount1Min: 0n,
            deadline: BigInt(Math.floor(Date.now() / 1000) + 1200),
          },
        ],
        account: recipient,
      })
      const [expected0, expected1] = sim.result as readonly [bigint, bigint]
      const bps = BigInt(Math.min(5000, Math.max(0, Math.round(args.slippageBps ?? 100))))
      amount0Min = (expected0 * (10_000n - bps)) / 10_000n
      amount1Min = (expected1 * (10_000n - bps)) / 10_000n
    } catch (e) {
      const reverted =
        e instanceof BaseError &&
        e.walk((err) => err instanceof ContractFunctionRevertedError) != null
      if (reverted) {
        return {
          ok: false,
          error:
            'Removing liquidity would revert. The connected wallet is likely not the owner of this position.',
        }
      }
      // Transport hiccup: proceed without a floor rather than blocking.
      amount0Min = 0n
      amount1Min = 0n
    }

    const prepared = buildRemoveLiquidityCalldata({
      tokenId,
      liquidity: toRemove,
      recipient,
      amount0Min,
      amount1Min,
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
