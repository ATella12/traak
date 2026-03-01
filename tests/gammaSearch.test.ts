import {
  buildCategoryLine,
  buildSearchV2Url,
  formatEndsIn,
  normalizeSearchV2Response,
  pickDisplayMarket,
  searchV2,
  type SearchMarketResult,
  type SearchTag,
} from "@/src/lib/gammaSearch";
import { describe, expect, it, vi } from "vitest";

const market = (overrides: Partial<SearchMarketResult> = {}): SearchMarketResult => ({
  marketId: "m",
  question: "Will Barcelona win?",
  slug: "will-barcelona-win",
  conditionId: "0xcond",
  outcomes: ["Yes", "No"],
  outcomePrices: [0.5, 0.5],
  active: true,
  closed: false,
  probabilityYes: 0.5,
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
    expect(url.searchParams.get("events_status")).toBe("resolved");
    expect(url.searchParams.get("page")).toBe("3");
    expect(url.searchParams.get("limit_per_type")).toBe("20");
    expect(url.searchParams.get("sort")).toBe("volume_24hr");
    expect(url.searchParams.get("optimized")).toBe("false");
  });

  it("pickDisplayMarket excludes draw and prefers highest volume24hr", () => {
    const draw = market({
      marketId: "draw",
      question: "Will match end in a draw?",
      groupItemTitle: "Draw (A vs B)",
      volume24hr: 999,
    });
    const low = market({ marketId: "low", volume24hr: 10, volumeNum: 30 });
    const high = market({ marketId: "high", volume24hr: 20, volumeNum: 5 });
    const chosen = pickDisplayMarket([draw, low, high]);
    expect(chosen?.marketId).toBe("high");
  });

  it("pickDisplayMarket falls back to volumeNum and liquidity", () => {
    const a = market({ marketId: "a", volumeNum: 100, liquidityNum: 200, probabilityYes: 0.8 });
    const b = market({ marketId: "b", volumeNum: 100, liquidityNum: 300, probabilityYes: 0.7 });
    const c = market({ marketId: "c", volumeNum: 100, liquidityNum: 300, probabilityYes: 0.52 });
    const chosen = pickDisplayMarket([a, b, c]);
    expect(chosen?.marketId).toBe("c");
  });

  it("normalizes search-v2 response and parses probability from outcomePrices", () => {
    const output = normalizeSearchV2Response(
      {
        events: [
          {
            id: "e1",
            title: "Elche vs Barcelona",
            slug: "elche-barca",
            endDate: "2026-03-01T13:00:00Z",
            tags: [
              { label: "Sports", slug: "sports" },
              { label: "La Liga", slug: "la-liga" },
            ],
            markets: [
              {
                id: "draw",
                question: "Will Elche vs Barcelona end in a draw?",
                slug: "draw",
                conditionId: "0x1",
                groupItemTitle: "Draw (Elche vs Barcelona)",
                outcomePrices: "[\"0.1\",\"0.9\"]",
                volume24hr: 999,
              },
              {
                id: "m1",
                question: "Will Barcelona win on 2026-03-01?",
                slug: "barca-win",
                conditionId: "0x2",
                groupItemTitle: "Barcelona",
                outcomePrices: "[\"0.395\",\"0.605\"]",
                volume24hr: 100,
                liquidityNum: 200,
              },
            ],
          },
        ],
        pagination: { hasMore: true, totalResults: 9 },
      },
      new Date("2026-03-01T10:00:00Z"),
    );

    expect(output.events).toHaveLength(1);
    expect(output.events[0]?.displayMarket.marketId).toBe("m1");
    expect(output.events[0]?.displayMarket.probabilityYes).toBe(0.395);
    expect(output.events[0]?.primaryCategoryLine).toBe("Sports  La Liga");
    expect(output.events[0]?.endsInText).toBe("Ends in about 3 hours");
    expect(output.hasMore).toBe(true);
    expect(output.totalResults).toBe(9);
  });

  it("buildCategoryLine returns expected category lines", () => {
    const withSub: SearchTag[] = [
      { label: "Sports", slug: "sports" },
      { label: "La Liga", slug: "la-liga" },
    ];
    const onlyTop: SearchTag[] = [{ label: "Sports", slug: "sports" }];
    expect(buildCategoryLine(withSub)).toBe("Sports  La Liga");
    expect(buildCategoryLine(onlyTop)).toBe("Sports");
  });

  it("formatEndsIn returns minutes/hours/days/ended", () => {
    const now = new Date("2026-03-01T10:00:00Z");
    expect(formatEndsIn("2026-03-01T10:30:00Z", now)).toBe("Ends in 30 minutes");
    expect(formatEndsIn("2026-03-01T13:00:00Z", now)).toBe("Ends in about 3 hours");
    expect(formatEndsIn("2026-03-03T10:00:00Z", now)).toBe("Ends in 2 days");
    expect(formatEndsIn("2026-03-01T09:00:00Z", now)).toBe("Ended");
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
