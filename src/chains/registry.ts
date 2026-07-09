/**
 * Single typed network registry — the source of truth for chain + CCTP + token
 * config across the app. Chain/token/wagmi config is derived FROM this file.
 *
 * Status: testnet-only ACTIVE now, mainnet-ready. The testnet rows are the
 * currently-enabled set (see ACTIVE_CHAINS). Mainnet rows are present but
 * flagged off (testnet:false) and are NOT wired into wagmi yet.
 *
 * SECURITY: rpcUrl values are PUBLIC RPCs only — never embed an API key here.
 */

import { type Address, type Chain, defineChain } from 'viem'

export type CctpVersion = 'v2' | 'v1'

export interface ChainEntry {
  /** Stable slug used as a key across the app. */
  key: string
  /** Human-readable network name. */
  name: string
  /** EVM chain id. */
  chainId: number
  /** Circle CCTP domain id. */
  cctpDomain: number
  /** CCTP protocol version. */
  cctpVersion: CctpVersion
  /** USDC ERC-20 address. */
  usdc: Address
  /** EURC ERC-20 address, if deployed on this chain. */
  eurc: Address | undefined
  /** CCTP TokenMessenger contract. */
  tokenMessenger: Address
  /** CCTP MessageTransmitter contract. */
  messageTransmitter: Address
  /** PUBLIC RPC url (no API key). */
  rpcUrl: string
  /** Block explorer base url. */
  explorerUrl: string
  /** Network logo URL for UI. */
  logo: string
  /** Whether CCTP Fast Transfer is supported. */
  fastTransfer: boolean
  /** Whether Circle Gateway is supported. */
  gatewaySupported: boolean
  /** Whether a paymaster (gas abstraction) is supported. */
  paymasterSupported: boolean
  /** Testnet flag — true for the currently-active set. */
  testnet: boolean
  /** Whether this is the Arc network. */
  isArc: boolean
}

// ---------------------------------------------------------------------------
// Shared CCTP V2 contracts (reused across all EVM chains of each environment).
// ---------------------------------------------------------------------------

/** CCTP V2 contracts on ALL EVM testnets (including Arc). */
const TESTNET_TOKEN_MESSENGER = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA' as Address
const TESTNET_MESSAGE_TRANSMITTER = '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275' as Address

/** CCTP V2 contracts on ALL EVM mainnets (except EDGE). */
const MAINNET_TOKEN_MESSENGER = '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d' as Address
const MAINNET_MESSAGE_TRANSMITTER = '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64' as Address

const DEFAULT_LOGO = ''

/**
 * Resolve a chain's local logo file (in /public/chains). Testnet variants share
 * their mainnet sibling's logo. Returns '' if none — the UI renders a branded
 * monogram fallback (see components/ui/chain-logo.tsx), so a missing file never
 * shows a broken image.
 */
function logoForKey(key: string): string {
  const base = key.replace(/-(testnet|sepolia|amoy|fuji)$/, '')
  const map: Record<string, string> = {
    arc: '/chains/arc.jpg',
    ethereum: '/chains/ethereum.png',
    base: '/chains/base.png',
    arbitrum: '/chains/arbitrum.png',
    optimism: '/chains/optimism.png',
    polygon: '/chains/polygon.png',
    avalanche: '/chains/avalanche.png',
    unichain: '/chains/unichain.webp',
    linea: '/chains/linea.webp',
  }
  return map[base] ?? ''
}

// ---------------------------------------------------------------------------
// Registry. Testnet rows are ACTIVE; mainnet rows are defined but flagged off.
// ---------------------------------------------------------------------------

