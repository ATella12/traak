export const TRANSACTIONS_STORAGE_KEY = "traak.transactions.v2";
const LEGACY_TRANSACTIONS_STORAGE_KEY = "traak.transactions.v1";
export const WALLET_SYNC_STORAGE_KEY = "traak.wallet-sync.v1";
export const CONNECTED_WALLETS_STORAGE_KEY = "traak.connected-wallets.v1";
const LOCAL_MIGRATION_MARKER_KEY = "traak.portfolio.backend-migrated.v1";

export type TransactionSource = "manual" | "wallet";
export type TransactionSide = "BUY" | "SELL";
export type TransactionOutcome = "YES" | "NO";

export type Transaction = {
  id: string;
  source: TransactionSource;
  sourceType: TransactionSource;
  sourceId: string;
  walletAddress?: string;
  connectedWalletAddress?: string;
  proxyWallet?: string;
  marketId: string;
  marketTitle: string;
  category?: string;
  side: TransactionSide;
  outcome: TransactionOutcome;
  shares: number;
  price: number;
  fee?: number;
  timestamp: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  externalTradeId?: string;
  rawSource?: unknown;
};

export type TransactionInput = Omit<Transaction, "id" | "sourceType" | "sourceId" | "createdAt" | "updatedAt"> &
  Partial<Pick<Transaction, "sourceType" | "sourceId" | "createdAt" | "updatedAt">>;
type NormalizedTransactionInput = Omit<Transaction, "id">;
export type TransactionUpdate = Partial<
  Omit<
    Transaction,
    "id" | "source" | "sourceType" | "sourceId" | "walletAddress" | "connectedWalletAddress" | "proxyWallet" | "externalTradeId" | "rawSource" | "createdAt" | "updatedAt"
  >
>;

export type ImportTransactionsResult = {
  found: number;
  imported: number;
  duplicatesSkipped: number;
  transactions: Transaction[];
};

export type WalletSyncStatus = {
  connectedWalletAddress: string;
  polymarketProxyWallet?: string;
  tradesFound: number;
  tradesImported: number;
  duplicatesSkipped: number;
  lastSyncedAt: string;
};

type PersistedPortfolioState = {
  transactions: Transaction[];
  connectedWallets: string[];
  walletSyncStatuses: Record<string, WalletSyncStatus>;
};

type LegacyTransaction = {
  id?: unknown;
  market?: {
    slug?: unknown;
    question?: unknown;
    category?: unknown;
  };
  side?: unknown;
  outcome?: unknown;
  shares?: unknown;
  price?: unknown;
  fee?: unknown;
  timestamp?: unknown;
  notes?: unknown;
};

type Listener = () => void;

const EMPTY_TX: Transaction[] = [];
const listeners = new Set<Listener>();
let snapshot: Transaction[] = EMPTY_TX;
let serializedSnapshot = "[]";
let hasInitializedFromStorage = false;

const EMPTY_WALLET_SYNC: Record<string, WalletSyncStatus> = {};
const walletSyncListeners = new Set<Listener>();
let walletSyncSnapshot: Record<string, WalletSyncStatus> = EMPTY_WALLET_SYNC;
let serializedWalletSyncSnapshot = "{}";
let hasInitializedWalletSync = false;
const EMPTY_CONNECTED_WALLETS: string[] = [];
const connectedWalletListeners = new Set<Listener>();
let connectedWalletSnapshot: string[] = EMPTY_CONNECTED_WALLETS;
let serializedConnectedWalletSnapshot = "[]";
let hasInitializedConnectedWallets = false;
let backendHydrationPromise: Promise<void> | null = null;
const UNKNOWN_TIMESTAMP_SENTINEL = "";

const canUseStorage = (): boolean => typeof window !== "undefined";
const canUseBackend = (): boolean => typeof window !== "undefined" && process.env.NODE_ENV !== "test";

const emitTransactions = (): void => {
  listeners.forEach((listener) => listener());
};

const emitWalletSync = (): void => {
  walletSyncListeners.forEach((listener) => listener());
};

const emitConnectedWallets = (): void => {
  connectedWalletListeners.forEach((listener) => listener());
};

const toTrimmedString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const normalizeWalletAddress = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.toLowerCase();
};

const normalizeSourceId = (
  source: TransactionSource,
  fallbackSourceId: string | undefined,
  connectedWalletAddress: string | undefined,
  walletAddress: string | undefined,
): string | undefined => {
  if (source === "manual") return "manual";
  return normalizeWalletAddress(fallbackSourceId) ?? connectedWalletAddress ?? walletAddress;
};

const isSide = (value: unknown): value is TransactionSide => value === "BUY" || value === "SELL";
const isOutcome = (value: unknown): value is TransactionOutcome => value === "YES" || value === "NO";
const isSource = (value: unknown): value is TransactionSource => value === "manual" || value === "wallet";

