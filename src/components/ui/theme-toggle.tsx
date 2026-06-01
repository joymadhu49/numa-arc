'use client'

import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

type ThemeValue = 'light' | 'dark' | 'system'

const OPTIONS: { value: ThemeValue; label: string; Icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
]

/**
 * Theme switcher backed by next-themes.
 *  - `segmented` (default): a 3-way radio group for Settings / wide surfaces.
 *  - `cycle`: a single icon button that cycles light → dark → system, sized to
 *    fit the collapsed sidebar.
 *
 * Reads `theme` only after mount to avoid a hydration mismatch (the server has
 * no knowledge of the persisted/system choice). Pre-mount it renders the
 * dark-default affordance, matching the SSR output.
 */
export function ThemeToggle({
  variant = 'segmented',
  className,
}: {
  variant?: 'segmented' | 'cycle'
  className?: string
}) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const current = mounted ? (theme as ThemeValue | undefined) : undefined

  if (variant === 'cycle') {
    const idx = OPTIONS.findIndex((o) => o.value === current)
    const active = OPTIONS[idx === -1 ? 1 : idx] // dark icon pre-mount (SSR default)
    const next = OPTIONS[(Math.max(idx, 0) + 1) % OPTIONS.length]
    const Icon = active.Icon
    return (
      <button
        type="button"
        onClick={() => setTheme(next.value)}
        aria-label={`Theme: ${active.label}. Switch to ${next.label}.`}
        title={`Theme: ${active.label}`}
        className={cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-fg transition hover:bg-muted-bg hover:text-fg',
          className,
        )}
      >
        <Icon className="h-5 w-5" />
      </button>
    )
  }

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-border-c bg-bg p-0.5',
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const isActive = current === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive
                ? 'bg-primary text-primary-fg'
                : 'text-muted-fg hover:bg-muted-bg hover:text-fg',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
