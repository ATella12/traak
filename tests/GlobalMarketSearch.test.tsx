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

const eventRow = (overrides: Record<string, unknown> = {}) => ({
  eventId: "e1",
  eventTitle: "Elche CF vs. RCD Espanyol de Barcelona",
  eventSlug: "elche-vs-espanyol",
  tags: [
    { label: "Sports", slug: "sports" },
    { label: "La Liga", slug: "la-liga" },
  ],
  primaryCategoryLine: "Sports  La Liga",
  endsInText: "Ends in about 3 hours",
  displayMarket: {
    marketId: "m1",
    question: "Will Barcelona win?",
    slug: "will-barcelona-win",
    conditionId: "0xcond",
    outcomes: ["Yes", "No"],
    outcomePrices: [0.395, 0.605],
    active: true,
    closed: false,
    probabilityYes: 0.395,
    groupItemTitle: "Barcelona",
  },
  ...overrides,
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
    const fetchMock = vi.fn().mockResolvedValue(createResponse({ q: "b", page: 1, stale: false, hasMore: false, results: [] }));
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
        results: [eventRow(), eventRow({ eventId: "e2", eventTitle: "Newcastle vs Barcelona" })],
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

    expect(await screen.findByText("Elche CF vs. RCD Espanyol de Barcelona")).toBeInTheDocument();
    expect(screen.getByText("Newcastle vs Barcelona")).toBeInTheDocument();
    expect(screen.getByText("Showing 2 events of 2")).toBeInTheDocument();
  });

  it("cancels stale requests and only keeps latest results", async () => {
    vi.useFakeTimers();
    let firstResolve: ((value: Response) => void) | undefined;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            firstResolve = resolve;
          }),
      )
      .mockResolvedValueOnce(
        createResponse({
          q: "barca",
          page: 1,
          stale: false,
          hasMore: false,
          results: [eventRow({ eventId: "latest", eventTitle: "Latest Event" })],
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

    if (firstResolve) {
      firstResolve(
        createResponse({
          q: "ba",
          page: 1,
          stale: false,
          hasMore: false,
          results: [eventRow({ eventId: "old", eventTitle: "Old Event" })],
        }),
      );
    }

    vi.useRealTimers();
    expect(await screen.findByText("Latest Event")).toBeInTheDocument();
    expect(screen.queryByText("Old Event")).not.toBeInTheDocument();
  });

  it("status and sort controls send correct API params", async () => {
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

  it("shows cached indicator when stale cached results are returned", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      createResponse({
        q: "barca",
        page: 1,
        stale: true,
        error: "Live search failed. Showing recent cached results. Retry to refresh.",
        hasMore: false,
        results: [eventRow({ eventTitle: "Cached Event" })],
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

  it("supports pagination", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createResponse({
          q: "barca",
          page: 1,
          stale: false,
          hasMore: true,
          results: [eventRow({ eventId: "p1", eventTitle: "Page 1" })],
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          q: "barca",
          page: 2,
          stale: false,
          hasMore: false,
          results: [eventRow({ eventId: "p2", eventTitle: "Page 2" })],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<GlobalMarketSearch showHeader={false} />);
    fireEvent.change(screen.getByPlaceholderText("Search all markets..."), { target: { value: "barca" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    vi.useRealTimers();

    expect(await screen.findByText("Page 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("page=2");
    expect(await screen.findByText("Page 2")).toBeInTheDocument();
  });

  it("navigates to event route when selecting a row", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      createResponse({
        q: "barca",
        page: 1,
        stale: false,
        hasMore: false,
        results: [eventRow({ eventSlug: "multi-option-event" })],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<GlobalMarketSearch showHeader={false} />);
    fireEvent.change(screen.getByPlaceholderText("Search all markets..."), { target: { value: "barca" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    vi.useRealTimers();

    fireEvent.click(await screen.findByText("Elche CF vs. RCD Espanyol de Barcelona"));
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining("/portfolio/manual/event/multi-option-event"));
  });
});
