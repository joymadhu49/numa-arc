'use client'

import { useEffect } from 'react'
import { create } from 'zustand'
import { createPublicClient, http } from 'viem'
import { getChain } from '@/chains/registry'

/**
 * Global pending-transaction tracker. Broadcast txs are registered here so the
 * header can show a persistent "N pending" indicator that survives scrolling
 * away from the in-chat status card (and toast auto-dismissal).
 *
 * Receipts are polled via each chain's public RPC; confirmed/failed entries
 * linger briefly so the user sees the resolution, then clear themselves.
 */

export type TrackedTxStatus = 'pending' | 'confirmed' | 'failed'

export interface TrackedTx {
  hash: string
  chainKey: string
  action: string
  explorerUrl?: string
  status: TrackedTxStatus
  addedAt: number
}

interface TxTrackerState {
  txs: TrackedTx[]
  track: (tx: Omit<TrackedTx, 'status' | 'addedAt'>) => void
  resolve: (hash: string, status: Exclude<TrackedTxStatus, 'pending'>) => void
  remove: (hash: string) => void
}

export const useTxTracker = create<TxTrackerState>((set) => ({
  txs: [],
  track: (tx) =>
    set((s) =>
      s.txs.some((t) => t.hash === tx.hash)
        ? s
        : { txs: [...s.txs, { ...tx, status: 'pending', addedAt: Date.now() }] },
    ),
  resolve: (hash, status) =>
    set((s) => ({ txs: s.txs.map((t) => (t.hash === hash ? { ...t, status } : t)) })),
  remove: (hash) => set((s) => ({ txs: s.txs.filter((t) => t.hash !== hash) })),
}))

const POLL_MS = 5_000
/** How long a confirmed/failed entry stays visible before clearing. */
const LINGER_MS = 8_000
/** Stop polling a tx after this long; leave it pending with its explorer link. */
const GIVE_UP_MS = 10 * 60_000

async function checkReceipt(tx: TrackedTx): Promise<'confirmed' | 'failed' | null> {
  const entry = getChain(tx.chainKey)
  if (!entry) return null
  try {
    const client = createPublicClient({ transport: http(entry.rpcUrl) })
    const receipt = await client.getTransactionReceipt({ hash: tx.hash as `0x${string}` })
    return receipt.status === 'success' ? 'confirmed' : 'failed'
  } catch {
    // Not mined yet (or RPC hiccup) — keep polling.
    return null
  }
}

/** Mount once (the header indicator does) to drive receipt polling. */
export function useTxTrackerPoller(): void {
  useEffect(() => {
    const timer = setInterval(() => {
      const { txs, resolve, remove } = useTxTracker.getState()
      const now = Date.now()
      for (const tx of txs) {
        if (tx.status !== 'pending') {
          if (now - tx.addedAt > GIVE_UP_MS + LINGER_MS) remove(tx.hash)
          continue
        }
        if (now - tx.addedAt > GIVE_UP_MS) continue
        void checkReceipt(tx).then((status) => {
          if (!status) return
          resolve(tx.hash, status)
          setTimeout(() => useTxTracker.getState().remove(tx.hash), LINGER_MS)
        })
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [])
}
