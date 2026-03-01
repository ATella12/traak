import { NextRequest, NextResponse } from "next/server";

import { normalizeEventDetailResponse, type SearchEventDetail } from "@/src/lib/gammaSearch";

type EventResponse = {
  stale: boolean;
  error?: string;
  event?: SearchEventDetail["event"];
  markets: SearchEventDetail["markets"];
};

type CachedValue = {
  expiresAt: number;
  payload: SearchEventDetail;
};

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CachedValue>();

export async function GET(_request: NextRequest, context: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await context.params;
  const slug = (eventSlug ?? "").trim();
  if (!slug) {
    return NextResponse.json({ stale: false, error: "Missing event slug", markets: [] } satisfies EventResponse, { status: 400 });
  }

  const cached = cache.get(slug);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return NextResponse.json({ stale: false, event: cached.payload.event, markets: cached.payload.markets } satisfies EventResponse);
  }

  try {
    const response = await fetch(`https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(slug)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Gamma event fetch failed with status ${response.status}`);
    }

    const payload: unknown = await response.json();
    const normalized = normalizeEventDetailResponse(payload);
    if (!normalized) {
      return NextResponse.json({ stale: false, error: "Event not found", markets: [] } satisfies EventResponse, { status: 404 });
    }

    cache.set(slug, { expiresAt: now + CACHE_TTL_MS, payload: normalized });
    return NextResponse.json({ stale: false, event: normalized.event, markets: normalized.markets } satisfies EventResponse);
  } catch {
    if (cached) {
      return NextResponse.json({
        stale: true,
        error: "Live event lookup failed. Showing recent cached results.",
        event: cached.payload.event,
        markets: cached.payload.markets,
      } satisfies EventResponse);
    }
    return NextResponse.json({ stale: false, error: "Live event lookup is unavailable.", markets: [] } satisfies EventResponse, { status: 502 });
  }
}
