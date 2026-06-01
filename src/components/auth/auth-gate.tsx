'use client'

import type { ReactNode } from 'react'
import { ShieldCheck, Wallet } from 'lucide-react'
import { useAuth } from '@/lib/use-auth'
import { Button } from '@/components/ui/button'

interface AuthGateProps {
  children: ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const auth = useAuth()

  if (auth.signedIn) return <>{children}</>

  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center px-3 sm:px-4">
      <div className="w-full max-w-md rounded-2xl border border-border-c bg-card p-4 shadow-lg sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <h2 className="text-lg font-semibold text-fg">Sign in to Numa</h2>
        </div>
        <p className="mb-5 text-sm text-muted-fg">
          Numa needs a wallet signature before sending any transaction. No funds move during sign-in.
        </p>

        {!auth.isConnected ? (
          <div className="space-y-2">
            {auth.connectors.length === 0 ? (
              <p className="text-xs text-muted-fg">No wallet connectors detected.</p>
            ) : (
              auth.connectors.map((c, i) => (
                <Button
                  key={c.uid}
                  variant={i === 0 ? 'default' : 'outline'}
                  size="md"
                  className="w-full justify-center"
                  disabled={auth.connectPending}
                  onClick={() => auth.connect(i)}
                >
                  <Wallet className="h-4 w-4" />
                  {auth.connectPending ? 'Connecting…' : `Connect ${c.name}`}
                </Button>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-border-c bg-bg px-3 py-2 text-xs text-muted-fg">
              <span className="text-muted-fg">Connected as </span>
              <span className="font-mono text-fg">
                {auth.address ? `${auth.address.slice(0, 6)}…${auth.address.slice(-4)}` : ''}
              </span>
            </div>
            <Button
              variant="default"
              size="md"
              className="w-full justify-center"
              disabled={auth.signing}
              onClick={() => void auth.signIn()}
            >
              <ShieldCheck className="h-4 w-4" />
              {auth.signing ? 'Waiting for signature…' : 'Sign message to continue'}
            </Button>
            <button
              type="button"
              className="w-full text-center text-xs text-muted-fg transition hover:text-fg"
              onClick={() => auth.signOut()}
            >
              Use a different wallet
            </button>
          </div>
        )}

        {auth.error ? <p className="mt-3 text-xs text-danger">{auth.error}</p> : null}
      </div>
    </div>
  )
}