const RAW_CHAINS: readonly ChainEntry[] = [
  // ===== TESTNET (ACTIVE) ===================================================
  {
    key: 'arc-testnet',
    name: 'Arc Testnet',
    chainId: 5042002,
    cctpDomain: 26,
    cctpVersion: 'v2',
    usdc: '0x3600000000000000000000000000000000000000' as Address,
    eurc: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as Address,
    tokenMessenger: TESTNET_TOKEN_MESSENGER,
    messageTransmitter: TESTNET_MESSAGE_TRANSMITTER,
    rpcUrl: 'https://rpc.testnet.arc.network',
    explorerUrl: 'https://testnet.arcscan.app',
    logo: 'https://pbs.twimg.com/profile_images/1955238194443849732/sHyVRItm_400x400.jpg',
    fastTransfer: false,
    gatewaySupported: false,
    paymasterSupported: false,
    testnet: true,
    isArc: true,
  },
  {
    key: 'ethereum-sepolia',
    name: 'Ethereum Sepolia',
    chainId: 11155111,
    cctpDomain: 0,
    cctpVersion: 'v2',
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address,
    eurc: undefined,
    tokenMessenger: TESTNET_TOKEN_MESSENGER,
    messageTransmitter: TESTNET_MESSAGE_TRANSMITTER,
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    explorerUrl: 'https://sepolia.etherscan.io',
    logo: DEFAULT_LOGO,
    fastTransfer: true,
    gatewaySupported: false,
    paymasterSupported: false,
    testnet: true,
    isArc: false,
  },
  {
    key: 'base-sepolia',
    name: 'Base Sepolia',
    chainId: 84532,
    cctpDomain: 6,
    cctpVersion: 'v2',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address,
    eurc: undefined,
    tokenMessenger: TESTNET_TOKEN_MESSENGER,
    messageTransmitter: TESTNET_MESSAGE_TRANSMITTER,
    rpcUrl: 'https://sepolia.base.org',
    explorerUrl: 'https://sepolia.basescan.org',
    logo: DEFAULT_LOGO,
    fastTransfer: true,
    gatewaySupported: false,
    paymasterSupported: false,
    testnet: true,
    isArc: false,
  },
  {
    key: 'arbitrum-sepolia',
    name: 'Arbitrum Sepolia',
    chainId: 421614,
    cctpDomain: 3,
    cctpVersion: 'v2',
    usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d' as Address,
    eurc: undefined,
    tokenMessenger: TESTNET_TOKEN_MESSENGER,
    messageTransmitter: TESTNET_MESSAGE_TRANSMITTER,
    rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
    explorerUrl: 'https://sepolia.arbiscan.io',
    logo: DEFAULT_LOGO,
    fastTransfer: true,
    gatewaySupported: false,
    paymasterSupported: false,
    testnet: true,
    isArc: false,
  },
  {
    key: 'optimism-sepolia',
    name: 'OP Sepolia',
    chainId: 11155420,
    cctpDomain: 2,
    cctpVersion: 'v2',
    usdc: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7' as Address,
    eurc: undefined,
    tokenMessenger: TESTNET_TOKEN_MESSENGER,
    messageTransmitter: TESTNET_MESSAGE_TRANSMITTER,
    rpcUrl: 'https://sepolia.optimism.io',
    explorerUrl: 'https://sepolia-optimism.etherscan.io',
    logo: DEFAULT_LOGO,
    fastTransfer: true,
    gatewaySupported: false,
    paymasterSupported: false,
    testnet: true,
    isArc: false,
  },
  {
    key: 'polygon-amoy',
    name: 'Polygon Amoy',
    chainId: 80002,
    cctpDomain: 7,
    cctpVersion: 'v2',
    usdc: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582' as Address,
    eurc: undefined,
    tokenMessenger: TESTNET_TOKEN_MESSENGER,
    messageTransmitter: TESTNET_MESSAGE_TRANSMITTER,
    rpcUrl: 'https://rpc-amoy.polygon.technology',
    explorerUrl: 'https://amoy.polygonscan.com',
    logo: DEFAULT_LOGO,
    fastTransfer: false,
    gatewaySupported: false,
    paymasterSupported: false,
    testnet: true,
    isArc: false,
  },
  {
    key: 'avalanche-fuji',
    name: 'Avalanche Fuji',
    chainId: 43113,
    cctpDomain: 1,
    cctpVersion: 'v2',
    usdc: '0x5425890298aed601595a70AB815c96711a31Bc65' as Address,
    eurc: undefined,
    tokenMessenger: TESTNET_TOKEN_MESSENGER,
    messageTransmitter: TESTNET_MESSAGE_TRANSMITTER,
    rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
    explorerUrl: 'https://testnet.snowtrace.io',
    logo: DEFAULT_LOGO,
    fastTransfer: false,
    gatewaySupported: false,
    paymasterSupported: false,
    testnet: true,
    isArc: false,
  },
  {
    key: 'unichain-sepolia',
    name: 'Unichain Sepolia',
    chainId: 1301,
    cctpDomain: 10,
    cctpVersion: 'v2',
    usdc: '0x31d0220469e10c4E71834a79b1f276d740d3768F' as Address,
    eurc: undefined,
    tokenMessenger: TESTNET_TOKEN_MESSENGER,
    messageTransmitter: TESTNET_MESSAGE_TRANSMITTER,
    rpcUrl: 'https://sepolia.unichain.org',
    explorerUrl: 'https://sepolia.uniscan.xyz',
    logo: DEFAULT_LOGO,
    fastTransfer: true,
    gatewaySupported: false,
    paymasterSupported: false,
    testnet: true,
    isArc: false,
  },
  {
    key: 'linea-sepolia',
    name: 'Linea Sepolia',
    chainId: 59141,
    cctpDomain: 11,
    cctpVersion: 'v2',
    usdc: '0xFEce4462D57bD51A6A552365A011b95f0E16d9B7' as Address,
    eurc: undefined,
    tokenMessenger: TESTNET_TOKEN_MESSENGER,
    messageTransmitter: TESTNET_MESSAGE_TRANSMITTER,
    rpcUrl: 'https://rpc.sepolia.linea.build',
    explorerUrl: 'https://sepolia.lineascan.build',
    logo: DEFAULT_LOGO,
    fastTransfer: true,
    gatewaySupported: false,
    paymasterSupported: false,
    testnet: true,
    isArc: false,
  },

  // ===== MAINNET (activated via NEXT_PUBLIC_ENABLE_MAINNET=true) ============
  {
    // Arc mainnet — verified live 2026-07-09: chainId 5042 via eth_chainId on
    // the public RPC; USDC precompile (same 0x3600… address as testnet,
    // 6-decimal ERC-20 surface) verified on-chain; CCTP V2 TokenMessenger /
    // MessageTransmitter deployed at the standard mainnet addresses with
    // localDomain() == 26. EURC intentionally omitted until Circle's docs
    // publish the official Arc-mainnet address (the explorer shows unverified
    // claimants — do not trust them).
    key: 'arc',
    name: 'Arc',
    chainId: 5042,
    cctpDomain: 26,
    cctpVersion: 'v2',
    usdc: '0x3600000000000000000000000000000000000000' as Address,
    eurc: undefined,
    tokenMessenger: MAINNET_TOKEN_MESSENGER,
    messageTransmitter: MAINNET_MESSAGE_TRANSMITTER,
    rpcUrl: 'https://rpc.blockdaemon.mainnet.arc.io',
    explorerUrl: 'https://arc-mainnet.cloud.blockscout.com',
    logo: DEFAULT_LOGO,
    fastTransfer: false,
    gatewaySupported: false,
    paymasterSupported: false,
    testnet: false,
    isArc: true,
  },
  {
    key: 'ethereum',
    name: 'Ethereum',
    chainId: 1,
    cctpDomain: 0,
    cctpVersion: 'v2',
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
    eurc: '0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c' as Address,
    tokenMessenger: MAINNET_TOKEN_MESSENGER,
    messageTransmitter: MAINNET_MESSAGE_TRANSMITTER,
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
    explorerUrl: 'https://etherscan.io',
    logo: DEFAULT_LOGO,
    fastTransfer: true,
    gatewaySupported: true,
    paymasterSupported: true,
    testnet: false,
    isArc: false,
  },
  {
    key: 'base',
    name: 'Base',
    chainId: 8453,
    cctpDomain: 6,
    cctpVersion: 'v2',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
    eurc: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42' as Address,
    tokenMessenger: MAINNET_TOKEN_MESSENGER,
    messageTransmitter: MAINNET_MESSAGE_TRANSMITTER,
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    logo: DEFAULT_LOGO,
    fastTransfer: true,
    gatewaySupported: true,
    paymasterSupported: true,
    testnet: false,
    isArc: false,
  },
  {
    key: 'arbitrum',
    name: 'Arbitrum One',
    chainId: 42161,
    cctpDomain: 3,
    cctpVersion: 'v2',
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address,
    eurc: undefined,
    tokenMessenger: MAINNET_TOKEN_MESSENGER,
    messageTransmitter: MAINNET_MESSAGE_TRANSMITTER,
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    explorerUrl: 'https://arbiscan.io',
    logo: DEFAULT_LOGO,
    fastTransfer: true,
    gatewaySupported: true,
    paymasterSupported: true,
    testnet: false,
    isArc: false,
  },
  {
    key: 'optimism',
    name: 'OP Mainnet',
    chainId: 10,
    cctpDomain: 2,
    cctpVersion: 'v2',
    usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85' as Address,
    eurc: undefined,
    tokenMessenger: MAINNET_TOKEN_MESSENGER,
    messageTransmitter: MAINNET_MESSAGE_TRANSMITTER,
    rpcUrl: 'https://mainnet.optimism.io',
    explorerUrl: 'https://optimistic.etherscan.io',
    logo: DEFAULT_LOGO,
    fastTransfer: true,
    gatewaySupported: true,
    paymasterSupported: true,
    testnet: false,
    isArc: false,
  },
  {
    key: 'polygon',
    name: 'Polygon PoS',
    chainId: 137,
    cctpDomain: 7,
    cctpVersion: 'v2',
    usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' as Address,
    eurc: undefined,
    tokenMessenger: MAINNET_TOKEN_MESSENGER,
    messageTransmitter: MAINNET_MESSAGE_TRANSMITTER,
    rpcUrl: 'https://polygon-rpc.com',
    explorerUrl: 'https://polygonscan.com',
    logo: DEFAULT_LOGO,
    fastTransfer: false,
    gatewaySupported: true,
    paymasterSupported: true,
    testnet: false,
    isArc: false,
  },
  {
    key: 'avalanche',
    name: 'Avalanche C',
    chainId: 43114,
    cctpDomain: 1,
    cctpVersion: 'v2',
    usdc: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E' as Address,
    eurc: undefined,
    tokenMessenger: MAINNET_TOKEN_MESSENGER,
    messageTransmitter: MAINNET_MESSAGE_TRANSMITTER,
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    explorerUrl: 'https://snowtrace.io',
    logo: DEFAULT_LOGO,
    fastTransfer: false,
    gatewaySupported: true,
    paymasterSupported: true,
    testnet: false,
    isArc: false,
  },
  {
    key: 'unichain',
    name: 'Unichain',
    chainId: 130,
    cctpDomain: 10,
    cctpVersion: 'v2',
    usdc: '0x078D782b760474a361dDA0AF3839290b0EF57AD6' as Address,
    eurc: undefined,
    tokenMessenger: MAINNET_TOKEN_MESSENGER,
    messageTransmitter: MAINNET_MESSAGE_TRANSMITTER,
    rpcUrl: 'https://mainnet.unichain.org',
    explorerUrl: 'https://uniscan.xyz',
    logo: DEFAULT_LOGO,
    fastTransfer: true,
    gatewaySupported: false,
    paymasterSupported: true,
    testnet: false,
    isArc: false,
  },
  {
    key: 'linea',
    name: 'Linea',
    chainId: 59144,
    cctpDomain: 11,
    cctpVersion: 'v2',
    usdc: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff' as Address,
    eurc: undefined,
    tokenMessenger: MAINNET_TOKEN_MESSENGER,
    messageTransmitter: MAINNET_MESSAGE_TRANSMITTER,
    rpcUrl: 'https://rpc.linea.build',
    explorerUrl: 'https://lineascan.build',
    logo: DEFAULT_LOGO,
    fastTransfer: true,
    gatewaySupported: false,
    paymasterSupported: false,
    testnet: false,
    isArc: false,
  },
] as const

