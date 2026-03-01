import {
  buildGammaPublicSearchUrl,
  fetchGammaPublicSearch,
  normalizeGammaPublicSearchResponse,
} from "@/src/lib/gammaSearch";
import { describe, expect, it, vi } from "vitest";

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

  it("normalizes events[].markets[] into SearchMarketResult", () => {
    const results = normalizeGammaPublicSearchResponse({
      events: [
        {
          id: "event-1",
          title: "UEFA",
          slug: "uefa",
          icon: "https://cdn/icon.png",
          markets: [
            {
              id: "m1",
              question: "Will Barca win?",
              slug: "will-barca-win",
              conditionId: "0xabc",
              active: true,
              closed: false,
              endDate: "2026-06-10T00:00:00Z",
              volume: "123.45",
              liquidityNum: 456.78,
            },
          ],
        },
      ],
    });

    expect(results).toEqual([
      {
        marketId: "m1",
        question: "Will Barca win?",
        slug: "will-barca-win",
        conditionId: "0xabc",
        active: true,
        closed: false,
        endDate: "2026-06-10T00:00:00Z",
        eventId: "event-1",
        eventTitle: "UEFA",
        eventSlug: "uefa",
        eventIcon: "https://cdn/icon.png",
        volume: 123.45,
        liquidity: 456.78,
      },
    ]);
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
