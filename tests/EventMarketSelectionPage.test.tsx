import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import EventMarketSelectionPage from "@/app/portfolio/manual/event/[eventSlug]/page";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useParams: () => ({ eventSlug: "trump-fed-chair" }),
  useSearchParams: () =>
    ({
      get: (key: string) => {
        if (key === "cat") return "Politics  Fed";
        return null;
      },
    }) as unknown as URLSearchParams,
}));

const createResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("EventMarketSelectionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all event markets and defaults to highest probability", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
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
            marketId: "m-low",
            question: "Will Candidate B be nominated?",
            slug: "candidate-b",
            conditionId: "0x2",
            active: true,
            closed: false,
            outcomes: ["Yes", "No"],
            outcomePrices: [0.3, 0.7],
            probabilityYes: 0.3,
          },
          {
            marketId: "m-high",
            question: "Will Candidate A be nominated?",
            slug: "candidate-a",
            conditionId: "0x1",
            groupItemTitle: "Candidate A",
            active: true,
            closed: false,
            outcomes: ["Yes", "No"],
            outcomePrices: [0.7, 0.3],
            probabilityYes: 0.7,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<EventMarketSelectionPage />);
    expect(await screen.findByText("Who will Trump nominate as Fed Chair?")).toBeInTheDocument();

    const select = (await screen.findByLabelText("Market option")) as HTMLSelectElement;
    expect(select.options.length).toBe(2);

    const questionInput = (await screen.findByLabelText("Market question")) as HTMLInputElement;
    expect(questionInput.value).toBe("Will Candidate A be nominated?");
  });

  it("selecting another market updates displayed question/category", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
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
            marketId: "m-a",
            question: "Will Candidate A be nominated?",
            slug: "candidate-a",
            conditionId: "0x1",
            active: true,
            closed: false,
            outcomes: ["Yes", "No"],
            outcomePrices: [0.7, 0.3],
            probabilityYes: 0.7,
          },
          {
            marketId: "m-b",
            question: "Will Candidate B be nominated?",
            slug: "candidate-b",
            conditionId: "0x2",
            active: true,
            closed: false,
            outcomes: ["Yes", "No"],
            outcomePrices: [0.3, 0.7],
            probabilityYes: 0.3,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<EventMarketSelectionPage />);
    const select = (await screen.findByLabelText("Market option")) as HTMLSelectElement;

    await act(async () => {
      fireEvent.change(select, { target: { value: "m-b" } });
    });

    const questionInput = (await screen.findByLabelText("Market question")) as HTMLInputElement;
    expect(questionInput.value).toBe("Will Candidate B be nominated?");

    const categoryInput = (await screen.findByLabelText("Category")) as HTMLInputElement;
    expect(categoryInput.value).toBe("Politics  Fed");
  });
});
