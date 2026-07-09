'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Check, Search, Zap, X } from 'lucide-react'
import { toast } from 'sonner'
import { ACTIVE_CHAINS, CHAINS, getChain, type ChainEntry } from '@/chains/registry'
import { useTestnetPrefs } from '@/lib/network-prefs'
import { ChainLogo } from '@/components/ui/chain-logo'
import { switchWalletChain, isUserRejection } from '@/lib/chain-switch'
import { classifyError } from '@/lib/errors'
import { cn } from '@/lib/utils'

/**
 * Chains the connected wallet can actually switch to right now — the ACTIVE
 * registry set (testnets always; mainnets too when NEXT_PUBLIC_ENABLE_MAINNET
 * is set). Inactive rows are shown disabled with a "soon" tag. Switching uses
 * raw EIP-1193 wallet_switchEthereumChain + 4902 add fallback, so any active
 * chain the wallet can add is selectable.
 */
const SWITCHABLE = ACTIVE_CHAINS.map((c) => c.key)

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: 'chainChanged', handler: (hex: string) => void) => void
  removeListener?: (event: 'chainChanged', handler: (hex: string) => void) => void
}

function useActiveChainId() {
  const [chainId, setChainId] = useState<number | null>(null)
  useEffect(() => {
    const eth =
      typeof window !== 'undefined'
        ? ((window as { ethereum?: Eip1193Provider }).ethereum ?? null)
        : null
    if (!eth) return
    let cancelled = false
    eth
      .request({ method: 'eth_chainId' })
      .then((hex) => {
        if (!cancelled && typeof hex === 'string') setChainId(parseInt(hex, 16))
      })
      .catch(() => {})
    const onChainChanged = (hex: string) => setChainId(parseInt(hex, 16))
    eth.on?.('chainChanged', onChainChanged)
    return () => {
      cancelled = true
      eth.removeListener?.('chainChanged', onChainChanged)
    }
  }, [])
  return chainId
}

// Raw EIP-1193 switch with the add-chain fallback (the wallet shows its own
// "add this network?" permission prompt when it doesn't have the chain yet).
// Every outcome gets feedback — a silent failure here looks like a dead click.
async function switchChain(entry: ChainEntry) {
  try {
    await switchWalletChain(entry)
    toast.success(`Switched to ${entry.name}`)
  } catch (err) {
    if (isUserRejection(err)) {
      toast.info('Network switch canceled', {
        description: `Approve the prompt in your wallet to use ${entry.name}.`,
      })
      return
    }
    toast.error(`Couldn’t switch to ${entry.name}`, {
      description: classifyError(err).hint || 'Try adding the network in your wallet manually.',
    })
  }
}

interface RowProps {
  entry: ChainEntry
  active: boolean
  switchable: boolean
  highlighted: boolean
  onSelect: () => void
}

function NetworkRow({ entry, active, switchable, highlighted, onSelect }: RowProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active || (highlighted && switchable)}
      aria-current={active ? 'true' : undefined}
      disabled={!switchable}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        switchable ? 'text-fg hover:bg-muted-bg' : 'cursor-not-allowed text-muted-fg',
        highlighted && switchable ? 'bg-muted-bg' : '',
      )}
    >
      <ChainLogo src={entry.logo} name={entry.name} chainKey={entry.key} size={24} />
      <span className="min-w-0 flex-1 truncate font-medium">{entry.name}</span>
      {entry.fastTransfer ? (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-2xs font-semibold text-primary">
          <Zap className="h-2.5 w-2.5" /> Fast
        </span>
      ) : null}
      {!switchable ? (
        <span className="rounded-full bg-muted-bg px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide text-muted-fg">
          soon
        </span>
      ) : null}
      {active ? <Check className="h-4 w-4 shrink-0 text-success" /> : null}
    </button>
  )
}

