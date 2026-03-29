import { describe, expect, it } from "vitest";

import { computePerformance, getCurrentPriceForTx } from "@/src/lib/performance";
import type { SearchMarketResult } from "@/src/lib/gammaSearch";
import type { Transaction } from "@/src/lib/storage";

const baseTx: Transaction = {
  id: "t1",
  source: "manual",
  sourceType: "manual",
  sourceId: "manual",
  marketId: "candidate-a",
  marketTitle: "Will Candidate A be nominated?",
  category: "Politics",
  side: "BUY",
  outcome: "YES",
  shares: 10,
  price: 0.5,
  fee: 0,
  timestamp: "2026-02-28T10:00:00.000Z",
  createdAt: "2026-02-28T10:00:00.000Z",
  updatedAt: "2026-02-28T10:00:00.000Z",
};

describe("computePerformance", () => {
  it("computes BUY performance", () => {
    const metrics = computePerformance(baseTx, 0.7);

    expect(metrics).toEqual({
      invested: 5,
      currentValue: 7,
      pnl: 2,
      pnlPct: 0.4,
    });
  });

  it("computes SELL performance", () => {
    const metrics = computePerformance({ ...baseTx, side: "SELL" }, 0.7);

    expect(metrics).toEqual({
      invested: 5,
      currentValue: 3,
      pnl: -2,
      pnlPct: -0.4,
      closeCost: 7,
    });
  });

  it("uses resolved YES payout for a winning YES position", () => {
    const resolvedMarket: SearchMarketResult = {
      marketId: "m1",
      question: "Will Arsenal win?",
      slug: "arsenal-win",
      conditionId: "0x1",
      outcomes: ["Yes", "No"],
      outcomePrices: [1, 0],
      active: true,
      closed: true,
      probabilityYes: 1,
      umaResolutionStatus: "resolved",
    };

    expect(getCurrentPriceForTx(baseTx, resolvedMarket)).toBe(1);
    expect(computePerformance(baseTx, 1).currentValue).toBe(10);
  });

  it("uses resolved YES payout for a losing NO position", () => {
    const resolvedMarket: SearchMarketResult = {
      marketId: "m1",
      question: "Will Arsenal win?",
      slug: "arsenal-win",
      conditionId: "0x1",
      outcomes: ["Yes", "No"],
      outcomePrices: [1, 0],
      active: true,
      closed: true,
      probabilityYes: 1,
      umaResolutionStatus: "resolved",
    };

    expect(getCurrentPriceForTx({ ...baseTx, outcome: "NO" }, resolvedMarket)).toBe(0);
    expect(computePerformance({ ...baseTx, outcome: "NO" }, 0).currentValue).toBe(0);
  });
});
