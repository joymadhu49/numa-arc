import { NextResponse } from 'next/server'
import {
  simulateTx,
  scanToken,
  scanApprovals,
  revokeApproval,
} from '@/lib/safety'
import type { Address, Hex } from 'viem'

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

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function POST(req: Request): Promise<NextResponse> {
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
        if (!body.from || !body.to) return badRequest('tx scan requires from and to')
        const result = await simulateTx({
          from: body.from as Address,
          to: body.to as Address,
          data: body.data as Hex | undefined,
          value: body.value,
          chainId: body.chainId,
        })
        return NextResponse.json(result)
      }
      case 'token': {
        if (!body.address) return badRequest('token scan requires address')
        const result = await scanToken({
          address: body.address as Address,
          chainId: body.chainId,
        })
        return NextResponse.json(result)
      }
      case 'approvals': {
        if (!body.owner) return badRequest('approvals scan requires owner')
        const result = await scanApprovals({
          owner: body.owner as Address,
          chainId: body.chainId,
          fromBlock: body.fromBlock,
          toBlock: body.toBlock,
        })
        return NextResponse.json(result)
      }
      case 'revoke': {
        if (!body.token || !body.spender)
          return badRequest('revoke requires token and spender')
        const result = revokeApproval({
          token: body.token as Address,
          spender: body.spender as Address,
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
