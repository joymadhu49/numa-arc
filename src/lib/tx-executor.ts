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
  parseUnits,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem'
import { getToken, type TokenSymbol } from '@/lib/tokens'
import { useConfig } from 'wagmi'
import { arcTestnet } from '@/chains/arc'
import {
  ACTIVE_CHAINS,
  resolveChainRef,
  toAppKitChain,
  toViemChain,
  type ChainEntry,
} from '@/chains/registry'
import { classifyError, type ErrorKind } from '@/lib/errors'

// ---------------------------------------------------------------------------
// SAFETY GUARD CONSTANTS (TASK A). Generous testnet defaults; tune here.
// These are denominated in USDC-equivalent human units (NOT base units).
// ---------------------------------------------------------------------------

/** Hard ceiling on a single write transaction's amount. */
const PER_TX_CAP = 100_000
/** Rolling 24h cap per (date, address). */
const DAILY_CAP = 250_000
/** Max allowed slippage in basis points (5%). */
const MAX_SLIPPAGE_BPS = 500
/** Default slippage when none / invalid supplied. */
const DEFAULT_SLIPPAGE_BPS = 50

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
  appKit: string
}

/** Resolve a registry-backed ChainInfo from any loose chain reference. */
function resolveChain(rawChain: unknown): ChainInfo {
  const entry = resolveChainRef(rawChain)
  const viem = entry.isArc ? arcTestnet : toViemChain(entry)
  return {
    entry,
    viem,
    wagmiId: entry.chainId,
    appKit: toAppKitChain(entry) ?? 'Arc_Testnet',
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

/** Clamp + validate slippage bps into [0, MAX_SLIPPAGE_BPS]. */
function clampSlippage(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SLIPPAGE_BPS
  return Math.min(Math.floor(n), MAX_SLIPPAGE_BPS)
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
          // GUARD: slippage clamp (App Kit computes its own minOut, so we
          // enforce the cap on the REQUESTED value and surface it). This MUST go
          // under `config` — a top-level slippageBps is ignored by the SDK and
          // it silently falls back to its looser 300 bps default.
          const slippageBps = clampSlippage(input.slippageBps)
          // GUARD: chain resolved via registry (swap stays on its chain; Arc default).
          const swapChain = resolveChain(input.chain)
          const chain = swapChain.appKit
          // App Kit's swap endpoint expects amountIn in BASE UNITS (unlike its
          // estimate/bridge/send paths, which take human units — an SDK quirk).
          // A human "1" sent verbatim is read as 1 base unit = dust and the swap
          // reverts. Convert using the input token's decimals (Arc USDC/EURC = 6).
          const decimals =
            getToken(swapChain.entry.chainId, tokenIn.toUpperCase() as TokenSymbol)?.decimals ?? 6
          let amountInBase: string
          try {
            amountInBase = parseUnits(amount.replace(/,/g, '').trim() as `${number}`, decimals).toString()
          } catch {
            return failWith('Invalid swap amount', 'validation', 'Enter a positive decimal amount, e.g. 1 or 0.5.')
          }
          const r = await kit.swap({
            from: { adapter, chain },
            tokenIn,
            tokenOut,
            amountIn: amountInBase,
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
          // opaque string enums). Reject same-chain bridges.
          const fromEntry = resolveChain(input.fromChain).entry
          const toEntry = resolveChain(input.toChain).entry
          if (fromEntry.chainId === toEntry.chainId) {
            return failWith(
              'Source and destination chains are the same',
              'validation',
              'Pick two different chains to bridge between.',
            )
          }
          const fromChain = toAppKitChain(fromEntry) ?? 'Arc_Testnet'
          const toChain = toAppKitChain(toEntry) ?? 'Arc_Testnet'
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
            explorerUrl: anyHash?.explorerUrl ?? explorerFor(hash, fromEntry.isArc ? arcTestnet : toViemChain(fromEntry)),
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
          // can reject sends to the token contract itself.
          const sendChain = resolveChain(input.chain)
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
          const connection =
            config.state.connections.get(config.state.current ?? '') ??
            Array.from(config.state.connections.values())[0]
          const connector = connection?.connector ?? config.connectors[0]
          if (!connector) return failWith('No wallet connector', 'wallet_not_connected', 'Connect a wallet first.')
          const provider = (await connector.getProvider()) as {
            request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
          }
          try {
            await provider.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: numberToHex(arcTestnet.id) }],
            })
          } catch {
            // already on chain or rejected
          }
          const account = (address ?? connection?.accounts[0]) as Address | undefined
          if (!account) return failWith('No active wallet account', 'wallet_not_connected', 'Connect or unlock your wallet.')
          const walletClient = createWalletClient({
            account,
            chain: arcTestnet,
            transport: custom(provider as unknown as Parameters<typeof custom>[0]),
          })
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
