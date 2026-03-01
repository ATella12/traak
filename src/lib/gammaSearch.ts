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

export type SearchTag = {
  label: string;
  slug: string;
};

export type SearchMarketResult = {
  marketId: string;
  question: string;
  slug: string;
  conditionId: string;
  groupItemTitle?: string;
  outcomes: string[];
  outcomePrices: number[];
  active: boolean;
  closed: boolean;
  endDate?: string;
  bestBid?: number;
  bestAsk?: number;
  volumeNum?: number;
  liquidityNum?: number;
  volume24hr?: number;
  probabilityYes?: number;
};

export type SearchEventRow = {
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  image?: string;
  icon?: string;
  tags: SearchTag[];
  primaryCategoryLine: string;
  endsInText: string;
  endDate?: string;
  liquidity?: number;
  volume?: number;
  volume24hr?: number;
  status: "active" | "resolved" | "closed" | "unknown";
  displayMarket: SearchMarketResult;
};

export type SearchEventsPage = {
  events: SearchEventRow[];
  hasMore: boolean;
  totalResults?: number;
};

export type SearchEventDetail = {
  event: SearchEventRow;
  markets: SearchMarketResult[];
};

export type SearchV2Response = {
  events?: GammaEvent[];
  pagination?: {
    hasMore?: boolean;
    totalResults?: number;
  };
};

type GammaTag = {
  label?: string;
  slug?: string;
  forceHide?: boolean;
};

type GammaMarket = {
  id?: string | number;
  question?: string;
  slug?: string;
  conditionId?: string;
  groupItemTitle?: string;
  active?: boolean;
  closed?: boolean;
  endDate?: string;
  volume?: number | string;
  volumeNum?: number;
  liquidity?: number | string;
  liquidityNum?: number;
  volume24hr?: number | string;
  outcomes?: string | string[];
  outcomePrices?: string | number[];
  bestBid?: number | string;
  bestAsk?: number | string;
};

type GammaEvent = {
  id?: string | number;
  title?: string;
  slug?: string;
  icon?: string;
  image?: string;
  active?: boolean;
  closed?: boolean;
  endDate?: string;
  liquidity?: number | string;
  volume?: number | string;
  volume24hr?: number | string;
  tags?: GammaTag[];
  markets?: GammaMarket[];
};

type FetchLike = typeof fetch;

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";
const DEFAULT_LIMIT_PER_TYPE = 20;

const TOP_LEVEL_TAG_SLUGS = new Set([
  "sports",
  "politics",
  "crypto",
  "finance",
  "world",
  "news",
  "culture",
  "technology",
]);

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

const toNormalizedText = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

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

export const parseOutcomePrices = (value: unknown): number[] => parseNumberArray(value);

const parseProbabilityYes = (market: GammaMarket): number | undefined => {
  const prices = parseOutcomePrices(market.outcomePrices);
  const yesPrice = prices[0];
  if (typeof yesPrice !== "number" || !Number.isFinite(yesPrice)) return undefined;
  if (yesPrice < 0) return 0;
  if (yesPrice > 1) return 1;
  return yesPrice;
};

const parseOutcomes = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string");
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
    conditionId: toStringOrUndefined(market.conditionId) ?? "",
    groupItemTitle: toStringOrUndefined(market.groupItemTitle),
    outcomes: parseOutcomes(market.outcomes),
    outcomePrices: parseOutcomePrices(market.outcomePrices),
    active: coerceBoolean(market.active, false),
    closed: coerceBoolean(market.closed, false),
    endDate: toStringOrUndefined(market.endDate),
    bestBid: toFiniteNumber(market.bestBid),
    bestAsk: toFiniteNumber(market.bestAsk),
    volumeNum: toFiniteNumber(market.volumeNum ?? market.volume),
    liquidityNum: toFiniteNumber(market.liquidityNum ?? market.liquidity),
    volume24hr: toFiniteNumber(market.volume24hr),
    probabilityYes: parseProbabilityYes(market),
  };
};

const isDrawMarket = (market: SearchMarketResult): boolean => {
  const groupTitle = toNormalizedText(market.groupItemTitle ?? "");
  const question = toNormalizedText(market.question);
  return groupTitle.includes("draw") || question.includes("end in a draw");
};

const compareMarketCandidates = (a: SearchMarketResult, b: SearchMarketResult): number => {
  const aVolumeScore = a.volume24hr ?? a.volumeNum ?? -1;
  const bVolumeScore = b.volume24hr ?? b.volumeNum ?? -1;
  if (bVolumeScore !== aVolumeScore) return bVolumeScore - aVolumeScore;

  const aLiquidityScore = a.liquidityNum ?? -1;
  const bLiquidityScore = b.liquidityNum ?? -1;
  if (bLiquidityScore !== aLiquidityScore) return bLiquidityScore - aLiquidityScore;

  const aDist = typeof a.probabilityYes === "number" ? Math.abs(a.probabilityYes - 0.5) : Number.POSITIVE_INFINITY;
  const bDist = typeof b.probabilityYes === "number" ? Math.abs(b.probabilityYes - 0.5) : Number.POSITIVE_INFINITY;
  if (aDist !== bDist) return aDist - bDist;

  return 0;
};

