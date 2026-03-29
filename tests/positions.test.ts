import { describe, expect, it } from "vitest";

import { derivePortfolioPositions, getPortfolioPositionDisplayStatus } from "@/src/lib/positions";
import type { Transaction } from "@/src/lib/storage";

const makeTx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: "tx-1",
  source: "manual",
  sourceType: "manual",
  sourceId: "manual",
  marketId: "market-1",
  marketTitle: "Will Arsenal win?",
  category: "Sports",
  side: "BUY",
  outcome: "YES",
  shares: 10,
  price: 0.5,
  fee: 0,
  timestamp: "2026-03-01T10:00:00.000Z",
  createdAt: "2026-03-01T10:00:00.000Z",
  updatedAt: "2026-03-01T10:00:00.000Z",
  ...overrides,
});

describe("derivePortfolioPositions", () => {
  it("removes a fully closed market from open positions", () => {
    const { openPositions, closedPositions } = derivePortfolioPositions([
      makeTx({ id: "buy", shares: 10, price: 0.4, timestamp: "2026-03-01T10:00:00.000Z" }),
      makeTx({ id: "sell", side: "SELL", shares: 10, price: 0.7, timestamp: "2026-03-02T10:00:00.000Z" }),
    ]);

    expect(openPositions).toHaveLength(0);
    expect(closedPositions).toHaveLength(1);
  });

  it("keeps a partially reduced market with the remaining net shares", () => {
    const { openPositions } = derivePortfolioPositions([
      makeTx({ id: "buy", shares: 10, price: 0.4, timestamp: "2026-03-01T10:00:00.000Z" }),
      makeTx({ id: "sell", side: "SELL", shares: 4, price: 0.7, timestamp: "2026-03-02T10:00:00.000Z" }),
    ]);

    expect(openPositions).toHaveLength(1);
    expect(openPositions[0]).toMatchObject({
      side: "BUY",
      outcome: "YES",
      shares: 6,
      price: 0.4,
      tradeCount: 2,
    });
  });

  it("keeps still-open markets grouped by market and outcome", () => {
    const { openPositions } = derivePortfolioPositions([
      makeTx({ id: "yes-buy", marketId: "market-1", outcome: "YES", shares: 5 }),
      makeTx({ id: "no-buy", marketId: "market-1", outcome: "NO", shares: 3, timestamp: "2026-03-02T10:00:00.000Z" }),
    ]);

    expect(openPositions).toHaveLength(2);
    expect(openPositions.map((position) => `${position.marketId}:${position.outcome}`)).toEqual(["market-1:NO", "market-1:YES"]);
  });

  it("normalizes floating-point dust to zero and closes the position", () => {
    const { openPositions, closedPositions } = derivePortfolioPositions([
      makeTx({ id: "buy", shares: 10, price: 0.4, timestamp: "2026-03-01T10:00:00.000Z" }),
      makeTx({ id: "sell", side: "SELL", shares: 9.9999999, price: 0.7, timestamp: "2026-03-02T10:00:00.000Z" }),
    ]);

    expect(openPositions).toHaveLength(0);
    expect(closedPositions).toHaveLength(1);
    expect(closedPositions[0]?.shares).toBe(0);
  });

  it("returns WON for a resolved winning position", () => {
    const { openPositions } = derivePortfolioPositions([makeTx({ id: "buy", shares: 5 })]);
    expect(getPortfolioPositionDisplayStatus(openPositions[0], 1)).toBe("WON");
  });

  it("returns LOST for a resolved losing position", () => {
    const { openPositions } = derivePortfolioPositions([makeTx({ id: "buy", shares: 5 })]);
    expect(getPortfolioPositionDisplayStatus(openPositions[0], 0)).toBe("LOST");
  });

  it("returns CLOSED for a fully exited resolved position", () => {
    const { closedPositions } = derivePortfolioPositions([
      makeTx({ id: "buy", shares: 10 }),
      makeTx({ id: "sell", side: "SELL", shares: 10, timestamp: "2026-03-02T10:00:00.000Z" }),
    ]);

    expect(getPortfolioPositionDisplayStatus(closedPositions[0], 1)).toBe("CLOSED");
  });

  it("returns OPEN for an unresolved position with meaningful exposure", () => {
    const { openPositions } = derivePortfolioPositions([makeTx({ id: "buy", shares: 5 })]);
    expect(getPortfolioPositionDisplayStatus(openPositions[0], 0.61)).toBe("OPEN");
  });
});
