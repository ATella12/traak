import { Prisma } from "@prisma/client";

import { prisma } from "@/src/lib/db";

const PER_REQUEST_TIMEOUT_MS = 10_000;
const TOTAL_TIMEOUT_MS = 180_000;
const PRIMARY_PAGE_LIMIT = 200;
const FALLBACK_PAGE_LIMIT = 50;

type UpstreamMarket = Record<string, unknown>;

export type SyncMarketsResult = {
  indexed: number;
  upserts: number;
  pages: number;
  durationMs: number;
};

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const simpleHash = (value: string): string => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
};

const toQuestion = (raw: UpstreamMarket): string => {
  const value =
    typeof raw.question === "string"
      ? raw.question
      : typeof raw.title === "string"
        ? raw.title
        : typeof raw.name === "string"
          ? raw.name
          : "";
  return value.trim();
};

const toCategory = (raw: UpstreamMarket): string => {
  if (typeof raw.category !== "string") return "Other";
  const cleaned = raw.category.trim();
  return cleaned || "Other";
};

const toSlug = (raw: UpstreamMarket, question: string, fallbackId: string): string => {
  const direct =
    typeof raw.slug === "string"
      ? raw.slug.trim()
      : typeof raw.market_slug === "string"
        ? raw.market_slug.trim()
        : "";
  if (direct) return direct;
  return normalizeText(`${question}-${fallbackId}`) || fallbackId;
};

const toId = (raw: UpstreamMarket, slug: string, question: string): string => {
  if (typeof raw.id === "string" || typeof raw.id === "number") return String(raw.id);
  if (typeof raw.marketId === "string" || typeof raw.marketId === "number") return String(raw.marketId);
  if (typeof raw.condition_id === "string") return raw.condition_id;
  return `${slug || "market"}-${simpleHash(question || slug || "market")}`;
};

const fetchMarketsPage = async (limit: number, offset: number, retries = 1): Promise<UpstreamMarket[]> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PER_REQUEST_TIMEOUT_MS);

    try {
      const url = new URL("https://gamma-api.polymarket.com/markets");
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("offset", String(offset));

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed with status ${response.status}`);
      }

      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) {
        throw new Error("Unexpected response payload");
      }

      return payload.filter((item): item is UpstreamMarket => typeof item === "object" && item !== null);
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to fetch markets page");
};

export async function syncMarketsCatalog(): Promise<SyncMarketsResult> {
  const startedAt = Date.now();
  let usedLimit = PRIMARY_PAGE_LIMIT;
  let offset = 0;
  let pages = 0;
  let upserts = 0;

  while (Date.now() - startedAt < TOTAL_TIMEOUT_MS) {
    let page: UpstreamMarket[];
    try {
      page = await fetchMarketsPage(usedLimit, offset, 1);
    } catch (error) {
      if (usedLimit !== FALLBACK_PAGE_LIMIT) {
        usedLimit = FALLBACK_PAGE_LIMIT;
        page = await fetchMarketsPage(usedLimit, offset, 1);
      } else {
        throw error;
      }
    }

    pages += 1;

    for (const rawMarket of page) {
      const question = toQuestion(rawMarket);
      if (!question) continue;

      const fallbackId = toId(rawMarket, "", question);
      const slug = toSlug(rawMarket, question, fallbackId);
      const marketId = toId(rawMarket, slug, question);
      const category = toCategory(rawMarket);

      const existingById = await prisma.market.findUnique({
        where: { id: marketId },
        select: { id: true },
      });

      const data = {
        slug,
        question,
        category,
        raw: rawMarket as Prisma.InputJsonValue,
      };

      if (existingById) {
        await prisma.market.update({
          where: { id: marketId },
          data,
        });
        upserts += 1;
        continue;
      }

      const existingBySlug = await prisma.market.findUnique({
        where: { slug },
        select: { id: true },
      });

      if (existingBySlug) {
        await prisma.market.update({
          where: { slug },
          data,
        });
        upserts += 1;
        continue;
      }

      await prisma.market.create({
        data: {
          id: marketId,
          ...data,
        },
      });
      upserts += 1;
    }

    console.log(`Sync markets: offset=${offset} limit=${usedLimit} received=${page.length} totalUpserts=${upserts}`);

    if (usedLimit === PRIMARY_PAGE_LIMIT && page.length > 0 && page.length < PRIMARY_PAGE_LIMIT) {
      usedLimit = FALLBACK_PAGE_LIMIT;
      offset += page.length;
      continue;
    }

    if (page.length === 0 || page.length < usedLimit) {
      break;
    }

    offset += usedLimit;
  }

  const indexed = await prisma.market.count();
  const durationMs = Date.now() - startedAt;
  return { indexed, upserts, pages, durationMs };
}
