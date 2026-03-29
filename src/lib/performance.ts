import type { Transaction } from "@/src/lib/storage";

export type PerformanceMetrics = {
  invested: number;
  currentValue: number;
  pnl: number;
  pnlPct: number;
  closeCost?: number;
};

export type PerformanceSeriesPoint = {
  timestamp: string;
  label: string;
  price: number;
  kind: "entry" | "current";
};

type QuoteLike = {
  probabilityYes?: unknown;
  outcomes?: unknown;
  outcomePrices?: unknown;
  active?: unknown;
  closed?: unknown;
  lastTradePrice?: unknown;
  acceptingOrders?: unknown;
  umaResolutionStatus?: unknown;
};

const clampPrice = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

const normalizeOutcomeLabel = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeResolutionStatus = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const normalizeQuotePrice = (value: unknown): number | null => {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;

  if (!Number.isFinite(numeric)) return null;
  if (numeric < 0) return null;
  if (numeric > 1 && numeric <= 100) return clampPrice(numeric / 100);
  if (numeric > 100) return null;
  return clampPrice(numeric);
};

const getYesAndNoPrices = (quote: QuoteLike): { yes: number | null; no: number | null } => {
  const normalizedProbabilityYes = normalizeQuotePrice(quote.probabilityYes);
  if (normalizedProbabilityYes !== null) {
    return {
      yes: normalizedProbabilityYes,
      no: clampPrice(1 - normalizedProbabilityYes),
    };
  }

  const outcomes = Array.isArray(quote.outcomes) ? quote.outcomes : [];
  const prices = Array.isArray(quote.outcomePrices) ? quote.outcomePrices : [];
  if (outcomes.length === 0 || prices.length === 0) {
    return { yes: null, no: null };
  }

  const yesIndex = outcomes.findIndex((item) => normalizeOutcomeLabel(item) === "yes");
  const noIndex = outcomes.findIndex((item) => normalizeOutcomeLabel(item) === "no");

  const yesPrice = normalizeQuotePrice(prices[yesIndex >= 0 ? yesIndex : 0]);
  const noPrice = normalizeQuotePrice(prices[noIndex >= 0 ? noIndex : prices.length > 1 ? 1 : 0]);

  return { yes: yesPrice, no: noPrice };
};

const isBinaryResolvedPair = (yesPrice: number | null, noPrice: number | null): boolean =>
  (yesPrice === 1 && noPrice === 0) || (yesPrice === 0 && noPrice === 1);

const getResolvedPriceForTx = (tx: Transaction, quote: QuoteLike): number | null => {
  const { yes, no } = getYesAndNoPrices(quote);
  const resolutionStatus = normalizeResolutionStatus(quote.umaResolutionStatus);
  const active = quote.active === true;
  const closed = quote.closed === true;

  if (!isBinaryResolvedPair(yes, no)) {
    return null;
  }

  if (resolutionStatus === "resolved" || closed || (!active && quote.acceptingOrders === false)) {
    return tx.outcome === "YES" ? yes : no;
  }

  return null;
};

export const getCurrentPriceForTx = (tx: Transaction, quote: QuoteLike | null | undefined): number | null => {
  if (!quote) return null;

  const resolvedPrice = getResolvedPriceForTx(tx, quote);
  if (resolvedPrice !== null) {
    return resolvedPrice;
  }

  const { yes, no } = getYesAndNoPrices(quote);
  return tx.outcome === "YES" ? yes : no;
};

export const computePerformance = (tx: Transaction, currentPrice: number): PerformanceMetrics => {
  const entry = clampPrice(tx.price);
  const current = clampPrice(currentPrice);
  const quantity = tx.shares;

  if (tx.side === "SELL") {
    const credit = quantity * entry;
    const closeCost = quantity * current;
    const pnl = credit - closeCost;
    return {
      invested: credit,
      currentValue: credit + pnl,
      pnl,
      pnlPct: credit > 0 ? pnl / credit : 0,
      closeCost,
    };
  }

  const invested = quantity * entry;
  const currentValue = quantity * current;
  const pnl = currentValue - invested;
  return {
    invested,
    currentValue,
    pnl,
    pnlPct: invested > 0 ? pnl / invested : 0,
  };
};

export const buildFallbackPerformanceSeries = (
  tx: Transaction,
  currentPrice: number,
  now = new Date(),
): PerformanceSeriesPoint[] => {
  const entryDate = new Date(tx.timestamp);
  const safeEntry = Number.isNaN(entryDate.getTime()) ? now : entryDate;

  return [
    {
      timestamp: safeEntry.toISOString(),
      label: "Entry",
      price: clampPrice(tx.price),
      kind: "entry",
    },
    {
      timestamp: now.toISOString(),
      label: "Current",
      price: clampPrice(currentPrice),
      kind: "current",
    },
  ];
};
