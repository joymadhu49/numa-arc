'use client'

import { Loader2, CheckCircle2, XCircle, ExternalLink, PartyPopper } from 'lucide-react'
import { CardShell } from './_shared'
import { cn } from '@/lib/utils'

export type TxStatus = 'pending' | 'success' | 'error'

export interface TxStatusCardProps {
  /** Human label of the action, e.g. "Swap", "Bridge", "Send". */
  action: string
  status: TxStatus
  /** Action summary line, e.g. "100 USDC → EURC". */
  summary?: { left: string; arrow?: string; right?: string }
  hash?: string | null
  explorerUrl?: string | null
  explorerLabel?: string
  error?: string | null
}

export function TxStatusCard({
  action,
  status,
  summary,
  hash,
  explorerUrl,
  explorerLabel = 'View on explorer',
  error,
}: TxStatusCardProps) {
  const icon =
    status === 'success' ? (
      <PartyPopper className="h-4 w-4 text-success" />
    ) : status === 'error' ? (
      <XCircle className="h-4 w-4 text-danger" />
    ) : (
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
    )

  const headline =
    status === 'success'
      ? `${action} confirmed`
      : status === 'error'
        ? `${action} failed`
        : `${action} pending…`

  return (
    <CardShell
      icon={icon}
      title={headline}
      right={
        <span className="inline-flex items-center gap-1 rounded-full border border-border-c bg-bg px-2 py-0.5 text-2xs font-medium text-muted-fg">
          Arc Testnet
        </span>
      }
    >
      <div className="space-y-2 px-4 py-3">
        {summary ? (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
            <span className="break-all font-mono text-fg">{summary.left}</span>
            {summary.arrow ? <span className="text-muted-fg">{summary.arrow}</span> : null}
            {summary.right ? (
              <span className="break-all font-mono text-fg">{summary.right}</span>
            ) : null}
          </div>
        ) : null}

        {status === 'error' && error ? (
          <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        ) : null}

        {hash ? (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-2xs">
            <span className="break-all font-mono text-muted-fg">
              {hash.slice(0, 14)}…{hash.slice(-6)}
            </span>
            {explorerUrl ? (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  'inline-flex min-h-[34px] items-center gap-1 rounded-md border border-border-c bg-muted-bg px-2.5 py-1 font-medium text-fg transition hover:bg-popover',
                )}
              >
                <ExternalLink className="h-3 w-3 shrink-0" /> {explorerLabel}
              </a>
            ) : null}
          </div>
        ) : null}

        {status === 'success' && !hash ? (
          <div className="inline-flex items-center gap-1.5 text-xs text-success">
            <CheckCircle2 className="h-3.5 w-3.5" /> Done
          </div>
        ) : null}
      </div>
    </CardShell>
  )
}
