export type GammaEventsStatus = string | string[];

export type GammaPublicSearchParams = {
  q: string;
  limitPerType?: number;
  keepClosedMarkets?: boolean;
  eventsStatus?: GammaEventsStatus;
  sort?: string;
  ascending?: boolean;
  signal?: AbortSignal;
};

export type SearchMarketResult = {
  marketId: string;
  question: string;
  slug: string;
  conditionId?: string;
  active: boolean;
  closed: boolean;
  endDate?: string;
  eventId?: string;
  eventTitle?: string;
  eventSlug?: string;
  eventIcon?: string;
  volume?: number;
  liquidity?: number;
};

type GammaMarket = {
  id?: string | number;
  question?: string;
  slug?: string;
  conditionId?: string;
  active?: boolean;
  closed?: boolean;
  endDate?: string;
  volume?: number | string;
  volumeNum?: number;
  liquidity?: number | string;
  liquidityNum?: number;
};

type GammaEvent = {
  id?: string | number;
  title?: string;
  slug?: string;
  icon?: string;
  image?: string;
  markets?: GammaMarket[];
};

type GammaPublicSearchResponse = {
  events?: GammaEvent[];
};

type FetchLike = typeof fetch;

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";
const DEFAULT_LIMIT_PER_TYPE = 10;

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const coerceBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  return fallback;
};

const toStringOrUndefined = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

export const buildGammaPublicSearchUrl = (params: Omit<GammaPublicSearchParams, "signal">): URL => {
  const url = new URL("/public-search", GAMMA_BASE_URL);
  url.searchParams.set("q", params.q);
  url.searchParams.set("limit_per_type", String(params.limitPerType ?? DEFAULT_LIMIT_PER_TYPE));
  url.searchParams.set("keep_closed_markets", params.keepClosedMarkets === false ? "0" : "1");

  if (params.eventsStatus) {
    const value = Array.isArray(params.eventsStatus) ? params.eventsStatus.join(",") : params.eventsStatus;
    if (value.trim()) {
      url.searchParams.set("events_status", value);
    }
  }

  if (params.sort) {
    url.searchParams.set("sort", params.sort);
  }

  if (typeof params.ascending === "boolean") {
    url.searchParams.set("ascending", params.ascending ? "true" : "false");
  }

  return url;
};

export const normalizeGammaPublicSearchResponse = (payload: unknown): SearchMarketResult[] => {
  const safePayload = (payload ?? {}) as GammaPublicSearchResponse;
  const events = Array.isArray(safePayload.events) ? safePayload.events : [];
  const results: SearchMarketResult[] = [];
  const seen = new Set<string>();

  for (const event of events) {
    const eventId =
      typeof event.id === "string" || typeof event.id === "number" ? String(event.id) : undefined;
    const eventTitle = toStringOrUndefined(event.title);
    const eventSlug = toStringOrUndefined(event.slug);
    const eventIcon = toStringOrUndefined(event.icon) ?? toStringOrUndefined(event.image);
    const markets = Array.isArray(event.markets) ? event.markets : [];

    for (const market of markets) {
      const marketId =
        typeof market.id === "string" || typeof market.id === "number" ? String(market.id) : undefined;
      const question = toStringOrUndefined(market.question);
      const slug = toStringOrUndefined(market.slug);

      if (!marketId || !question || !slug) continue;
      if (seen.has(marketId)) continue;
      seen.add(marketId);

      results.push({
        marketId,
        question,
        slug,
        conditionId: toStringOrUndefined(market.conditionId),
        active: coerceBoolean(market.active, false),
        closed: coerceBoolean(market.closed, false),
        endDate: toStringOrUndefined(market.endDate),
        eventId,
        eventTitle,
        eventSlug,
        eventIcon,
        volume: toFiniteNumber(market.volumeNum ?? market.volume),
        liquidity: toFiniteNumber(market.liquidityNum ?? market.liquidity),
      });
    }
  }

  return results;
};

export const fetchGammaPublicSearch = async (
  params: GammaPublicSearchParams,
  fetchImpl: FetchLike = fetch,
): Promise<SearchMarketResult[]> => {
  const url = buildGammaPublicSearchUrl(params);
  const response = await fetchImpl(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: params.signal,
  });

  if (!response.ok) {
    throw new Error(`Gamma public-search failed with status ${response.status}`);
  }

  const payload: unknown = await response.json();
  return normalizeGammaPublicSearchResponse(payload);
};
