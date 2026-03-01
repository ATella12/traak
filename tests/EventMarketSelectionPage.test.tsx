import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import EventOptionSelectScreen from "@/app/portfolio/manual/event/[eventSlug]/page";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useParams: () => ({ eventSlug: "trump-fed-chair" }),
  useSearchParams: () =>
    ({
      get: (key: string) => {
        if (key === "cat") return "Politics  Fed";
        if (key === "marketId") return null;
        return null;
      },
    }) as unknown as URLSearchParams,
}));

const createResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("EventOptionSelectScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders event markets as options", async () => {
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
          { marketId: "m1", question: "Candidate A", slug: "a", conditionId: "0x1", outcomes: ["Yes", "No"], outcomePrices: [0.7, 0.3], active: true, closed: false, probabilityYes: 0.7 },
          { marketId: "m2", question: "Candidate B", slug: "b", conditionId: "0x2", outcomes: ["Yes", "No"], outcomePrices: [0.3, 0.7], active: true, closed: false, probabilityYes: 0.3 },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<EventOptionSelectScreen />);
    expect(await screen.findByText("Who will Trump nominate as Fed Chair?")).toBeInTheDocument();
    const select = (await screen.findByLabelText("Market option")) as HTMLSelectElement;
    expect(select.options.length).toBe(2);
  });

  it("navigates to transaction form when clicking Continue", async () => {
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
          { marketId: "m1", question: "Candidate A", slug: "a", conditionId: "0x1", outcomes: ["Yes", "No"], outcomePrices: [0.7, 0.3], active: true, closed: false, probabilityYes: 0.7 },
          { marketId: "m2", question: "Candidate B", slug: "b", conditionId: "0x2", outcomes: ["Yes", "No"], outcomePrices: [0.3, 0.7], active: true, closed: false, probabilityYes: 0.3 },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<EventOptionSelectScreen />);
    await screen.findByText("Who will Trump nominate as Fed Chair?");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    });

    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining("/portfolio/manual/transaction?"));
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining("eventSlug=trump-fed-chair"));
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining("marketId="));
  });
});
