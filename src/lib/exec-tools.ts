import type { Address } from 'viem'

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
}

const TOOLS_ENDPOINT_MAP: Record<string, string> = {
  scan_token: '/api/scan',
  scan_tx: '/api/scan',
  scan_approvals: '/api/scan',
}

const SCAN_KIND_MAP: Record<string, string> = {
  scan_token: 'token',
  scan_tx: 'tx',
  scan_approvals: 'approvals',
}

const TOOL_NAME_TO_DISPATCH: Record<string, string> = {
  get_portfolio: 'getPortfolio',
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
      const json = (await res.json()) as ToolExecResult
      return json
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
    const json = (await res.json()) as ToolExecResult
    return json
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'exec_failed' }
  }
}