export const pickDisplayMarket = (markets: SearchMarketResult[]): SearchMarketResult | null => {
  if (markets.length === 0) return null;
  const nonDraw = markets.filter((market) => !isDrawMarket(market));
  const candidates = nonDraw.length > 0 ? nonDraw : markets;
  return [...candidates].sort(compareMarketCandidates)[0] ?? null;
};

export const sortMarketsForEvent = (markets: SearchMarketResult[]): SearchMarketResult[] =>
  [...markets].sort((a, b) => {
    const aProbability = typeof a.probabilityYes === "number" ? a.probabilityYes : -1;
    const bProbability = typeof b.probabilityYes === "number" ? b.probabilityYes : -1;
    if (bProbability !== aProbability) return bProbability - aProbability;

    const aVolume = a.volume24hr ?? a.volumeNum ?? -1;
    const bVolume = b.volume24hr ?? b.volumeNum ?? -1;
    if (bVolume !== aVolume) return bVolume - aVolume;

    const aLiquidity = a.liquidityNum ?? -1;
    const bLiquidity = b.liquidityNum ?? -1;
    return bLiquidity - aLiquidity;
  });

export const buildCategoryLine = (tags: SearchTag[]): string => {
  if (tags.length === 0) return "";

  const top = tags.find((tag) => TOP_LEVEL_TAG_SLUGS.has(tag.slug.toLowerCase()));
  const sub = tags.find((tag) => {
    const slug = tag.slug.toLowerCase();
    if (top && slug === top.slug.toLowerCase()) return false;
    return !TOP_LEVEL_TAG_SLUGS.has(slug);
  });

  if (top && sub) return `${top.label}  ${sub.label}`;
  if (top) return top.label;
  if (sub) return sub.label;
  return tags[0]?.label ?? "";
};

export const formatEndsIn = (endDate: string | undefined, now = new Date()): string => {
  if (!endDate) return "";
  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return "";

  const diffMs = end.getTime() - now.getTime();
  if (diffMs <= 0) return "Ended";

  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 60) return `Ends in ${diffMinutes} minutes`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `Ends in about ${diffHours} hours`;

  const diffDays = Math.round(diffHours / 24);
  return `Ends in ${diffDays} days`;
};

const toSearchTags = (tags: GammaTag[] | undefined): SearchTag[] => {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((tag) => tag.forceHide !== true)
    .map((tag) => {
      const label = toStringOrUndefined(tag.label);
      const slug = toStringOrUndefined(tag.slug);
      if (!label || !slug) return null;
      return { label, slug };
    })
    .filter((tag): tag is SearchTag => tag !== null);
};

const deriveStatus = (event: GammaEvent): SearchEventRow["status"] => {
  const active = coerceBoolean(event.active, false);
  const closed = coerceBoolean(event.closed, false);
  if (active && !closed) return "active";
  if (closed) return "closed";
  if (!active && !closed) return "resolved";
  return "unknown";
};

const normalizeEventRow = (event: GammaEvent, now: Date): SearchEventDetail | null => {
  const eventId = typeof event.id === "string" || typeof event.id === "number" ? String(event.id) : undefined;
  const eventTitle = toStringOrUndefined(event.title);
  const eventSlug = toStringOrUndefined(event.slug);
  if (!eventId || !eventTitle || !eventSlug) return null;

  const markets = (Array.isArray(event.markets) ? event.markets : [])
    .map(toMarketResult)
    .filter((item): item is SearchMarketResult => item !== null);
  const sortedMarkets = sortMarketsForEvent(markets);
  const displayMarket = pickDisplayMarket(sortedMarkets);
  if (!displayMarket) return null;

  const tags = toSearchTags(event.tags);
  const endDate = toStringOrUndefined(event.endDate);

  return {
    event: {
      eventId,
      eventTitle,
      eventSlug,
      image: toStringOrUndefined(event.image),
      icon: toStringOrUndefined(event.icon),
      tags,
      primaryCategoryLine: buildCategoryLine(tags),
      endsInText: formatEndsIn(endDate, now),
      endDate,
      liquidity: toFiniteNumber(event.liquidity),
      volume: toFiniteNumber(event.volume),
      volume24hr: toFiniteNumber(event.volume24hr),
      status: deriveStatus(event),
      displayMarket,
    },
    markets: sortedMarkets,
  };
};

export const normalizeEventDetailResponse = (payload: unknown, now = new Date()): SearchEventDetail | null => {
  if (!Array.isArray(payload)) return null;
  const rawEvent = payload.find((item): item is GammaEvent => typeof item === "object" && item !== null);
  if (!rawEvent) return null;
  return normalizeEventRow(rawEvent, now);
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

export const normalizeSearchV2Response = (payload: unknown, now = new Date()): SearchEventsPage => {
  const safePayload = (payload ?? {}) as SearchV2Response;
  const events = Array.isArray(safePayload.events) ? safePayload.events : [];
  const normalized: SearchEventRow[] = [];

  for (const event of events) {
    const detail = normalizeEventRow(event, now);
    if (!detail) continue;
    normalized.push(detail.event);
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
