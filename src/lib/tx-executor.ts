'use client'

import { useCallback } from 'react'
import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  http,
  numberToHex,
  isAddress,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem'
import { useConfig } from 'wagmi'
import { arcTestnet } from '@/chains/arc'
import {
  ACTIVE_CHAINS,
  getChainByDomain,
  resolveActiveChainStrict,
  resolveChainRef,
  toAppKitChain,
  toViemChain,
  type ChainEntry,
} from '@/chains/registry'
import { classifyError, type ErrorKind } from '@/lib/errors'
import { switchChainOnProvider } from '@/lib/chain-switch'
import {
  buildApproveCalldata,
  buildDepositForBurnCalldata,
  buildReceiveMessageCalldata,
  erc20ApproveAbi,
  fetchIrisMessage,
  fetchStandardMaxFee,
} from '@/lib/cctp-native'

/**
 * Resolve a model-supplied chain ref STRICTLY for execution: unknown refs and
 * chains outside the ACTIVE set (e.g. mainnet rows while the flag is off) fail
 * validation instead of silently falling back to Arc Testnet.
 */
function requireActiveChain(ref: unknown, label: string): ChainEntry | TxExecResult {
  const entry = resolveActiveChainStrict(ref)
  if (entry) return entry
  return failWith(
    `Unknown or disabled ${label} "${String(ref)}"`,
    'validation',
    'Use an enabled chain key like "arc-testnet" or "base-sepolia" (or "arc", "base" when mainnet is enabled).',
  )
}

// ---------------------------------------------------------------------------
// SAFETY GUARD CONSTANTS (TASK A). Generous testnet defaults; tune here.
// These are denominated in USDC-equivalent human units (NOT base units).
// ---------------------------------------------------------------------------

/** Hard ceiling on a single write transaction's amount. */
const PER_TX_CAP = 100_000
/** Rolling 24h cap per (date, address). */
const DAILY_CAP = 250_000
/**
 * Slippage caps, by network.
 *
 * Arc TESTNET pools are thin and the Circle quote API's `estimatedOutput` runs
 * materially ABOVE what the pool actually delivers at execution. Reproduced
 * on-chain with the real SDK: a 1 USDC->EURC swap quotes ~1.217 EURC but the
 * adapter's `execute` reverts with `InsufficientAmountOut()` (0xe52970aa) for
 * any tolerance below ~6% — 500 bps reverts, 600 bps clears. So minAmountOut,
 * which the SDK derives from this slippage, is unreachable at tight settings and
 * the swap is impossible at the old 5% cap, regardless of the default. (NOT an
 * approval/permit problem: Arc USDC is FiatTokenV2.2 with working EIP-2612, and
 * the execute reverts identically with allowanceStrategy:'approve' + a live
 * allowance — verified.) Testnet therefore needs a generous default + cap.
 *
 * Mainnet keeps tight, safe values — real liquidity makes the quote/execute gap
 * negligible. Revisit the testnet branch once Arc mainnet pools are live.
 */
const SLIPPAGE_BPS = {
  testnet: { default: 1000, max: 1500 },
  mainnet: { default: 50, max: 300 },
} as const

/** Known burn / sink addresses we never allow `send` to target. */
const BURN_ADDRESSES = new Set<string>([
  '0x0000000000000000000000000000000000000000',
  '0x000000000000000000000000000000000000dEaD',
  '0xdEAD000000000000000042069420694206942069',
].map((a) => a.toLowerCase()))

export interface TxExecResult {
  ok: boolean
  hash?: string
  explorerUrl?: string
  error?: string
  errorKind?: ErrorKind
  errorHint?: string
  errorDetail?: string
  data?: unknown
}

function failFrom(err: unknown): TxExecResult {
  const c = classifyError(err)
  return {
    ok: false,
    error: c.headline,
    errorKind: c.kind,
    errorHint: c.hint,
    errorDetail: c.detail,
  }
}

function failWith(headline: string, kind: ErrorKind = 'unknown', hint?: string): TxExecResult {
  return { ok: false, error: headline, errorKind: kind, errorHint: hint, errorDetail: headline }
}

