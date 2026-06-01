'use client'

import type { ReactNode } from 'react'
import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Shared primitives for Numa generative-UI cards.
 *
 * All card view-model types are defined LOCALLY in each card file to match the
 * SHARED DATA CONTRACTS without importing from src/lib or src/ai (those move
 * concurrently). These helpers are pure presentation.
 */

// ---------------------------------------------------------------------------
// Card shell — consistent surface, entrance animation, optional header.
// ---------------------------------------------------------------------------

export function CardShell({
  children,
  className,
  icon,
  title,
  right,
}: {
  children: ReactNode
  className?: string
  icon?: ReactNode
  title?: ReactNode
  right?: ReactNode
}) {
  return (
    <div
      className={cn(
        'numa-card-in overflow-hidden rounded-xl border border-border-c bg-card shadow-sm',
        className,
      )}
    >
      {title != null || right != null ? (
        <div className="flex items-center justify-between gap-2 border-b border-border-c px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            {icon ? <span className="shrink-0 text-primary">{icon}</span> : null}
            <span className="truncate text-sm font-semibold text-fg">{title}</span>
          </div>
          {right ? <div className="shrink-0">{right}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Logo with graceful fallback to a monogram chip.
// ---------------------------------------------------------------------------

export function TokenLogo({
  src,
  alt,
  size = 20,
  className,
}: {
  src?: string
  alt: string
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const dim = { width: size, height: size }
  if (!src || failed) {
    return (
      <span
        style={dim}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full bg-muted-bg text-[9px] font-semibold uppercase text-muted-fg',
          className,
        )}
        aria-hidden="true"
      >
        {alt.slice(0, 2)}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      style={dim}
      onError={() => setFailed(true)}
      className={cn('shrink-0 rounded-full object-cover', className)}
    />
  )
}

// ---------------------------------------------------------------------------
// Formatting helpers (null-tolerant).
// ---------------------------------------------------------------------------

export function fmtUsd(n: number | null | undefined, opts?: { compact?: boolean }): string {
  if (n == null || Number.isNaN(n)) return '—'
  if (opts?.compact && Math.abs(n) >= 1000) {
    return n.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    })
  }
  const maxFrac = Math.abs(n) > 0 && Math.abs(n) < 1 ? 4 : 2
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: maxFrac,
  })
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

export function fmtCompact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 })
}

// ---------------------------------------------------------------------------
// Delta (24h change) pill / inline text.
// ---------------------------------------------------------------------------

export function Delta({
  pct,
  className,
}: {
  pct: number | null | undefined
  className?: string
}) {
  if (pct == null || Number.isNaN(pct)) {
    return <span className={cn('text-xs text-muted-fg', className)}>—</span>
  }
  const up = pct >= 0
  return (
    <span
      className={cn(
        'text-xs font-medium tabular-nums',
        up ? 'text-success' : 'text-danger',
        className,
      )}
    >
      {fmtPct(pct)}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Severity flag row (info / warn / danger).
// ---------------------------------------------------------------------------

export type FlagSeverity = 'info' | 'warn' | 'danger'

export function FlagRow({
  label,
  severity,
}: {
  label: string
  severity: FlagSeverity
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 text-xs',
        severity === 'danger'
          ? 'text-danger'
          : severity === 'warn'
            ? 'text-warning'
            : 'text-muted-fg',
      )}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="leading-relaxed">{label}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty / failed state inside a card.
// ---------------------------------------------------------------------------

export function CardError({ message }: { message?: string }) {
  return (
    <div className="numa-card-in rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5 text-xs text-danger">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span className="leading-relaxed">{message || 'Something went wrong.'}</span>
      </div>
    </div>
  )
}