/**
 * The registry consumed across the app, with each chain's logo resolved to its
 * local /public/chains file. Missing files fall back to a branded monogram in
 * the UI (see components/ui/chain-logo.tsx), so a logo is never a broken image.
 */
export const CHAINS: readonly ChainEntry[] = RAW_CHAINS.map((c) => ({
  ...c,
  logo: logoForKey(c.key),
}))

// ---------------------------------------------------------------------------
// Active set: testnets always; mainnets join when the env flag is set.
// ---------------------------------------------------------------------------

/**
 * Mainnet activation gate. Default OFF — set NEXT_PUBLIC_ENABLE_MAINNET=true
 * to add the mainnet rows (Arc mainnet, Ethereum, Base, …) to the active set.
 * NEXT_PUBLIC_ so the same flag drives both server tools and client UI.
 */
export const MAINNET_ENABLED = process.env.NEXT_PUBLIC_ENABLE_MAINNET === 'true'

/**
 * Currently-enabled chains. Testnet rows stay first so Arc Testnet remains the
 * default chain (resolveChainRef's fallback) even with mainnet enabled.
 */
export const ACTIVE_CHAINS: readonly ChainEntry[] = CHAINS.filter(
  (c) => c.testnet || MAINNET_ENABLED,
)

// ---------------------------------------------------------------------------
// Lookup helpers.
// ---------------------------------------------------------------------------

