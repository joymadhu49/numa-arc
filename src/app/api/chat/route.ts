import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from 'ai'
import { cookies } from 'next/headers'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { isAddress } from 'viem'
import { SYSTEM_PROMPT } from '@/ai/system-prompt'
import { buildNumaTools } from '@/ai/tools'
import { verifySessionToken, SESSION_COOKIE } from '@/lib/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Strong 2026 tool-use fallback (overridable via OPENROUTER_MODEL env). */
const FALLBACK_MODEL = 'anthropic/claude-sonnet-4.6'

/** Max number of agentic steps (tool round-trips) per request. */
const MAX_STEPS = 6

// ---------------------------------------------------------------------------
// NO FORCED SCAN-BEFORE-WRITE GATE.
//
// A previous `prepareStep` gate withheld every fund-moving write tool
// (swap/send/bridge/…) until the model first produced a scan_token/scan_tx
// result. It backfired badly: a plain "swap 1 USDC for EURC" between two KNOWN
// stablecoins has no contract address for the model to scan, so to satisfy the
// gate the model INVENTED token addresses and ran scan_token on them — which on
// Arc (no GoPlus, USDC is a precompile) reported "EOA, not a token / High risk",
// producing scary false-positive cards and never running the swap.
//
// The real, non-theater safety layer is intact and does NOT depend on the gate:
//   1. simulate → review → confirm modal (TxPreview) — the user approves every tx,
//   2. in-code guards in tx-executor (checksum, slippage cap, spend caps),
//   3. scan_token remains available for GENUINELY unknown / user-pasted token
//      addresses (model discretion, per the system prompt) — just not forced.
// ---------------------------------------------------------------------------
// Abuse protection (P0). In-memory per-IP sliding window + body size cap.
//
// TODO(security): replace with server-side SIWE/session gate + a distributed
// rate limiter (e.g. Upstash Redis) for production. The in-memory limiter below
// is per-instance only — it does NOT survive serverless cold starts and does
// NOT coordinate across multiple instances, so it is best-effort defense in
// depth, not a real auth boundary. SIWE is currently verified client-side only
// (see src/lib/use-auth.ts); a real deployment must verify the signed session
// on the server before allowing model calls.
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 20
/** Reject obviously oversized payloads (~256 KB of JSON). */
const MAX_BODY_BYTES = 256 * 1024

const hits = new Map<string, number[]>()

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const cutoff = now - RATE_LIMIT_WINDOW_MS
  const recent = (hits.get(ip) ?? []).filter((t) => t > cutoff)
  recent.push(now)
  hits.set(ip, recent)
  // Opportunistic cleanup so the map does not grow unbounded.
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (times.every((t) => t <= cutoff)) hits.delete(key)
    }
  }
  return recent.length > RATE_LIMIT_MAX
}

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

interface ChatRequestBody {
  messages: UIMessage[]
  /** Optional connected wallet address, used as tool execution context. */
  address?: string
}

export async function POST(req: Request): Promise<Response> {
  // AUTH GATE (the real one): require a valid server-verified wallet session.
  // This is what actually prevents un-authenticated callers from spending LLM
  // credits — the client-side gate is UX only. No cookie → 401, no model call.
  const jar = await cookies()
  const session = verifySessionToken(jar.get(SESSION_COOKIE)?.value)
  if (!session) {
    return jsonError('unauthorized', 401)
  }

  const ip = clientIp(req)
  if (rateLimited(ip)) {
    return jsonError('rate_limited', 429)
  }

  // Body size cap (defense against absurdly large message arrays).
  const contentLength = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return jsonError('payload_too_large', 413)
  }

  const raw = await req.text()
  if (raw.length > MAX_BODY_BYTES) {
    return jsonError('payload_too_large', 413)
  }

  let body: ChatRequestBody
  try {
    body = JSON.parse(raw) as ChatRequestBody
  } catch {
    return jsonError('invalid_json', 400)
  }

  if (!body?.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonError('messages_required', 400)
  }
  if (
    body.address &&
    (!isAddress(body.address) || body.address.toLowerCase() !== session.address)
  ) {
    return jsonError('address_mismatch', 403)
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return jsonError('missing_openrouter_api_key', 500)
  }

  // OpenRouter app-attribution headers (shows up in the OpenRouter dashboard /
  // app rankings). HTTP-Referer uses NEXT_PUBLIC_APP_URL when set, else the prod
  // URL; X-Title labels the app as Numa.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://numa-arc.vercel.app'
  const openrouter = createOpenRouter({
    apiKey,
    headers: { 'HTTP-Referer': appUrl, 'X-Title': 'Numa' },
  })
  const modelId = process.env.OPENROUTER_MODEL ?? FALLBACK_MODEL

  const result = streamText({
    model: openrouter(modelId),
    system: SYSTEM_PROMPT,
    // `ignoreIncompleteToolCalls` strips any signing-tool call the user left
    // unconfirmed (state `input-available`, no result) from the history sent to
    // the model. Without it, an unconfirmed card (e.g. a pending swap) leaves a
    // dangling `tool_use` with no `tool_result`; the very next message then makes
    // the provider reject the conversation (400) and the turn dies with an opaque
    // "Something went wrong". Dropping the incomplete call lets the new turn run.
    messages: await convertToModelMessages(body.messages, {
      ignoreIncompleteToolCalls: true,
    }),
    // Read-tool execute() functions close over the connected wallet address.
    tools: buildNumaTools({ address: session.address }),
    stopWhen: stepCountIs(MAX_STEPS),
  })

  return result.toUIMessageStreamResponse()
}
