import { headers } from "next/headers";
import type { YieldResponse, YieldPool } from "@/app/api/yield/route";

async function baseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

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
    const url = `${await baseUrl()}/api/yield`;
    const res = await fetch(url, { next: { revalidate: 300 } });
    const json = (await res.json()) as YieldResponse;
    if (!json.ok) return json;

    let pools = json.pools;
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