const NUMERIC_TIMESTAMP_SECONDS_THRESHOLD = 100_000_000_000;

const normalizeTimestampNumber = (value: number): string | undefined => {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const timestampMs = Math.abs(value) < NUMERIC_TIMESTAMP_SECONDS_THRESHOLD ? value * 1000 : value;
  const parsed = new Date(timestampMs);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
};

export const normalizeTimestamp = (value: unknown): string | undefined => {
  if (typeof value === "number") {
    return normalizeTimestampNumber(value);
  }

  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return normalizeTimestampNumber(numeric);
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
};

const getRawSourceTimestamp = (value: unknown): unknown => {
  if (!value || typeof value !== "object") return undefined;
  return "timestamp" in value ? (value as { timestamp?: unknown }).timestamp : undefined;
};

const isEpochFallbackTimestamp = (value: string | undefined): boolean => {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getUTCFullYear() === 1970;
};

export const resolveTransactionTimestamp = (value: Pick<Transaction, "source" | "timestamp" | "rawSource">): string | undefined => {
  const normalizedTimestamp = normalizeTimestamp(value.timestamp);
  const rawSourceTimestamp = normalizeTimestamp(getRawSourceTimestamp(value.rawSource));

  if (value.source === "wallet") {
    if (rawSourceTimestamp && (!normalizedTimestamp || isEpochFallbackTimestamp(normalizedTimestamp))) {
      return rawSourceTimestamp;
    }

    if (normalizedTimestamp && !isEpochFallbackTimestamp(normalizedTimestamp)) {
      return normalizedTimestamp;
    }

    return undefined;
  }

  return normalizedTimestamp;
};

const createId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const sortWalletAddresses = (value: string[]): string[] => [...value].sort((left, right) => left.localeCompare(right));

const normalizeTransactionInput = (value: TransactionInput): NormalizedTransactionInput | null => {
  if (!isSource(value.source)) return null;
  if (!isSide(value.side) || !isOutcome(value.outcome)) return null;

  const marketId = toTrimmedString(value.marketId);
  const marketTitle = toTrimmedString(value.marketTitle);
  const timestamp = normalizeTimestamp(value.timestamp);
  const shares = toFiniteNumber(value.shares);
  const price = toFiniteNumber(value.price);
  const fee = value.fee === undefined ? undefined : toFiniteNumber(value.fee);
  const walletAddress = normalizeWalletAddress(value.walletAddress);
  const connectedWalletAddress = normalizeWalletAddress(value.connectedWalletAddress);
  const proxyWallet = normalizeWalletAddress(value.proxyWallet);
  const category = toTrimmedString(value.category);
  const notes = toTrimmedString(value.notes);
  const externalTradeId = toTrimmedString(value.externalTradeId);
  const sourceId = normalizeSourceId(value.source, toTrimmedString(value.sourceId), connectedWalletAddress, walletAddress);
  const createdAt = normalizeTimestamp(value.createdAt) ?? timestamp;
  const updatedAt = normalizeTimestamp(value.updatedAt) ?? createdAt;

  if (!marketId || !marketTitle || !timestamp) return null;
  if (shares === undefined || shares <= 0) return null;
  if (price === undefined || price < 0) return null;
  if (fee !== undefined && fee < 0) return null;
  if (value.source === "wallet" && !walletAddress) return null;
  if (!sourceId || !createdAt || !updatedAt) return null;

  return {
    source: value.source,
    sourceType: value.source,
    sourceId,
    walletAddress,
    connectedWalletAddress,
    proxyWallet,
    marketId,
    marketTitle,
    category,
    side: value.side,
    outcome: value.outcome,
    shares,
    price,
    fee,
    timestamp,
    createdAt,
    updatedAt,
    notes,
    externalTradeId,
    rawSource: value.rawSource,
  };
};

const normalizeStoredTransaction = (value: unknown): Transaction | null => {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<Transaction>;
  const id = toTrimmedString(candidate.id);
  if (!id) return null;

  const source = candidate.source as TransactionSource;
  const resolvedTimestamp =
    isSource(source)
      ? resolveTransactionTimestamp({
          source,
          timestamp: candidate.timestamp ?? "",
          rawSource: candidate.rawSource,
        })
      : undefined;

  const normalized = normalizeTransactionInput({
    source,
    walletAddress: candidate.walletAddress,
    connectedWalletAddress: candidate.connectedWalletAddress,
    proxyWallet: candidate.proxyWallet,
    marketId: candidate.marketId ?? "",
    marketTitle: candidate.marketTitle ?? "",
    category: candidate.category,
    side: candidate.side as TransactionSide,
    outcome: candidate.outcome as TransactionOutcome,
    shares: candidate.shares ?? 0,
    price: candidate.price ?? 0,
    fee: candidate.fee,
    timestamp: resolvedTimestamp ?? "2000-01-01T00:00:00.000Z",
    sourceId: candidate.sourceId,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    notes: candidate.notes,
    externalTradeId: candidate.externalTradeId,
    rawSource: candidate.rawSource,
  });

  if (!normalized) return null;

  return {
    id,
    ...normalized,
    timestamp: resolvedTimestamp ?? UNKNOWN_TIMESTAMP_SENTINEL,
  };
};

