import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isAddress, type Address } from 'viem'
import { executeSwap, type SwapArgs } from '@/ai/tools/swap'
import { executeSend, type SendArgs } from '@/ai/tools/send'
import { executeBridge, type BridgeArgs } from '@/ai/tools/bridge'
import { getPortfolio, type PortfolioArgs } from '@/ai/tools/portfolio'
import { addLiquidity, type AddLiquidityArgs } from '@/ai/tools/add-liquidity'
import { removeLiquidity, type RemoveLiquidityArgs } from '@/ai/tools/remove-liquidity'
import { getLpPositions } from '@/ai/tools/lp-positions'
import { deposit, type DepositArgs } from '@/ai/tools/deposit'
import { withdraw, type WithdrawArgs } from '@/ai/tools/withdraw'
import { getPrices, type GetPricesArgs } from '@/ai/tools/prices'
import { getYield, type GetYieldArgs } from '@/ai/tools/yield'
import { getTrending } from '@/ai/tools/trending'
import { verifySessionToken, SESSION_COOKIE } from '@/lib/auth/session'

export const runtime = 'nodejs'

type ToolName =
  | 'swap'
  | 'send'
  | 'bridge'
  | 'getPortfolio'
  | 'add_liquidity'
  | 'remove_liquidity'
  | 'get_lp_positions'
  | 'deposit'
  | 'withdraw'
  | 'get_prices'
  | 'get_yield'
  | 'get_trending'

interface ToolRequest {
  tool: ToolName
  args: Record<string, unknown>
  address?: Address
}

const VALID_TOOLS: readonly ToolName[] = [
  'swap',
  'send',
  'bridge',
  'getPortfolio',
  'add_liquidity',
  'remove_liquidity',
  'get_lp_positions',
  'deposit',
  'withdraw',
  'get_prices',
  'get_yield',
  'get_trending',
]

function isToolName(value: unknown): value is ToolName {
  return typeof value === 'string' && (VALID_TOOLS as readonly string[]).includes(value)
}

function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error }, { status })
}

function badRequest(error: string): NextResponse {
  return jsonError(error, 400)
}

function sameAddress(a: string | undefined, b: string): boolean {
  return !!a && isAddress(a) && a.toLowerCase() === b.toLowerCase()
}

export async function POST(req: Request): Promise<NextResponse> {
  const jar = await cookies()
  const session = verifySessionToken(jar.get(SESSION_COOKIE)?.value)
  if (!session) return jsonError('unauthorized', 401)

  let body: ToolRequest
  try {
    body = (await req.json()) as ToolRequest
  } catch {
    return badRequest('Invalid JSON body')
  }

  if (!isToolName(body.tool)) return badRequest('Unknown tool')
  if (!body.args || typeof body.args !== 'object') return badRequest('Missing args')

  const sessionAddress = session.address as Address
  const bodyAddress = typeof body.address === 'string' ? body.address : undefined
  const argAddress = typeof body.args.address === 'string' ? body.args.address : undefined
  if (bodyAddress && !sameAddress(bodyAddress, session.address)) {
    return jsonError('address_mismatch', 403)
  }
  if (argAddress && !sameAddress(argAddress, session.address)) {
    return jsonError('address_mismatch', 403)
  }

  try {
    switch (body.tool) {
      case 'swap':
        return NextResponse.json(await executeSwap(body.args as unknown as SwapArgs))
      case 'send':
        return NextResponse.json(await executeSend(body.args as unknown as SendArgs))
      case 'bridge':
        return NextResponse.json(await executeBridge(body.args as unknown as BridgeArgs))
      case 'getPortfolio': {
        const args = body.args as unknown as PortfolioArgs
        const portfolio = await getPortfolio({ address: sessionAddress, chainId: args.chainId })
        // Opt-in: return the GROUPED multichain PortfolioCardData directly
        // (used by the /portfolio page, which renders the chain-grouped card).
        if (body.args.grouped === true) {
          return NextResponse.json(portfolio)
        }
        if (!portfolio.ok) return NextResponse.json(portfolio)
        // Back-compat shape for any legacy caller (which expects
        // { ok, data: { balances, totalUsd } }). Flatten the multichain
        // PortfolioCardData into the legacy balances[] list.
        const balances = portfolio.chains.flatMap((c) =>
          c.tokens.map((t) => ({
            symbol: t.symbol,
            name: t.name,
            decimals: 6,
            amount: t.balance,
            usdValue: t.usd ?? undefined,
            address: null,
            chainId: 0,
          })),
        )
        return NextResponse.json({
          ok: true as const,
          data: { balances, totalUsd: portfolio.totalUsd },
        })
      }
      case 'add_liquidity': {
        const args = body.args as unknown as AddLiquidityArgs
        return NextResponse.json(await addLiquidity({ ...args, recipient: sessionAddress }))
      }
      case 'remove_liquidity': {
        const args = body.args as unknown as RemoveLiquidityArgs
        return NextResponse.json(
          await removeLiquidity({ ...args, recipient: sessionAddress }),
        )
      }
      case 'get_lp_positions': {
        return NextResponse.json(await getLpPositions({ address: sessionAddress }))
      }
      case 'deposit': {
        const args = body.args as unknown as DepositArgs
        return NextResponse.json(await deposit({ ...args, recipient: sessionAddress }))
      }
      case 'withdraw': {
        const args = body.args as unknown as WithdrawArgs
        return NextResponse.json(await withdraw({ ...args, recipient: sessionAddress }))
      }
      case 'get_prices': {
        const args = body.args as unknown as GetPricesArgs
        return NextResponse.json(await getPrices(args))
      }
      case 'get_yield': {
        const args = body.args as unknown as GetYieldArgs
        return NextResponse.json(await getYield(args))
      }
      case 'get_trending': {
        return NextResponse.json(await getTrending())
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown server error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
