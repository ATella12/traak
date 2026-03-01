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
  volume?: number;
  liquidity?: number;
  outcomes: string[];
  outcomePrices: number[];
  groupItemTitle?: string;
};

export type SearchEventResult = {
  eventId: string;
  eventTitle?: string;
  eventSlug?: string;
  eventImage?: string;
  eventIcon?: string;
  primaryMarket: SearchMarketResult;
  secondaryMarkets?: SearchMarketResult[];
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
  groupItemTitle?: string;
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

export type PickPrimaryMarketOptions = {
  derivativeKeywords?: string[];
};

type FetchLike = typeof fetch;

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";
const DEFAULT_LIMIT_PER_TYPE = 10;

export const DEFAULT_DERIVATIVE_KEYWORDS = [
  "map",
  "handicap",
  "spread",
  "o/u",
  "over/under",
  "total",
  "kills",
  "corners",
];

const YES_TOKENS = new Set(["yes", "no", "true", "false"]);

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

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const parseStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean);
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
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed: unknown = JSON.parse(trimmed);
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
    groupItemTitle: toStringOrUndefined(market.groupItemTitle),
  };
};

const isYesNoBinary = (market: SearchMarketResult): boolean => {
  if (market.outcomes.length !== 2) return false;
  const normalized = market.outcomes.map((value) => normalizeText(value));
  return normalized.every((value) => YES_TOKENS.has(value));
};

const isDerivativeMarket = (market: SearchMarketResult, keywords: string[]): boolean => {
  const haystack = normalizeText(`${market.question} ${market.groupItemTitle ?? ""}`);
  return keywords.some((keyword) => haystack.includes(normalizeText(keyword)));
};

const similarityScore = (market: SearchMarketResult, eventTitle?: string): number => {
  if (!eventTitle) return 0;
  const title = normalizeText(eventTitle);
  const question = normalizeText(market.question);
  if (!title || !question) return 0;
  if (question === title) return 100;
  if (question.includes(title) || title.includes(question)) return 80;

  const titleTokens = new Set(title.split(" "));
  const questionTokens = new Set(question.split(" "));
  let overlap = 0;
  for (const token of questionTokens) {
    if (titleTokens.has(token)) overlap += 1;
  }
  return overlap;
};

const marketDepthScore = (market: SearchMarketResult): number => {
  if (typeof market.liquidity === "number") return market.liquidity;
  if (typeof market.volume === "number") return market.volume;
  return 0;
};

export const pickPrimaryMarket = (
  event: { title?: string; markets: SearchMarketResult[] },
  options: PickPrimaryMarketOptions = {},
): SearchMarketResult | null => {
  const keywords = options.derivativeKeywords ?? DEFAULT_DERIVATIVE_KEYWORDS;
  const markets = event.markets;
  if (markets.length === 0) return null;

  const nonDerivative = markets.filter((market) => !isDerivativeMarket(market, keywords));
  const yesNoCandidates = nonDerivative.filter(isYesNoBinary);
  const basePool = yesNoCandidates.length > 0 ? yesNoCandidates : nonDerivative.length > 0 ? nonDerivative : markets;

  const bestBySimilarity = [...basePool].sort((a, b) => similarityScore(b, event.title) - similarityScore(a, event.title));
  const bestSimilarityScore = similarityScore(bestBySimilarity[0], event.title);
  const similarityPool = bestBySimilarity.filter((market) => similarityScore(market, event.title) === bestSimilarityScore);

  const rankedByDepth = [...similarityPool].sort((a, b) => marketDepthScore(b) - marketDepthScore(a));
  if (rankedByDepth[0]) return rankedByDepth[0];

  const fallback = [...markets].sort((a, b) => marketDepthScore(b) - marketDepthScore(a));
  return fallback[0] ?? null;
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

export const normalizeGammaPublicSearchResponse = (payload: unknown): SearchEventResult[] => {
  const safePayload = (payload ?? {}) as GammaPublicSearchResponse;
  const events = Array.isArray(safePayload.events) ? safePayload.events : [];
  const results: SearchEventResult[] = [];

  for (const event of events) {
    const eventId =
      typeof event.id === "string" || typeof event.id === "number" ? String(event.id) : undefined;
    if (!eventId) continue;

    const markets = (Array.isArray(event.markets) ? event.markets : [])
      .map(toMarketResult)
      .filter((item): item is SearchMarketResult => item !== null);
    const primaryMarket = pickPrimaryMarket({
      title: toStringOrUndefined(event.title),
      markets,
    });

    if (!primaryMarket) continue;

    results.push({
      eventId,
      eventTitle: toStringOrUndefined(event.title),
      eventSlug: toStringOrUndefined(event.slug),
      eventImage: toStringOrUndefined(event.image),
      eventIcon: toStringOrUndefined(event.icon),
      primaryMarket,
      secondaryMarkets: [],
    });
  }

  return results;
};

export const fetchGammaPublicSearch = async (
  params: GammaPublicSearchParams,
  fetchImpl: FetchLike = fetch,
): Promise<SearchEventResult[]> => {
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