const migrateLegacyTransaction = (value: LegacyTransaction): Transaction | null => {
  const marketSlug = toTrimmedString(value.market?.slug);
  const marketQuestion = toTrimmedString(value.market?.question);
  const timestamp = normalizeTimestamp(value.timestamp);
  const shares = toFiniteNumber(value.shares);
  const price = toFiniteNumber(value.price);
  const fee = toFiniteNumber(value.fee) ?? 0;
  const notes = toTrimmedString(value.notes);
  const category = toTrimmedString(value.market?.category);
  const side = value.side;
  const outcome = value.outcome;

  if (!marketSlug || !marketQuestion || !timestamp || shares === undefined || price === undefined) return null;
  if (!isSide(side) || !isOutcome(outcome)) return null;

  return {
    id: toTrimmedString(value.id) ?? createId(),
    source: "manual",
    sourceType: "manual",
    sourceId: "manual",
    marketId: marketSlug,
    marketTitle: marketQuestion,
    category,
    side,
    outcome,
    shares,
    price,
    fee,
    timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    notes,
  };
};

const parseTransactions = (raw: string | null): Transaction[] => {
  if (!raw) return EMPTY_TX;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return EMPTY_TX;

    const normalized = parsed
      .map((item) => normalizeStoredTransaction(item) ?? migrateLegacyTransaction(item as LegacyTransaction))
      .filter((item): item is Transaction => item !== null);

    return normalized.length === 0 ? EMPTY_TX : normalized;
  } catch {
    return EMPTY_TX;
  }
};

const replaceSnapshot = (next: Transaction[], options?: { persist?: boolean }): boolean => {
  const nextSerialized = JSON.stringify(next);
  if (nextSerialized === serializedSnapshot) return false;

  snapshot = next.length === 0 ? EMPTY_TX : next;
  serializedSnapshot = nextSerialized;

  if (options?.persist && canUseStorage()) {
    if (snapshot.length === 0) {
      window.localStorage.removeItem(TRANSACTIONS_STORAGE_KEY);
    } else {
      window.localStorage.setItem(TRANSACTIONS_STORAGE_KEY, serializedSnapshot);
    }
  }

  emitTransactions();
  return true;
};

const parseWalletSyncSnapshot = (raw: string | null): Record<string, WalletSyncStatus> => {
  if (!raw) return EMPTY_WALLET_SYNC;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return EMPTY_WALLET_SYNC;

    const entries = Object.values(parsed as Record<string, unknown>)
      .map((value) => {
        if (!value || typeof value !== "object") return null;
        const status = value as Partial<WalletSyncStatus>;
        const connectedWalletAddress = normalizeWalletAddress(status.connectedWalletAddress);
        const polymarketProxyWallet = normalizeWalletAddress(status.polymarketProxyWallet);
        const lastSyncedAt = normalizeTimestamp(status.lastSyncedAt);
        const tradesFound = toFiniteNumber(status.tradesFound);
        const tradesImported = toFiniteNumber(status.tradesImported);
        const duplicatesSkipped = toFiniteNumber(status.duplicatesSkipped);

        if (!connectedWalletAddress || !lastSyncedAt) return null;
        if (tradesFound === undefined || tradesImported === undefined || duplicatesSkipped === undefined) return null;

        return [
          connectedWalletAddress,
          {
            connectedWalletAddress,
            polymarketProxyWallet,
            tradesFound,
            tradesImported,
            duplicatesSkipped,
            lastSyncedAt,
          } as WalletSyncStatus,
        ] as const;
      })
      .filter((entry): entry is readonly [string, WalletSyncStatus] => entry !== null);

    return entries.length === 0 ? EMPTY_WALLET_SYNC : Object.fromEntries(entries);
  } catch {
    return EMPTY_WALLET_SYNC;
  }
};