interface AppKitTxApi {
  swap: (params: {
    from: { adapter: unknown; chain: string }
    tokenIn: string
    tokenOut: string
    amountIn: string
    // App Kit's SwapParams nests all of these under `config` — slippageBps at the
    // top level is silently ignored, so our slippage clamp must live here.
    config?: { slippageBps?: number; kitKey?: string; allowanceStrategy?: 'permit' | 'approve' }
  }) => Promise<{ txHash?: string; hash?: string; transactionHash?: string; explorerUrl?: string }>
  bridge: (params: {
    from: { adapter: unknown; chain: string }
    to: { adapter: unknown; chain: string }
    amount: string
    token?: 'USDC'
    config?: { kitKey?: string }
  }) => Promise<{
    state?: string
    steps?: Array<{ name?: string; state?: string; txHash?: string; explorerUrl?: string }>
  }>
  send: (params: {
    from: { adapter: unknown; chain: string }
    to: string
    amount: string
    token?: string
    config?: { kitKey?: string }
  }) => Promise<{ txHash?: string; hash?: string; explorerUrl?: string }>
}

const KIT_KEY = process.env.NEXT_PUBLIC_KIT_KEY ?? ''

type ViemAdapterCtor = typeof import('@circle-fin/adapter-viem-v2').ViemAdapter

interface AppKitRuntime {
  ViemAdapter: ViemAdapterCtor
  kit: AppKitTxApi
  /**
   * App Kit supported-chain list, derived from the registry's ACTIVE set rather
   * than a hardcoded 3-entry table. We map each ACTIVE registry key to its App
   * Kit chain object so the adapter advertises every routable chain.
   */
  supportedChains: unknown[]
}

let appKitRuntime: Promise<AppKitRuntime> | null = null

/**
 * The Circle App Kit SDK is by far the heaviest dependency in the chat bundle
 * and is only needed at signing time. Loading it on first execution keeps it
 * out of the initial page JS; the promise is cached so later txs are instant.
 */
function loadAppKit(): Promise<AppKitRuntime> {
  appKitRuntime ??= Promise.all([
    import('@circle-fin/adapter-viem-v2'),
    import('@/lib/appkit'),
    import('@circle-fin/app-kit/chains'),
  ]).then(([adapterMod, kitMod, chains]) => {
    const objects: Record<string, unknown> = {
      'arc-testnet': chains.ArcTestnet,
      'ethereum-sepolia': chains.EthereumSepolia,
      'base-sepolia': chains.BaseSepolia,
      'arbitrum-sepolia': chains.ArbitrumSepolia,
      'optimism-sepolia': chains.OptimismSepolia,
      'polygon-amoy': chains.PolygonAmoy,
      'avalanche-fuji': chains.AvalancheFuji,
      'unichain-sepolia': chains.UnichainSepolia,
      'linea-sepolia': chains.LineaSepolia,
      // Mainnet objects — only reach supportedChains when the registry's
      // ACTIVE set includes them (NEXT_PUBLIC_ENABLE_MAINNET). Arc mainnet has
      // no App Kit object; it routes via the native CCTP path instead.
      ethereum: chains.Ethereum,
      base: chains.Base,
      arbitrum: chains.Arbitrum,
      optimism: chains.Optimism,
      polygon: chains.Polygon,
      avalanche: chains.Avalanche,
      unichain: chains.Unichain,
      linea: chains.Linea,
    }
    return {
      ViemAdapter: adapterMod.ViemAdapter,
      kit: kitMod.appkit as unknown as AppKitTxApi,
      supportedChains: ACTIVE_CHAINS.map((c) => objects[c.key]).filter((x) => x != null),
    }
  })
  return appKitRuntime
}

interface ChainInfo {
  entry: ChainEntry
  viem: Chain
  wagmiId: number
  /** App Kit chain enum — undefined when Circle's SDK has no enum for this
   *  chain yet (e.g. Arc mainnet). Callers MUST fail loudly, never fall back
   *  to a different network. */
  appKit: string | undefined
}

/** Resolve a registry-backed ChainInfo from any loose chain reference. */
function resolveChain(rawChain: unknown): ChainInfo {
  const entry = resolveChainRef(rawChain)
  // Match on chainId, not isArc — Arc MAINNET must not resolve to the testnet
  // viem chain.
  const viem = entry.chainId === arcTestnet.id ? arcTestnet : toViemChain(entry)
  return {
    entry,
    viem,
    wagmiId: entry.chainId,
    appKit: toAppKitChain(entry),
  }
}

