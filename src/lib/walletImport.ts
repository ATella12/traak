import { normalizeTimestamp, type TransactionInput, type TransactionOutcome, type TransactionSide } from "@/src/lib/storage";

const WALLET_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const POLYMARKET_ACTIVITY_URL = "https://data-api.polymarket.com/activity";

export type WalletActivityTrade = {
  proxyWallet?: string;
  timestamp?: number;
  type?: string;
  size?: number;
  usdcSize?: number;
  transactionHash?: string;
  price?: number;
  side?: string;
  title?: string;
  slug?: string;
  eventSlug?: string;
  outcome?: string;
  conditionId?: string;
};

export const isValidWalletAddress = (value: string): boolean => WALLET_ADDRESS_PATTERN.test(value.trim());

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const normalizeOutcome = (value: unknown): TransactionOutcome | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "YES" || normalized === "NO") return normalized;
  return null;
};

const normalizeSide = (value: unknown): TransactionSide | null => {
  if (value === "BUY" || value === "SELL") return value;
  return null;
};

export const buildWalletActivityUrl = (walletAddress: string, offset = 0, limit = 500): URL => {
  const url = new URL(POLYMARKET_ACTIVITY_URL);
  url.searchParams.set("user", walletAddress);
  url.searchParams.set("type", "TRADE");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("sortBy", "TIMESTAMP");
  url.searchParams.set("sortDirection", "DESC");
  return url;
};

export const normalizeWalletTrade = (
  input: { connectedWalletAddress: string; proxyWallet: string },
  trade: WalletActivityTrade,
): TransactionInput | null => {
  const side = normalizeSide(trade.side);
  const outcome = normalizeOutcome(trade.outcome);
  const shares = toFiniteNumber(trade.size);
  const price = toFiniteNumber(trade.price);
  const normalizedTimestamp = normalizeTimestamp(trade.timestamp);
  const marketId = typeof trade.conditionId === "string" && trade.conditionId.trim() ? trade.conditionId.trim() : null;
  const marketTitle = typeof trade.title === "string" && trade.title.trim() ? trade.title.trim() : null;

  if (!side || !outcome || shares === null || shares <= 0 || price === null || price < 0 || !normalizedTimestamp) {
    return null;
  }

  if (!marketId || !marketTitle) return null;

  const transactionHash = typeof trade.transactionHash === "string" && trade.transactionHash.trim() ? trade.transactionHash.trim() : null;
  const externalTradeId =
    transactionHash ? `${transactionHash}:${normalizedTimestamp}:${marketId}:${side}:${outcome}:${shares}:${price}` : undefined;

  return {
    source: "wallet",
    walletAddress: input.proxyWallet.toLowerCase(),
    connectedWalletAddress: input.connectedWalletAddress.toLowerCase(),
    proxyWallet: input.proxyWallet.toLowerCase(),
    marketId,
    marketTitle,
    category: undefined,
    side,
    outcome,
    shares,
    price,
    fee: undefined,
    timestamp: normalizedTimestamp,
    notes: undefined,
    externalTradeId,
    rawSource: trade,
  };
};
