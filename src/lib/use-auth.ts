'use client'

import { useCallback, useEffect, useSyncExternalStore, useState } from 'react'
import { useAccount, useConnect, useDisconnect, useSignMessage } from 'wagmi'
import { classifyError } from '@/lib/errors'

const STORAGE_KEY = 'arcwise.siwe'

interface SiweRecord {
  address: string
  signature: string
  message: string
  issuedAt: string
}

function loadRecord(): SiweRecord | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SiweRecord
  } catch {
    return null
  }
}

function saveRecord(rec: SiweRecord): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rec))
}

function clearRecord(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}

const signedAddressListeners = new Set<() => void>()
let signedAddressValue: string | null = null
let signedAddressHydrated = false

function readSignedAddress(): string | null {
  if (typeof window === 'undefined') return null
  if (!signedAddressHydrated) {
    const rec = loadRecord()
    signedAddressValue = rec?.address ? rec.address.toLowerCase() : null
    signedAddressHydrated = true
  }
  return signedAddressValue
}

function setSignedAddressGlobal(next: string | null): void {
  signedAddressValue = next
  signedAddressHydrated = true
  signedAddressListeners.forEach((l) => l())
}

function subscribeSignedAddress(listener: () => void): () => void {
  signedAddressListeners.add(listener)
  return () => {
    signedAddressListeners.delete(listener)
  }
}

function buildMessage(address: string, nonce: string, issuedAt: string): string {
  return [
    'Sign in to Numa',
    '',
    `Address: ${address}`,
    `Chain: Arc Testnet (5042002)`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    '',
    'By signing, you authorize this session. No funds move.',
  ].join('\n')
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
  signIn: () => Promise<void>
  signOut: () => void
}

export function useAuth(): AuthState {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending: connectPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { signMessageAsync } = useSignMessage()

  const signedAddress = useSyncExternalStore(
    subscribeSignedAddress,
    readSignedAddress,
    () => null,
  )
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    if (address && signedAddress && signedAddress !== address.toLowerCase()) {
      clearRecord()
      setSignedAddressGlobal(null)
    }
  }, [address, signedAddress])

  const signIn = useCallback(async () => {
    if (!address) {
      setError('Connect a wallet first.')
      return
    }
    setSigning(true)
    setError(undefined)
    try {
      const nonce = Math.random().toString(36).slice(2, 10)
      const issuedAt = new Date().toISOString()
      const message = buildMessage(address, nonce, issuedAt)
      const signature = await signMessageAsync({ message, account: address })
      saveRecord({ address, signature, message, issuedAt })
      setSignedAddressGlobal(address.toLowerCase())
    } catch (e) {
      setError(classifyError(e).headline)
    } finally {
      setSigning(false)
    }
  }, [address, signMessageAsync])

  const signOut = useCallback(() => {
    clearRecord()
    setSignedAddressGlobal(null)
    disconnect()
  }, [disconnect])

  const signedIn = !!signedAddress && (!address || signedAddress === address.toLowerCase())

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