/** Look up a chain by its slug key or its numeric chainId. */
export function getChain(keyOrChainId: string | number): ChainEntry | undefined {
  if (typeof keyOrChainId === 'number') {
    return CHAINS.find((c) => c.chainId === keyOrChainId)
  }
  return CHAINS.find((c) => c.key === keyOrChainId)
}

/** Map an EVM chainId to its CCTP domain. */
export function chainIdToDomain(chainId: number): number | undefined {
  return CHAINS.find((c) => c.chainId === chainId)?.cctpDomain
}

/**
 * Map a CCTP domain back to a chainId. Domains are shared between testnet and
 * mainnet (e.g. domain 0 is both Ethereum and Sepolia), so pass `testnet` to
 * disambiguate. Defaults to the active (testnet) set.
 */
export function domainToChainId(
  domain: number,
  opts?: { testnet?: boolean },
): number | undefined {
  const wantTestnet = opts?.testnet ?? true
  return CHAINS.find((c) => c.cctpDomain === domain && c.testnet === wantTestnet)?.chainId
}

/** Get the currently-active chain set (testnet-only now). */
export function getActiveChains(): readonly ChainEntry[] {
  return ACTIVE_CHAINS
}

/**
 * Look up a chain entry by CCTP domain. Defaults to the active (testnet) set;
 * pass `testnet: false` to resolve a mainnet entry.
 */
