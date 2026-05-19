import type { YieldPool } from "@/app/api/yield/route";

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

export type GetYieldArgs = {
  symbol?: string;
  chain?: string;
};

export type GetYieldResult =
  | { ok: true; pools: YieldPool[] }
  | { ok: false; error: string };

export async function getYield(
  args: GetYieldArgs = {},
): Promise<GetYieldResult> {
  try {
    const res = await fetch("https://yields.llama.fi/pools", {
      next: { revalidate: 300 },
      headers: { accept: "application/json" },
    });

    if (!res.ok) {
      return { ok: false, error: `DefiLlama responded ${res.status}` };
    }

    const json = (await res.json()) as LlamaResponse;
    if (!json?.data || !Array.isArray(json.data)) {
      return { ok: false, error: "Malformed DefiLlama payload" };
    }

    let pools: YieldPool[] = json.data
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

    if (args.symbol) {
      const s = args.symbol.toUpperCase();
      pools = pools.filter((p) => p.symbol.toUpperCase().includes(s));
    }
    if (args.chain) {
      const c = args.chain.toLowerCase();
      pools = pools.filter((p) => p.chain.toLowerCase() === c);
    }
    return { ok: true, pools };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { ok: false, error: message };
  }
}
