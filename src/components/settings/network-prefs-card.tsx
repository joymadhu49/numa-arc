'use client'

import { useTestnetPrefs } from '@/lib/network-prefs'
import { MAINNET_ENABLED } from '@/chains/registry'
import { cn } from '@/lib/utils'

/**
 * Interactive body of the Settings → Networks card.
 * Testnets are hidden by default when mainnet is enabled; this switch opts
 * back in. Without NEXT_PUBLIC_ENABLE_MAINNET the switch renders disabled
 * (testnets always show — they're all there is).
 */
export function NetworkPrefsCard() {
  const { showTestnets, setShowTestnets } = useTestnetPrefs()
  const disabled = !MAINNET_ENABLED
  const checked = disabled ? true : showTestnets

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-fg">
        Switch the active chain from the header network picker.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-fg">Show testnets</p>
          <p className="text-xs text-muted-fg">
            {disabled
              ? 'Testnets are always shown while mainnet networks are disabled.'
              : 'Off by default. Enable to show testnet networks in the picker and chain lists.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label="Show testnets"
          disabled={disabled}
          onClick={() => setShowTestnets(!showTestnets)}
          className={cn(
            'relative h-6 w-11 shrink-0 rounded-full transition-colors',
            checked ? 'bg-primary' : 'bg-muted-bg',
            disabled && 'cursor-not-allowed opacity-50',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'absolute top-0.5 h-5 w-5 rounded-full bg-primary-fg shadow transition-transform',
              checked ? 'left-0.5 translate-x-5' : 'left-0.5 translate-x-0',
            )}
          />
        </button>
      </div>
    </div>
  )
}
