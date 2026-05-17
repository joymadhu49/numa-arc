'use client'

interface ExampleChipsProps {
  onPick: (prompt: string) => void
  disabled?: boolean
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

export function ExampleChips({ onPick, disabled = false }: ExampleChipsProps) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 px-5 py-4">
      <p className="mb-3 text-sm text-neutral-300">Try an example:</p>
      <ul className="space-y-1.5">
        {EXAMPLES.map((ex) => (
          <li
            key={ex}
            className="list-disc list-inside marker:text-neutral-600"
          >
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(ex)}
              className="text-sm text-neutral-200 underline decoration-neutral-600 decoration-1 underline-offset-4 transition hover:text-white hover:decoration-neutral-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ex}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
