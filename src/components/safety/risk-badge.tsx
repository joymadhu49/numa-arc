import type { ReactElement } from 'react'
import type { RiskLevel } from '@/lib/safety'

interface RiskBadgeProps {
  risk: RiskLevel
  label?: string
  className?: string
}

const STYLES: Record<RiskLevel, { bg: string; text: string; border: string; label: string }> = {
  low: {
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
    label: 'Low risk',
  },
  med: {
    bg: 'bg-amber-500/15',
    text: 'text-amber-300',
    border: 'border-amber-500/30',
    label: 'Medium risk',
  },
  high: {
    bg: 'bg-red-500/15',
    text: 'text-red-300',
    border: 'border-red-500/30',
    label: 'High risk',
  },
}

export function RiskBadge({ risk, label, className }: RiskBadgeProps): ReactElement {
  const style = STYLES[risk]
  const text = label ?? style.label
  const composed = [
    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide',
    style.bg,
    style.text,
    style.border,
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <span className={composed} role="status" aria-label={`Risk level: ${risk}`}>
      <span
        aria-hidden="true"
        className={[
          'h-1.5 w-1.5 rounded-full',
          risk === 'low'
            ? 'bg-emerald-400'
            : risk === 'med'
            ? 'bg-amber-400'
            : 'bg-red-400',
        ].join(' ')}
      />
      {text}
    </span>
  )
}