/** Uniform failure for chains Circle App Kit cannot target yet. */
function appKitUnsupported(chainName: string): TxExecResult {
  return failWith(
    `${chainName} is not supported by Circle App Kit yet`,
    'validation',
    `Circle's App Kit SDK has no ${chainName} route yet. This action will be enabled as soon as Circle ships support.`,
  )
}

// ---------------------------------------------------------------------------
// Native CCTP V2 path — used for bridges App Kit cannot execute (Arc mainnet).
// ---------------------------------------------------------------------------

type WagmiConfig = ReturnType<typeof useConfig>

/**
 * Get a viem WalletClient on `entry`'s chain from the connected wagmi
 * connector, switching the wallet's network first (best-effort; the send
 * itself pins the chain, so a refused switch surfaces as a wallet error).
 */
async function walletOn(
  config: WagmiConfig,
  address: Address | undefined,
  entry: ChainEntry,
): Promise<{ walletClient: WalletClient; account: Address; viem: Chain } | TxExecResult> {
  const connection =
    config.state.connections.get(config.state.current ?? '') ??
    Array.from(config.state.connections.values())[0]
  const connector = connection?.connector ?? config.connectors[0]
  if (!connector) {
    return failWith('No wallet connector', 'wallet_not_connected', 'Connect a wallet first.')
  }
  const provider = (await connector.getProvider()) as {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  }
  try {
    // Switch with the EIP-3085 add-chain fallback: chains like Arc mainnet
    // are usually not preconfigured in wallets, and without the add the
    // pinned sendTransaction below dies on ChainMismatchError.
    await switchChainOnProvider(provider, entry)
  } catch {
    // Already on chain or user rejected the switch/add. The sendTransaction
    // below pins the chain and will surface a clear error if still wrong.
  }
  const account = (address ?? connection?.accounts[0]) as Address | undefined
  if (!account) {
    return failWith('No active wallet account', 'wallet_not_connected', 'Connect or unlock your wallet.')
  }
  const viem = entry.chainId === arcTestnet.id ? arcTestnet : toViemChain(entry)
  const walletClient = createWalletClient({
    account,
    chain: viem,
    transport: custom(provider as unknown as Parameters<typeof custom>[0]),
  })
  return { walletClient, account, viem }
}

/**
 * Bridge USDC via raw CCTP V2 (approve if needed + depositForBurn on the
 * source chain). The user later claims on the destination with claim_bridge
 * once Circle's attestation completes. Only USDC is supported.
 */
async function executeNativeCctpBridge(params: {
  config: WagmiConfig
  address?: Address
  fromEntry: ChainEntry
  toEntry: ChainEntry
  token: string
  amount: string
}): Promise<TxExecResult> {
  const { config, address, fromEntry, toEntry, token, amount } = params
  if (token.toUpperCase() !== 'USDC') {
    return failWith(
      'Native CCTP bridging supports USDC only',
      'validation',
      `${fromEntry.name} routes use the raw CCTP contracts, which burn/mint USDC.`,
    )
  }
  const wallet = await walletOn(config, address, fromEntry)
  if (!('walletClient' in wallet)) return wallet
  const { walletClient, account, viem } = wallet

  // Authorize Circle's standard-transfer fee from the live schedule: a maxFee
  // below the current fee means Iris never attests and the burn strands.
  const amountForFee = buildDepositForBurnCalldata({
    amount,
    destinationDomain: toEntry.cctpDomain,
    mintRecipient: account,
    burnToken: fromEntry.usdc,
    maxFee: 0n,
  }).amountBase
  if (amountForFee <= 0n) {
    return failWith('Amount must be greater than zero', 'validation')
  }
  const maxFee = await fetchStandardMaxFee(
    fromEntry.cctpDomain,
    toEntry.cctpDomain,
    amountForFee,
    fromEntry.testnet,
  )
  const { data: burnData, amountBase } = buildDepositForBurnCalldata({
    amount,
    destinationDomain: toEntry.cctpDomain,
    mintRecipient: account,
    burnToken: fromEntry.usdc,
    maxFee,
  })

  const publicClient = createPublicClient({ chain: viem, transport: http(fromEntry.rpcUrl) })
  const allowance = (await publicClient.readContract({
    address: fromEntry.usdc,
    abi: erc20ApproveAbi,
    functionName: 'allowance',
    args: [account, fromEntry.tokenMessenger],
  })) as bigint

  if (allowance < amountBase) {
    const approveHash = await walletClient.sendTransaction({
      account,
      chain: viem,
      to: fromEntry.usdc,
      data: buildApproveCalldata(fromEntry.tokenMessenger, amountBase),
    })
    await publicClient.waitForTransactionReceipt({ hash: approveHash })
  }

  const hash = await walletClient.sendTransaction({
    account,
    chain: viem,
    to: fromEntry.tokenMessenger,
    data: burnData,
  })

  return {
    ok: true,
    hash,
    explorerUrl: explorerFor(hash, viem),
    data: {
      native: true,
      state: 'burned',
      steps: [{ name: 'Burn', txHash: hash, state: 'success' }],
      srcDomain: fromEntry.cctpDomain,
      dstDomain: toEntry.cctpDomain,
      fromKey: fromEntry.key,
      toKey: toEntry.key,
      note: `Standard CCTP transfer: once Circle attests (typically ~15 min), claim the USDC on ${toEntry.name} (claim_bridge).`,
    },
  }
}

