'use client'

import { Flame, Stamp, Coins, Check, Loader2, ExternalLink } from 'lucide-react'
import { CardShell, TokenLogo } from './_shared'
import { cn } from '@/lib/utils'

export type StageStatus = 'pending' | 'active' | 'done' | 'error'

export interface BridgeChainInfo {
  name: string
  logo?: string
}

/**
 * Visualizes the 3-stage CCTP flow:
 *   Burn on source → Circle attestation → Mint on destination.
 * Fully prop-driven so live status can be fed later. With no stage props it
 * shows an initial "burn active" state.
 */
export interface BridgeCardProps {
  amount?: string
  token?: string
  source: BridgeChainInfo
  dest: BridgeChainInfo
  burn?: StageStatus
  attest?: StageStatus
  mint?: StageStatus
  hash?: string | null
  explorerUrl?: string | null
}

const STAGE_ICON = {
  burn: Flame,
  attest: Stamp,
  mint: Coins,
} as const

function StageNode({
  kind,
  label,
  status,
}: {
  kind: keyof typeof STAGE_ICON
  label: string
  status: StageStatus
}) {
  const Icon = STAGE_ICON[kind]
  const ring =
    status === 'done'
      ? 'border-success bg-success/15 text-success'
      : status === 'active'
        ? 'border-primary bg-primary/15 text-primary'
        : status === 'error'
          ? 'border-danger bg-danger/15 text-danger'
          : 'border-border-c bg-muted-bg text-muted-fg'

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
      <div
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-full border transition',
          ring,
        )}
      >
        {status === 'active' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : status === 'done' ? (
          <Check className="h-4 w-4" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
      </div>
      <span
        className={cn(
          'text-2xs font-medium leading-tight',
          status === 'pending' ? 'text-muted-fg' : 'text-fg',
        )}
      >
        {label}
      </span>
    </div>
  )
}

function Connector({ done }: { done: boolean }) {
  return (
    <div className="mt-[18px] h-px flex-1 self-start">
      <div className={cn('h-px w-full transition', done ? 'bg-success' : 'bg-border-c')} />
    </div>
  )
}

export function BridgeCard({
  amount,
  token = 'USDC',
  source,
  dest,
  burn = 'active',
  attest = 'pending',
  mint = 'pending',
  hash,
  explorerUrl,
}: BridgeCardProps) {
  return (
    <CardShell
      icon={<Coins className="h-4 w-4" />}
      title="Bridge via CCTP"
      right={
        <span className="inline-flex items-center gap-1 rounded-full border border-border-c bg-bg px-2 py-0.5 text-2xs font-medium text-muted-fg">
          {dest.name}
        </span>
      }
    >
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TokenLogo src={source.logo} alt={source.name} size={20} />
            <span className="text-xs font-medium text-fg">{source.name}</span>
          </div>
          <span className="text-xs font-semibold tabular-nums text-fg">
            {amount ? `${amount} ${token}` : token}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-fg">{dest.name}</span>
            <TokenLogo src={dest.logo} alt={dest.name} size={20} />
          </div>
        </div>

        <div className="mt-4 flex items-start">
          <StageNode kind="burn" label={`Burn on ${source.name}`} status={burn} />
          <Connector done={burn === 'done'} />
          <StageNode kind="attest" label="Circle attestation" status={attest} />
          <Connector done={attest === 'done'} />
          <StageNode kind="mint" label={`Mint on ${dest.name}`} status={mint} />
        </div>

        {hash ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border-c pt-3 text-2xs">
            <span className="break-all font-mono text-muted-fg">
              {hash.slice(0, 14)}…{hash.slice(-6)}
            </span>
            {explorerUrl ? (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-border-c bg-muted-bg px-2.5 py-1 font-medium text-fg transition hover:bg-popover"
              >
                <ExternalLink className="h-3 w-3 shrink-0" /> View burn tx
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </CardShell>
  )
}
