import { describe, expect, it } from "vitest";

import type { SearchMarketResult } from "@/src/lib/gammaSearch";
import { findMatchingPortfolioMarket, getWalletImportedConditionId, getWalletImportedEventSlug } from "@/src/lib/portfolioLookup";
import type { Transaction } from "@/src/lib/storage";

const market = (overrides: Partial<SearchMarketResult> = {}): SearchMarketResult => ({
  marketId: "market-1",
  question: "Will Arsenal win on 2026-03-01?",
  slug: "arsenal-win-2026-03-01",
  conditionId: "0xcondition-1",
  outcomes: ["Yes", "No"],
  outcomePrices: [0.6, 0.4],
  active: true,
  closed: false,
  probabilityYes: 0.6,
  ...overrides,
});

const tx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: "tx-1",
  source: "wallet",
  sourceType: "wallet",
  sourceId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  marketId: "0xcondition-1",
  marketTitle: "Will Arsenal win on 2026-03-01?",
  side: "BUY",
  outcome: "YES",
  shares: 5,
  price: 0.4,
  timestamp: "2026-03-01T10:00:00.000Z",
  createdAt: "2026-03-01T10:00:00.000Z",
  updatedAt: "2026-03-01T10:00:00.000Z",
  rawSource: { eventSlug: "arsenal-v-chelsea-2026-03-01", conditionId: "0xcondition-1" },
  ...overrides,
});

describe("findMatchingPortfolioMarket", () => {
  it("matches wallet imports by exact market identity", () => {
    const result = findMatchingPortfolioMarket(tx(), [market()]);
    expect(result?.conditionId).toBe("0xcondition-1");
  });

  it("reads the imported event slug and condition id from wallet raw source", () => {
    expect(getWalletImportedEventSlug(tx())).toBe("arsenal-v-chelsea-2026-03-01");
    expect(getWalletImportedConditionId(tx())).toBe("0xcondition-1");
  });

  it("does not fuzzy-match wallet imports by recurring question text", () => {
    const recurringMarket = market({
      marketId: "market-2",
      slug: "arsenal-win-2027-03-01",
      conditionId: "0xcondition-2",
    });

    const result = findMatchingPortfolioMarket(tx({ marketId: "0xcondition-missing" }), [recurringMarket]);
    expect(result).toBeNull();
  });

  it("matches wallet imports by raw imported condition id even when market id differs", () => {
    const result = findMatchingPortfolioMarket(tx({ marketId: "market-1" }), [market()]);
    expect(result?.conditionId).toBe("0xcondition-1");
  });

  it("falls back to the stored wallet market id when raw source condition id is missing", () => {
    const walletTransaction = tx({
      marketId: "0xcondition-7",
      rawSource: { eventSlug: "arsenal-v-chelsea-2026-03-01" },
    });

    expect(getWalletImportedConditionId(walletTransaction)).toBe("0xcondition-7");
  });

  it("keeps manual fallback matching behavior unchanged", () => {
    const result = findMatchingPortfolioMarket(
      tx({ source: "manual", marketId: "arsenal-win-2026-03-01" }),
      [market()],
    );

    expect(result?.slug).toBe("arsenal-win-2026-03-01");
  });
});
