import type { PriceEntry } from "@/app/api/prices/route";

type CoinGeckoSimplePrice = Record<
  string,
  { usd?: number; usd_24h_change?: number }
>;

/**
 * DefiLlama coins API response. Keyed by the query coin id
 * (e.g. "coingecko:usd-coin" or "{chain}:{address}").
 */
type LlamaCoinsResponse = {
  coins?: Record<
    string,
    { price?: number; symbol?: string; decimals?: number; timestamp?: number }
  >;
};

const SYMBOL_TO_ID: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  WETH: "weth",
  USDC: "usd-coin",
  USDT: "tether",
  DAI: "dai",
  EURC: "euro-coin",
  SOL: "solana",
  MATIC: "matic-network",
  POL: "matic-network",
  ARB: "arbitrum",
  OP: "optimism",
  BASE: "base",
  AVAX: "avalanche-2",
  BNB: "binancecoin",
  LINK: "chainlink",
  UNI: "uniswap",
  AAVE: "aave",
};

export type GetPricesArgs = { symbols: string[] };

export type GetPricesResult =
  | { ok: true; prices: Record<string, PriceEntry & { id: string }> }
  | { ok: false; error: string };

/** Map a (mainnet) registry chainId to its DefiLlama chain slug. */
const CHAIN_ID_TO_LLAMA: Record<number, string> = {
  1: "ethereum",
  8453: "base",
  42161: "arbitrum",
  10: "optimism",
  137: "polygon",
  43114: "avax",
  130: "unichain",
  59144: "linea",
};

/** Resolve a symbol to its CoinGecko id (falls back to lowercased symbol). */
export function symbolToCoingeckoId(symbol: string): string {
  const upper = symbol.toUpperCase();
  return SYMBOL_TO_ID[upper] ?? symbol.toLowerCase();
}

/**
 * Fetch USD spot + 24h change for a set of symbols via CoinGecko. KEEPS the
 * legacy Record-keyed-by-symbol shape so existing callers (/api/prices,
 * /api/tools, the get_prices execute) keep working.
 */
