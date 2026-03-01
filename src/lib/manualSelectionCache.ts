import type { SearchEventRow, SearchMarketResult } from "@/src/lib/gammaSearch";

type CachedSelection = {
  event: SearchEventRow;
  markets: SearchMarketResult[];
  savedAt: number;
};

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, CachedSelection>();

export const setManualSelectionCache = (eventSlug: string, payload: { event: SearchEventRow; markets: SearchMarketResult[] }) => {
  cache.set(eventSlug, { ...payload, savedAt: Date.now() });
};

export const getManualSelectionCache = (eventSlug: string): CachedSelection | null => {
  const cached = cache.get(eventSlug);
  if (!cached) return null;
  if (Date.now() - cached.savedAt > CACHE_TTL_MS) {
    cache.delete(eventSlug);
    return null;
  }
  return cached;
};
