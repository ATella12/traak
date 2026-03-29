import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TransactionFormScreen from "@/app/portfolio/manual/transaction/page";

const pushMock = vi.fn();
const addTransactionMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () =>
    ({
      get: (key: string) => {
        if (key === "eventSlug") return "trump-fed-chair";
        if (key === "marketId") return "m1";
        return null;
      },
    }) as unknown as URLSearchParams,
}));

vi.mock("@/src/lib/storage", () => ({
  addTransaction: (...args: unknown[]) => addTransactionMock(...args),
}));

const createResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const mockEventResponse = () =>
  createResponse({
    stale: false,
    event: {
      eventId: "e1",
      eventTitle: "Who will Trump nominate as Fed Chair?",
      eventSlug: "trump-fed-chair",
      primaryCategoryLine: "Politics  Fed",
    },
    markets: [
      {
        marketId: "m1",
        question: "Will Candidate A be nominated?",
        slug: "candidate-a",
        conditionId: "0x1",
        outcomes: ["Yes", "No"],
        outcomePrices: [0.7, 0.3],
        active: true,
        closed: false,
        probabilityYes: 0.7,
      },
    ],
  });

describe("TransactionFormScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("renders wizard first step", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockEventResponse()));

    render(<TransactionFormScreen />);

    expect(await screen.findByRole("heading", { name: "Add Transaction" })).toBeInTheDocument();
    expect(screen.getByText("Did you buy or sell this market?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sell" })).toBeInTheDocument();
  });

  it("requires valid input before moving to next step", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockEventResponse()));

    render(<TransactionFormScreen />);
    await screen.findByText("Did you buy or sell this market?");

    const nextButton = screen.getByRole("button", { name: "Next" });
    expect(nextButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Buy" }));
    expect(nextButton).toBeEnabled();

    await act(async () => {
      fireEvent.click(nextButton);
    });
    fireEvent.click(await screen.findByRole("button", { name: "Yes" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    });

    expect(await screen.findByLabelText("Shares")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Shares"), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Shares"), { target: { value: "10" } });
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("submits transaction payload from review step", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockEventResponse()));

    render(<TransactionFormScreen />);
    await screen.findByText("Did you buy or sell this market?");

    fireEvent.click(screen.getByRole("button", { name: "Buy" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    });

    fireEvent.click(await screen.findByRole("button", { name: "Yes" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    });

    fireEvent.change(await screen.findByLabelText("Shares"), { target: { value: "10" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    });

    fireEvent.change(await screen.findByLabelText("Price per share"), { target: { value: "0.55" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    });

    fireEvent.change(await screen.findByLabelText("Trade notes"), {
      target: { value: "Mean reversion after the morning move." },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    });

    expect(screen.getByText("Review transaction")).toBeInTheDocument();
    expect(screen.getByText("Mean reversion after the morning move.")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm & Save" }));
    });

    expect(addTransactionMock).toHaveBeenCalledTimes(1);
    expect(addTransactionMock.mock.calls[0]?.[0]).toMatchObject({
      source: "manual",
      marketId: "m1",
      marketTitle: "Will Candidate A be nominated?",
      category: "Politics  Fed",
      side: "BUY",
      outcome: "YES",
      shares: 10,
      price: 0.55,
      fee: 0,
      notes: "Mean reversion after the morning move.",
    });
    expect(pushMock).toHaveBeenCalledWith("/portfolio");
  });
});
