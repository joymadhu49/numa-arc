'use client'

import { Sparkles } from 'lucide-react'

interface ExampleChipsProps {
  onPick: (prompt: string) => void
  disabled?: boolean
  /** Override the default starter prompts (used for follow-up suggestions). */
  prompts?: readonly string[]
  /** Section label. */
  label?: string
  /** Compact pill layout (for follow-ups) vs. bulleted list (for welcome). */
  variant?: 'list' | 'pills'
}

const EXAMPLES: readonly string[] = [
  'Show my portfolio with total balance',
  'Show me top stablecoin yield opportunities',
  'Swap 1 USDC for EURC on Arc Testnet',
  'Bridge 50 USDC from Base Sepolia to Arc',
  'Bridge 25 USDC from Ethereum Sepolia to Arc',
  'Send 10 USDC to 0x… on Arc',
  'Show trending tokens on Arc',
  "What's the BTC price today?",
  'Scan this token: 0x…',
  'Mint your agent ID',
]

export function ExampleChips({
  onPick,
  disabled = false,
  prompts,
  label = 'Try an example:',
  variant = 'list',
}: ExampleChipsProps) {
  const items = prompts ?? EXAMPLES

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
            <Sparkles className="h-3 w-3 text-primary" />
            {ex}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="w-full rounded-2xl border border-border-c bg-card px-3 py-2.5 sm:px-4 sm:py-3">
      <p className="mb-1.5 text-xs font-medium text-muted-fg sm:mb-2 sm:text-sm">{label}</p>
      <ul className="space-y-1 sm:space-y-1.5">
        {items.map((ex) => (
          <li key={ex} className="list-inside list-disc marker:text-border-c">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(ex)}
              className="break-words text-left text-xs text-fg underline decoration-border-c decoration-1 underline-offset-4 transition hover:text-primary hover:decoration-primary disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
            >
              {ex}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
