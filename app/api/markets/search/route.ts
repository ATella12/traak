import { NextRequest, NextResponse } from "next/server";

import { fetchGammaPublicSearch, type SearchMarketResult } from "@/src/lib/gammaSearch";

type SearchResponse = {
  q: string;
  stale: boolean;
  error?: string;
  results: SearchMarketResult[];
};

type CachedSearch = {
  expiresAt: number;
  results: SearchMarketResult[];
};

const CACHE_TTL_MS = 60_000;
const DEFAULT_LIMIT_PER_TYPE = 10;
const MAX_LIMIT_PER_TYPE = 50;
const cache = new Map<string, CachedSearch>();

const toBoolean = (value: string | null, fallback: boolean): boolean => {
  if (value === null) return fallback;
  if (value === "1" || value.toLowerCase() === "true") return true;
  if (value === "0" || value.toLowerCase() === "false") return false;
  return fallback;
};

const clampLimit = (value: string | null): number => {
  const parsed = Number(value ?? String(DEFAULT_LIMIT_PER_TYPE));
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT_PER_TYPE;
  return Math.min(Math.max(Math.floor(parsed), 1), MAX_LIMIT_PER_TYPE);
};

const toEventsStatus = (value: string | null): string | undefined => {
  if (!value) return undefined;
  const cleaned = value.trim();
  return cleaned || undefined;
};

const toSearchResponse = (payload: SearchResponse, status = 200) => NextResponse.json(payload, { status });

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limitPerType = clampLimit(searchParams.get("limit_per_type") ?? searchParams.get("limit"));
  const keepClosedMarkets = toBoolean(searchParams.get("keep_closed_markets"), true);
  const eventsStatus = toEventsStatus(searchParams.get("events_status"));
  const sort = searchParams.get("sort") ?? undefined;
  const ascendingRaw = searchParams.get("ascending");
  const ascending =
    ascendingRaw === null ? undefined : ascendingRaw === "1" || ascendingRaw.toLowerCase() === "true";

  if (q.length < 2) {
    return toSearchResponse({ q, results: [], stale: false });
  }

  const cacheKey = [q.toLowerCase(), limitPerType, keepClosedMarkets ? "1" : "0", eventsStatus ?? "", sort ?? "", String(ascending)].join("|");
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return toSearchResponse({ q, results: cached.results, stale: false });
  }

  try {
    const results = await fetchGammaPublicSearch({
      q,
      limitPerType,
      keepClosedMarkets,
      eventsStatus,
      sort,
      ascending,
      signal: request.signal,
    });
    cache.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, results });
    return toSearchResponse({ q, results, stale: false });
  } catch (error) {
    const lastCached = cache.get(cacheKey);
    if (lastCached) {
      return toSearchResponse({
        q,
        stale: true,
        error: "Live search failed. Showing recent cached results. Retry to refresh.",
        results: lastCached.results,
      });
    }

    if (error instanceof Error && error.name === "AbortError") {
      return toSearchResponse({ q, stale: false, error: "Search request was canceled.", results: [] }, 499);
    }

    return toSearchResponse({ q, stale: false, error: "Live search is unavailable. Please retry.", results: [] }, 502);
  }
}
