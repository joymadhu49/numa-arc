import { type Address, type Hex, encodeFunctionData, parseAbi, parseUnits } from 'viem'
import { arcTestnet } from '@/chains/arc'
import { getToken, type TokenSymbol } from '@/lib/tokens'

export interface DepositArgs {
  protocol: string
  token: string
  amount: string
  chain?: string
  recipient?: Address
}

export interface DepositResult {
  ok: boolean
  error?: string
  data?: {
    prepared: { to: string; data: string; value: string }
    protocol: string
    poolAddress: Address
    note?: string
  }
}

const aavePoolAbi = parseAbi([
  'function supply(address asset,uint256 amount,address onBehalfOf,uint16 referralCode) external',
])

const morphoAbi = parseAbi([
  'function supply((address loanToken,address collateralToken,address oracle,address irm,uint256 lltv) marketParams,uint256 assets,uint256 shares,address onBehalf,bytes data) external returns (uint256,uint256)',
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

export async function deposit(args: DepositArgs): Promise<DepositResult> {
  try {
    const recipient = args.recipient
    if (!recipient) return { ok: false, error: 'recipient required (connect wallet)' }
    const poolAddress = resolveProtocolAddress(args.protocol)
    if (!poolAddress) {
      return {
        ok: false,
        error: `protocol ${args.protocol} not configured for Arc Testnet. Set NEXT_PUBLIC_AAVE_POOL or NEXT_PUBLIC_MORPHO.`,
      }
    }
    const token = getToken(arcTestnet.id, args.token as TokenSymbol)
    if (!token) return { ok: false, error: `unknown token ${args.token}` }
    if (!token.address) {
      return { ok: false, error: `${args.token} is native USDC on Arc; lending markets need an ERC-20 surface address.` }
    }

    const amount = parseUnits(args.amount, token.decimals)
    const p = args.protocol.toLowerCase()

    let data: Hex
    let note: string | undefined

    if (p.startsWith('aave')) {
      data = encodeFunctionData({
        abi: aavePoolAbi,
        functionName: 'supply',
        args: [token.address as Address, amount, recipient, 0],
      })
    } else {
      note = 'Morpho calldata is a placeholder — set NEXT_PUBLIC_MORPHO + market params and update tool.'
      data = '0x' as Hex
    }

    return {
      ok: true,
      data: {
        prepared: { to: poolAddress, data, value: '0' },
        protocol: args.protocol,
        poolAddress,
        note,
      },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'deposit_failed' }
  }
}
