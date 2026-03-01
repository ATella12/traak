import {
  buildSearchV2Url,
  normalizeSearchV2Response,
  pickPrimaryMarket,
  searchV2,
  type SearchMarketResult,
} from "@/src/lib/gammaSearch";
import { describe, expect, it, vi } from "vitest";

const market = (overrides: Partial<SearchMarketResult> = {}): SearchMarketResult => ({
  marketId: "m",
  question: "Will Barcelona win?",
  slug: "will-barcelona-win",
  active: true,
  closed: false,
  outcomes: ["Yes", "No"],
  outcomePrices: [0.5, 0.5],
  ...overrides,
});

describe("search-v2 client", () => {
  it("builds URL with pagination/sort/status params", () => {
    const url = buildSearchV2Url({
      q: "barcelona",
      type: "events",
      eventsStatus: "resolved",
      page: 3,
      limitPerType: 20,
      sort: "volume_24hr",
      optimized: false,
    });

    expect(url.origin).toBe("https://gamma-api.polymarket.com");
    expect(url.pathname).toBe("/search-v2");
    expect(url.searchParams.get("q")).toBe("barcelona");
    expect(url.searchParams.get("type")).toBe("events");
    expect(url.searchParams.get("events_status")).toBe("resolved");
    expect(url.searchParams.get("page")).toBe("3");
    expect(url.searchParams.get("limit_per_type")).toBe("20");
    expect(url.searchParams.get("sort")).toBe("volume_24hr");
    expect(url.searchParams.get("optimized")).toBe("false");
  });

  it("normalizes search-v2 response and keeps event-first rows", () => {
    const output = normalizeSearchV2Response({
      events: [
        {
          id: "e1",
          title: "Barcelona vs Madrid",
          tags: [{ label: "Soccer", forceHide: false }],
          markets: [
            {
              id: "m1",
              question: "Will Barcelona win?",
              slug: "will-barcelona-win",
              outcomes: "[\"Yes\",\"No\"]",
              outcomePrices: "[\"0.62\",\"0.38\"]",
              liquidityNum: 200,
            },
            {
              id: "m2",
              question: "Who wins map 1?",
              slug: "map-1",
              outcomes: "[\"A\",\"B\"]",
              outcomePrices: "[\"0.5\",\"0.5\"]",
              liquidityNum: 900,
            },
          ],
        },
      ],
      pagination: { hasMore: true, totalResults: 99 },
    });

    expect(output.events).toHaveLength(1);
    expect(output.events[0]?.primaryMarket.marketId).toBe("m1");
    expect(output.events[0]?.tag).toBe("Soccer");
    expect(output.hasMore).toBe(true);
    expect(output.totalResults).toBe(99);
  });

  it("pickPrimaryMarket prefers yes/no, else highest liquidity", () => {
    const yesNoLow = market({ marketId: "yes-no-low", liquidity: 100 });
    const nonYesNoHigh = market({
      marketId: "non-yes-no-high",
      outcomes: ["A", "B"],
      outcomePrices: [0.2, 0.8],
      liquidity: 999,
    });
    const chosen1 = pickPrimaryMarket([yesNoLow, nonYesNoHigh]);
    expect(chosen1?.marketId).toBe("yes-no-low");

    const nonYesNoA = market({ marketId: "a", outcomes: ["A", "B"], outcomePrices: [0.5, 0.5], liquidity: 120 });
    const nonYesNoB = market({ marketId: "b", outcomes: ["A", "B"], outcomePrices: [0.5, 0.5], liquidity: 220 });
    const chosen2 = pickPrimaryMarket([nonYesNoA, nonYesNoB]);
    expect(chosen2?.marketId).toBe("b");
  });

  it("respects abort signal", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal;
      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
      return new Response(JSON.stringify({ events: [] }), { status: 200 });
    });

    const pending = searchV2({ q: "barcelona", signal: controller.signal }, fetchMock as unknown as typeof fetch);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
