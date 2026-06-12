'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, ExternalLink, Loader2, XCircle } from 'lucide-react'
import { useTxTracker, useTxTrackerPoller, type TrackedTx } from '@/lib/tx-tracker'
import { getChain } from '@/chains/registry'
import { ChainLogo } from '@/components/ui/chain-logo'
import { cn } from '@/lib/utils'

function shortHash(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`
}

/** "send_token" → "Send token". */
function actionLabel(action: string): string {
  const words = action.replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function StatusIcon({ status }: { status: TrackedTx['status'] }) {
  if (status === 'confirmed') return <CheckCircle2 className="h-3.5 w-3.5 text-success" />
  if (status === 'failed') return <XCircle className="h-3.5 w-3.5 text-danger" />
  return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
}

/**
 * Persistent header badge for broadcast transactions. Stays visible while txs
 * confirm on-chain — unlike the submit toast (auto-dismisses) or the in-chat
 * status card (scrolls away). Hidden entirely when nothing is in flight.
 */
export function TxIndicator() {
  useTxTrackerPoller()
  const txs = useTxTracker((s) => s.txs)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Close the popover when the last entry clears itself.
  useEffect(() => {
    if (txs.length === 0) setOpen(false)
  }, [txs.length])

  if (txs.length === 0) return null

  const pendingCount = txs.filter((t) => t.status === 'pending').length
  const label =
    pendingCount > 0
      ? `${pendingCount} pending`
      : txs.every((t) => t.status === 'confirmed')
        ? 'Confirmed'
        : 'Done'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Transactions: ${label}. Show details.`}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          pendingCount > 0
            ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15'
            : 'border-success/40 bg-success/10 text-success hover:bg-success/15',
        )}
      >
        {pendingCount > 0 ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5" />
        )}
        <span aria-live="polite">{label}</span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="In-flight transactions"
          className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-border-c bg-popover shadow-xl"
        >
          <div className="border-b border-border-c px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-muted-fg">
            Transactions
          </div>
          <div className="numa-scroll max-h-72 overflow-y-auto">
            {txs.map((tx) => {
              const chain = getChain(tx.chainKey)
              return (
                <div
                  key={tx.hash}
                  className="flex items-center gap-2.5 border-b border-border-c/60 px-3 py-2 last:border-b-0"
                >
                  <StatusIcon status={tx.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium text-fg">
                        {actionLabel(tx.action)}
                      </span>
                      {chain ? (
                        <ChainLogo src={chain.logo} name={chain.name} chainKey={chain.key} size={12} />
                      ) : null}
                    </div>
                    <div className="font-mono text-2xs text-muted-fg">{shortHash(tx.hash)}</div>
                  </div>
                  {tx.explorerUrl ? (
                    <a
                      href={tx.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`View ${actionLabel(tx.action)} on explorer`}
                      className="shrink-0 rounded-md p-1 text-muted-fg transition hover:bg-muted-bg hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