const replaceWalletSyncSnapshot = (next: Record<string, WalletSyncStatus>, options?: { persist?: boolean }): boolean => {
  const nextSerialized = JSON.stringify(next);
  if (nextSerialized === serializedWalletSyncSnapshot) return false;

  walletSyncSnapshot = Object.keys(next).length === 0 ? EMPTY_WALLET_SYNC : next;
  serializedWalletSyncSnapshot = nextSerialized;

  if (options?.persist && canUseStorage()) {
    if (Object.keys(walletSyncSnapshot).length === 0) {
      window.localStorage.removeItem(WALLET_SYNC_STORAGE_KEY);
    } else {
      window.localStorage.setItem(WALLET_SYNC_STORAGE_KEY, serializedWalletSyncSnapshot);
    }
  }

  emitWalletSync();
  return true;
};

const parseConnectedWalletSnapshot = (raw: string | null): string[] => {
  if (!raw) return EMPTY_CONNECTED_WALLETS;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return EMPTY_CONNECTED_WALLETS;

    const normalized = sortWalletAddresses(
      parsed.map((item) => normalizeWalletAddress(typeof item === "string" ? item : undefined)).filter((item): item is string => Boolean(item)),
    );

    return normalized.length === 0 ? EMPTY_CONNECTED_WALLETS : normalized;
  } catch {
    return EMPTY_CONNECTED_WALLETS;
  }
};

const replaceConnectedWalletSnapshot = (next: string[], options?: { persist?: boolean }): boolean => {
  const normalized = next.length === 0 ? EMPTY_CONNECTED_WALLETS : sortWalletAddresses([...new Set(next)]);
  const nextSerialized = JSON.stringify(normalized);
  if (nextSerialized === serializedConnectedWalletSnapshot) return false;

  connectedWalletSnapshot = normalized;
  serializedConnectedWalletSnapshot = nextSerialized;

  if (options?.persist && canUseStorage()) {
    if (connectedWalletSnapshot.length === 0) {
      window.localStorage.removeItem(CONNECTED_WALLETS_STORAGE_KEY);
    } else {
      window.localStorage.setItem(CONNECTED_WALLETS_STORAGE_KEY, serializedConnectedWalletSnapshot);
    }
  }

  emitConnectedWallets();
  return true;
};

const applyPersistedPortfolioState = (
  state: Partial<PersistedPortfolioState>,
  options?: { persistTransactions?: boolean; persistWalletSync?: boolean; persistConnectedWallets?: boolean },
): void => {
  if (state.transactions) {
    void replaceSnapshot(state.transactions, { persist: options?.persistTransactions });
  }
  if (state.walletSyncStatuses) {
    void replaceWalletSyncSnapshot(state.walletSyncStatuses, { persist: options?.persistWalletSync });
  }
  if (state.connectedWallets) {
    void replaceConnectedWalletSnapshot(state.connectedWallets, { persist: options?.persistConnectedWallets });
  }
};

const hasLocalPortfolioStateToMigrate = (): boolean => {
  if (!canUseStorage()) return false;
  return Boolean(
    window.localStorage.getItem(TRANSACTIONS_STORAGE_KEY) ||
      window.localStorage.getItem(LEGACY_TRANSACTIONS_STORAGE_KEY) ||
      window.localStorage.getItem(WALLET_SYNC_STORAGE_KEY) ||
      window.localStorage.getItem(CONNECTED_WALLETS_STORAGE_KEY),
  );
};

const clearLocalPortfolioFallback = (): void => {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(TRANSACTIONS_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_TRANSACTIONS_STORAGE_KEY);
  window.localStorage.removeItem(WALLET_SYNC_STORAGE_KEY);
  window.localStorage.removeItem(CONNECTED_WALLETS_STORAGE_KEY);
  window.localStorage.setItem(LOCAL_MIGRATION_MARKER_KEY, "1");
};

const getLocalPersistedPortfolioState = (): PersistedPortfolioState => ({
  transactions: parseTransactions(window.localStorage.getItem(TRANSACTIONS_STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_TRANSACTIONS_STORAGE_KEY)),
  connectedWallets: parseConnectedWalletSnapshot(window.localStorage.getItem(CONNECTED_WALLETS_STORAGE_KEY)),
  walletSyncStatuses: parseWalletSyncSnapshot(window.localStorage.getItem(WALLET_SYNC_STORAGE_KEY)),
});

