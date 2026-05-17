import { NextResponse } from "next/server";

export const revalidate = 60;

type CoinGeckoTrendingItem = {
  item: {
    id: string;
    coin_id: number;
    name: string;
    symbol: string;
    market_cap_rank: number | null;
    data?: {
      price?: number | string;
      price_change_percentage_24h?: { usd?: number };
      market_cap?: string;
    };
  };
};

type CoinGeckoTrendingResponse = {
  coins: CoinGeckoTrendingItem[];
};

export type TrendingToken = {
  id: string;
  symbol: string;
  name: string;
  price: number | null;
  change24h: number | null;
  marketCap: string | null;
};

export type TrendingResponse =
  | { ok: true; tokens: TrendingToken[] }
  | { ok: false; error: string };

function toNumber(v: number | string | undefined): number | null {
  if (v === undefined || v === null) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

export async function GET(): Promise<NextResponse<TrendingResponse>> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/search/trending",
      {
        next: { revalidate: 60 },
        headers: { accept: "application/json" },
      },
    );

    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        error: `CoinGecko responded ${res.status}`,
      });
    }

    const json = (await res.json()) as CoinGeckoTrendingResponse;
    if (!json?.coins || !Array.isArray(json.coins)) {
      return NextResponse.json({
        ok: false,
        error: "Malformed CoinGecko payload",
      });
    }

    const tokens: TrendingToken[] = json.coins.map(({ item }) => ({
      id: item.id,
      symbol: item.symbol.toUpperCase(),
      name: item.name,
      price: toNumber(item.data?.price),
      change24h: item.data?.price_change_percentage_24h?.usd ?? null,
      marketCap: item.data?.market_cap ?? null,
    }));

    return NextResponse.json({ ok: true, tokens });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ ok: false, error: message });
  }
}
