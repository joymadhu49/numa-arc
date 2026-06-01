import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  simulateTx,
  scanToken,
  scanApprovals,
  revokeApproval,
} from '@/lib/safety'
import { isAddress, type Address, type Hex } from 'viem'
import { verifySessionToken, SESSION_COOKIE } from '@/lib/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ScanKind = 'tx' | 'token' | 'approvals' | 'revoke'

interface ScanRequestBody {
  kind: ScanKind
  // tx
  from?: string
  to?: string
  data?: string
  value?: string
  // token / approvals
  address?: string
  owner?: string
  // approvals window
  fromBlock?: string
  toBlock?: string
  // revoke
  token?: string
  spender?: string
  // shared
  chainId?: number
}

function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status })
}

function badRequest(message: string): NextResponse {
  return jsonError(message, 400)
}

function assertAddress(value: string | undefined, field: string): Address | NextResponse {
  if (!value || !isAddress(value)) return badRequest(`${field} must be a valid EVM address`)
  return value as Address
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

export async function POST(req: Request): Promise<NextResponse> {
  const jar = await cookies()
  const session = verifySessionToken(jar.get(SESSION_COOKIE)?.value)
  if (!session) return jsonError('unauthorized', 401)

  let body: ScanRequestBody
  try {
    body = (await req.json()) as ScanRequestBody
  } catch {
    return badRequest('Invalid JSON body')
  }

  if (!body || typeof body.kind !== 'string') {
    return badRequest('Missing required field: kind ("tx" | "token" | "approvals" | "revoke")')
  }

  try {
    switch (body.kind) {
      case 'tx': {
        const from = assertAddress(body.from, 'from')
        if (from instanceof NextResponse) return from
        if (!sameAddress(from, session.address)) return jsonError('address_mismatch', 403)
        const to = assertAddress(body.to, 'to')
        if (to instanceof NextResponse) return to
        const result = await simulateTx({
          from,
          to,
          data: body.data as Hex | undefined,
          value: body.value,
          chainId: body.chainId,
        })
        return NextResponse.json(result)
      }
      case 'token': {
        const address = assertAddress(body.address, 'address')
        if (address instanceof NextResponse) return address
        const result = await scanToken({
          address,
          chainId: body.chainId,
        })
        return NextResponse.json(result)
      }
      case 'approvals': {
        const owner = assertAddress(body.owner, 'owner')
        if (owner instanceof NextResponse) return owner
        if (!sameAddress(owner, session.address)) return jsonError('address_mismatch', 403)
        if (!body.fromBlock) {
          return badRequest('approvals scan requires fromBlock to bound the log range')
        }
        const result = await scanApprovals({
          owner,
          chainId: body.chainId,
          fromBlock: body.fromBlock,
          toBlock: body.toBlock,
        })
        return NextResponse.json(result)
      }
      case 'revoke': {
        const token = assertAddress(body.token, 'token')
        if (token instanceof NextResponse) return token
        const spender = assertAddress(body.spender, 'spender')
        if (spender instanceof NextResponse) return spender
        const result = revokeApproval({
          token,
          spender,
        })
        return NextResponse.json(result)
      }
      default:
        return badRequest(`Unknown kind: ${String(body.kind)}`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
