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
    const fetchMock = vi.fn().mockResolvedValue(createResponse({ q: "ba", stale: false, results: [] }));
    vi.stubGlobal("fetch", fetchMock);

    render(<GlobalMarketSearch showHeader={false} />);
    const input = screen.getByPlaceholderText("Search all markets...");

    fireEvent.change(input, { target: { value: "b" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("debounces and calls API once for final query", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      createResponse({
        q: "barca",
        stale: false,
        results: [
          {
            eventId: "e1",
            eventTitle: "La Liga",
            primaryMarket: {
              marketId: "1",
              question: "Will Barca win El Clasico?",
              slug: "will-barca-win-el-clasico",
              active: true,
              closed: false,
              liquidity: 1234,
              volume: 5678,
              outcomes: ["Yes", "No"],
              outcomePrices: [0.62, 0.38],
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
    fireEvent.change(input, { target: { value: "bar" } });
    fireEvent.change(input, { target: { value: "barca" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();

    expect(await screen.findByText("Will Barca win El Clasico?")).toBeInTheDocument();
    expect(screen.getByText("La Liga")).toBeInTheDocument();
    expect(screen.getByText("Showing 1 events")).toBeInTheDocument();
  });

  it("renders one row per event", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      createResponse({
        q: "barca",
        stale: false,
        results: [
          {
            eventId: "e1",
            eventTitle: "Event 1",
            primaryMarket: {
              marketId: "1",
              question: "Event 1 primary",
              slug: "event-1-primary",
              active: true,
              closed: false,
              outcomes: ["Yes", "No"],
              outcomePrices: [0.5, 0.5],
            },
          },
          {
            eventId: "e2",
            eventTitle: "Event 2",
            primaryMarket: {
              marketId: "2",
              question: "Event 2 primary",
              slug: "event-2-primary",
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

    expect(await screen.findByText("Event 1 primary")).toBeInTheDocument();
    expect(screen.getByText("Event 2 primary")).toBeInTheDocument();
    expect(screen.queryByText("Showing 3 events")).not.toBeInTheDocument();
  });

  it("shows error state and uses cached results when stale payload is returned", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      createResponse({
        q: "barca",
        stale: true,
        error: "Live search failed. Showing recent cached results. Retry to refresh.",
        results: [
          {
            eventId: "e3",
            eventTitle: "Cached Event",
            primaryMarket: {
              marketId: "3",
              question: "Cached primary",
              slug: "cached-primary",
              active: true,
              closed: true,
              outcomes: ["Yes", "No"],
              outcomePrices: [0.7, 0.3],
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
    expect(screen.getByText("Cached primary")).toBeInTheDocument();
  });

  it("shows loading state while request is in-flight", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>(() => {
          // keep pending
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<GlobalMarketSearch showHeader={false} />);
    fireEvent.change(screen.getByPlaceholderText("Search all markets..."), { target: { value: "barca" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(screen.getByText("Searching markets...")).toBeInTheDocument();
  });

  it("supports retry after hard error", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createResponse({ q: "barca", stale: false, error: "Live search is unavailable. Please retry.", results: [] }, 502))
      .mockResolvedValueOnce(
        createResponse({
          q: "barca",
          stale: false,
          results: [
            {
              eventId: "e4",
              eventTitle: "Champions League",
              primaryMarket: {
                marketId: "4",
                question: "Barca to qualify?",
                slug: "barca-to-qualify",
                active: true,
                closed: false,
                outcomes: ["Yes", "No"],
                outcomePrices: [0.3, 0.7],
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

    expect(await screen.findByText("Live search is unavailable. Please retry.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 2000 });
    expect(await screen.findByText("Barca to qualify?")).toBeInTheDocument();
  });
});