export function getChainByDomain(
  domain: number,
  opts?: { testnet?: boolean },
): ChainEntry | undefined {
  const wantTestnet = opts?.testnet ?? true
  return CHAINS.find((c) => c.cctpDomain === domain && c.testnet === wantTestnet)
}

// ---------------------------------------------------------------------------
// viem Chain builder — lets wagmi/clients consume registry entries uniformly.
// ---------------------------------------------------------------------------

interface NativeCurrency {
  name: string
  symbol: string
  decimals: number
}

/** Determine the native currency for a registry entry. */
function nativeCurrencyFor(entry: ChainEntry): NativeCurrency {
  if (entry.isArc) {
    // Arc uses native USDC gas with 18 decimals via eth_getBalance.
    // The ERC-20 USDC precompile is still read/formatted separately at 6 decimals.
    return { name: 'USD Coin', symbol: 'USDC', decimals: 18 }
  }
  switch (entry.key) {
    case 'polygon':
    case 'polygon-amoy':
      return { name: 'POL', symbol: 'POL', decimals: 18 }
    case 'avalanche':
    case 'avalanche-fuji':
      return { name: 'Avalanche', symbol: 'AVAX', decimals: 18 }
    default:
      return { name: 'Ether', symbol: 'ETH', decimals: 18 }
  }
}

/**
 * Build a viem `Chain` object from a registry entry so wagmi/clients can consume
 * registry rows uniformly. Uses the PUBLIC rpc only.
 */
export function toViemChain(entry: ChainEntry): Chain {
  return defineChain({
    id: entry.chainId,
    name: entry.name,
    nativeCurrency: nativeCurrencyFor(entry),
    rpcUrls: {
      default: { http: [entry.rpcUrl] },
    },
    blockExplorers: {
      default: { name: `${entry.name} Explorer`, url: entry.explorerUrl },
    },
    testnet: entry.testnet,
  })
}

// ---------------------------------------------------------------------------
// Circle App Kit chain-enum mapping.
//
// App Kit identifies chains by a case-sensitive string enum (e.g.
// "Arc_Testnet", "Base_Sepolia") rather than chainId. We derive that enum
// string FROM the registry key so swap/send/bridge work on every ACTIVE chain
// without a separate hardcoded table. Verified against the installed
// @circle-fin/app-kit/chains values (Arc_Testnet, Ethereum_Sepolia,
// Base_Sepolia, Arbitrum_Sepolia, Optimism_Sepolia, Polygon_Amoy,
// Avalanche_Fuji, Unichain_Sepolia, Linea_Sepolia).
// ---------------------------------------------------------------------------

/**
 * registry key → App Kit chain enum string.
 *
 * Mainnet enums verified against @circle-fin/app-kit 1.9.0 chains.d.ts.
 * NOTE: App Kit (≤1.9.0, 2026-07-06) has NO Arc-mainnet enum — only
 * Arc_Testnet. The 'arc' (mainnet) key is intentionally unmapped so
 * toAppKitChain returns undefined and callers fail loudly instead of
 * silently targeting the testnet. Add the mapping when Circle ships it.
 */
