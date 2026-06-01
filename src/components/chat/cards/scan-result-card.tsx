'use client'

import { ShieldCheck, ShieldAlert, ShieldQuestion, CheckCircle2, XCircle } from 'lucide-react'
import { CardShell, FlagRow, fmtCompact, CardError, type FlagSeverity } from './_shared'
import { cn } from '@/lib/utils'

type Risk = 'low' | 'medium' | 'high' | 'unknown'

/** Matches SHARED contract: scan_token -> ScanCardData. */
export type ScanCardData =
  | {
      ok: true
      address: string
      chainKey: string
      name?: string
      symbol?: string
      decimals?: number
      verified?: boolean
      risk: Risk
      flags: Array<{ label: string; severity: FlagSeverity }>
      honeypot?: boolean
      buyTaxPct?: number
      sellTaxPct?: number
      holderCount?: number
      source: 'goplus' | 'onchain' | 'mixed'
    }
  | { ok: false; error: string }

const RISK_META: Record<Risk, { label: string; chip: string; icon: typeof ShieldCheck }> = {
  low: { label: 'Low risk', chip: 'bg-success/15 text-success border-success/30', icon: ShieldCheck },
  medium: { label: 'Medium risk', chip: 'bg-warning/15 text-warning border-warning/30', icon: ShieldAlert },
  high: { label: 'High risk', chip: 'bg-danger/15 text-danger border-danger/30', icon: ShieldAlert },
  unknown: { label: 'Unknown', chip: 'bg-muted-bg text-muted-fg border-border-c', icon: ShieldQuestion },
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-fg">{label}</span>
      <span className="font-medium text-fg">{children}</span>
    </div>
  )
}

export function ScanResultCard({ data }: { data: ScanCardData }) {
  if (!data.ok) return <CardError message={data.error} />

  const meta = RISK_META[data.risk] ?? RISK_META.unknown
  const Icon = meta.icon
  const title = data.symbol || data.name || 'Token scan'

  const hasTax = data.buyTaxPct != null || data.sellTaxPct != null
  const hasFacts = data.honeypot != null || hasTax || data.holderCount != null || data.verified != null

  return (
    <CardShell
      icon={<Icon className="h-4 w-4" />}
      title={title}
      right={
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
            meta.chip,
          )}
        >
          {meta.label}
        </span>
      }
    >
      <div className="border-b border-border-c px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          {data.name && data.name !== title ? (
            <span className="text-muted-fg">{data.name}</span>
          ) : null}
          <span className="font-mono break-all text-muted-fg">{data.address}</span>
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-fg">
          source: {data.source}
          {data.chainKey ? ` · ${data.chainKey}` : ''}
        </div>
      </div>

      {hasFacts ? (
        <div className="space-y-1.5 border-b border-border-c px-4 py-3">
          {data.verified != null ? (
            <Fact label="Verified">
              {data.verified ? (
                <span className="inline-flex items-center gap-1 text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Yes
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-warning">
                  <XCircle className="h-3.5 w-3.5" /> No
                </span>
              )}
            </Fact>
          ) : null}
          {data.honeypot != null ? (
            <Fact label="Honeypot">
              {data.honeypot ? (
                <span className="inline-flex items-center gap-1 text-danger">
                  <XCircle className="h-3.5 w-3.5" /> Detected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" /> No
                </span>
              )}
            </Fact>
          ) : null}
          {data.buyTaxPct != null ? (
            <Fact label="Buy tax">
              <span className={data.buyTaxPct > 10 ? 'text-warning' : 'text-fg'}>
                {data.buyTaxPct}%
              </span>
            </Fact>
          ) : null}
          {data.sellTaxPct != null ? (
            <Fact label="Sell tax">
              <span className={data.sellTaxPct > 10 ? 'text-warning' : 'text-fg'}>
                {data.sellTaxPct}%
              </span>
            </Fact>
          ) : null}
          {data.holderCount != null ? (
            <Fact label="Holders">{fmtCompact(data.holderCount)}</Fact>
          ) : null}
        </div>
      ) : null}

      {data.flags.length > 0 ? (
        <div className="space-y-1.5 px-4 py-3">
          {data.flags.map((f, i) => (
            <FlagRow key={i} label={f.label} severity={f.severity} />
          ))}
        </div>
      ) : (
        <div className="px-4 py-3 text-xs text-muted-fg">No risk flags reported.</div>
      )}
    </CardShell>
  )
}
