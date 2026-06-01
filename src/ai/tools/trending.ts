import type { TrendingToken } from "@/app/api/trending/route";

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

/**
 * Trending token enriched with `rank` (CoinGecko market_cap_rank). Extends the
 * route's TrendingToken shape so /api/trending consumers keep working while the
 * get_trending execute can map to the shared TrendingCardData contract.
 */
export type TrendingTokenWithRank = TrendingToken & {
  rank: number | null;
};

export type GetTrendingResult =
  | { ok: true; tokens: TrendingTokenWithRank[] }
  | { ok: false; error: string };

function toNumber(v: number | string | undefined): number | null {
  if (v === undefined || v === null) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

export async function getTrending(): Promise<GetTrendingResult> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/search/trending",
      {
        next: { revalidate: 60 },
        headers: { accept: "application/json" },
      },
    );

    if (!res.ok) {
      return { ok: false, error: `CoinGecko responded ${res.status}` };
    }

    const json = (await res.json()) as CoinGeckoTrendingResponse;
    if (!json?.coins || !Array.isArray(json.coins)) {
      return { ok: false, error: "Malformed CoinGecko payload" };
    }

    const tokens: TrendingTokenWithRank[] = json.coins.map(({ item }) => ({
      id: item.id,
      symbol: item.symbol.toUpperCase(),
      name: item.name,
      price: toNumber(item.data?.price),
      change24h: item.data?.price_change_percentage_24h?.usd ?? null,
      marketCap: item.data?.market_cap ?? null,
      rank: item.market_cap_rank,
    }));

    return { ok: true, tokens };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { ok: false, error: message };
  }
}
