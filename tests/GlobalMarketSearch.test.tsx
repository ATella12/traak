import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import GlobalMarketSearch from "@/components/GlobalMarketSearch";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

const createResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("GlobalMarketSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not call API for query shorter than 2 chars", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(createResponse({ q: "ba", page: 1, stale: false, hasMore: false, results: [] }));
    vi.stubGlobal("fetch", fetchMock);

    render(<GlobalMarketSearch showHeader={false} />);
    fireEvent.change(screen.getByPlaceholderText("Search all markets..."), { target: { value: "b" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("debounces calls and renders one row per event", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      createResponse({
        q: "barca",
        page: 1,
        stale: false,
        hasMore: false,
        totalResults: 2,
        results: [
          {
            eventId: "e1",
            eventTitle: "Event 1",
            tag: "Soccer",
            primaryMarket: {
              marketId: "m1",
              question: "Will Barca win?",
              slug: "will-barca-win",
              active: true,
              closed: false,
              liquidity: 1000,
              volume: 2000,
              outcomes: ["Yes", "No"],
              outcomePrices: [0.6, 0.4],
            },
          },
          {
            eventId: "e2",
            eventTitle: "Event 2",
            tag: "Soccer",
            primaryMarket: {
              marketId: "m2",
              question: "Will Barca qualify?",
              slug: "will-barca-qualify",
              active: true,
              closed: false,
              outcomes: ["Yes", "No"],
              outcomePrices: [0.55, 0.45],
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<GlobalMarketSearch showHeader={false} />);
    const input = screen.getByPlaceholderText("Search all markets...");
    fireEvent.change(input, { target: { value: "b" } });
    fireEvent.change(input, { target: { value: "ba" } });
    fireEvent.change(input, { target: { value: "barca" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    expect(await screen.findByText("Event 1")).toBeInTheDocument();
    expect(screen.getByText("Event 2")).toBeInTheDocument();
    expect(screen.getByText("Showing 2 events of 2")).toBeInTheDocument();
  });

  it("aborts stale in-flight request when a new query is sent", async () => {
    vi.useFakeTimers();
    const capturedSignals: AbortSignal[] = [];
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_url: RequestInfo | URL, init?: RequestInit) => {
        capturedSignals.push(init?.signal as AbortSignal);
        return new Promise<Response>(() => {
          // pending forever
        });
      })
      .mockResolvedValueOnce(
        createResponse({
          q: "barca",
          page: 1,
          stale: false,
          hasMore: false,
          results: [
            {
              eventId: "e2",
              eventTitle: "Event 2",
              primaryMarket: {
                marketId: "m2",
                question: "Second request result",
                slug: "second-request-result",
                active: true,
                closed: false,
                outcomes: ["Yes", "No"],
                outcomePrices: [0.4, 0.6],
              },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<GlobalMarketSearch showHeader={false} />);
    const input = screen.getByPlaceholderText("Search all markets...");

    fireEvent.change(input, { target: { value: "ba" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    fireEvent.change(input, { target: { value: "barca" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(capturedSignals[0]?.aborted).toBe(true);
  });

  it("sort and status controls trigger API params", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      createResponse({
        q: "barca",
        page: 1,
        stale: false,
        hasMore: false,
        results: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<GlobalMarketSearch showHeader={false} />);
    fireEvent.change(screen.getByPlaceholderText("Search all markets..."), { target: { value: "barca" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "liquidity" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "resolved" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    const lastCallUrl = String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1]?.[0]);
    expect(lastCallUrl).toContain("sort=liquidity");
    expect(lastCallUrl).toContain("events_status=resolved");
  });

  it("shows stale cached results and error when returned by API", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      createResponse({
        q: "barca",
        page: 1,
        stale: true,
        error: "Live search failed. Showing recent cached results. Retry to refresh.",
        hasMore: false,
        results: [
          {
            eventId: "e3",
            eventTitle: "Cached Event",
            primaryMarket: {
              marketId: "m3",
              question: "Cached Market",
              slug: "cached-market",
              active: false,
              closed: true,
              outcomes: ["Yes", "No"],
              outcomePrices: [0.9, 0.1],
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<GlobalMarketSearch showHeader={false} />);
    fireEvent.change(screen.getByPlaceholderText("Search all markets..."), { target: { value: "barca" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    vi.useRealTimers();

    expect(await screen.findByText("Live search failed. Showing recent cached results. Retry to refresh.")).toBeInTheDocument();
    expect(screen.getByText("Showing cached results while live search recovers.")).toBeInTheDocument();
    expect(screen.getByText("Cached Event")).toBeInTheDocument();
  });

  it("pagination loads the next page", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createResponse({
          q: "barca",
          page: 1,
          stale: false,
          hasMore: true,
          results: [
            {
              eventId: "e1",
              eventTitle: "Page 1 Event",
              primaryMarket: {
                marketId: "m1",
                question: "Page 1 Market",
                slug: "page-1-market",
                active: true,
                closed: false,
                outcomes: ["Yes", "No"],
                outcomePrices: [0.5, 0.5],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          q: "barca",
          page: 2,
          stale: false,
          hasMore: false,
          results: [
            {
              eventId: "e2",
              eventTitle: "Page 2 Event",
              primaryMarket: {
                marketId: "m2",
                question: "Page 2 Market",
                slug: "page-2-market",
                active: true,
                closed: false,
                outcomes: ["Yes", "No"],
                outcomePrices: [0.5, 0.5],
              },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<GlobalMarketSearch showHeader={false} />);
    fireEvent.change(screen.getByPlaceholderText("Search all markets..."), { target: { value: "barca" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    vi.useRealTimers();

    expect(await screen.findByText("Page 1 Event")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const secondCallUrl = String(fetchMock.mock.calls[1]?.[0]);
    expect(secondCallUrl).toContain("page=2");
    expect(await screen.findByText("Page 2 Event")).toBeInTheDocument();
  });
});