function explorerFor(hash: string, chain: Chain = arcTestnet): string {
  return `${chain.blockExplorers?.default.url ?? arcTestnet.blockExplorers.default.url}/tx/${hash}`
}

// ---------------------------------------------------------------------------
// Guard helpers (TASK A). Applied BEFORE any kit.* / sendTransaction call.
// ---------------------------------------------------------------------------

/** Parse a human amount string defensively; returns NaN on garbage. */
function parseAmount(raw: unknown): number {
  if (typeof raw === 'number') return raw
  if (typeof raw !== 'string') return NaN
  const n = Number(raw.replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : NaN
}

/**
 * Validate + checksum a recipient/contract address. Rejects non-addresses,
 * the zero address, known burn sinks, and (for sends) the token contract
 * itself. Returns the checksummed address or an error string.
 */
function validateRecipient(
  to: unknown,
  opts: { tokenAddress?: string } = {},
): { ok: true; address: Address } | { ok: false; error: string; hint: string } {
  if (typeof to !== 'string' || !isAddress(to)) {
    return {
      ok: false,
      error: 'Invalid recipient address',
      hint: 'The recipient must be a checksummed 0x-prefixed EVM address.',
    }
  }
  let checksummed: Address
  try {
    checksummed = getAddress(to)
  } catch {
    return {
      ok: false,
      error: 'Recipient address failed checksum validation',
      hint: 'Re-enter the address; the checksum did not validate.',
    }
  }
  const lower = checksummed.toLowerCase()
  if (lower === '0x0000000000000000000000000000000000000000' || BURN_ADDRESSES.has(lower)) {
    return {
      ok: false,
      error: 'Refusing to send to a burn / zero address',
      hint: 'This address would permanently destroy the funds.',
    }
  }
  if (opts.tokenAddress && lower === opts.tokenAddress.toLowerCase()) {
    return {
      ok: false,
      error: 'Refusing to send tokens to the token contract itself',
      hint: 'Sending a token to its own contract address usually burns it.',
    }
  }
  return { ok: true, address: checksummed }
}

/** Clamp + validate slippage bps into [0, max], using per-network caps. */
function clampSlippage(raw: unknown, isTestnet: boolean): number {
  const caps = isTestnet ? SLIPPAGE_BPS.testnet : SLIPPAGE_BPS.mainnet
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n <= 0) return caps.default
  return Math.min(Math.floor(n), caps.max)
}

/** localStorage key for rolling daily spend, keyed by UTC date + address. */
function dailySpendKey(address: string | undefined): string {
  const day = new Date().toISOString().slice(0, 10)
  return `numa:dailySpend:${day}:${(address ?? 'anon').toLowerCase()}`
}

