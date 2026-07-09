import { http, createConfig, createStorage, type CreateConnectorFn } from 'wagmi'
import { injected, walletConnect } from 'wagmi/connectors'
import type { Chain, Transport } from 'viem'
import { ACTIVE_CHAINS, toViemChain } from '@/chains/registry'
import { arcTestnet } from '@/chains/arc'

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? ''

const connectors: CreateConnectorFn[] = walletConnectProjectId
  ? [
      injected({ shimDisconnect: true }),
      walletConnect({ projectId: walletConnectProjectId, showQrModal: true }),
    ]
  : [injected({ shimDisconnect: true })]

// Derive the active chains from the registry. Arc Testnet MUST be first so it
// is the default chain. We reuse the concrete `arcTestnet` export for the Arc
// TESTNET entry (match by chainId, NOT isArc — Arc mainnet is its own chain)
// and build the rest via toViemChain.
const activeViemChains: Chain[] = ACTIVE_CHAINS.map((entry) =>
  entry.chainId === arcTestnet.id ? arcTestnet : toViemChain(entry),
)
const arcFirst: Chain[] = [
  arcTestnet,
  ...activeViemChains.filter((c) => c.id !== arcTestnet.id),
]

// wagmi's createConfig requires a non-empty readonly tuple of chains.
const chains = arcFirst as unknown as readonly [Chain, ...Chain[]]

// One http() transport per active chain, keyed by chain id, using the public RPC.
const transports: Record<number, Transport> = {}
for (const entry of ACTIVE_CHAINS) {
  transports[entry.chainId] = http(entry.rpcUrl)
}

export const wagmiConfig = createConfig({
  chains,
  connectors,
  transports,
  storage:
    typeof window !== 'undefined'
      ? createStorage({ storage: window.localStorage, key: 'numa.wagmi' })
      : undefined,
  ssr: true,
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
