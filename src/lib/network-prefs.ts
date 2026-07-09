'use client'

/**
 * User network preferences (client-side, localStorage-persisted).
 *
 * Default posture: when mainnet rows are enabled (NEXT_PUBLIC_ENABLE_MAINNET),
 * testnets are HIDDEN by default — the network picker and welcome-panel chain
 * list show mainnets only. Users opt back in via Settings → Networks → "Show
 * testnets". This is a DISPLAY preference only — routing defaults, tool
 * behavior, and the wagmi config are unchanged.
 *
 * While mainnet rows are NOT enabled the preference is ignored entirely
 * (testnets always show — hiding them would leave an empty picker).
 */

import { useCallback, useSyncExternalStore } from 'react'
import { MAINNET_ENABLED } from '@/chains/registry'

const KEY = 'numa.settings.showTestnets'
const EVENT = 'numa:network-prefs'

function readShowTestnets(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(KEY) === 'true'
  } catch {
    return false
  }
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('storage', cb)
  window.addEventListener(EVENT, cb)
  return () => {
    window.removeEventListener('storage', cb)
    window.removeEventListener(EVENT, cb)
  }
}

export interface TestnetPrefs {
  /** True when testnet rows should be hidden from network UI. */
  hideTestnets: boolean
  /** Raw opt-in state of the Settings switch (default false). */
  showTestnets: boolean
  setShowTestnets: (v: boolean) => void
}

export function useTestnetPrefs(): TestnetPrefs {
  const showTestnets = useSyncExternalStore(subscribe, readShowTestnets, () => false)
  const setShowTestnets = useCallback((v: boolean) => {
    try {
      window.localStorage.setItem(KEY, String(v))
    } catch {
      // localStorage unavailable (private mode) — pref is session-lost, fine.
    }
    window.dispatchEvent(new Event(EVENT))
  }, [])
  return {
    hideTestnets: MAINNET_ENABLED && !showTestnets,
    showTestnets,
    setShowTestnets,
  }
}
