import {
  buildGammaPublicSearchUrl,
  fetchGammaPublicSearch,
  normalizeGammaPublicSearchResponse,
  pickPrimaryMarket,
  type SearchMarketResult,
} from "@/src/lib/gammaSearch";
import { describe, expect, it, vi } from "vitest";

const mk = (overrides: Partial<SearchMarketResult> = {}): SearchMarketResult => ({
  marketId: "m",
  question: "Will Barca win?",
  slug: "will-barca-win",
  active: true,
  closed: false,
  outcomes: ["Yes", "No"],
  outcomePrices: [0.6, 0.4],
  ...overrides,
});

describe("gammaSearch client", () => {
  it("builds public-search URL with required and optional params", () => {
    const url = buildGammaPublicSearchUrl({
      q: "barca",
      limitPerType: 25,
      keepClosedMarkets: true,
      eventsStatus: ["active", "closed"],
      sort: "volume",
      ascending: false,
    });

    expect(url.origin).toBe("https://gamma-api.polymarket.com");
    expect(url.pathname).toBe("/public-search");
    expect(url.searchParams.get("q")).toBe("barca");
    expect(url.searchParams.get("limit_per_type")).toBe("25");
    expect(url.searchParams.get("keep_closed_markets")).toBe("1");
    expect(url.searchParams.get("events_status")).toBe("active,closed");
    expect(url.searchParams.get("sort")).toBe("volume");
    expect(url.searchParams.get("ascending")).toBe("false");
  });

  it("normalizes into event-first results using one primary market per event", () => {
    const results = normalizeGammaPublicSearchResponse({
      events: [
        {
          id: "event-1",
          title: "Barcelona vs Real Madrid",
          slug: "barca-real",
          icon: "https://cdn/icon.png",
          markets: [
            {
              id: "m-prop",
              question: "Map 1 Winner",
              slug: "map-1-winner",
              outcomes: "[\"Yes\",\"No\"]",
              outcomePrices: "[\"0.4\",\"0.6\"]",
              liquidityNum: 9999,
            },
            {
              id: "m-main",
              question: "Will Barcelona beat Real Madrid?",
              slug: "will-barcelona-beat-real-madrid",
              outcomes: "[\"Yes\",\"No\"]",
              outcomePrices: "[\"0.6\",\"0.4\"]",
              liquidityNum: 100,
              volumeNum: 123.45,
            },
          ],
        },
      ],
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.eventId).toBe("event-1");
    expect(results[0]?.primaryMarket.marketId).toBe("m-main");
    expect(results[0]?.primaryMarket.outcomes).toEqual(["Yes", "No"]);
    expect(results[0]?.primaryMarket.outcomePrices).toEqual([0.6, 0.4]);
  });

  it("pickPrimaryMarket prefers Yes/No and excludes derivative markets", () => {
    const chosen = pickPrimaryMarket({
      title: "Barcelona vs Real Madrid",
      markets: [
        mk({
          marketId: "prop",
          question: "Map Handicap: Barcelona -1.5",
          groupItemTitle: "Map Handicap",
          liquidity: 10000,
        }),
        mk({
          marketId: "main",
          question: "Will Barcelona beat Real Madrid?",
          liquidity: 500,
        }),
      ],
    });

    expect(chosen?.marketId).toBe("main");
  });

  it("pickPrimaryMarket falls back to best liquidity when no yes/no market exists", () => {
    const chosen = pickPrimaryMarket({
      title: "Barcelona vs Real Madrid",
      markets: [
        mk({
          marketId: "a",
          outcomes: ["Barcelona", "Real Madrid"],
          outcomePrices: [0.5, 0.5],
          liquidity: 150,
        }),
        mk({
          marketId: "b",
          outcomes: ["Barcelona", "Real Madrid"],
          outcomePrices: [0.4, 0.6],
          liquidity: 220,
        }),
      ],
    });

    expect(chosen?.marketId).toBe("b");
  });

  it("pickPrimaryMarket honors derivative keyword exclusions", () => {
    const chosen = pickPrimaryMarket({
      title: "Barcelona vs Real Madrid",
      markets: [
        mk({
          marketId: "kills",
          question: "Total Kills O/U 20.5",
          groupItemTitle: "Total Kills",
          liquidity: 1000,
        }),
        mk({
          marketId: "winner",
          question: "Will Barcelona beat Real Madrid?",
          liquidity: 400,
        }),
      ],
    });

    expect(chosen?.marketId).toBe("winner");
  });

  it("respects abort signal", async () => {
    const controller = new AbortController();

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal | undefined;
      await new Promise<void>((resolve, reject) => {
        if (!signal) {
          resolve();
          return;
        }
        if (signal.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });

      return new Response(JSON.stringify({ events: [] }), { status: 200 });
    });

    const pending = fetchGammaPublicSearch(
      {
        q: "barca",
        signal: controller.signal,
      },
      fetchMock as unknown as typeof fetch,
    );

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBe(controller.signal);
  });
});
