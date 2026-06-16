export type ErrorKind =
  | 'user_rejected'
  | 'insufficient_funds'
  | 'gas_estimation'
  | 'contract_revert'
  | 'nonce'
  | 'chain_mismatch'
  | 'wallet_not_connected'
  | 'signature_invalid'
  | 'rate_limit'
  | 'timeout'
  | 'network'
  | 'unauthorized'
  | 'upstream'
  | 'config_missing'
  | 'validation'
  | 'unknown'

export interface ClassifiedError {
  kind: ErrorKind
  headline: string
  hint?: string
  detail: string
}

interface RawErrLike {
  message?: string
  shortMessage?: string
  code?: number | string
  cause?: unknown
  name?: string
}

function pickMessage(err: unknown): string {
  if (!err) return ''
  if (typeof err === 'string') return err
  if (typeof err !== 'object') return String(err)
  const e = err as RawErrLike
  return e.shortMessage || e.message || e.name || JSON.stringify(err)
}

function extractCode(err: unknown): number | string | undefined {
  if (!err || typeof err !== 'object') return undefined
  const e = err as RawErrLike
  if (e.code !== undefined) return e.code
  const c = (err as { cause?: RawErrLike }).cause
  return c?.code
}

function deepStack(err: unknown, max = 4): string {
  const parts: string[] = []
  let cur: unknown = err
  let i = 0
  while (cur && i < max) {
    parts.push(pickMessage(cur))
    const next = (cur as { cause?: unknown }).cause
    if (!next || next === cur) break
    cur = next
    i++
  }
  return parts.filter(Boolean).join(' ← ')
}

const REJECT_PATTERNS = [
  /user rejected/i,
  /user denied/i,
  /rejected by user/i,
  /request rejected/i,
  /denied transaction/i,
  /action_rejected/i,
]

/**
 * Circle App Kit / SwapKit throw `KitError` with structured fields:
 *   type: 'INPUT' | 'BALANCE' | 'ONCHAIN' | 'RPC' | 'NETWORK' | 'RATE_LIMIT' | 'SERVICE' | 'UNKNOWN'
 *   recoverability: 'RETRYABLE' | 'RESUMABLE' | 'FATAL'
 *   name: human-readable id (e.g. "NETWORK_MISMATCH"), code: number
 * These are far more reliable than string matching, so we read them first and
 * only fall back to message heuristics when the shape isn't a KitError. This is
 * what turns an opaque "Something went wrong" into an actionable, honest error.
 */
const KIT_ERROR_TYPES = new Set([
  'INPUT',
  'BALANCE',
  'ONCHAIN',
  'RPC',
  'NETWORK',
  'RATE_LIMIT',
  'SERVICE',
  'UNKNOWN',
])

interface KitErrLike {
  type?: string
  recoverability?: string
  name?: string
  code?: number
}

function asKitError(err: unknown): KitErrLike | null {
  if (!err || typeof err !== 'object') return null
  const e = err as KitErrLike
  if (typeof e.type === 'string' && KIT_ERROR_TYPES.has(e.type) && typeof e.recoverability === 'string') {
    return e
  }
  return null
}

