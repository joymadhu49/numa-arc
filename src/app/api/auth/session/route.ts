import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySessionToken, SESSION_COOKIE } from '@/lib/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/auth/session → { address } if a valid session cookie exists, else
 * { address: null }. Lets the client hydrate signed-in state on load/refresh
 * from the httpOnly cookie (not localStorage). */
export async function GET(): Promise<Response> {
  const jar = await cookies()
  const session = verifySessionToken(jar.get(SESSION_COOKIE)?.value)
  return NextResponse.json({ address: session?.address ?? null })
}

/** DELETE /api/auth/session → clears the session cookie (sign out). */
export async function DELETE(): Promise<Response> {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
  return res
}
