import type { Address } from 'viem'
import { classifyError, type ErrorKind } from '@/lib/errors'

export type ExecutableToolName =
  | 'swap'
  | 'send'
  | 'bridge'
  | 'deposit'
  | 'withdraw'
  | 'add_liquidity'
  | 'remove_liquidity'
  | 'get_lp_positions'
  | 'get_portfolio'
  | 'register_agent'
  | 'hire_agent'
  | 'create_job'
  | 'scan_token'
  | 'scan_tx'

export interface ToolExecResult {
  ok: boolean
  data?: unknown
  error?: string
  errorKind?: ErrorKind
  errorHint?: string
  errorDetail?: string
}

const SCAN_KIND_MAP: Record<string, string> = {
  scan_token: 'token',
  scan_tx: 'tx',
  scan_approvals: 'approvals',
}

const TOOL_NAME_TO_DISPATCH: Record<string, string> = {
  get_portfolio: 'getPortfolio',
}

function failFrom(err: unknown): ToolExecResult {
  const c = classifyError(err)
  return {
    ok: false,
    error: c.headline,
    errorKind: c.kind,
    errorHint: c.hint,
    errorDetail: c.detail,
  }
}

function annotateUpstream(json: ToolExecResult): ToolExecResult {
  if (json.ok || json.errorKind) return json
  const c = classifyError(json.error ?? 'Unknown server error')
  return {
    ...json,
    error: c.headline,
    errorKind: c.kind,
    errorHint: c.hint,
    errorDetail: json.errorDetail ?? c.detail,
  }
}

async function safeJson(res: Response): Promise<ToolExecResult> {
  try {
    return (await res.json()) as ToolExecResult
  } catch (e) {
    return failFrom(e)
  }
}

export async function execTool(
  name: string,
  input: unknown,
  address?: Address,
): Promise<ToolExecResult> {
  try {
    const scanKind = SCAN_KIND_MAP[name]
    if (scanKind) {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: scanKind, args: input, address }),
      })
      if (!res.ok) {
        return failFrom(new Error(`Scan API responded ${res.status}`))
      }
      return annotateUpstream(await safeJson(res))
    }

    const SIGNING_TOOLS = new Set([
      'swap',
      'send',
      'bridge',
      'deposit',
      'withdraw',
      'add_liquidity',
      'remove_liquidity',
      'register_agent',
      'hire_agent',
      'create_job',
    ])
    if (SIGNING_TOOLS.has(name)) {
      return {
        ok: true,
        data: {
          status: 'awaiting_wallet_signature',
          message:
            'Transaction prepared and shown to the user. The user must confirm in their wallet to broadcast. STOP: do NOT call scan_tx, do NOT call this tool again, do NOT call any further tool. Reply in plain text confirming the action is queued and tell the user to approve in their wallet.',
          tool: name,
          input,
        },
      }
    }

    const dispatch = TOOL_NAME_TO_DISPATCH[name] ?? name
    const res = await fetch('/api/tools', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tool: dispatch, args: input, address }),
    })
    if (!res.ok) {
      return failFrom(new Error(`Tools API responded ${res.status}`))
    }
    return annotateUpstream(await safeJson(res))
  } catch (e) {
    return failFrom(e)
  }
}
