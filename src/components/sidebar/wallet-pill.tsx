'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Copy, LogOut, ShieldCheck, Wallet } from 'lucide-react'
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
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
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
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-2 text-sm text-neutral-100 transition-colors hover:bg-neutral-800 sm:justify-between sm:px-3',
        )}
      >
        <span className="flex items-center gap-2 truncate">
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
          <span className="hidden truncate sm:inline">{truncate(auth.address)}</span>
        </span>
        <ChevronDown className="hidden h-3.5 w-3.5 text-neutral-400 sm:inline" />
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-44 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-md border border-neutral-800 bg-neutral-950 shadow-lg">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-neutral-200 hover:bg-neutral-900"
            onClick={() => {
              void navigator.clipboard.writeText(auth.address as string)
              setOpen(false)
            }}
          >
            <Copy className="h-3.5 w-3.5" /> Copy address
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-400 hover:bg-neutral-900"
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