const fetchBackendState = async (): Promise<PersistedPortfolioState> => {
  const response = await fetch("/api/portfolio/state", {
    method: "GET",
    cache: "no-store",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Portfolio state fetch failed with status ${response.status}`);
  }
  return (await response.json()) as PersistedPortfolioState;
};

const postBackend = async <T>(url: string, init: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Portfolio request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
};

const migrateLocalPortfolioToBackend = async (): Promise<void> => {
  if (!canUseBackend() || !canUseStorage()) return;
  if (window.localStorage.getItem(LOCAL_MIGRATION_MARKER_KEY) === "1") return;
  if (!hasLocalPortfolioStateToMigrate()) {
    window.localStorage.setItem(LOCAL_MIGRATION_MARKER_KEY, "1");
    return;
  }

  const localState = getLocalPersistedPortfolioState();
  if (
    localState.transactions.length === 0 &&
    localState.connectedWallets.length === 0 &&
    Object.keys(localState.walletSyncStatuses).length === 0
  ) {
    window.localStorage.setItem(LOCAL_MIGRATION_MARKER_KEY, "1");
    return;
  }

  const migrated = await postBackend<PersistedPortfolioState>("/api/portfolio/state", {
    method: "POST",
    body: JSON.stringify(localState),
  });
  applyPersistedPortfolioState(migrated, {
    persistTransactions: true,
    persistWalletSync: true,
    persistConnectedWallets: true,
  });
  clearLocalPortfolioFallback();
};

const hydratePortfolioFromBackend = async (): Promise<void> => {
  if (!canUseBackend()) return;
  if (backendHydrationPromise) return backendHydrationPromise;

  backendHydrationPromise = (async () => {
    try {
      const backendState = await fetchBackendState();
      applyPersistedPortfolioState(backendState, {
        persistTransactions: true,
        persistWalletSync: true,
        persistConnectedWallets: true,
      });
      await migrateLocalPortfolioToBackend();
      const freshState = await fetchBackendState();
      applyPersistedPortfolioState(freshState, {
        persistTransactions: true,
        persistWalletSync: true,
        persistConnectedWallets: true,
      });
    } catch {
      if (canUseStorage()) {
        applyPersistedPortfolioState(getLocalPersistedPortfolioState());
      }
    } finally {
      backendHydrationPromise = null;
    }
  })();

  return backendHydrationPromise;
};

export const initTransactionsFromStorage = (): void => {
  if (!canUseStorage() || hasInitializedFromStorage) return;

  hasInitializedFromStorage = true;
  const v2Raw = window.localStorage.getItem(TRANSACTIONS_STORAGE_KEY);
  const legacyRaw = window.localStorage.getItem(LEGACY_TRANSACTIONS_STORAGE_KEY);
  const parsed = parseTransactions(v2Raw ?? legacyRaw);
  void replaceSnapshot(parsed, { persist: true });
  void hydratePortfolioFromBackend();

  if (legacyRaw) {
    window.localStorage.removeItem(LEGACY_TRANSACTIONS_STORAGE_KEY);
  }
};

const ensureInitialized = (): void => {
  if (!hasInitializedFromStorage) {
    initTransactionsFromStorage();
  }
};

export const initWalletSyncFromStorage = (): void => {
  if (!canUseStorage() || hasInitializedWalletSync) return;

  hasInitializedWalletSync = true;
  const raw = window.localStorage.getItem(WALLET_SYNC_STORAGE_KEY);
  const parsed = parseWalletSyncSnapshot(raw);
  void replaceWalletSyncSnapshot(parsed);
  void hydratePortfolioFromBackend();
};

const ensureWalletSyncInitialized = (): void => {
  if (!hasInitializedWalletSync) {
    initWalletSyncFromStorage();
  }
};

export const initConnectedWalletsFromStorage = (): void => {
  if (!canUseStorage() || hasInitializedConnectedWallets) return;

  hasInitializedConnectedWallets = true;
  const raw = window.localStorage.getItem(CONNECTED_WALLETS_STORAGE_KEY);
  const parsed = parseConnectedWalletSnapshot(raw);
  void replaceConnectedWalletSnapshot(parsed);
  void hydratePortfolioFromBackend();
};

const ensureConnectedWalletsInitialized = (): void => {
  if (!hasInitializedConnectedWallets) {
    initConnectedWalletsFromStorage();
  }
};

export const listTransactions = (): Transaction[] => snapshot;
export const listConnectedWallets = (): string[] => connectedWalletSnapshot;

const toStableNumberText = (value: number): string => value.toFixed(8).replace(/\.?0+$/, "");

export const buildWalletImportKey = (
  input: Pick<TransactionInput, "walletAddress" | "connectedWalletAddress" | "sourceId" | "marketId" | "timestamp" | "side" | "outcome" | "shares" | "price" | "externalTradeId">,
): string => {
  const externalTradeId = toTrimmedString(input.externalTradeId);
  if (externalTradeId) return `external:${externalTradeId}`;

  const sourceId = normalizeWalletAddress(input.sourceId) ?? normalizeWalletAddress(input.connectedWalletAddress) ?? normalizeWalletAddress(input.walletAddress) ?? "";

  return [
    "derived",
    sourceId,
    input.marketId.trim(),
    normalizeTimestamp(input.timestamp) ?? input.timestamp,
    input.side,
    input.outcome,
    toStableNumberText(Number(input.shares)),
    toStableNumberText(Number(input.price)),
  ].join("|");
};

const getTransactionImportKey = (tx: Transaction): string | null => {
  if (tx.source !== "wallet" || !tx.walletAddress) return null;

  return buildWalletImportKey({
    walletAddress: tx.walletAddress,
    connectedWalletAddress: tx.connectedWalletAddress,
    sourceId: tx.sourceId,
    marketId: tx.marketId,
    timestamp: tx.timestamp,
    side: tx.side,
    outcome: tx.outcome,
    shares: tx.shares,
    price: tx.price,
    externalTradeId: tx.externalTradeId,
  });
};

export const addTransaction = (data: TransactionInput): Transaction => {
  ensureInitialized();

  const now = new Date().toISOString();
  const normalized = normalizeTransactionInput({
    ...data,
    createdAt: data.createdAt ?? now,
    updatedAt: now,
  });
  if (!normalized) {
    throw new Error("Invalid transaction payload.");
  }

  const next: Transaction = {
    ...normalized,
    id: createId(),
  };

  void replaceSnapshot([next, ...snapshot], { persist: true });
  if (canUseBackend()) {
    void postBackend<{ transaction: Transaction }>("/api/portfolio/transactions", {
      method: "POST",
      body: JSON.stringify({ transaction: next }),
    })
      .then((response) => {
        void replaceSnapshot([response.transaction, ...snapshot.filter((item) => item.id !== next.id)], { persist: true });
      })
      .catch(() => undefined);
  }
  return next;
};

export const importTransactions = (items: TransactionInput[]): ImportTransactionsResult => {
  ensureInitialized();

  const existingKeys = new Set(snapshot.map((tx) => getTransactionImportKey(tx)).filter((key): key is string => Boolean(key)));
  const nextTransactions: Transaction[] = [];
  let duplicatesSkipped = 0;

  for (const item of items) {
    const now = new Date().toISOString();
    const normalized = normalizeTransactionInput({
      ...item,
      createdAt: item.createdAt ?? now,
      updatedAt: now,
    });
    if (!normalized) continue;

    const importKey =
      normalized.source === "wallet"
        ? buildWalletImportKey({
            walletAddress: normalized.walletAddress,
            connectedWalletAddress: normalized.connectedWalletAddress,
            sourceId: normalized.sourceId,
            marketId: normalized.marketId,
            timestamp: normalized.timestamp,
            side: normalized.side,
            outcome: normalized.outcome,
            shares: normalized.shares,
            price: normalized.price,
            externalTradeId: normalized.externalTradeId,
          })
        : null;

    if (importKey && existingKeys.has(importKey)) {
      duplicatesSkipped += 1;
      continue;
    }

    if (importKey) existingKeys.add(importKey);
    nextTransactions.push({
      id: createId(),
      ...normalized,
    });
  }

  if (nextTransactions.length > 0) {
    void replaceSnapshot([...nextTransactions, ...snapshot], { persist: true });
    if (canUseBackend()) {
      void postBackend<ImportTransactionsResult>("/api/portfolio/transactions", {
        method: "POST",
        body: JSON.stringify({ transactions: nextTransactions }),
      })
        .then((response) => {
          const importedIds = new Set(nextTransactions.map((item) => item.id));
          const merged = [...response.transactions, ...snapshot.filter((item) => !importedIds.has(item.id))];
          void replaceSnapshot(merged, { persist: true });
        })
        .catch(() => undefined);
    }
  }

  return {
    found: items.length,
    imported: nextTransactions.length,
    duplicatesSkipped,
    transactions: nextTransactions,
  };
};

export const deleteTransaction = (id: string): void => {
  ensureInitialized();
  const updated = snapshot.filter((item) => item.id !== id);
  void replaceSnapshot(updated, { persist: true });
  if (canUseBackend()) {
    void postBackend<{ ok: true }>(`/api/portfolio/transactions/${encodeURIComponent(id)}`, {
      method: "DELETE",
      body: JSON.stringify({}),
    }).catch(() => undefined);
  }
};

export const updateTransaction = (id: string, updates: TransactionUpdate): Transaction | null => {
  ensureInitialized();

  let updatedTransaction: Transaction | null = null;
  const updated = snapshot.map((item) => {
    if (item.id !== id) return item;

    const safeUpdates: TransactionUpdate = { ...updates };
    if (item.source === "wallet") {
      delete safeUpdates.marketId;
      delete safeUpdates.marketTitle;
      delete safeUpdates.category;
      delete safeUpdates.side;
      delete safeUpdates.outcome;
      delete safeUpdates.shares;
      delete safeUpdates.price;
      delete safeUpdates.fee;
      delete safeUpdates.timestamp;
      delete (safeUpdates as Partial<Transaction>).connectedWalletAddress;
      delete (safeUpdates as Partial<Transaction>).proxyWallet;
      delete (safeUpdates as Partial<Transaction>).sourceId;
    }

    updatedTransaction = {
      ...item,
      ...safeUpdates,
      updatedAt: new Date().toISOString(),
      notes: safeUpdates.notes?.trim() || undefined,
    };
    return updatedTransaction;
  });

  if (!updatedTransaction) return null;
  void replaceSnapshot(updated, { persist: true });
  if (updatedTransaction && canUseBackend()) {
    void postBackend<{ transaction: Transaction }>(`/api/portfolio/transactions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ updates }),
    })
      .then((response) => {
        void replaceSnapshot(snapshot.map((item) => (item.id === id ? response.transaction : item)), { persist: true });
      })
      .catch(() => undefined);
  }
  return updatedTransaction;
};