function readDailySpend(address: string | undefined): number {
  if (typeof window === 'undefined') return 0
  try {
    const v = window.localStorage.getItem(dailySpendKey(address))
    const n = v ? Number(v) : 0
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

function recordDailySpend(address: string | undefined, amount: number): void {
  if (typeof window === 'undefined' || !Number.isFinite(amount) || amount <= 0) return
  try {
    const next = readDailySpend(address) + amount
    window.localStorage.setItem(dailySpendKey(address), String(next))
  } catch {
    // localStorage unavailable (private mode); cap enforcement is best-effort.
  }
}

/**
 * Enforce per-tx + rolling daily spend caps. Reads the amount defensively; a
 * non-numeric / zero amount passes the cap check (other guards handle bad
 * amounts). Returns null on success or a TxExecResult error.
 */
function checkSpendCaps(amountRaw: unknown, address: string | undefined): TxExecResult | null {
  const amount = parseAmount(amountRaw)
  if (!Number.isFinite(amount) || amount <= 0) return null
  if (amount > PER_TX_CAP) {
    return failWith(
      `Amount ${amount} exceeds the per-transaction cap of ${PER_TX_CAP}`,
      'validation',
      `Split into smaller transactions under ${PER_TX_CAP} USDC-equivalent.`,
    )
  }
  const prior = readDailySpend(address)
  if (prior + amount > DAILY_CAP) {
    return failWith(
      `This would exceed the rolling daily cap of ${DAILY_CAP} (already ${prior} today)`,
      'validation',
      `The daily safety cap resets at UTC midnight. Remaining today: ${Math.max(0, DAILY_CAP - prior)}.`,
    )
  }
  return null
}

function buildAdapter(
  { ViemAdapter, supportedChains }: AppKitRuntime,
  config: ReturnType<typeof useConfig>,
  address?: Address,
): InstanceType<ViemAdapterCtor> {
  const adapterOptions = {
    getPublicClient: ({ chain }: { chain: unknown }): PublicClient => {
      const info = resolveChain(chain)
      if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
        console.debug('[numa] getPublicClient', { rawChain: chain, resolved: info.viem.name })
      }
      return createPublicClient({ chain: info.viem, transport: http() })
    },
    getWalletClient: async ({ chain }: { chain: unknown }): Promise<WalletClient> => {
      const info = resolveChain(chain)
      // Resolve the active connection robustly: prefer "current", but fall back
      // to any live connection — wagmi's `current` can lag a fresh reconnect.
      const connection =
        config.state.connections.get(config.state.current ?? '') ??
        Array.from(config.state.connections.values())[0]
      const connector = connection?.connector ?? config.connectors[0]
      if (!connector) throw new Error('no wallet connector')
      const provider = (await connector.getProvider()) as {
        request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
      }
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: numberToHex(info.wagmiId) }],
        })
      } catch (e: unknown) {
        // 4902 = chain not added; try add then switch
        const errCode = (e as { code?: number })?.code
        if (errCode === 4902) {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: numberToHex(info.wagmiId),
                chainName: info.viem.name,
                nativeCurrency: info.viem.nativeCurrency,
                rpcUrls: info.viem.rpcUrls.default.http,
                blockExplorerUrls: info.viem.blockExplorers
                  ? [info.viem.blockExplorers.default.url]
                  : undefined,
              },
            ],
          })
        } else if (errCode !== 4001) {
          // 4001 = user rejected; surface anything else, ignore otherwise
        }
      }
      // The connected address is authoritative (it gates the whole app); prefer
      // it over the connection's cached account list.
      const account = address ?? connection?.accounts[0]
      if (!account) throw new Error('no account')
      const walletClient: WalletClient = createWalletClient({
        account,
        chain: info.viem,
        transport: custom(provider as unknown as Parameters<typeof custom>[0]),
      })
      return walletClient
    },
  }
  const capabilities = {
    addressContext: 'user-controlled' as const,
    supportedChains,
  }
  return new ViemAdapter(
    adapterOptions as unknown as ConstructorParameters<ViemAdapterCtor>[0],
    capabilities as unknown as ConstructorParameters<ViemAdapterCtor>[1],
  )
}

export interface ExecInput {
  tool: string
  input: Record<string, unknown>
  address?: Address
}

