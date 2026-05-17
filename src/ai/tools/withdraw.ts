import { type Address, type Hex, encodeFunctionData, parseAbi, parseUnits, maxUint256 } from 'viem'
import { arcTestnet } from '@/chains/arc'
import { getToken, type TokenSymbol } from '@/lib/tokens'

export interface WithdrawArgs {
  protocol: string
  token: string
  amount: string
  chain?: string
  recipient?: Address
}

export interface WithdrawResult {
  ok: boolean
  error?: string
  data?: {
    prepared: { to: string; data: string; value: string }
    protocol: string
    poolAddress: Address
  }
}

const aavePoolAbi = parseAbi([
  'function withdraw(address asset,uint256 amount,address to) external returns (uint256)',
])

function resolveProtocolAddress(protocol: string): Address | null {
  const p = protocol.toLowerCase()
  if (p.startsWith('aave')) {
    const a = process.env.NEXT_PUBLIC_AAVE_POOL
    return a ? (a as Address) : null
  }
  if (p.startsWith('morpho')) {
    const a = process.env.NEXT_PUBLIC_MORPHO
    return a ? (a as Address) : null
  }
  return null
}

export async function withdraw(args: WithdrawArgs): Promise<WithdrawResult> {
  try {
    const recipient = args.recipient
    if (!recipient) return { ok: false, error: 'recipient required' }
    const poolAddress = resolveProtocolAddress(args.protocol)
    if (!poolAddress) return { ok: false, error: `protocol ${args.protocol} not configured` }

    const token = getToken(arcTestnet.id, args.token as TokenSymbol)
    if (!token || !token.address) {
      return { ok: false, error: `unknown or native-only token ${args.token}` }
    }

    const amount =
      args.amount.toLowerCase() === 'max' ? maxUint256 : parseUnits(args.amount, token.decimals)
    const p = args.protocol.toLowerCase()
    if (!p.startsWith('aave')) {
      return { ok: false, error: `${args.protocol} withdraw not implemented; only aave wired in v1` }
    }

    const data: Hex = encodeFunctionData({
      abi: aavePoolAbi,
      functionName: 'withdraw',
      args: [token.address as Address, amount, recipient],
    })

    return {
      ok: true,
      data: {
        prepared: { to: poolAddress, data, value: '0' },
        protocol: args.protocol,
        poolAddress,
      },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'withdraw_failed' }
  }
}