export const clearTransactions = (): void => {
  ensureInitialized();
  void replaceSnapshot(EMPTY_TX, { persist: true });
  void replaceWalletSyncSnapshot(EMPTY_WALLET_SYNC, { persist: true });
  void replaceConnectedWalletSnapshot(EMPTY_CONNECTED_WALLETS, { persist: true });
  if (canUseBackend()) {
    void postBackend<PersistedPortfolioState>("/api/portfolio/transactions", {
      method: "DELETE",
      body: JSON.stringify({}),
    })
      .then((state) => {
        applyPersistedPortfolioState(state, {
          persistTransactions: true,
          persistWalletSync: true,
          persistConnectedWallets: true,
        });
      })
      .catch(() => undefined);
  }
};

export const connectWalletSource = (connectedWalletAddress: string): string[] => {
  ensureConnectedWalletsInitialized();
  const normalizedAddress = normalizeWalletAddress(connectedWalletAddress);
  if (!normalizedAddress) {
    throw new Error("A valid connected wallet address is required.");
  }

  const next = [...connectedWalletSnapshot, normalizedAddress];
  void replaceConnectedWalletSnapshot(next, { persist: true });
  if (canUseBackend()) {
    void postBackend<{ connectedWallets: string[] }>("/api/portfolio/wallets", {
      method: "POST",
      body: JSON.stringify({ connectedWalletAddress: normalizedAddress }),
    })
      .then((response) => {
        void replaceConnectedWalletSnapshot(response.connectedWallets, { persist: true });
      })
      .catch(() => undefined);
  }
  return listConnectedWallets();
};

