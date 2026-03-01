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

  it("debounces input and does not search for queries shorter than 2 chars", async () => {
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

    fireEvent.change(input, { target: { value: "ba" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("calls API once for a debounced query and renders returned markets", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      createResponse({
        q: "barca",
        stale: false,
        results: [
          {
            marketId: "1",
            question: "Will Barca win El Clasico?",
            slug: "will-barca-win-el-clasico",
            active: true,
            closed: false,
            eventTitle: "La Liga",
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
    const input = screen.getByPlaceholderText("Search all markets...");

    fireEvent.change(input, { target: { value: "barca" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(screen.getByText("Searching markets...")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("shows error state and retries", async () => {
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
              marketId: "2",
              question: "Barca to qualify?",
              slug: "barca-to-qualify",
              active: true,
              closed: false,
              eventTitle: "Champions League",
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<GlobalMarketSearch showHeader={false} />);
    const input = screen.getByPlaceholderText("Search all markets...");

    fireEvent.change(input, { target: { value: "barca" } });
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
