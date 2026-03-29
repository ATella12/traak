import type { SearchMarketResult } from "@/src/lib/gammaSearch";
import type { Transaction } from "@/src/lib/storage";

const normalizeText = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
const getRawSourceField = (transaction: Transaction, field: "eventSlug" | "conditionId"): string | undefined => {
  if (!transaction.rawSource || typeof transaction.rawSource !== "object") return undefined;
  const value = (transaction.rawSource as Record<string, unknown>)[field];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

export const getWalletImportedEventSlug = (transaction: Transaction): string | undefined => {
  if (transaction.source !== "wallet") return undefined;
  return getRawSourceField(transaction, "eventSlug");
};

export const getWalletImportedConditionId = (transaction: Transaction): string | undefined => {
  if (transaction.source !== "wallet") return undefined;
  return (getRawSourceField(transaction, "conditionId") ?? transaction.marketId.trim()) || undefined;
};

export const findMatchingPortfolioMarket = (tx: Transaction, markets: SearchMarketResult[]): SearchMarketResult | null => {
  const marketId = tx.marketId.trim();
  const question = normalizeText(tx.marketTitle);

  const walletConditionId = getWalletImportedConditionId(tx);
  const byMarketId = markets.find(
    (market) => market.marketId === marketId || market.conditionId === marketId || (walletConditionId ? market.conditionId === walletConditionId : false),
  );
  if (byMarketId) return byMarketId;

  if (tx.source === "wallet") {
    return null;
  }

  const bySlug = markets.find((market) => market.slug === marketId);
  if (bySlug) return bySlug;

  const byQuestion = markets.find((market) => normalizeText(market.question) === question);
  if (byQuestion) return byQuestion;

  return null;
};
