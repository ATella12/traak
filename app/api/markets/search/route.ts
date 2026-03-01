import { NextRequest, NextResponse } from "next/server";

import {
  searchV2,
  type SearchEventsPage,
  type SearchEventResult,
  type SearchEventsStatus,
  type SearchSort,
} from "@/src/lib/gammaSearch";

type SearchResponse = {
  q: string;
  page: number;
  stale: boolean;
  error?: string;
  hasMore: boolean;
  totalResults?: number;
  results: SearchEventResult[];
};

type CachedSearch = {
  expiresAt: number;
  payload: SearchEventsPage;
};

const CACHE_TTL_MS = 60_000;
const DEFAULT_LIMIT_PER_TYPE = 20;
const MAX_LIMIT_PER_TYPE = 50;
const cache = new Map<string, CachedSearch>();

const allowedSorts: SearchSort[] = ["volume_24hr", "liquidity", "ending_soon", "newest"];
const allowedStatuses: SearchEventsStatus[] = ["active", "resolved", "all"];

const clampLimit = (value: string | null): number => {
  const parsed = Number(value ?? String(DEFAULT_LIMIT_PER_TYPE));
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT_PER_TYPE;
  return Math.min(Math.max(Math.floor(parsed), 1), MAX_LIMIT_PER_TYPE);
};

const clampPage = (value: string | null): number => {
  const parsed = Number(value ?? "1");
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.floor(parsed));
};

const parseSort = (value: string | null): SearchSort | undefined => {
  if (!value) return undefined;
  return allowedSorts.includes(value as SearchSort) ? (value as SearchSort) : undefined;
};

const parseStatus = (value: string | null): SearchEventsStatus => {
  if (!value) return "active";
  return allowedStatuses.includes(value as SearchEventsStatus) ? (value as SearchEventsStatus) : "active";
};

const toSearchResponse = (payload: SearchResponse, status = 200) => NextResponse.json(payload, { status });

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const page = clampPage(searchParams.get("page"));
  const limitPerType = clampLimit(searchParams.get("limit_per_type"));
  const eventsStatus = parseStatus(searchParams.get("events_status"));
  const sort = parseSort(searchParams.get("sort"));
  const optimized = (searchParams.get("optimized") ?? "false").toLowerCase() === "true";

  if (q.length < 2) {
    return toSearchResponse({ q, page, results: [], stale: false, hasMore: false });
  }

  const cacheKey = [q.toLowerCase(), page, limitPerType, eventsStatus, sort ?? "", optimized ? "1" : "0"].join("|");
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return toSearchResponse({
      q,
      page,
      stale: false,
      hasMore: cached.payload.hasMore,
      totalResults: cached.payload.totalResults,
      results: cached.payload.events,
    });
  }

  try {
    const payload = await searchV2(
      {
        q,
        type: "events",
        eventsStatus,
        page,
        limitPerType,
        sort,
        optimized,
        signal: request.signal,
      },
    );
    cache.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, payload });
    return toSearchResponse({
      q,
      page,
      stale: false,
      hasMore: payload.hasMore,
      totalResults: payload.totalResults,
      results: payload.events,
    });
  } catch (error) {
    const lastCached = cache.get(cacheKey);
    if (lastCached) {
      return toSearchResponse({
        q,
        page,
        stale: true,
        error: "Live search failed. Showing recent cached results. Retry to refresh.",
        hasMore: lastCached.payload.hasMore,
        totalResults: lastCached.payload.totalResults,
        results: lastCached.payload.events,
      });
    }

    if (error instanceof Error && error.name === "AbortError") {
      return toSearchResponse({ q, page, stale: false, error: "Search request was canceled.", hasMore: false, results: [] }, 499);
    }

    return toSearchResponse({ q, page, stale: false, error: "Live search is unavailable. Please retry.", hasMore: false, results: [] }, 502);
  }
}
