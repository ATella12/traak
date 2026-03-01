import { act, fireEvent, render, screen } from "@testing-library/react";
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

describe("TransactionFormScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders form fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
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
        }),
      ),
    );

    render(<TransactionFormScreen />);
    expect(await screen.findByRole("heading", { name: "Add Transaction" })).toBeInTheDocument();
    expect(screen.getByLabelText("Type")).toBeInTheDocument();
    expect(screen.getByLabelText("Outcome")).toBeInTheDocument();
    expect(screen.getByLabelText("Shares")).toBeInTheDocument();
    expect(screen.getByLabelText("Price per share")).toBeInTheDocument();
    expect(screen.getByLabelText("Date & time")).toBeInTheDocument();
  });

  it("validates required shares/price before submit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
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
        }),
      ),
    );

    render(<TransactionFormScreen />);
    await screen.findByRole("button", { name: "Add transaction" });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add transaction" }));
    });

    expect(screen.getByText("Shares must be greater than 0.")).toBeInTheDocument();
    expect(screen.getByText("Price per share must be between 0 and 1.")).toBeInTheDocument();
    expect(addTransactionMock).not.toHaveBeenCalled();
  });

  it("submits transaction payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
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
        }),
      ),
    );

    render(<TransactionFormScreen />);
    await screen.findByRole("button", { name: "Add transaction" });

    fireEvent.change(screen.getByLabelText("Shares"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Price per share"), { target: { value: "0.55" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add transaction" }));
    });

    expect(addTransactionMock).toHaveBeenCalledTimes(1);
    expect(addTransactionMock.mock.calls[0]?.[0]).toMatchObject({
      market: {
        slug: "candidate-a",
        question: "Will Candidate A be nominated?",
        category: "Politics  Fed",
      },
      side: "BUY",
      outcome: "YES",
      shares: 10,
      price: 0.55,
    });
    expect(pushMock).toHaveBeenCalledWith("/portfolio");
  });
});
