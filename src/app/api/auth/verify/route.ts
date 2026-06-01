import { NextResponse } from 'next/server'
import { isAddress, recoverMessageAddress, type Hex } from 'viem'
import {
  verifyNonce,
  createSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
} from '@/lib/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface VerifyBody {
  address?: string
  message?: string
  nonce?: string
  exp?: number
  sig?: string
  signature?: string
}

/**
 * POST /api/auth/verify — verifies a wallet signature over a server-issued
 * nonce and, on success, sets the httpOnly session cookie that /api/chat
 * requires. This is the real gate: no valid signature → no session → no LLM.
 */
export async function POST(req: Request): Promise<Response> {
  let body: VerifyBody
  try {
    body = (await req.json()) as VerifyBody
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  const { address, message, nonce, exp, sig, signature } = body
  if (!address || !isAddress(address)) {
    return NextResponse.json({ ok: false, error: 'bad_address' }, { status: 400 })
  }
  if (!message || !nonce || !sig || !signature) {
    return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 })
  }

  // 1) The nonce must be server-issued and unexpired (HMAC-bound).
  if (!verifyNonce(nonce, Number(exp), sig)) {
    return NextResponse.json({ ok: false, error: 'nonce_invalid_or_expired' }, { status: 401 })
  }

  // 2) The signed message must reference THIS nonce and be our canonical prompt
  //    (ties the signature to this challenge; rejects arbitrary signed payloads).
  if (!message.includes(`Nonce: ${nonce}`) || !message.startsWith('Sign in to Numa')) {
    return NextResponse.json({ ok: false, error: 'message_mismatch' }, { status: 401 })
  }

  // 3) The signature must recover to the claimed address.
  let recovered: string
  try {
    recovered = await recoverMessageAddress({ message, signature: signature as Hex })
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_signature' }, { status: 401 })
  }
  if (recovered.toLowerCase() !== address.toLowerCase()) {
    return NextResponse.json({ ok: false, error: 'signature_mismatch' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true, address: address.toLowerCase() })
  res.cookies.set(SESSION_COOKIE, createSessionToken(address), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_S,
  })
  return res
}
