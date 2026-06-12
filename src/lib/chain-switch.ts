import type { ChainEntry } from '@/chains/registry'

type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }

function getEthereum(): Eip1193 | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { ethereum?: Eip1193 }).ethereum ?? null
}

interface ProviderError {
  code?: number
  message?: string
  data?: { originalError?: { code?: number; message?: string } }
}

/**
 * EIP-3326 says "chain not added" is code 4902, but wallets disagree in
 * practice: MetaMask frequently wraps it as -32603 with the real error nested
 * under data.originalError, and some providers only say so in the message.
 * Detect all of those, or the add-chain fallback never fires and clicking a
 * network the wallet doesn't have silently does nothing.
 */
function isUnrecognizedChain(err: unknown): boolean {
  const e = err as ProviderError
  if (e?.code === 4902 || e?.data?.originalError?.code === 4902) return true
  const msg = `${e?.message ?? ''} ${e?.data?.originalError?.message ?? ''}`
  return /unrecognized chain|chain.{0,20}not.{0,20}(added|configured|supported)|wallet_addEthereumChain/i.test(
    msg,
  )
}

/** EIP-1193 user rejection (the user dismissed the wallet prompt). */
export function isUserRejection(err: unknown): boolean {
  const e = err as ProviderError
  return e?.code === 4001 || /user (rejected|denied|cancell?ed)/i.test(e?.message ?? '')
}

/**
 * Native gas currency for wallet_addEthereumChain. Arc uses USDC for gas; the
 * EVM testnets here use ETH except the named exceptions. Wallets validate the
 * symbol against what they know about the chain, so a wrong symbol can get the
 * add request rejected.
 */
function nativeCurrencyFor(entry: ChainEntry): { name: string; symbol: string; decimals: number } {
  if (entry.isArc) return { name: 'USDC', symbol: 'USDC', decimals: 18 }
  if (entry.key.startsWith('polygon')) return { name: 'POL', symbol: 'POL', decimals: 18 }
  if (entry.key.startsWith('avalanche')) return { name: 'AVAX', symbol: 'AVAX', decimals: 18 }
  return { name: 'Ether', symbol: 'ETH', decimals: 18 }
}

/**
 * Raw EIP-1193 chain switch with the EIP-3085 "add chain" fallback. If the
 * wallet doesn't have the network, this triggers the wallet's own "allow this
 * site to add a network?" permission prompt, then switches to it. Throws on a
 * real failure (including user rejection) so callers can surface feedback.
 */
export async function switchWalletChain(entry: ChainEntry): Promise<void> {
  const eth = getEthereum()
  if (!eth) throw new Error('No wallet detected')
  const hexId = '0x' + entry.chainId.toString(16)
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexId }] })
  } catch (err) {
    if (!isUnrecognizedChain(err)) throw err
    // Wallet doesn't know this network → ask permission to add it (the wallet
    // shows its own approval prompt), then switch. Most wallets switch as part
    // of the add; the explicit re-switch covers the ones that don't and is a
    // no-op when already on the chain.
    await eth.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: hexId,
          chainName: entry.name,
          nativeCurrency: nativeCurrencyFor(entry),
          rpcUrls: [entry.rpcUrl],
          blockExplorerUrls: [entry.explorerUrl],
        },
      ],
    })
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexId }] })
  }
}
