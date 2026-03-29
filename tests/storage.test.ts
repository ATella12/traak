import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  addTransaction,
  buildWalletImportKey,
  connectWalletSource,
  CONNECTED_WALLETS_STORAGE_KEY,
  disconnectWalletSource,
  getWalletSyncStatus,
  importTransactions,
  initConnectedWalletsFromStorage,
  initTransactionsFromStorage,
  initWalletSyncFromStorage,
  listConnectedWallets,
  listTransactions,
  normalizeTimestamp,
  resolveTransactionTimestamp,
  recordWalletSyncStatus,
  resetStorageStateForTests,
  TRANSACTIONS_STORAGE_KEY,
  WALLET_SYNC_STORAGE_KEY,
} from "@/src/lib/storage";

describe("storage", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStorageStateForTests();
  });

  afterEach(() => {
    localStorage.clear();
    resetStorageStateForTests();
  });

  it("migrates legacy transactions into the canonical model", () => {
    localStorage.setItem(
      "traak.transactions.v1",
      JSON.stringify([
        {
          id: "legacy-1",
          market: {
            slug: "candidate-a",
            question: "Will Candidate A be nominated?",
            category: "Politics",
          },
          side: "BUY",
          outcome: "YES",
          shares: 12,
          price: 0.44,
          fee: 0,
          timestamp: "2026-02-28T10:00:00.000Z",
          notes: "legacy note",
        },
      ]),
    );

    initTransactionsFromStorage();

    expect(listTransactions()).toEqual([
      expect.objectContaining({
        id: "legacy-1",
        source: "manual",
        sourceType: "manual",
        sourceId: "manual",
        marketId: "candidate-a",
        marketTitle: "Will Candidate A be nominated?",
        category: "Politics",
        side: "BUY",
        outcome: "YES",
        shares: 12,
        price: 0.44,
        fee: 0,
        timestamp: "2026-02-28T10:00:00.000Z",
        createdAt: "2026-02-28T10:00:00.000Z",
        updatedAt: "2026-02-28T10:00:00.000Z",
        notes: "legacy note",
      }),
    ]);
    expect(localStorage.getItem(TRANSACTIONS_STORAGE_KEY)).toContain("\"source\":\"manual\"");
  });

  it("deduplicates wallet imports across repeated syncs", () => {
    const walletTrade = {
      source: "wallet" as const,
      walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
      connectedWalletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      proxyWallet: "0x1234567890abcdef1234567890abcdef12345678",
      marketId: "0xcondition",
      marketTitle: "Will Candidate A be nominated?",
      side: "BUY" as const,
      outcome: "YES" as const,
      shares: 10,
      price: 0.55,
      timestamp: "2026-02-28T10:00:00.000Z",
      externalTradeId: "0xtradehash",
      rawSource: { example: true },
    };

    const firstImport = importTransactions([walletTrade]);
    const secondImport = importTransactions([walletTrade]);

    expect(firstImport).toMatchObject({ found: 1, imported: 1, duplicatesSkipped: 0 });
    expect(secondImport).toMatchObject({ found: 1, imported: 0, duplicatesSkipped: 1 });
    expect(listTransactions()).toHaveLength(1);
  });

  it("builds a stable fallback wallet import key when externalTradeId is missing", () => {
    const key = buildWalletImportKey({
      walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
      connectedWalletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      marketId: "0xcondition",
      timestamp: "2026-02-28T10:00:00.000Z",
      side: "BUY",
      outcome: "YES",
      shares: 10,
      price: 0.55,
      externalTradeId: undefined,
    });

    expect(key).toBe("derived|0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa|0xcondition|2026-02-28T10:00:00.000Z|BUY|YES|10|0.55");
  });

  it("normalizes timestamp inputs from seconds, milliseconds, and iso strings", () => {
    expect(normalizeTimestamp(1771675200)).toBe("2026-02-21T12:00:00.000Z");
    expect(normalizeTimestamp(1771675200000)).toBe("2026-02-21T12:00:00.000Z");
    expect(normalizeTimestamp("2026-02-21T12:00:00.000Z")).toBe("2026-02-21T12:00:00.000Z");
  });

  it("treats zero-like and missing timestamps as invalid instead of epoch fallbacks", () => {
    expect(normalizeTimestamp(0)).toBeUndefined();
    expect(normalizeTimestamp("0")).toBeUndefined();
    expect(normalizeTimestamp("")).toBeUndefined();
    expect(normalizeTimestamp(null)).toBeUndefined();
  });

  it("hydrates persisted wallet trades with second-based timestamps correctly", () => {
    localStorage.setItem(
      TRANSACTIONS_STORAGE_KEY,
      JSON.stringify([
        {
          id: "wallet-seconds",
          source: "wallet",
          walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
          connectedWalletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          proxyWallet: "0x1234567890abcdef1234567890abcdef12345678",
          marketId: "0xcondition",
          marketTitle: "Will Candidate A be nominated?",
          side: "BUY",
          outcome: "YES",
          shares: 10,
          price: 0.55,
          timestamp: 1771675200,
        },
      ]),
    );

    initTransactionsFromStorage();

    expect(listTransactions()[0]?.timestamp).toBe("2026-02-21T12:00:00.000Z");
  });

  it("repairs stale wallet timestamps from raw source data during hydration", () => {
    localStorage.setItem(
      TRANSACTIONS_STORAGE_KEY,
      JSON.stringify([
        {
          id: "wallet-stale-epoch",
          source: "wallet",
          walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
          connectedWalletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          proxyWallet: "0x1234567890abcdef1234567890abcdef12345678",
          marketId: "0xcondition",
          marketTitle: "Will Candidate A be nominated?",
          side: "BUY",
          outcome: "YES",
          shares: 10,
          price: 0.55,
          timestamp: "1970-01-21T12:07:55.200Z",
          rawSource: { timestamp: 1771675200 },
        },
      ]),
    );

    initTransactionsFromStorage();

    expect(listTransactions()[0]?.timestamp).toBe("2026-02-21T12:00:00.000Z");
  });

  it("marks unrecoverable wallet timestamps as unknown instead of keeping a 1970 fallback", () => {
    const resolved = resolveTransactionTimestamp({
      source: "wallet",
      timestamp: "1970-01-21T12:07:55.200Z",
      rawSource: undefined,
    });

    expect(resolved).toBeUndefined();
  });

  it("persists wallet sync status", () => {
    initWalletSyncFromStorage();

    recordWalletSyncStatus({
      connectedWalletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      polymarketProxyWallet: "0x1234567890abcdef1234567890abcdef12345678",
      tradesFound: 4,
      tradesImported: 3,
      duplicatesSkipped: 1,
      lastSyncedAt: "2026-03-23T10:00:00.000Z",
    });

    expect(getWalletSyncStatus("0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toEqual({
      connectedWalletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      polymarketProxyWallet: "0x1234567890abcdef1234567890abcdef12345678",
      tradesFound: 4,
      tradesImported: 3,
      duplicatesSkipped: 1,
      lastSyncedAt: "2026-03-23T10:00:00.000Z",
    });
    expect(localStorage.getItem(WALLET_SYNC_STORAGE_KEY)).toContain("\"tradesImported\":3");
  });

  it("keeps manual transactions persisted across refresh and wallet disconnect", () => {
    addTransaction({
      source: "manual",
      marketId: "candidate-a",
      marketTitle: "Will Candidate A be nominated?",
      category: "Politics",
      side: "BUY",
      outcome: "YES",
      shares: 5,
      price: 0.4,
      fee: 0,
      timestamp: "2026-02-28T10:00:00.000Z",
    });

    importTransactions([
      {
        source: "wallet",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        connectedWalletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        proxyWallet: "0x1234567890abcdef1234567890abcdef12345678",
        marketId: "0xcondition",
        marketTitle: "Will Candidate B be nominated?",
        side: "SELL",
        outcome: "NO",
        shares: 3,
        price: 0.61,
        timestamp: "2026-02-28T12:00:00.000Z",
      },
    ]);

    resetStorageStateForTests();
    initTransactionsFromStorage();

    expect(listTransactions().map((tx) => tx.sourceType)).toEqual(["wallet", "manual"]);

    const result = disconnectWalletSource("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

    expect(result.removedTransactions).toBe(1);
    expect(listTransactions()).toHaveLength(1);
    expect(listTransactions()[0]).toMatchObject({
      source: "manual",
      sourceType: "manual",
      sourceId: "manual",
      marketId: "candidate-a",
    });
  });

  it("tracks connected wallets separately from manual transactions", () => {
    initConnectedWalletsFromStorage();

    connectWalletSource("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    connectWalletSource("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");

    expect(listConnectedWallets()).toEqual([
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ]);
    expect(localStorage.getItem(CONNECTED_WALLETS_STORAGE_KEY)).toContain("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });

  it("disconnects only the targeted wallet source", () => {
    importTransactions([
      {
        source: "wallet",
        walletAddress: "0x1111111111111111111111111111111111111111",
        connectedWalletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        proxyWallet: "0x1111111111111111111111111111111111111111",
        marketId: "0xcondition-a",
        marketTitle: "Will Candidate A be nominated?",
        side: "BUY",
        outcome: "YES",
        shares: 2,
        price: 0.5,
        timestamp: "2026-02-28T12:00:00.000Z",
      },
      {
        source: "wallet",
        walletAddress: "0x2222222222222222222222222222222222222222",
        connectedWalletAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        proxyWallet: "0x2222222222222222222222222222222222222222",
        marketId: "0xcondition-b",
        marketTitle: "Will Candidate B be nominated?",
        side: "BUY",
        outcome: "NO",
        shares: 3,
        price: 0.4,
        timestamp: "2026-02-28T13:00:00.000Z",
      },
    ]);

    recordWalletSyncStatus({
      connectedWalletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      polymarketProxyWallet: "0x1111111111111111111111111111111111111111",
      tradesFound: 1,
      tradesImported: 1,
      duplicatesSkipped: 0,
      lastSyncedAt: "2026-03-23T10:00:00.000Z",
    });
    recordWalletSyncStatus({
      connectedWalletAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      polymarketProxyWallet: "0x2222222222222222222222222222222222222222",
      tradesFound: 1,
      tradesImported: 1,
      duplicatesSkipped: 0,
      lastSyncedAt: "2026-03-23T11:00:00.000Z",
    });

    const result = disconnectWalletSource("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

    expect(result.removedTransactions).toBe(1);
    expect(listTransactions()).toHaveLength(1);
    expect(listTransactions()[0]).toMatchObject({
      source: "wallet",
      sourceId: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      marketId: "0xcondition-b",
    });
    expect(getWalletSyncStatus("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBeNull();
    expect(getWalletSyncStatus("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")).not.toBeNull();
  });
});
