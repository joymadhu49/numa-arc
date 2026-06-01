import { NextResponse } from 'next/server'
import { isAddress, getAddress } from 'viem'
import { issueNonce, buildSiweMessage } from '@/lib/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/nonce?address=0x… → a server-issued, HMAC-bound nonce + the
 * exact message the client must sign. Stateless: the client echoes the nonce
 * fields back to /api/auth/verify.
 */
export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url)
  const raw = searchParams.get('address') ?? ''
  if (!isAddress(raw)) {
    return NextResponse.json({ error: 'bad_address' }, { status: 400 })
  }
  const address = getAddress(raw)
  const { nonce, issuedAt, exp, sig } = issueNonce()
  const message = buildSiweMessage(address, nonce, issuedAt)
  return NextResponse.json({ address, nonce, issuedAt, exp, sig, message })
}
