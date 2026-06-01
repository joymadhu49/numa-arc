import type { ReactElement } from 'react'
import type { RiskLevel } from '@/lib/safety'

interface RiskBadgeProps {
  risk: RiskLevel
  label?: string
  className?: string
}

const STYLES: Record<RiskLevel, { wrap: string; dot: string; label: string }> = {
  low: {
    wrap: 'bg-success/15 text-success border-success/30',
    dot: 'bg-success',
    label: 'Low risk',
  },
  med: {
    wrap: 'bg-warning/15 text-warning border-warning/30',
    dot: 'bg-warning',
    label: 'Medium risk',
  },
  high: {
    wrap: 'bg-danger/15 text-danger border-danger/30',
    dot: 'bg-danger',
    label: 'High risk',
  },
}

export function RiskBadge({ risk, label, className }: RiskBadgeProps): ReactElement {
  const style = STYLES[risk] ?? STYLES.low
  const text = label ?? style.label
  const composed = [
    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide',
    style.wrap,
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <span className={composed} role="status" aria-label={`Risk level: ${risk}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {text}
    </span>
  )
}
