import { resolveTransactionTimestamp, type Transaction } from "@/src/lib/storage";

export const POSITION_SHARE_EPSILON = 1e-6;

export type PortfolioPosition = Transaction & {
  positionKey: string;
  tradeCount: number;
  latestFillId: string;
  latestActivityTimestamp: string;
  status: "open" | "closed";
};

type PositionAccumulator = {
  quantity: number;
  averageEntryPrice: number;
  openedAt: string;
  latest: Transaction;
  tradeCount: number;
};

const toSortableTimestamp = (transaction: Transaction): number => {
  const resolved = resolveTransactionTimestamp(transaction);
  if (!resolved) return 0;
  const parsed = new Date(resolved);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const toPositionKey = (transaction: Transaction): string => `${transaction.marketId.trim()}|${transaction.outcome}`;

const toSignedShares = (transaction: Transaction): number => (transaction.side === "BUY" ? transaction.shares : -transaction.shares);
const normalizeExposure = (value: number): number => (Math.abs(value) <= POSITION_SHARE_EPSILON ? 0 : value);

const applyTrade = (accumulator: PositionAccumulator | null, transaction: Transaction): PositionAccumulator => {
  const signedShares = normalizeExposure(toSignedShares(transaction));
  const timestamp = resolveTransactionTimestamp(transaction) ?? transaction.timestamp;

  if (!accumulator || accumulator.quantity === 0) {
    return {
      quantity: signedShares,
      averageEntryPrice: transaction.price,
      openedAt: timestamp,
      latest: transaction,
      tradeCount: 1,
    };
  }

  const currentQuantity = accumulator.quantity;
  const sameDirection = Math.sign(currentQuantity) === Math.sign(signedShares);

  if (sameDirection) {
    const nextQuantity = normalizeExposure(currentQuantity + signedShares);
    const weightedEntry =
      (Math.abs(currentQuantity) * accumulator.averageEntryPrice + Math.abs(signedShares) * transaction.price) / Math.abs(nextQuantity);

    return {
      quantity: nextQuantity,
      averageEntryPrice: weightedEntry,
      openedAt: accumulator.openedAt,
      latest: transaction,
      tradeCount: accumulator.tradeCount + 1,
    };
  }

  const remainingQuantity = normalizeExposure(currentQuantity + signedShares);

  if (remainingQuantity === 0) {
    return {
      quantity: 0,
      averageEntryPrice: 0,
      openedAt: timestamp,
      latest: transaction,
      tradeCount: accumulator.tradeCount + 1,
    };
  }

  if (Math.sign(remainingQuantity) === Math.sign(currentQuantity)) {
    return {
      quantity: remainingQuantity,
      averageEntryPrice: accumulator.averageEntryPrice,
      openedAt: accumulator.openedAt,
      latest: transaction,
      tradeCount: accumulator.tradeCount + 1,
    };
  }

  return {
    quantity: remainingQuantity,
    averageEntryPrice: transaction.price,
    openedAt: timestamp,
    latest: transaction,
    tradeCount: accumulator.tradeCount + 1,
  };
};

export const derivePortfolioPositions = (
  transactions: Transaction[],
): { openPositions: PortfolioPosition[]; closedPositions: PortfolioPosition[] } => {
  const grouped = new Map<string, PositionAccumulator>();
  const sorted = [...transactions].sort((left, right) => toSortableTimestamp(left) - toSortableTimestamp(right));

  for (const transaction of sorted) {
    const key = toPositionKey(transaction);
    const current = grouped.get(key) ?? null;
    grouped.set(key, applyTrade(current, transaction));
  }

  const openPositions: PortfolioPosition[] = [];
  const closedPositions: PortfolioPosition[] = [];

  for (const [positionKey, accumulator] of grouped.entries()) {
    const latestTimestamp = resolveTransactionTimestamp(accumulator.latest) ?? accumulator.latest.timestamp;
    const basePosition: PortfolioPosition = {
      ...accumulator.latest,
      id: positionKey,
      positionKey,
      side: accumulator.quantity >= 0 ? "BUY" : "SELL",
      shares: Math.abs(accumulator.quantity),
      price: accumulator.quantity === 0 ? accumulator.latest.price : accumulator.averageEntryPrice,
      timestamp: accumulator.quantity === 0 ? latestTimestamp : accumulator.openedAt,
      tradeCount: accumulator.tradeCount,
      latestFillId: accumulator.latest.id,
      latestActivityTimestamp: latestTimestamp,
      status: accumulator.quantity === 0 ? "closed" : "open",
    };

    if (accumulator.quantity === 0) {
      closedPositions.push(basePosition);
    } else {
      openPositions.push(basePosition);
    }
  }

  const sortByRecentActivity = (left: PortfolioPosition, right: PortfolioPosition) =>
    toSortableTimestamp({ ...right, id: right.latestFillId }) - toSortableTimestamp({ ...left, id: left.latestFillId });

  return {
    openPositions: openPositions.sort(sortByRecentActivity),
    closedPositions: closedPositions.sort(sortByRecentActivity),
  };
};

export const getPortfolioPositionDisplayStatus = (
  position: Pick<PortfolioPosition, "status" | "shares">,
  currentPrice?: number,
): "OPEN" | "CLOSED" | "WON" | "LOST" => {
  if (position.status === "closed" || Math.abs(position.shares) <= POSITION_SHARE_EPSILON) {
    return "CLOSED";
  }

  if (typeof currentPrice === "number" && Number.isFinite(currentPrice)) {
    if (currentPrice === 1) return "WON";
    if (currentPrice === 0) return "LOST";
  }

  return "OPEN";
};
