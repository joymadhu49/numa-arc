'use client'

import { Sparkles } from 'lucide-react'
import { useTestnetPrefs } from '@/lib/network-prefs'

interface ExampleChipsProps {
  onPick: (prompt: string) => void
  disabled?: boolean
  /** Override the default starter prompts (used for follow-up suggestions). */
  prompts?: readonly string[]
  /** Section label. */
  label?: string
  /** Compact pill layout (for follow-ups) vs. tappable rows (for welcome). */
  variant?: 'list' | 'pills'
}

/**
 * Capability map shown on the empty-state welcome. Bridge prompts intentionally
 * span the three CCTP shapes — INTO Arc, OUT of Arc, and ACROSS two non-Arc
 * chains — so users see Numa as a multichain hub, not an Arc-only on-ramp.
 * "on Arc" suffix is dropped where context already implies it (yield is
 * cross-chain by default, LP tool resolves to Arc internally).
 */
const EXAMPLES: readonly string[] = [
  'Show my portfolio with total balance',
  'Swap 1 USDC for EURC on Arc',
  'Bridge 50 USDC from Base Sepolia to Arc',
  'Bridge 10 USDC from Arc to Arbitrum Sepolia',
  'Bridge 15 USDC from Base Sepolia to Arbitrum Sepolia',
  'Check my token approvals for risky allowances',
  'Scan EURC: 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
]

/**
 * Mainnet-mode starters (testnets hidden). Arc is the hub: bridges INTO and
 * OUT of Arc mainnet ride the native CCTP path (burn now, claim on the
 * destination once attested). Swaps stay off Arc mainnet until Circle App Kit
 * ships support; the scan address is Circle's official Ethereum-mainnet EURC.
 */
const MAINNET_EXAMPLES: readonly string[] = [
  'Show my portfolio with total balance',
  'Bridge 20 USDC from Base to Arc',
  'Bridge 10 USDC from Arc to Ethereum',
  'What are the best USDC yields right now?',
  'Swap 1 USDC for EURC on Base',
  'Check my token approvals for risky allowances',
  'Scan EURC: 0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c',
]

export function ExampleChips({
  onPick,
  disabled = false,
  prompts,
  label = 'Start with',
  variant = 'list',
}: ExampleChipsProps) {
  const { hideTestnets } = useTestnetPrefs()
  const items = prompts ?? (hideTestnets ? MAINNET_EXAMPLES : EXAMPLES)

  if (variant === 'pills') {
    return (
      <div className="flex flex-wrap gap-2">
        {items.map((ex) => (
          <button
            key={ex}
            type="button"
            disabled={disabled}
            onClick={() => onPick(ex)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border-c bg-card px-2.5 py-1 text-xs text-fg transition hover:bg-muted-bg disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles aria-hidden className="h-3 w-3 text-primary" />
            {ex}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="w-full overflow-hidden rounded-xl border border-border-c bg-card">
      <p
        id="numa-examples-heading"
        className="px-4 pt-3 pb-2 text-2xs font-semibold uppercase tracking-wide text-muted-fg"
      >
        {label}
      </p>
      <ul
        role="list"
        aria-labelledby="numa-examples-heading"
        className="divide-y divide-border-c/60 border-t border-border-c/60"
      >
        {items.map((ex) => (
          <li key={ex}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(ex)}
              className="group flex min-h-[44px] w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-fg transition hover:bg-muted-bg/60 focus-visible:bg-muted-bg/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles
                aria-hidden
                className="h-3.5 w-3.5 shrink-0 text-primary/70 transition group-hover:text-primary"
              />
              <span className="min-w-0 flex-1 break-words">{ex}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