export const disconnectWalletSource = (
  connectedWalletAddress: string,
): { disconnectedWallets: string[]; removedTransactions: number } => {
  ensureInitialized();
  ensureWalletSyncInitialized();
  ensureConnectedWalletsInitialized();

  const normalizedAddress = normalizeWalletAddress(connectedWalletAddress);
  if (!normalizedAddress) {
    throw new Error("A valid connected wallet address is required.");
  }

  const nextTransactions = snapshot.filter(
    (transaction) =>
      !(
        transaction.sourceType === "wallet" &&
        (transaction.sourceId === normalizedAddress || transaction.connectedWalletAddress === normalizedAddress)
      ),
  );
  const removedTransactions = snapshot.length - nextTransactions.length;
  void replaceSnapshot(nextTransactions, { persist: true });

  const nextWalletSync = { ...walletSyncSnapshot };
  delete nextWalletSync[normalizedAddress];
  void replaceWalletSyncSnapshot(nextWalletSync, { persist: true });

  const nextConnectedWallets = connectedWalletSnapshot.filter((walletAddress) => walletAddress !== normalizedAddress);
  void replaceConnectedWalletSnapshot(nextConnectedWallets, { persist: true });
  if (canUseBackend()) {
    void postBackend<{ disconnectedWallets: string[]; removedTransactions: number }>(
      `/api/portfolio/wallets/${encodeURIComponent(normalizedAddress)}`,
      {
        method: "DELETE",
        body: JSON.stringify({}),
      },
    )
      .then((response) => {
        void replaceConnectedWalletSnapshot(response.disconnectedWallets, { persist: true });
        void hydratePortfolioFromBackend();
      })
      .catch(() => undefined);
  }

  return {
    disconnectedWallets: nextConnectedWallets,
    removedTransactions,
  };
};

export const getWalletSyncStatus = (connectedWalletAddress: string): WalletSyncStatus | null => {
  ensureWalletSyncInitialized();
  const normalizedAddress = normalizeWalletAddress(connectedWalletAddress);
  if (!normalizedAddress) return null;
  return walletSyncSnapshot[normalizedAddress] ?? null;
};

