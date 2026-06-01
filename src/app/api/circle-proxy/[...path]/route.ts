import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CIRCLE_BASE = 'https://api.circle.com'

/**
 * Circle App Kit CORS shim — host-locked + path-allowlisted.
 *
 * App Kit's browser client calls https://api.circle.com/v{1,2}/… directly, which
 * the browser blocks on CORS (it can't set `x-user-agent` etc.). `circle-fetch-
 * patch.ts` rewrites those calls to this route, which relays them server-side.
 *
 * The proxy MUST forward App Kit's auth: the KIT_KEY travels in the
 * `authorization` header (and App Kit also sets `x-user-agent`/`x-*` headers).
 * The KIT_KEY is `NEXT_PUBLIC_` (client-exposed by design) and only ever reaches
 * api.circle.com, so relaying it is the intended flow, not a credential leak.
 * Stripping it (an earlier over-correction) is what made every swap 401.
 *
 * Retained protections (cheap + meaningful):
 *  1. HOST-LOCK: only ever forwards to https://api.circle.com — never an
 *     attacker-chosen host (no SSRF to arbitrary origins).
 *  2. PATH-ALLOWLIST: only Circle's versioned surface (`v1/…`/`v2/…`); rejects
 *     path traversal and anything else with 403.
 *  3. Drops hop-by-hop request headers and never relays upstream `set-cookie`.
 *  4. Allows only GET / POST / OPTIONS.
 */
const ALLOWED_PATH = /^v[12]\//

/** Request headers we will NOT forward upstream (hop-by-hop / host-specific). */
const STRIPPED_REQUEST_HEADERS = new Set(['host', 'connection', 'content-length', 'cookie'])

function isAllowedPath(path: string[]): boolean {
  const joined = path.join('/')
  // Reject path traversal and anything outside the versioned API surface.
  if (joined.includes('..')) return false
  return ALLOWED_PATH.test(joined)
}

async function forward(req: NextRequest, path: string[]): Promise<Response> {
  if (!isAllowedPath(path)) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Path not allowed by proxy allowlist.' },
      { status: 403 },
    )
  }

  const target = `${CIRCLE_BASE}/${path.join('/')}${req.nextUrl.search}`

  // Forward App Kit's headers (incl. authorization = KIT_KEY, x-user-agent, x-*)
  // so Circle authenticates the request. Drop only hop-by-hop / host headers and
  // the client cookie (never needed by Circle).
  const headers = new Headers()
  for (const [k, v] of req.headers.entries()) {
    if (STRIPPED_REQUEST_HEADERS.has(k.toLowerCase())) continue
    headers.set(k, v)
  }

  const body = req.method === 'GET' ? undefined : await req.arrayBuffer()

  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body,
    cache: 'no-store',
  })

  const resHeaders = new Headers()
  upstream.headers.forEach((v, k) => {
    const lower = k.toLowerCase()
    if (lower === 'content-encoding' || lower === 'transfer-encoding') return
    // Do not relay upstream set-cookie back to the client.
    if (lower === 'set-cookie') return
    resHeaders.set(k, v)
  })

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: resHeaders,
  })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params
  return forward(req, path)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params
  return forward(req, path)
}

export async function OPTIONS(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params
  return forward(req, path)
}
