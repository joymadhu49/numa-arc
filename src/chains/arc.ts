/**
 * Arc Testnet viem chain.
 *
 * Values are sourced from the single network registry (see ./registry) so chain
 * config has one source of truth. `arcTestnet` is still exported here because
 * many files import it from '@/chains/arc'.
 *
 * We build it with `defineChain` directly (rather than the generic toViemChain
 * helper) so the inferred type keeps a non-optional `blockExplorers` — several
 * call sites access `arcTestnet.blockExplorers.default.url` without optional
 * chaining.
 *
 * SECURITY: the previous version interpolated process.env.ALCHEMY_KEY into an
 * rpcUrls.alchemy entry, which risked leaking a key (and ALCHEMY_KEY is unset).
 * That entry has been removed — only the public RPC is used.
 */

import { defineChain } from 'viem'
import { getChain } from './registry'

const arcEntry = getChain('arc-testnet')
if (!arcEntry) {
  throw new Error('registry: missing arc-testnet entry')
}

export const arcTestnet = defineChain({
  id: arcEntry.chainId,
  name: arcEntry.name,
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
  rpcUrls: {
    default: { http: [arcEntry.rpcUrl] },
  },
  blockExplorers: {
    default: { name: 'Arcscan', url: arcEntry.explorerUrl },
  },
  testnet: true,
})
