import { NextResponse } from "next/server";

export const revalidate = 300;

type LlamaPool = {
  project: string;
  symbol: string;
  chain: string;
  apy: number | null;
  tvlUsd: number | null;
  stablecoin: boolean;
};

type LlamaResponse = {
  status: string;
  data: LlamaPool[];
};

export type YieldPool = {
  project: string;
  symbol: string;
  chain: string;
  apy: number;
  tvlUsd: number;
};

export type YieldResponse =
  | { ok: true; pools: YieldPool[] }
  | { ok: false; error: string };

export async function GET(): Promise<NextResponse<YieldResponse>> {
  try {
    const res = await fetch("https://yields.llama.fi/pools", {
      next: { revalidate: 300 },
      headers: { accept: "application/json" },
    });

    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        error: `DefiLlama responded ${res.status}`,
      });
    }

    const json = (await res.json()) as LlamaResponse;
    if (!json?.data || !Array.isArray(json.data)) {
      return NextResponse.json({
        ok: false,
        error: "Malformed DefiLlama payload",
      });
    }

    const pools: YieldPool[] = json.data
      .filter(
        (p): p is LlamaPool & { apy: number; tvlUsd: number } =>
          p.stablecoin === true &&
          typeof p.apy === "number" &&
          typeof p.tvlUsd === "number" &&
          p.tvlUsd > 1_000_000,
      )
      .sort((a, b) => b.apy - a.apy)
      .slice(0, 20)
      .map((p) => ({
        project: p.project,
        symbol: p.symbol,
        chain: p.chain,
        apy: p.apy,
        tvlUsd: p.tvlUsd,
      }));

    return NextResponse.json({ ok: true, pools });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ ok: false, error: message });
  }
}
