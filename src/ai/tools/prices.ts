import { headers } from "next/headers";
import type { PricesResponse, PriceEntry } from "@/app/api/prices/route";

async function baseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

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

    const ids = Array.from(new Set(mapping.map((m) => m.id))).join(",");
    const url = `${await baseUrl()}/api/prices?ids=${encodeURIComponent(ids)}`;
    const res = await fetch(url, { next: { revalidate: 30 } });
    const json = (await res.json()) as PricesResponse;
    if (!json.ok) return json;

    const out: Record<string, PriceEntry & { id: string }> = {};
    for (const { symbol, id } of mapping) {
      const entry = json.prices[id];
      if (entry) out[symbol] = { ...entry, id };
    }
    return { ok: true, prices: out };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { ok: false, error: message };
  }
}
