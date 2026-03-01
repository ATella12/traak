export type SearchSort = "volume_24hr" | "liquidity" | "ending_soon" | "newest";
export type SearchEventsStatus = "active" | "resolved" | "all";

export type SearchV2Params = {
  q: string;
  type?: "events";
  eventsStatus?: SearchEventsStatus;
  page?: number;
  limitPerType?: number;
  sort?: SearchSort;
  optimized?: boolean;
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
  volume?: number;
  liquidity?: number;
  outcomes: string[];
  outcomePrices: number[];
};

export type SearchEventResult = {
  eventId: string;
  eventTitle?: string;
  eventSlug?: string;
  eventImage?: string;
  eventIcon?: string;
  tag?: string;
  primaryMarket: SearchMarketResult;
};

export type SearchEventsPage = {
  events: SearchEventResult[];
  hasMore: boolean;
  totalResults?: number;
};

type GammaTag = {
  label?: string;
  forceHide?: boolean;
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
  outcomes?: string | string[];
  outcomePrices?: string | number[];
};

type GammaEvent = {
  id?: string | number;
  title?: string;
  slug?: string;
  icon?: string;
  image?: string;
  tags?: GammaTag[];
  markets?: GammaMarket[];
};

type SearchV2Response = {
  events?: GammaEvent[];
  pagination?: {
    hasMore?: boolean;
    totalResults?: number;
  };
};

type FetchLike = typeof fetch;

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";
const DEFAULT_LIMIT_PER_TYPE = 20;

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

const parseStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
      }
    } catch {
      return [];
    }
  }
  return [];
};

const parseNumberArray = (value: unknown): number[] => {
  if (Array.isArray(value)) {
    return value.map((item) => toFiniteNumber(item)).filter((item): item is number => typeof item === "number");
  }
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => toFiniteNumber(item)).filter((item): item is number => typeof item === "number");
      }
    } catch {
      return [];
    }
  }
  return [];
};

const toMarketResult = (market: GammaMarket): SearchMarketResult | null => {
  const marketId = typeof market.id === "string" || typeof market.id === "number" ? String(market.id) : undefined;
  const question = toStringOrUndefined(market.question);
  const slug = toStringOrUndefined(market.slug);
  if (!marketId || !question || !slug) return null;

  return {
    marketId,
    question,
    slug,
    conditionId: toStringOrUndefined(market.conditionId),
    active: coerceBoolean(market.active, false),
    closed: coerceBoolean(market.closed, false),
    endDate: toStringOrUndefined(market.endDate),
    volume: toFiniteNumber(market.volumeNum ?? market.volume),
    liquidity: toFiniteNumber(market.liquidityNum ?? market.liquidity),
    outcomes: parseStringArray(market.outcomes),
    outcomePrices: parseNumberArray(market.outcomePrices),
  };
};

const isYesNoMarket = (market: SearchMarketResult): boolean => {
  if (market.outcomes.length !== 2) return false;
  const outcomes = market.outcomes.map((item) => item.trim().toLowerCase());
  return outcomes.includes("yes") && outcomes.includes("no");
};

const depthScore = (market: SearchMarketResult): number => {
  if (typeof market.liquidity === "number") return market.liquidity;
  if (typeof market.volume === "number") return market.volume;
  return 0;
};

export const pickPrimaryMarket = (markets: SearchMarketResult[]): SearchMarketResult | null => {
  if (markets.length === 0) return null;
  const yesNo = markets.filter(isYesNoMarket);
  const pool = yesNo.length > 0 ? yesNo : markets;
  return [...pool].sort((a, b) => depthScore(b) - depthScore(a))[0] ?? null;
};

export const buildSearchV2Url = (params: Omit<SearchV2Params, "signal">): URL => {
  const url = new URL("/search-v2", GAMMA_BASE_URL);
  url.searchParams.set("q", params.q);
  url.searchParams.set("type", params.type ?? "events");
  url.searchParams.set("events_status", params.eventsStatus ?? "active");
  url.searchParams.set("page", String(params.page ?? 1));
  url.searchParams.set("limit_per_type", String(params.limitPerType ?? DEFAULT_LIMIT_PER_TYPE));
  if (params.sort) url.searchParams.set("sort", params.sort);
  url.searchParams.set("optimized", String(params.optimized ?? false));
  return url;
};

const pickTag = (tags: GammaTag[] | undefined): string | undefined => {
  if (!Array.isArray(tags)) return undefined;
  const firstVisible = tags.find((tag) => tag.forceHide !== true && typeof tag.label === "string");
  return toStringOrUndefined(firstVisible?.label);
};

export const normalizeSearchV2Response = (payload: unknown): SearchEventsPage => {
  const safePayload = (payload ?? {}) as SearchV2Response;
  const events = Array.isArray(safePayload.events) ? safePayload.events : [];
  const normalized: SearchEventResult[] = [];

  for (const event of events) {
    const eventId = typeof event.id === "string" || typeof event.id === "number" ? String(event.id) : undefined;
    if (!eventId) continue;

    const markets = (Array.isArray(event.markets) ? event.markets : [])
      .map(toMarketResult)
      .filter((item): item is SearchMarketResult => item !== null);

    const primaryMarket = pickPrimaryMarket(markets);
    if (!primaryMarket) continue;

    normalized.push({
      eventId,
      eventTitle: toStringOrUndefined(event.title),
      eventSlug: toStringOrUndefined(event.slug),
      eventImage: toStringOrUndefined(event.image),
      eventIcon: toStringOrUndefined(event.icon),
      tag: pickTag(event.tags),
      primaryMarket,
    });
  }

  return {
    events: normalized,
    hasMore: safePayload.pagination?.hasMore === true,
    totalResults: toFiniteNumber(safePayload.pagination?.totalResults),
  };
};

export const searchV2 = async (
  params: SearchV2Params,
  fetchImpl: FetchLike = fetch,
): Promise<SearchEventsPage> => {
  const url = buildSearchV2Url(params);
  const response = await fetchImpl(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: params.signal,
  });

  if (!response.ok) {
    throw new Error(`Gamma search-v2 failed with status ${response.status}`);
  }

  const payload: unknown = await response.json();
  return normalizeSearchV2Response(payload);
};
