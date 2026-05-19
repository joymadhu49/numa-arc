import type { PriceEntry } from "@/app/api/prices/route";

type CoinGeckoSimplePrice = Record<
  string,
  { usd?: number; usd_24h_change?: number }
>;

const SYMBOL_TO_ID: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  USDC: "usd-coin",
  USDT: "tether",
  DAI: "dai",
  SOL: "solana",
  MATIC: "matic-network",
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