export function NetworkSwitcher() {
  const activeChainId = useActiveChainId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const ref = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const active = activeChainId ? getChain(activeChainId) : null

  // Registry-driven: all chains, grouped, filtered by query. Testnets are
  // hidden by default when mainnet is enabled (Settings → Networks → "Show
  // testnets" opts back in) — keyboard nav follows automatically since
  // flatSwitchable derives from this.
  const { hideTestnets } = useTestnetPrefs()
  const all = useMemo(() => [...CHAINS] as ChainEntry[], [])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = q
      ? all.filter((e) => e.name.toLowerCase().includes(q) || e.key.toLowerCase().includes(q))
      : all
    const mainnet = rows.filter((e) => !e.testnet)
    // Hidden testnets: still show the chain the wallet is CURRENTLY on, or
    // the active row would vanish from its own picker with no way back.
    const testnet = rows.filter(
      (e) => e.testnet && (!hideTestnets || e.chainId === activeChainId),
    )
    return { mainnet, testnet }
  }, [all, query, hideTestnets, activeChainId])

  // Flat list of switchable rows for keyboard navigation.
  const flatSwitchable = useMemo(
    () =>
      [...filtered.testnet, ...filtered.mainnet].filter((e) => SWITCHABLE.includes(e.key)),
    [filtered],
  )

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setHighlight(0)
      // Focus search shortly after open (next paint).
      const t = setTimeout(() => inputRef.current?.focus(), 30)
      return () => clearTimeout(t)
    }
  }, [open])

  function choose(entry: ChainEntry) {
    if (!SWITCHABLE.includes(entry.key)) return
    void switchChain(entry)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, Math.max(flatSwitchable.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = flatSwitchable[highlight]
      if (target) choose(target)
    }
  }

  const panel = (
    <div
      className="flex h-full flex-col"
      role="listbox"
      aria-label="Select network"
      onKeyDown={onKeyDown}
    >
      <div className="flex items-center justify-between border-b border-border-c px-3 py-2 md:hidden">
        <span className="text-sm font-semibold text-fg">Select network</span>
        <button
          type="button"
          aria-label="Close"
          onClick={() => setOpen(false)}
          className="rounded-md p-1 text-muted-fg hover:bg-muted-bg hover:text-fg"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-border-c p-2">
        <div className="flex items-center gap-2 rounded-lg border border-border-c bg-bg px-2.5 py-1.5">
          <Search className="h-4 w-4 shrink-0 text-muted-fg" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setHighlight(0)
            }}
            placeholder="Search networks…"
            className="w-full bg-transparent text-sm text-fg placeholder:text-muted-fg focus:outline-none"
            aria-label="Search networks"
          />
        </div>
      </div>

      <div className="numa-scroll flex-1 overflow-y-auto p-2">
        {filtered.testnet.length > 0 ? (
          <div className="mb-1">
            <div className="px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-muted-fg">
              Testnet
            </div>
            {filtered.testnet.map((entry) => {
              const switchable = SWITCHABLE.includes(entry.key)
              const flatIdx = flatSwitchable.findIndex((e) => e.key === entry.key)
              return (
                <NetworkRow
                  key={entry.key}
                  entry={entry}
                  active={activeChainId === entry.chainId}
                  switchable={switchable}
                  highlighted={flatIdx === highlight}
                  onSelect={() => choose(entry)}
                />
              )
            })}
          </div>
        ) : null}

        {filtered.mainnet.length > 0 ? (
          <div>
            <div className="px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-muted-fg">
              Mainnet
            </div>
            {filtered.mainnet.map((entry) => {
              const switchable = SWITCHABLE.includes(entry.key)
              const flatIdx = flatSwitchable.findIndex((e) => e.key === entry.key)
              return (
                <NetworkRow
                  key={entry.key}
                  entry={entry}
                  active={activeChainId === entry.chainId}
                  switchable={switchable}
                  highlighted={flatIdx === highlight}
                  onSelect={() => choose(entry)}
                />
              )
            })}
          </div>
        ) : null}

        {filtered.testnet.length === 0 && filtered.mainnet.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-muted-fg">No networks found.</div>
        ) : null}
      </div>
    </div>
  )

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={active ? `Network: ${active.name}. Change network.` : 'Select network'}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border-c bg-card px-2.5 py-1.5 text-xs font-medium text-fg transition hover:bg-muted-bg"
      >
        {active ? (
          <>
            <ChainLogo src={active.logo} name={active.name} chainKey={active.key} size={16} />
            <span className="hidden sm:inline">{active.name}</span>
          </>
        ) : (
          <span>Select network</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-muted-fg" />
      </button>

      {open ? (
        <>
          {/* Desktop / tablet: anchored popover. */}
          <div className="absolute right-0 z-50 mt-2 hidden max-h-[70vh] w-72 overflow-hidden rounded-xl border border-border-c bg-popover shadow-xl md:flex md:flex-col">
            {panel}
          </div>

          {/* Mobile: full-screen sheet. */}
          <div className="fixed inset-0 z-50 flex flex-col bg-bg md:hidden">{panel}</div>
        </>
      ) : null}
    </div>
  )
}