/** Turn an UPPER_SNAKE KitError name into a readable headline. */
function humanizeKitName(name: string | undefined, fallback: string): string {
  if (!name) return fallback
  const words = name.toLowerCase().replace(/_/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : fallback
}

function classifyKitError(kit: KitErrLike, detail: string): ClassifiedError | null {
  const retryable = kit.recoverability === 'RETRYABLE' || kit.recoverability === 'RESUMABLE'
  const retryHint = retryable ? ' This usually clears on retry.' : ''
  const name = (kit.name ?? '').toUpperCase()

  // Name-based specifics — clearer than the broad `type` bucket. The Circle
  // swap service returns these as type INPUT, but "rejected as malformed" is
  // the wrong story for a missing route or a slippage trip.
  if (name.includes('UNSUPPORTED_ROUTE') || name.includes('ROUTE_NOT') || name.includes('NO_ROUTE')) {
    return {
      kind: 'upstream',
      headline: 'No swap route available',
      hint: 'The router has no path for this pair and amount right now (common on Arc testnet — routing is intermittent). Try again shortly, or a different amount/pair.',
      detail,
    }
  }
  if (name.includes('SLIPPAGE') || name.includes('STOP_LIMIT') || name.includes('INSUFFICIENT_OUTPUT')) {
    return {
      kind: 'contract_revert',
      headline: 'Swap exceeded slippage',
      hint: 'The price moved past your slippage tolerance before the swap landed. Retry, or raise slippage slightly for volatile testnet pricing.',
      detail,
    }
  }
  if (name.includes('INSUFFICIENT_SWAP_AMOUNT') || name.includes('INSUFFICIENT_AMOUNT')) {
    return {
      kind: 'validation',
      headline: 'Swap amount too small',
      hint: 'After fees the amount is below the minimum the router accepts. Increase the swap amount.',
      detail,
    }
  }

  switch (kit.type) {
    case 'BALANCE':
      return {
        kind: 'insufficient_funds',
        headline: 'Not enough balance',
        hint: 'Top up the source wallet with the required token or USDC gas on Arc.',
        detail,
      }
    case 'ONCHAIN':
      return {
        kind: 'contract_revert',
        headline: humanizeKitName(kit.name, 'On-chain transaction reverted'),
        hint: `The swap transaction reverted on-chain — commonly a slippage/min-output trip or a missing approval.${retryHint}`,
        detail,
      }
    case 'RPC':
    case 'NETWORK':
      return {
        kind: 'network',
        headline: 'Network error reaching Arc',
        hint: `The RPC or App Kit service was unreachable.${retryHint || ' Check your connection and retry.'}`,
        detail,
      }
    case 'RATE_LIMIT':
      return {
        kind: 'rate_limit',
        headline: 'Upstream rate limit hit',
        hint: 'The swap routing service is throttling us. Try again in a few seconds.',
        detail,
      }
    case 'SERVICE':
      return {
        kind: 'upstream',
        headline: humanizeKitName(kit.name, 'Swap service error'),
        hint: `Circle's swap service returned an error, not your wallet or the chain.${retryHint || ' Try again shortly.'}`,
        detail,
      }
    case 'INPUT':
      return {
        kind: 'validation',
        headline: humanizeKitName(kit.name, 'Invalid swap parameters'),
        hint: 'The swap request was rejected as malformed. Check the tokens, amount, and chain.',
        detail,
      }
    case 'UNKNOWN':
    default:
      // A KitError we can't categorize — still better than a bare "unknown":
      // surface its name + recoverability so the failure is diagnosable.
      return {
        kind: retryable ? 'timeout' : 'upstream',
        headline: humanizeKitName(kit.name, 'Swap failed'),
        hint: retryable
          ? 'The swap could not start but may succeed on retry.'
          : 'The swap service reported an unrecoverable error. Verify the amount and pair.',
        detail,
      }
  }
}

export function classifyError(err: unknown): ClassifiedError {
  const msg = pickMessage(err)
  const code = extractCode(err)
  const detail = deepStack(err) || msg || 'unknown error'
  const lower = (msg + ' ' + (typeof code === 'string' ? code : '')).toLowerCase()

  if (code === 4001 || code === 'ACTION_REJECTED' || REJECT_PATTERNS.some((r) => r.test(msg))) {
    return {
      kind: 'user_rejected',
      headline: 'Transaction rejected in wallet',
      hint: 'You declined the signing request. Click again and approve to continue.',
      detail,
    }
  }

  // Structured Circle KitError (swap/bridge/send) — trust its own taxonomy
  // before falling back to fragile string matching on the message.
  const kit = asKitError(err) ?? asKitError((err as { cause?: unknown })?.cause)
  if (kit) {
    const classified = classifyKitError(kit, detail)
    if (classified) return classified
  }

  if (/insufficient (funds|balance)/i.test(lower) || /not enough.*(balance|funds)/i.test(lower)) {
    return {
      kind: 'insufficient_funds',
      headline: 'Not enough balance',
      hint: 'Top up the source wallet with the required token or native gas (USDC on Arc).',
      detail,
    }
  }

  if (/gas required exceeds|gas estimation|cannot estimate gas|out of gas/i.test(lower)) {
    return {
      kind: 'gas_estimation',
      headline: 'Gas estimation failed',
      hint: 'The transaction would revert. Check token allowances, amounts, and that the target contract is correct.',
      detail,
    }
  }

  if (/slippage|stop.?limit|min(imum)?.?output|price impact|insufficient output/i.test(lower)) {
    return {
      kind: 'contract_revert',
      headline: 'Swap exceeded slippage',
      hint: 'The price moved past your slippage tolerance before the swap landed. Retry — or raise slippage slightly for volatile testnet pricing.',
      detail,
    }
  }

  if (/no route|route not (found|supported|available)|no.*liquidity|unsupported pair|pool not found/i.test(lower)) {
    return {
      kind: 'upstream',
      headline: 'No swap route available',
      hint: 'The router could not find a path for this pair on this chain right now. Try a different pair or amount.',
      detail,
    }
  }

  if (/execution reverted|contract.*revert|VM Exception|revert reason/i.test(lower)) {
    return {
      kind: 'contract_revert',
      headline: 'Contract reverted',
      hint: 'The on-chain call failed. Common causes: missing approval, slippage exceeded, paused contract.',
      detail,
    }
  }

  if (/nonce too low|replacement transaction underpriced|already known/i.test(lower)) {
    return {
      kind: 'nonce',
      headline: 'Nonce conflict',
      hint: 'A previous tx from this account is still pending. Wait for it to confirm or replace it in your wallet.',
      detail,
    }
  }

  if (/chain (mismatch|not supported|unsupported)|unsupported chain|wrong network/i.test(lower) || code === 4902) {
    return {
      kind: 'chain_mismatch',
      headline: 'Wrong network',
      hint: 'Switch your wallet to Arc Testnet (chainId 5042002) and retry.',
      detail,
    }
  }

  if (/no (wallet|account|connector)|wallet.*not.*connect/i.test(lower)) {
    return {
      kind: 'wallet_not_connected',
      headline: 'Wallet not connected',
      hint: 'Connect a wallet first, then retry.',
      detail,
    }
  }

  if (/invalid signature|signature.*mismatch|bad signature/i.test(lower)) {
    return {
      kind: 'signature_invalid',
      headline: 'Signature invalid',
      hint: 'The wallet returned an unexpected signature. Try signing again.',
      detail,
    }
  }

  if (/rate.?limit|too many requests|429/i.test(lower)) {
    return {
      kind: 'rate_limit',
      headline: 'Upstream rate limit hit',
      hint: 'The price/data feed is throttling us. Try again in a few seconds.',
      detail,
    }
  }

  if (/timeout|ETIMEDOUT|timed out/i.test(lower)) {
    return {
      kind: 'timeout',
      headline: 'Request timed out',
      hint: 'The network or RPC took too long to respond. Retry.',
      detail,
    }
  }

  if (/fetch failed|ENOTFOUND|ECONNRESET|ECONNREFUSED|network error|getaddrinfo/i.test(lower)) {
    return {
      kind: 'network',
      headline: 'Network error',
      hint: 'Could not reach the upstream service. Check your connection and retry.',
      detail,
    }
  }

  if (/401|403|unauthorized|forbidden/i.test(lower)) {
    return {
      kind: 'unauthorized',
      headline: 'Unauthorized',
      hint: 'API credentials missing or rejected. Check server env vars.',
      detail,
    }
  }

  if (/missing_openrouter_api_key|openrouter_failed|coingecko responded|defillama responded/i.test(lower)) {
    return {
      kind: 'upstream',
      headline: 'Upstream service error',
      hint: 'The data provider returned an error. Try again or pick a different query.',
      detail,
    }
  }

  if (/^missing /i.test(msg) || /invalid (json|address|recipient|amount|param)/i.test(lower) || /required/i.test(lower)) {
    return {
      kind: 'validation',
      headline: 'Invalid input',
      hint: 'Check the request arguments and try again.',
      detail,
    }
  }

  if (/missing.*api.*key|missing env|config/i.test(lower)) {
    return {
      kind: 'config_missing',
      headline: 'Server misconfiguration',
      hint: 'A required environment variable is not set. Contact the operator.',
      detail,
    }
  }

  return {
    kind: 'unknown',
    headline: 'Something went wrong',
    detail,
  }
}

export interface ErrorEnvelope {
  ok: false
  error: string
  errorKind: ErrorKind
  errorHint?: string
  errorDetail: string
}

export function toErrorEnvelope(err: unknown): ErrorEnvelope {
  const c = classifyError(err)
  return {
    ok: false,
    error: c.headline,
    errorKind: c.kind,
    errorHint: c.hint,
    errorDetail: c.detail,
  }
}