export async function getPrices(
  args: GetPricesArgs,
): Promise<GetPricesResult> {
  try {
    if (!args.symbols || args.symbols.length === 0) {
      return { ok: false, error: "no symbols provided" };
    }

    const mapping = args.symbols.map((sym) => {
      const upper = sym.toUpperCase();
      const id = SYMBOL_TO_ID[upper] ?? sym.toLowerCase();
      return { symbol: upper, id };
    });

    const ids = Array.from(new Set(mapping.map((m) => m.id)));
    const url = new URL("https://api.coingecko.com/api/v3/simple/price");
    url.searchParams.set("ids", ids.join(","));
    url.searchParams.set("vs_currencies", "usd");
    url.searchParams.set("include_24hr_change", "true");

    const res = await fetch(url.toString(), {
      next: { revalidate: 30 },
      headers: { accept: "application/json" },
    });

    if (!res.ok) {
      return { ok: false, error: `CoinGecko responded ${res.status}` };
    }

    const json = (await res.json()) as CoinGeckoSimplePrice;
    const out: Record<string, PriceEntry & { id: string }> = {};
    for (const { symbol, id } of mapping) {
      const entry = json[id];
      if (!entry) continue;
      out[symbol] = {
        id,
        usd: typeof entry.usd === "number" ? entry.usd : null,
        change24h:
          typeof entry.usd_24h_change === "number"
            ? entry.usd_24h_change
            : null,
      };
    }
    return { ok: true, prices: out };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Live single-token pricing helper (used by the portfolio).
// ---------------------------------------------------------------------------

export interface TokenPrice {
  usd: number | null;
  change24hPct: number | null;
}

export interface PriceTokenArgs {
  /** Token symbol (preferred — uses CoinGecko by id). */
  symbol?: string;
  /** Optional explicit CoinGecko id. */
  coingeckoId?: string;
  /** Token contract address (used for DefiLlama chain:address fallback). */
  address?: string;
  /** Chain id the address lives on (for the DefiLlama chain slug). */
  chainId?: number;
}

const EMPTY_PRICE: TokenPrice = { usd: null, change24hPct: null };

/** Stablecoin symbols we can value at $1 if every live source fails. */
const USD_STABLE = new Set(["USDC", "USDT", "DAI"]);

/**
 * Price a single token by symbol or address. Tries CoinGecko by id first
 * (gives 24h change), then DefiLlama coins (by coingecko id, then chain:address)
 * for the spot price. As a last resort, USD-pegged stables fall back to $1.
 * Always resolves (never throws); returns nulls when nothing is found.
 */
export async function priceToken(args: PriceTokenArgs): Promise<TokenPrice> {
  const symbol = args.symbol?.toUpperCase();
  const cgId = args.coingeckoId ?? (symbol ? symbolToCoingeckoId(symbol) : undefined);

  // 1) CoinGecko by id — best because it carries 24h change.
  if (cgId) {
    try {
      const url = new URL("https://api.coingecko.com/api/v3/simple/price");
      url.searchParams.set("ids", cgId);
      url.searchParams.set("vs_currencies", "usd");
      url.searchParams.set("include_24hr_change", "true");
      const res = await fetch(url.toString(), {
        next: { revalidate: 30 },
        headers: { accept: "application/json" },
      });
      if (res.ok) {
        const json = (await res.json()) as CoinGeckoSimplePrice;
        const entry = json[cgId];
        if (entry && typeof entry.usd === "number") {
          return {
            usd: entry.usd,
            change24hPct:
              typeof entry.usd_24h_change === "number"
                ? entry.usd_24h_change
                : null,
          };
        }
      }
    } catch {
      // fall through to DefiLlama
    }
  }

  // 2) DefiLlama coins — by coingecko id, then by chain:address.
  const llamaKeys: string[] = [];
  if (cgId) llamaKeys.push(`coingecko:${cgId}`);
  if (args.address && args.chainId !== undefined) {
    const slug = CHAIN_ID_TO_LLAMA[args.chainId];
    if (slug) llamaKeys.push(`${slug}:${args.address}`);
  }
  for (const key of llamaKeys) {
    try {
      const res = await fetch(
        `https://coins.llama.fi/prices/current/${encodeURIComponent(key)}`,
        { next: { revalidate: 60 }, headers: { accept: "application/json" } },
      );
      if (!res.ok) continue;
      const json = (await res.json()) as LlamaCoinsResponse;
      const coin = json.coins?.[key];
      if (coin && typeof coin.price === "number") {
        return { usd: coin.price, change24hPct: null };
      }
    } catch {
      // try next key
    }
  }

  // 3) Last-resort peg for USD stablecoins.
  if (symbol && USD_STABLE.has(symbol)) {
    return { usd: 1, change24hPct: 0 };
  }

  return { ...EMPTY_PRICE };
}

/**
 * Batch-price several distinct symbols in one CoinGecko call, returning a map
 * keyed by UPPER-CASE symbol. Falls back to per-token pricing for symbols the
 * batch call could not resolve. Used by the portfolio to value holdings.
 */
export async function priceSymbols(
  symbols: string[],
): Promise<Record<string, TokenPrice>> {
  const out: Record<string, TokenPrice> = {};
  const unique = Array.from(new Set(symbols.map((s) => s.toUpperCase())));
  if (unique.length === 0) return out;

  const res = await getPrices({ symbols: unique });
  if (res.ok) {
    for (const sym of unique) {
      const entry = res.prices[sym];
      if (entry) {
        out[sym] = { usd: entry.usd, change24hPct: entry.change24h };
      }
    }
  }

  // Fill any gaps (incl. peg fallback for stables) via single-token pricing.
  const missing = unique.filter((s) => !(s in out) || out[s].usd === null);
  await Promise.all(
    missing.map(async (s) => {
      out[s] = await priceToken({ symbol: s });
    }),
  );

  return out;
}
