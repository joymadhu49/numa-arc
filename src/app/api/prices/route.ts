import { NextRequest, NextResponse } from "next/server";

export const revalidate = 30;

type CoinGeckoSimplePrice = Record<
  string,
  { usd?: number; usd_24h_change?: number }
>;

export type PriceEntry = {
  usd: number | null;
  change24h: number | null;
};

export type PricesResponse =
  | { ok: true; prices: Record<string, PriceEntry> }
  | { ok: false; error: string };

export async function GET(
  req: NextRequest,
): Promise<NextResponse<PricesResponse>> {
  try {
    const idsParam = req.nextUrl.searchParams.get("ids");
    if (!idsParam) {
      return NextResponse.json({ ok: false, error: "missing ids param" });
    }

    const ids = idsParam
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (ids.length === 0) {
      return NextResponse.json({ ok: false, error: "empty ids list" });
    }

    const url = new URL("https://api.coingecko.com/api/v3/simple/price");
    url.searchParams.set("ids", ids.join(","));
    url.searchParams.set("vs_currencies", "usd");
    url.searchParams.set("include_24hr_change", "true");

    const res = await fetch(url.toString(), {
      next: { revalidate: 30 },
      headers: { accept: "application/json" },
    });

    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        error: `CoinGecko responded ${res.status}`,
      });
    }

    const json = (await res.json()) as CoinGeckoSimplePrice;
    const prices: Record<string, PriceEntry> = {};
    for (const id of ids) {
      const entry = json[id];
      prices[id] = {
        usd: typeof entry?.usd === "number" ? entry.usd : null,
        change24h:
          typeof entry?.usd_24h_change === "number"
            ? entry.usd_24h_change
            : null,
      };
    }

    return NextResponse.json({ ok: true, prices });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ ok: false, error: message });
  }
}
