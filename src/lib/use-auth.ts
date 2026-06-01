'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAccount, useConnect, useDisconnect, useSignMessage } from 'wagmi'
import { classifyError } from '@/lib/errors'

/**
 * Wallet auth backed by a SERVER-VERIFIED SIWE session (httpOnly cookie).
 *
 * Flow: connect → GET /api/auth/nonce (server-issued challenge) → sign it →
 * POST /api/auth/verify (server recovers the signer + sets the session cookie).
 * `signedIn` reflects the SERVER session (read via GET /api/auth/session), NOT
 * localStorage — so it can't be spoofed and gates the LLM endpoint for real.
 */

interface SessionResponse {
  address: string | null
}

interface NonceResponse {
  address: string
  nonce: string
  issuedAt: string
  exp: number
  sig: string
  message: string
}

export interface AuthState {
  address: `0x${string}` | undefined
  isConnected: boolean
  signedIn: boolean
  signing: boolean
  error: string | undefined
  connectors: ReturnType<typeof useConnect>['connectors']
  connect: (connectorIndex: number) => void
  connectPending: boolean
  signIn: () => Promise<boolean>
  signOut: () => void
}

export function useAuth(): AuthState {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending: connectPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { signMessageAsync } = useSignMessage()

  const [sessionAddress, setSessionAddress] = useState<string | null>(null)
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState<string | undefined>()

  // Hydrate signed-in state from the server session cookie on mount.
  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session', { cache: 'no-store' })
      const json = (await res.json()) as SessionResponse
      setSessionAddress(json.address ? json.address.toLowerCase() : null)
    } catch {
      setSessionAddress(null)
    }
  }, [])

  useEffect(() => {
    void refreshSession()
  }, [refreshSession])

  // If the connected wallet no longer matches the session, drop the session.
  useEffect(() => {
    if (address && sessionAddress && sessionAddress !== address.toLowerCase()) {
      setSessionAddress(null)
    }
  }, [address, sessionAddress])

  const signIn = useCallback(async (): Promise<boolean> => {
    if (!address) {
      setError('Connect a wallet first.')
      return false
    }
    setSigning(true)
    setError(undefined)
    try {
      // 1) Server-issued nonce + canonical message.
      const nonceRes = await fetch(`/api/auth/nonce?address=${address}`, { cache: 'no-store' })
      if (!nonceRes.ok) throw new Error('Could not start sign-in. Try again.')
      const challenge = (await nonceRes.json()) as NonceResponse

      // 2) Sign the server's message.
      const signature = await signMessageAsync({ message: challenge.message, account: address })

      // 3) Server verifies + sets the httpOnly session cookie.
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          address,
          message: challenge.message,
          nonce: challenge.nonce,
          exp: challenge.exp,
          sig: challenge.sig,
          signature,
        }),
      })
      const verifyJson = (await verifyRes.json()) as { ok?: boolean; error?: string }
      if (!verifyRes.ok || !verifyJson.ok) {
        throw new Error(verifyJson.error ?? 'Sign-in verification failed.')
      }
      setSessionAddress(address.toLowerCase())
      return true
    } catch (e) {
      setError(classifyError(e).headline)
      return false
    } finally {
      setSigning(false)
    }
  }, [address, signMessageAsync])

  const signOut = useCallback(() => {
    setSessionAddress(null)
    void fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {})
    disconnect()
  }, [disconnect])

  const signedIn = !!sessionAddress && (!address || sessionAddress === address.toLowerCase())

  return {
    address,
    isConnected,
    signedIn,
    signing,
    error,
    connectors,
    connect: (i: number) => {
      const c = connectors[i]
      if (c) connect({ connector: c })
    },
    connectPending,
    signIn,
    signOut,
  }
}