export function useTxExecutor(): (e: ExecInput) => Promise<TxExecResult> {
  const config = useConfig()

  return useCallback(
    async ({ tool, input, address }: ExecInput): Promise<TxExecResult> => {
      try {
        const runtime = await loadAppKit()
        const adapter = buildAdapter(runtime, config, address)
        const kit = runtime.kit
        const cfg = KIT_KEY ? { config: { kitKey: KIT_KEY } } : {}

        if (tool === 'swap') {
          const tokenIn = String(input.fromToken ?? input.tokenIn ?? 'USDC')
          const tokenOut = String(input.toToken ?? input.tokenOut ?? 'EURC')
          const amount = String(input.amount ?? '0')
          // GUARD: spend caps (per-tx + rolling daily).
          const capErr = checkSpendCaps(amount, address)
          if (capErr) return capErr
          // GUARD: chain resolved via registry (swap stays on its chain; Arc
          // default). Strict: unknown/disabled chains fail instead of
          // silently swapping on Arc Testnet.
          const swapEntry = requireActiveChain(input.chain, 'chain')
          if (!('chainId' in swapEntry)) return swapEntry
          const swapChain = resolveChain(swapEntry.chainId)
          const chain = swapChain.appKit
          if (!chain) return appKitUnsupported(swapChain.entry.name)
          // GUARD: slippage clamp, per-network (App Kit computes its own minOut,
          // so we enforce the cap on the REQUESTED value and surface it). This
          // MUST go under `config` — a top-level slippageBps is ignored by the
          // SDK. Testnet pools need a high tolerance (see SLIPPAGE_BPS): the Circle
          // quote over-estimates output there, so a tight value reverts with
          // InsufficientAmountOut().
          const slippageBps = clampSlippage(input.slippageBps, swapChain.entry.testnet)
          // App Kit's swap/estimate wrappers take amountIn in HUMAN units and
          // convert to base internally (verified: estimateSwap('1') quotes 1
          // USDC -> ~1.217 EURC). Pre-converting to base here makes the SDK read
          // it as 1e6 USDC and the router returns "no route", so pass the human
          // amount through unchanged. (The raw HTTP /swap endpoint wants base
          // units, but that is below this wrapper — do not convert here.)
          const r = await kit.swap({
            from: { adapter, chain },
            tokenIn,
            tokenOut,
            amountIn: amount,
            config: { slippageBps, ...(KIT_KEY ? { kitKey: KIT_KEY } : {}) },
          })
          const hash = r.txHash ?? r.hash ?? r.transactionHash
          if (!hash) return failWith('Swap returned no transaction hash', 'upstream', 'The aggregator did not produce a tx. Retry.')
          recordDailySpend(address, parseAmount(amount))
          return { ok: true, hash, explorerUrl: r.explorerUrl ?? explorerFor(hash) }
        }

        if (tool === 'bridge') {
          const amount = String(input.amount ?? '0')
          // GUARD: spend caps.
          const capErr = checkSpendCaps(amount, address)
          if (capErr) return capErr
          // GUARD: resolve BOTH chains via the registry (CCTP V2 domains, not
          // opaque string enums). Strict + ACTIVE-only: unknown refs and
          // disabled mainnet rows fail validation. Reject same-chain bridges.
          const fromRes = requireActiveChain(input.fromChain, 'source chain')
          if (!('chainId' in fromRes)) return fromRes
          const toRes = requireActiveChain(input.toChain, 'destination chain')
          if (!('chainId' in toRes)) return toRes
          const fromEntry = fromRes
          const toEntry = toRes
          if (fromEntry.chainId === toEntry.chainId) {
            return failWith(
              'Source and destination chains are the same',
              'validation',
              'Pick two different chains to bridge between.',
            )
          }
          const fromChain = toAppKitChain(fromEntry)
          const toChain = toAppKitChain(toEntry)
          if (!fromChain || !toChain) {
            // App Kit can't route this pair (Arc mainnet end) — burn via the
            // raw CCTP V2 contracts instead. Claiming happens on the
            // destination once Circle attests (claim_bridge tool).
            const r = await executeNativeCctpBridge({
              config,
              address,
              fromEntry,
              toEntry,
              token: String(input.token ?? 'USDC'),
              amount,
            })
            if (r.ok) recordDailySpend(address, parseAmount(amount))
            return r
          }
          const r = await kit.bridge({
            from: { adapter, chain: fromChain },
            to: { adapter, chain: toChain },
            amount,
            token: 'USDC',
            ...cfg,
          })
          const steps = r.steps ?? []
          const burn = steps.find(
            (s) => s.txHash && (s.name?.toLowerCase().includes('burn') || s.state === 'success'),
          )
          const anyHash = burn ?? steps.find((s) => s.txHash)
          const hash = anyHash?.txHash
          if (!hash) {
            const errStep = steps.find((s) => s.state === 'error')
            return failWith(
              errStep ? `Bridge step "${errStep.name}" failed` : `Bridge ${r.state ?? 'returned no tx hash'}`,
              'upstream',
              'CCTP could not produce a burn tx. Verify source chain balance and allowance.',
            )
          }
          recordDailySpend(address, parseAmount(amount))
          return {
            ok: true,
            hash,
            explorerUrl: anyHash?.explorerUrl ?? explorerFor(hash, fromEntry.chainId === arcTestnet.id ? arcTestnet : toViemChain(fromEntry)),
            data: {
              state: r.state,
              steps,
              srcDomain: fromEntry.cctpDomain,
              dstDomain: toEntry.cctpDomain,
              fromKey: fromEntry.key,
              toKey: toEntry.key,
            },
          }
        }

        if (tool === 'send') {
          const amount = String(input.amount ?? '0')
          const token = String(input.token ?? 'USDC')
          // GUARD: chain resolved via registry; derive the token contract so we
          // can reject sends to the token contract itself. Strict: unknown or
          // disabled chains fail instead of falling back to Arc Testnet.
          const sendEntry = requireActiveChain(input.chain, 'chain')
          if (!('chainId' in sendEntry)) return sendEntry
          const sendChain = resolveChain(sendEntry.chainId)
          const tokenUpper = token.toUpperCase()
          const tokenAddress =
            tokenUpper === 'USDC'
              ? sendChain.entry.usdc
              : tokenUpper === 'EURC'
                ? sendChain.entry.eurc
                : isAddress(token)
                  ? token
                  : undefined
          // GUARD: recipient validation (checksum, zero/burn, token-self).
          const recip = validateRecipient(input.to, { tokenAddress })
          if (!recip.ok) return failWith(recip.error, 'validation', recip.hint)
          // GUARD: spend caps.
          const capErr = checkSpendCaps(amount, address)
          if (capErr) return capErr
          if (!sendChain.appKit) return appKitUnsupported(sendChain.entry.name)
          const r = await kit.send({
            from: { adapter, chain: sendChain.appKit },
            to: recip.address,
            amount,
            token,
            ...cfg,
          })
          const hash = r.txHash ?? r.hash
          if (!hash) return failWith('Send returned no transaction hash', 'upstream', 'The wallet adapter did not produce a tx. Retry.')
          recordDailySpend(address, parseAmount(amount))
          return { ok: true, hash, explorerUrl: r.explorerUrl ?? explorerFor(hash, sendChain.viem) }
        }

        if (tool === 'claim_bridge') {
          // Mint the USDC on the destination chain of a native CCTP bridge:
          // fetch Circle's attestation for the burn tx, then sign
          // receiveMessage on the destination MessageTransmitter.
          const srcRes = requireActiveChain(input.fromChain, 'source chain')
          if (!('chainId' in srcRes)) return srcRes
          const dstRes = requireActiveChain(input.toChain, 'destination chain')
          if (!('chainId' in dstRes)) return dstRes
          const src = srcRes
          const dst = dstRes
          const txHash = String(input.txHash ?? '')
          if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
            return failWith('Invalid burn transaction hash', 'validation', 'Pass the 0x… hash of the bridge burn transaction.')
          }
          let iris
          try {
            iris = await fetchIrisMessage(src.cctpDomain, txHash, src.testnet)
          } catch (e) {
            return failWith(
              'Could not reach the Circle attestation API',
              'network',
              e instanceof Error ? e.message : 'Retry in a moment.',
            )
          }
          const message = iris?.message
          const attestation = iris?.attestation
          // Ready when the attestation exists. Do NOT require status
          // 'complete': Iris reports 'pending_confirmations' with a usable
          // attestation in the window get_bridge_status calls ready_to_mint.
          if (!iris || !message || !attestation || attestation === 'PENDING') {
            return failWith(
              'Attestation not ready yet',
              'timeout',
              'Circle is still attesting the burn (standard transfers take ~15 min). Check get_bridge_status and try again once it reads ready_to_mint.',
            )
          }
          // The attested message names its destination. Refuse a mismatched
          // claim: signing on the wrong chain only burns gas on a revert.
          const decodedDst = Number(iris.decodedMessage?.destinationDomain)
          if (Number.isFinite(decodedDst) && decodedDst !== dst.cctpDomain) {
            const actual = getChainByDomain(decodedDst, { testnet: src.testnet })
            return failWith(
              `This burn is destined for ${actual?.name ?? `CCTP domain ${decodedDst}`}, not ${dst.name}`,
              'validation',
              'Call claim_bridge with the chain the bridge was actually sent to.',
            )
          }
          const wallet = await walletOn(config, address, dst)
          if (!('walletClient' in wallet)) return wallet
          const data = buildReceiveMessageCalldata(message as Hex, attestation as Hex)
          // Preflight the mint: a used nonce (already claimed) or a
          // not-yet-valid attestation reverts here instead of costing gas.
          const dstPublic = createPublicClient({ chain: wallet.viem, transport: http(dst.rpcUrl) })
          try {
            await dstPublic.call({ account: wallet.account, to: dst.messageTransmitter, data })
          } catch {
            return failWith(
              'Claim would revert on the destination chain',
              'validation',
              'The USDC was most likely already claimed. Check the destination balance before retrying.',
            )
          }
          const hash = await wallet.walletClient.sendTransaction({
            account: wallet.account,
            chain: wallet.viem,
            to: dst.messageTransmitter,
            data,
          })
          return {
            ok: true,
            hash,
            explorerUrl: explorerFor(hash, wallet.viem),
            data: { claimed: true, fromKey: src.key, toKey: dst.key, burnTx: txHash },
          }
        }

        // Tools that build their own calldata server-side
        const dispatchMap: Record<string, string> = {
          deposit: 'deposit',
          withdraw: 'withdraw',
          add_liquidity: 'add_liquidity',
          remove_liquidity: 'remove_liquidity',
        }
        const serverTool = dispatchMap[tool]
        if (serverTool) {
          // GUARD: spend caps on the primary amount(s) where present.
          const capAmount =
            input.amount ?? input.amountA ?? input.budgetUsdc ?? input.amountB
          const capErr = checkSpendCaps(capAmount, address)
          if (capErr) return capErr
          // These builders are Arc-Testnet-only (position manager / pools
          // live there); reuse the shared wallet acquisition helper.
          const arcWallet = await walletOn(config, address, resolveChainRef('arc-testnet'))
          if (!('walletClient' in arcWallet)) return arcWallet
          const { walletClient } = arcWallet
          const res = await fetch('/api/tools', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ tool: serverTool, args: input, address }),
          })
          const json = (await res.json()) as {
            ok: boolean
            data?: { prepared?: { to: string; data: string; value: string } }
            error?: string
          }
          if (!json.ok || !json.data?.prepared) {
            return failWith(json.error ?? 'Tool returned no prepared tx', 'upstream', 'The server-side builder did not return calldata. Retry or check params.')
          }
          const prepared = json.data.prepared
          // GUARD: checksum-validate the server-prepared destination.
          if (!isAddress(prepared.to)) {
            return failWith('Prepared transaction has an invalid destination', 'validation', 'The server-side builder returned a malformed address.')
          }
          const hash = await walletClient.sendTransaction({
            account: walletClient.account!,
            chain: arcTestnet,
            to: getAddress(prepared.to),
            data: prepared.data as Hex,
            value: BigInt(prepared.value ?? '0'),
          })
          recordDailySpend(address, parseAmount(capAmount))
          return { ok: true, hash, explorerUrl: explorerFor(hash) }
        }

        if (tool === 'register_agent' || tool === 'hire_agent' || tool === 'create_job') {
          return failWith(
            'ERC-8004 registry not deployed on Arc Testnet yet',
            'config_missing',
            'Enabled once the registry contracts are published.',
          )
        }

        return failWith(`Tool "${tool}" is not executable from the client`, 'validation')
      } catch (e) {
        return failFrom(e)
      }
    },
    [config],
  )
}
