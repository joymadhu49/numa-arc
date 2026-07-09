import {
  type Address,
  type Hex,
  encodeFunctionData,
  parseAbi,
  parseUnits,
} from 'viem'

export const UNIV3_POSITION_MANAGER = (process.env.NEXT_PUBLIC_UNIV3_POSITION_MANAGER ??
  '0x0000000000000000000000000000000000000000') as Address

export const UNIV3_SWAP_ROUTER = (process.env.NEXT_PUBLIC_UNIV3_SWAP_ROUTER ??
  '0x0000000000000000000000000000000000000000') as Address

export const UNIV3_FACTORY = (process.env.NEXT_PUBLIC_UNIV3_FACTORY ??
  '0x0000000000000000000000000000000000000000') as Address

export type FeeTier = 100 | 500 | 3000 | 10000

export const TICK_SPACING: Record<FeeTier, number> = {
  100: 1,
  500: 10,
  3000: 60,
  10000: 200,
}

export const MIN_TICK = -887272
export const MAX_TICK = 887272

export const positionManagerAbi = parseAbi([
  'function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) external payable returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)',
  'function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline)) external payable returns (uint256 amount0,uint256 amount1)',
  'function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max)) external payable returns (uint256 amount0,uint256 amount1)',
  'function multicall(bytes[] data) external payable returns (bytes[] results)',
  'function burn(uint256 tokenId) external payable',
  'function positions(uint256 tokenId) external view returns (uint96 nonce,address operator,address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint128 liquidity,uint256 feeGrowthInside0LastX128,uint256 feeGrowthInside1LastX128,uint128 tokensOwed0,uint128 tokensOwed1)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner,uint256 index) external view returns (uint256)',
])

export type RangePreset = 'full' | 'wide' | 'narrow' | 'custom'

export interface TickRange {
  tickLower: number
  tickUpper: number
}

export function presetToTicks(preset: RangePreset, fee: FeeTier, currentTick = 0): TickRange {
  const spacing = TICK_SPACING[fee]
  const round = (t: number): number => Math.floor(t / spacing) * spacing
  if (preset === 'full') {
    // Round the full-range bounds *inward* to the nearest usable tick. Flooring
    // MIN_TICK pushes tickLower below MIN_TICK for spacings >1 (10/60/200),
    // which NonfungiblePositionManager.mint rejects (revert). Ceil the lower
    // bound and floor the upper so both stay valid multiples within range.
    return {
      tickLower: Math.ceil(MIN_TICK / spacing) * spacing,
      tickUpper: Math.floor(MAX_TICK / spacing) * spacing,
    }
  }
  const pct = preset === 'wide' ? 0.5 : 0.05
  const half = Math.log(1 + pct) / Math.log(1.0001)
  return {
    tickLower: round(currentTick - half),
    tickUpper: round(currentTick + half),
  }
}

export interface MintLiquidityInput {
  token0: Address
  token1: Address
  fee: FeeTier
  tickLower: number
  tickUpper: number
  amount0: string
  amount1: string
  decimals0: number
  decimals1: number
  recipient: Address
  slippageBps?: number
  deadlineSeconds?: number
}

export interface PreparedTx {
  to: Address
  data: Hex
  value: string
}

export function buildMintCalldata(input: MintLiquidityInput): PreparedTx {
  const slippage = BigInt(input.slippageBps ?? 50)
  const amount0Desired = parseUnits(input.amount0, input.decimals0)
  const amount1Desired = parseUnits(input.amount1, input.decimals1)
  const amount0Min = (amount0Desired * (10_000n - slippage)) / 10_000n
  const amount1Min = (amount1Desired * (10_000n - slippage)) / 10_000n
  const deadline = BigInt(Math.floor(Date.now() / 1000) + (input.deadlineSeconds ?? 600))

  const data = encodeFunctionData({
    abi: positionManagerAbi,
    functionName: 'mint',
    args: [
      {
        token0: input.token0,
        token1: input.token1,
        fee: input.fee,
        tickLower: input.tickLower,
        tickUpper: input.tickUpper,
        amount0Desired,
        amount1Desired,
        amount0Min,
        amount1Min,
        recipient: input.recipient,
        deadline,
      },
    ],
  })

  return { to: UNIV3_POSITION_MANAGER, data, value: '0' }
}

/** Max uint128 — tells `collect` to sweep everything owed on the position. */
export const UINT128_MAX = (1n << 128n) - 1n

export interface RemoveLiquidityCalldataInput {
  tokenId: bigint
  liquidity: bigint
  /** Where withdrawn tokens + fees are sent — must be the position owner. */
  recipient: Address
  amount0Min?: bigint
  amount1Min?: bigint
  deadlineSeconds?: number
}

/**
 * Build a single multicall that BOTH decreases liquidity AND collects the
 * resulting tokens (plus accrued fees) to the recipient. `decreaseLiquidity`
 * alone only credits `tokensOwed` on the NFT — without the trailing `collect`
 * nothing actually reaches the user's wallet.
 */
export function buildRemoveLiquidityCalldata(input: RemoveLiquidityCalldataInput): PreparedTx {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + (input.deadlineSeconds ?? 600))

  const decreaseData = encodeFunctionData({
    abi: positionManagerAbi,
    functionName: 'decreaseLiquidity',
    args: [
      {
        tokenId: input.tokenId,
        liquidity: input.liquidity,
        amount0Min: input.amount0Min ?? 0n,
        amount1Min: input.amount1Min ?? 0n,
        deadline,
      },
    ],
  })

  const collectData = encodeFunctionData({
    abi: positionManagerAbi,
    functionName: 'collect',
    args: [
      {
        tokenId: input.tokenId,
        recipient: input.recipient,
        amount0Max: UINT128_MAX,
        amount1Max: UINT128_MAX,
      },
    ],
  })

  const data = encodeFunctionData({
    abi: positionManagerAbi,
    functionName: 'multicall',
    args: [[decreaseData, collectData]],
  })

  return { to: UNIV3_POSITION_MANAGER, data, value: '0' }
}
