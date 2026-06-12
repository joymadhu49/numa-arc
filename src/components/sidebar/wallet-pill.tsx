'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Copy, LogOut, ShieldCheck, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/use-auth'
import { cn } from '@/lib/utils'

function truncate(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function WalletPill() {
  const auth = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  if (!auth.isConnected || !auth.address) {
    const primary = auth.connectors[0]
    return (
      <Button
        variant="default"
        size="md"
        className="w-full px-2 sm:px-3"
        disabled={auth.connectPending || !primary}
        onClick={() => auth.connect(0)}
      >
        <Wallet className="h-4 w-4" />
        <span className="hidden sm:inline">
          {auth.connectPending ? 'Connecting…' : 'Connect'}
        </span>
        <span className="hidden md:inline">Wallet</span>
      </Button>
    )
  }

  if (!auth.signedIn) {
    return (
      <Button
        variant="default"
        size="md"
        className="w-full px-2 sm:px-3"
        disabled={auth.signing}
        onClick={() => void auth.signIn()}
      >
        <ShieldCheck className="h-4 w-4" />
        <span className="hidden sm:inline">
          {auth.signing ? 'Signing…' : 'Sign in'}
        </span>
      </Button>
    )
  }

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-lg border border-border-c bg-card px-2 py-1.5 text-sm text-fg transition hover:bg-muted-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:justify-between sm:px-3',
        )}
      >
        <span className="flex items-center gap-2 truncate">
          <span className="h-2 w-2 shrink-0 rounded-full bg-success" aria-hidden />
          <span className="hidden truncate font-mono sm:inline">{truncate(auth.address)}</span>
        </span>
        <ChevronDown className="hidden h-3.5 w-3.5 text-muted-fg sm:inline" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-44 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-lg border border-border-c bg-popover shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-fg transition hover:bg-muted-bg focus-visible:bg-muted-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            onClick={() => {
              void navigator.clipboard
                .writeText(auth.address as string)
                .then(() => toast.success('Address copied'))
                .catch(() => toast.error('Couldn’t copy address'))
              setOpen(false)
            }}
          >
            <Copy className="h-3.5 w-3.5" /> Copy address
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-danger transition hover:bg-muted-bg focus-visible:bg-muted-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            onClick={() => {
              auth.signOut()
              setOpen(false)
            }}
          >
            <LogOut className="h-3.5 w-3.5" /> Disconnect
          </button>
        </div>
      ) : null}
    </div>
  )
}
