import { headers } from "next/headers";
import type {
  TrendingResponse,
  TrendingToken,
} from "@/app/api/trending/route";

async function baseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export type GetTrendingResult =
  | { ok: true; tokens: TrendingToken[] }
  | { ok: false; error: string };

export async function getTrending(): Promise<GetTrendingResult> {
  try {
    const url = `${await baseUrl()}/api/trending`;
    const res = await fetch(url, { next: { revalidate: 60 } });
    const json = (await res.json()) as TrendingResponse;
    return json;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { ok: false, error: message };
  }
}
