import type { ChainEntry } from '@/chains/registry'

type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }

function getEthereum(): Eip1193 | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { ethereum?: Eip1193 }).ethereum ?? null
}

/**
 * Raw EIP-1193 chain switch with the EIP-3085 (4902) "add chain" fallback.
 * Wallet-agnostic — works with any injected provider. Throws on a real failure
 * so interactive callers can surface feedback; the network switcher wraps this
 * and ignores rejections to preserve its fire-and-forget behavior.
 */
export async function switchWalletChain(entry: ChainEntry): Promise<void> {
  const eth = getEthereum()
  if (!eth) throw new Error('No wallet detected')
  const hexId = '0x' + entry.chainId.toString(16)
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexId }] })
  } catch (err) {
    if ((err as { code?: number })?.code === 4902) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: hexId,
            chainName: entry.name,
            nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
            rpcUrls: [entry.rpcUrl],
            blockExplorerUrls: [entry.explorerUrl],
          },
        ],
      })
    } else {
      throw err
    }
  }
}