export const recordWalletSyncStatus = (status: WalletSyncStatus): WalletSyncStatus => {
  ensureWalletSyncInitialized();
  ensureConnectedWalletsInitialized();
  const connectedWalletAddress = normalizeWalletAddress(status.connectedWalletAddress);
  const polymarketProxyWallet = normalizeWalletAddress(status.polymarketProxyWallet);
  const lastSyncedAt = normalizeTimestamp(status.lastSyncedAt);

  if (!connectedWalletAddress || !lastSyncedAt) {
    throw new Error("Invalid wallet sync status.");
  }

  const nextStatus: WalletSyncStatus = {
    connectedWalletAddress,
    polymarketProxyWallet,
    tradesFound: status.tradesFound,
    tradesImported: status.tradesImported,
    duplicatesSkipped: status.duplicatesSkipped,
    lastSyncedAt,
  };

  void replaceWalletSyncSnapshot(
    {
      ...walletSyncSnapshot,
      [connectedWalletAddress]: nextStatus,
    },
    { persist: true },
  );
  void replaceConnectedWalletSnapshot([...connectedWalletSnapshot, connectedWalletAddress], { persist: true });
  if (canUseBackend()) {
    void postBackend<{ status: WalletSyncStatus }>("/api/portfolio/wallet-sync", {
      method: "POST",
      body: JSON.stringify({ status: nextStatus }),
    })
      .then((response) => {
        void replaceWalletSyncSnapshot(
          {
            ...walletSyncSnapshot,
            [connectedWalletAddress]: response.status,
          },
          { persist: true },
        );
      })
      .catch(() => undefined);
    void postBackend<{ connectedWallets: string[] }>("/api/portfolio/wallets", {
      method: "POST",
      body: JSON.stringify({ connectedWalletAddress, polymarketProxyWallet }),
    })
      .then((response) => {
        void replaceConnectedWalletSnapshot(response.connectedWallets, { persist: true });
      })
      .catch(() => undefined);
  }

  return nextStatus;
};

export const subscribeTransactions = (listener: Listener): (() => void) => {
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key !== TRANSACTIONS_STORAGE_KEY && event.key !== LEGACY_TRANSACTIONS_STORAGE_KEY && event.key !== null) return;
    if (!canUseStorage()) return;

    const raw = window.localStorage.getItem(TRANSACTIONS_STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_TRANSACTIONS_STORAGE_KEY);
    const parsed = parseTransactions(raw);
    void replaceSnapshot(parsed);
  };

  if (canUseStorage()) {
    window.addEventListener("storage", onStorage);
  }

  return () => {
    listeners.delete(listener);
    if (canUseStorage()) {
      window.removeEventListener("storage", onStorage);
    }
  };
};

export const subscribeWalletSyncStatus = (listener: Listener): (() => void) => {
  walletSyncListeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key !== WALLET_SYNC_STORAGE_KEY && event.key !== null) return;
    if (!canUseStorage()) return;

    const raw = event.key === WALLET_SYNC_STORAGE_KEY ? event.newValue : window.localStorage.getItem(WALLET_SYNC_STORAGE_KEY);
    const parsed = parseWalletSyncSnapshot(raw);
    void replaceWalletSyncSnapshot(parsed);
  };

  if (canUseStorage()) {
    window.addEventListener("storage", onStorage);
  }

  return () => {
    walletSyncListeners.delete(listener);
    if (canUseStorage()) {
      window.removeEventListener("storage", onStorage);
    }
  };
};

export const subscribeConnectedWallets = (listener: Listener): (() => void) => {
  connectedWalletListeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key !== CONNECTED_WALLETS_STORAGE_KEY && event.key !== null) return;
    if (!canUseStorage()) return;

    const raw = event.key === CONNECTED_WALLETS_STORAGE_KEY ? event.newValue : window.localStorage.getItem(CONNECTED_WALLETS_STORAGE_KEY);
    const parsed = parseConnectedWalletSnapshot(raw);
    void replaceConnectedWalletSnapshot(parsed);
  };

  if (canUseStorage()) {
    window.addEventListener("storage", onStorage);
  }

  return () => {
    connectedWalletListeners.delete(listener);
    if (canUseStorage()) {
      window.removeEventListener("storage", onStorage);
    }
  };
};

export const resetStorageStateForTests = (): void => {
  snapshot = EMPTY_TX;
  serializedSnapshot = "[]";
  hasInitializedFromStorage = false;
  walletSyncSnapshot = EMPTY_WALLET_SYNC;
  serializedWalletSyncSnapshot = "{}";
  hasInitializedWalletSync = false;
  connectedWalletSnapshot = EMPTY_CONNECTED_WALLETS;
  serializedConnectedWalletSnapshot = "[]";
  hasInitializedConnectedWallets = false;
  listeners.clear();
  walletSyncListeners.clear();
  connectedWalletListeners.clear();
};
