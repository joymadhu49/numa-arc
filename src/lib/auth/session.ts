/**
 * Server-side SIWE session — the REAL auth boundary.
 *
 * The client wallet gate (use-auth.ts) is UX only; this module is what actually
 * stops un-authenticated callers (e.g. a direct `curl /api/chat`) from spending
 * the server's LLM/OpenRouter credits.
 *
 * Stateless design (no DB / Redis needed, survives serverless cold starts):
 *  - Nonce  = `nonce.exp` + HMAC(nonce.exp)  → issued by the server, short TTL.
 *  - Session = `address.exp` + HMAC(address.exp) → set as an httpOnly cookie
 *    after a valid signature; verified on every gated request.
 *
 * SECURITY: set AUTH_SECRET in the environment (a long random string). The dev
 * fallback is intentionally obvious so a missing secret is caught in review, not
 * silently shipped.
 */

import crypto from 'crypto'

const SECRET = process.env.AUTH_SECRET

if (process.env.NODE_ENV === 'production' && (!SECRET || SECRET.length < 32)) {
  throw new Error('AUTH_SECRET must be set to a long random value in production')
}

const HMAC_SECRET = SECRET ?? 'numa-dev-insecure-secret-set-AUTH_SECRET-in-env'

/** Session cookie name (httpOnly). */
export const SESSION_COOKIE = 'numa_session'

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const NONCE_TTL_MS = 5 * 60 * 1000 // 5 minutes
export const SESSION_MAX_AGE_S = Math.floor(SESSION_TTL_MS / 1000)

function hmac(input: string): string {
  return crypto.createHmac('sha256', HMAC_SECRET).update(input).digest('base64url')
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}

// --------------------------------------------------------------------------
// Nonce (stateless, short-lived). Bound to the server via HMAC so a client
// can't forge one; embedded in the signed message so the signature is tied to
// this challenge.
// --------------------------------------------------------------------------

export interface NonceChallenge {
  nonce: string
  issuedAt: string
  exp: number
  sig: string
}

export function issueNonce(): NonceChallenge {
  const nonce = crypto.randomBytes(16).toString('hex')
  const issuedAt = new Date().toISOString()
  const exp = Date.now() + NONCE_TTL_MS
  return { nonce, issuedAt, exp, sig: hmac(`${nonce}.${exp}`) }
}

export function verifyNonce(nonce: string, exp: number, sig: string): boolean {
  if (!nonce || !Number.isFinite(exp) || !sig) return false
  if (Date.now() > exp) return false
  return safeEqual(hmac(`${nonce}.${exp}`), sig)
}

// --------------------------------------------------------------------------
// Canonical SIWE-style message. Built identically on the nonce endpoint and
// referenced (by nonce) on verify, so the signed bytes are unambiguous.
// --------------------------------------------------------------------------

export function buildSiweMessage(address: string, nonce: string, issuedAt: string): string {
  return [
    'Sign in to Numa',
    '',
    `Address: ${address}`,
    'Chain: Arc Testnet (5042002)',
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    '',
    'By signing, you authorize this session. No funds move.',
  ].join('\n')
}

// --------------------------------------------------------------------------
// Session token (stateless HMAC cookie value).
// --------------------------------------------------------------------------

export function createSessionToken(address: string): string {
  const addr = address.toLowerCase()
  const exp = Date.now() + SESSION_TTL_MS
  const payload = `${addr}.${exp}`
  return `${payload}.${hmac(payload)}`
}

/** Returns the authenticated address (lowercased) or null if the token is
 * missing / malformed / expired / tampered. */
export function verifySessionToken(token: string | undefined): { address: string } | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [addr, expStr, sig] = parts
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || Date.now() > exp) return null
  if (!safeEqual(hmac(`${addr}.${exp}`), sig)) return null
  return { address: addr }
}
