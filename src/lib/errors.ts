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
