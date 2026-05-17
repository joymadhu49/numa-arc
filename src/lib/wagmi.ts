import { http, createConfig, createStorage } from 'wagmi'
import { baseSepolia, sepolia } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'
import { arcTestnet } from '@/chains/arc'

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? ''

const connectors = walletConnectProjectId
  ? [
      injected({ shimDisconnect: true }),
      walletConnect({ projectId: walletConnectProjectId, showQrModal: true }),
    ]
  : [injected({ shimDisconnect: true })]

export const wagmiConfig = createConfig({
  chains: [arcTestnet, baseSepolia, sepolia],
  connectors,
  transports: {
    [arcTestnet.id]: http('https://rpc.testnet.arc.network'),
    [baseSepolia.id]: http(),
    [sepolia.id]: http(),
  },
  storage:
    typeof window !== 'undefined'
      ? createStorage({ storage: window.localStorage, key: 'arcwise.wagmi' })
      : undefined,
  ssr: true,
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