const APPKIT_CHAIN_BY_KEY: Record<string, string> = {
  'arc-testnet': 'Arc_Testnet',
  'ethereum-sepolia': 'Ethereum_Sepolia',
  'base-sepolia': 'Base_Sepolia',
  'arbitrum-sepolia': 'Arbitrum_Sepolia',
  'optimism-sepolia': 'Optimism_Sepolia',
  'polygon-amoy': 'Polygon_Amoy',
  'avalanche-fuji': 'Avalanche_Fuji',
  'unichain-sepolia': 'Unichain_Sepolia',
  'linea-sepolia': 'Linea_Sepolia',
  // Mainnet rows (active only when MAINNET_ENABLED).
  ethereum: 'Ethereum',
  base: 'Base',
  arbitrum: 'Arbitrum',
  optimism: 'Optimism',
  polygon: 'Polygon',
  avalanche: 'Avalanche',
  unichain: 'Unichain',
  linea: 'Linea',
}

/**
 * Resolve the App Kit chain-enum string for a registry entry. Returns undefined
 * when the chain has no known App Kit mapping (e.g. mainnet rows not wired yet).
 */
export function toAppKitChain(entry: ChainEntry): string | undefined {
  return APPKIT_CHAIN_BY_KEY[entry.key]
}

/**
 * Resolve a registry entry from a loose chain reference the model or UI may
 * supply: a registry key ("base-sepolia"), an App Kit enum ("Base_Sepolia"),
 * a numeric chainId, or a CCTP domain prefixed object. NEVER trusts the value
 * blindly — only returns entries that exist in the registry. Falls back to the
 * ACTIVE Arc entry when nothing matches.
 */
/**
 * Strict variant of resolveChainRef for EXECUTION paths: returns undefined
 * instead of silently falling back to Arc Testnet when the ref doesn't match,
 * and only resolves chains in the ACTIVE set (so mainnet rows are not
 * executable while the flag is off). Accepts common aliases like
 * "arc-mainnet" / "Arc_Mainnet" for the "arc" key.
 */
export function resolveActiveChainStrict(ref: unknown): ChainEntry | undefined {
  if (ref == null) return ACTIVE_CHAINS.find((c) => c.isArc)
  let candidate: ChainEntry | undefined
  if (typeof ref === 'number') {
    candidate = getChain(ref)
  } else if (typeof ref === 'string') {
    const raw = ref.trim()
    candidate = getChain(raw)
    if (!candidate) {
      // App Kit enum string.
      for (const [key, appkit] of Object.entries(APPKIT_CHAIN_BY_KEY)) {
        if (appkit === raw) {
          candidate = getChain(key)
          break
        }
      }
    }
    if (!candidate) {
      // Normalized aliases: "Arc_Mainnet" / "arc mainnet" → "arc", etc.
      const norm = raw.toLowerCase().replace(/[\s_]+/g, '-')
      candidate = getChain(norm) ?? (norm === 'arc-mainnet' ? getChain('arc') : undefined)
    }
    if (!candidate) {
      const asNum = Number(raw)
      if (Number.isFinite(asNum) && raw !== '') candidate = getChain(asNum)
    }
  } else if (typeof ref === 'object') {
    const o = ref as { chain?: string; key?: string; chainId?: number; id?: number }
    return resolveActiveChainStrict(o.key ?? o.chain ?? o.chainId ?? o.id)
  }
  if (!candidate) return undefined
  // Execution is limited to the ACTIVE set — mainnet rows only when enabled.
  return ACTIVE_CHAINS.some((c) => c.chainId === candidate.chainId) ? candidate : undefined
}

export function resolveChainRef(ref: unknown): ChainEntry {
  const arc = ACTIVE_CHAINS.find((c) => c.isArc) ?? CHAINS[0]!
  if (ref == null) return arc

  if (typeof ref === 'number') {
    return getChain(ref) ?? arc
  }
  if (typeof ref === 'string') {
    // Direct registry key.
    const byKey = getChain(ref)
    if (byKey) return byKey
    // App Kit enum string → registry key.
    for (const [key, appkit] of Object.entries(APPKIT_CHAIN_BY_KEY)) {
      if (appkit === ref) {
        const e = getChain(key)
        if (e) return e
      }
    }
    return arc
  }
  if (typeof ref === 'object') {
    const o = ref as { chain?: string; key?: string; chainId?: number; id?: number; domain?: number }
    if (o.key) return resolveChainRef(o.key)
    if (o.chain) return resolveChainRef(o.chain)
    const cid = o.chainId ?? o.id
    if (typeof cid === 'number') return getChain(cid) ?? arc
    if (typeof o.domain === 'number') return getChainByDomain(o.domain) ?? arc
  }
  return arc
}
