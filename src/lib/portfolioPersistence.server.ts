import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";

import { prisma } from "@/src/lib/db";
import type { Transaction, TransactionInput, TransactionUpdate, WalletSyncStatus } from "@/src/lib/storage";
import { buildWalletImportKey, normalizeTimestamp } from "@/src/lib/storage";

const PORTFOLIO_OWNER_COOKIE = "traak_portfolio_owner";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

type PersistedState = {
  transactions: Transaction[];
  connectedWallets: string[];
  walletSyncStatuses: Record<string, WalletSyncStatus>;
};

const normalizeWalletAddress = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();
  return trimmed ? trimmed : undefined;
};

const toPrismaJson = (value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
};

const toTransaction = (value: {
  id: string;
  sourceType: string;
  sourceId: string;
  walletAddress: string | null;
  connectedWalletAddress: string | null;
  proxyWallet: string | null;
  marketId: string;
  marketTitle: string;
  category: string | null;
  side: string;
  outcome: string;
  shares: number;
  price: number;
  fee: number | null;
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
  notes: string | null;
  externalTradeId: string | null;
  rawSource: unknown;
}): Transaction => ({
  id: value.id,
  source: value.sourceType as Transaction["source"],
  sourceType: value.sourceType as Transaction["sourceType"],
  sourceId: value.sourceId,
  walletAddress: value.walletAddress ?? undefined,
  connectedWalletAddress: value.connectedWalletAddress ?? undefined,
  proxyWallet: value.proxyWallet ?? undefined,
  marketId: value.marketId,
  marketTitle: value.marketTitle,
  category: value.category ?? undefined,
  side: value.side as Transaction["side"],
  outcome: value.outcome as Transaction["outcome"],
  shares: value.shares,
  price: value.price,
  fee: value.fee ?? undefined,
  timestamp: value.timestamp.toISOString(),
  createdAt: value.createdAt.toISOString(),
  updatedAt: value.updatedAt.toISOString(),
  notes: value.notes ?? undefined,
  externalTradeId: value.externalTradeId ?? undefined,
  rawSource: value.rawSource ?? undefined,
});

const toWalletSyncStatus = (value: {
  connectedWalletAddress: string;
  polymarketProxyWallet: string | null;
  tradesFound: number;
  tradesImported: number;
  duplicatesSkipped: number;
  lastSyncedAt: Date;
}): WalletSyncStatus => ({
  connectedWalletAddress: value.connectedWalletAddress,
  polymarketProxyWallet: value.polymarketProxyWallet ?? undefined,
  tradesFound: value.tradesFound,
  tradesImported: value.tradesImported,
  duplicatesSkipped: value.duplicatesSkipped,
  lastSyncedAt: value.lastSyncedAt.toISOString(),
});

const normalizeTransactionForDb = (input: TransactionInput | Transaction): Transaction => {
  const timestamp = normalizeTimestamp(input.timestamp);
  const createdAt = normalizeTimestamp(input.createdAt ?? input.timestamp);
  const updatedAt = normalizeTimestamp(input.updatedAt ?? createdAt ?? input.timestamp);
  const sourceType = input.sourceType ?? input.source;
  const sourceId =
    sourceType === "manual"
      ? "manual"
      : normalizeWalletAddress(input.sourceId) ??
        normalizeWalletAddress(input.connectedWalletAddress) ??
        normalizeWalletAddress(input.walletAddress) ??
        "";

  if (!timestamp || !createdAt || !updatedAt || !sourceId) {
    throw new Error("Invalid transaction payload.");
  }

  return {
    ...input,
    source: sourceType,
    sourceType,
    sourceId,
    walletAddress: normalizeWalletAddress(input.walletAddress),
    connectedWalletAddress: normalizeWalletAddress(input.connectedWalletAddress),
    proxyWallet: normalizeWalletAddress(input.proxyWallet),
    timestamp,
    createdAt,
    updatedAt,
  } as Transaction;
};

const getImportKey = (transaction: Transaction): string | undefined => {
  if (transaction.sourceType !== "wallet") return undefined;
  return buildWalletImportKey({
    walletAddress: transaction.walletAddress,
    connectedWalletAddress: transaction.connectedWalletAddress,
    sourceId: transaction.sourceId,
    marketId: transaction.marketId,
    timestamp: transaction.timestamp,
    side: transaction.side,
    outcome: transaction.outcome,
    shares: transaction.shares,
    price: transaction.price,
    externalTradeId: transaction.externalTradeId,
  });
};

export const getOrCreatePortfolioOwner = async (): Promise<string> => {
  const cookieStore = await cookies();
  let ownerKey = cookieStore.get(PORTFOLIO_OWNER_COOKIE)?.value?.trim();

  if (!ownerKey) {
    ownerKey = crypto.randomUUID();
    cookieStore.set(PORTFOLIO_OWNER_COOKIE, ownerKey, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
  }

  const owner = await prisma.portfolioOwner.upsert({
    where: { ownerKey },
    update: {},
    create: { ownerKey },
    select: { id: true },
  });

  return owner.id;
};

export const loadPortfolioState = async (): Promise<PersistedState> => {
  const ownerId = await getOrCreatePortfolioOwner();

  const [transactions, connectedWallets, walletSyncs] = await Promise.all([
    prisma.portfolioTransaction.findMany({
      where: { ownerId },
      orderBy: [{ timestamp: "desc" }, { createdAt: "desc" }],
    }),
    prisma.connectedWallet.findMany({
      where: { ownerId },
      orderBy: { connectedAddress: "asc" },
    }),
    prisma.walletSync.findMany({
      where: { ownerId },
    }),
  ]);

  return {
    transactions: transactions.map(toTransaction),
    connectedWallets: connectedWallets.map((item) => item.connectedAddress),
    walletSyncStatuses: Object.fromEntries(walletSyncs.map((item) => [item.connectedWalletAddress, toWalletSyncStatus(item)])),
  };
};

export const createPortfolioTransaction = async (input: TransactionInput): Promise<Transaction> => {
  const ownerId = await getOrCreatePortfolioOwner();
  const now = new Date().toISOString();
  const transaction = normalizeTransactionForDb({
    ...input,
    id: crypto.randomUUID(),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  });

  const created = await prisma.portfolioTransaction.create({
    data: {
      id: transaction.id,
      ownerId,
      sourceType: transaction.sourceType,
      sourceId: transaction.sourceId,
      walletAddress: transaction.walletAddress,
      connectedWalletAddress: transaction.connectedWalletAddress,
      proxyWallet: transaction.proxyWallet,
      marketId: transaction.marketId,
      marketTitle: transaction.marketTitle,
      category: transaction.category,
      side: transaction.side,
      outcome: transaction.outcome,
      shares: transaction.shares,
      price: transaction.price,
      fee: transaction.fee,
      timestamp: new Date(transaction.timestamp),
      createdAt: new Date(transaction.createdAt),
      updatedAt: new Date(transaction.updatedAt),
      notes: transaction.notes,
      externalTradeId: transaction.externalTradeId,
      importKey: getImportKey(transaction),
      rawSource: toPrismaJson(transaction.rawSource),
    },
  });

  return toTransaction(created);
};

export const importPortfolioTransactions = async (
  inputs: TransactionInput[],
): Promise<{ found: number; imported: number; duplicatesSkipped: number; transactions: Transaction[] }> => {
  const ownerId = await getOrCreatePortfolioOwner();
  const now = new Date().toISOString();
  const normalized = inputs.map((item) =>
    normalizeTransactionForDb({
      ...item,
      id: crypto.randomUUID(),
      createdAt: item.createdAt ?? now,
      updatedAt: now,
    }),
  );

  const importKeys = normalized.map(getImportKey).filter((item): item is string => Boolean(item));
  const existing = importKeys.length
    ? await prisma.portfolioTransaction.findMany({
        where: { ownerId, importKey: { in: importKeys } },
        select: { importKey: true },
      })
    : [];
  const existingKeys = new Set(existing.map((item) => item.importKey).filter((item): item is string => Boolean(item)));

  const created: Transaction[] = [];
  let duplicatesSkipped = 0;

  for (const transaction of normalized) {
    const importKey = getImportKey(transaction);
    if (importKey && existingKeys.has(importKey)) {
      duplicatesSkipped += 1;
      continue;
    }

    const record = await prisma.portfolioTransaction.create({
      data: {
        id: transaction.id,
        ownerId,
        sourceType: transaction.sourceType,
        sourceId: transaction.sourceId,
        walletAddress: transaction.walletAddress,
        connectedWalletAddress: transaction.connectedWalletAddress,
        proxyWallet: transaction.proxyWallet,
        marketId: transaction.marketId,
        marketTitle: transaction.marketTitle,
        category: transaction.category,
        side: transaction.side,
        outcome: transaction.outcome,
        shares: transaction.shares,
        price: transaction.price,
        fee: transaction.fee,
        timestamp: new Date(transaction.timestamp),
        createdAt: new Date(transaction.createdAt),
        updatedAt: new Date(transaction.updatedAt),
        notes: transaction.notes,
        externalTradeId: transaction.externalTradeId,
        importKey,
        rawSource: toPrismaJson(transaction.rawSource),
      },
    });

    if (importKey) existingKeys.add(importKey);
    created.push(toTransaction(record));
  }

  return {
    found: inputs.length,
    imported: created.length,
    duplicatesSkipped,
    transactions: created,
  };
};

export const updatePortfolioTransaction = async (id: string, updates: TransactionUpdate): Promise<Transaction | null> => {
  const ownerId = await getOrCreatePortfolioOwner();
  const existing = await prisma.portfolioTransaction.findFirst({ where: { ownerId, id } });
  if (!existing) return null;

  const safeUpdates = { ...updates } as TransactionUpdate & Partial<Transaction>;
  if (existing.sourceType === "wallet") {
    delete safeUpdates.marketId;
    delete safeUpdates.marketTitle;
    delete safeUpdates.category;
    delete safeUpdates.side;
    delete safeUpdates.outcome;
    delete safeUpdates.shares;
    delete safeUpdates.price;
    delete safeUpdates.fee;
    delete safeUpdates.timestamp;
  }

  const updated = await prisma.portfolioTransaction.update({
    where: { id },
    data: {
      marketTitle: safeUpdates.marketTitle,
      category: safeUpdates.category,
      side: safeUpdates.side,
      outcome: safeUpdates.outcome,
      shares: safeUpdates.shares,
      price: safeUpdates.price,
      fee: safeUpdates.fee,
      timestamp: safeUpdates.timestamp ? new Date(safeUpdates.timestamp) : undefined,
      notes: safeUpdates.notes?.trim() || null,
      updatedAt: new Date(),
    },
  });

  return toTransaction(updated);
};

export const deletePortfolioTransaction = async (id: string): Promise<void> => {
  const ownerId = await getOrCreatePortfolioOwner();
  await prisma.portfolioTransaction.deleteMany({ where: { ownerId, id } });
};

export const clearPortfolioTransactions = async (): Promise<void> => {
  const ownerId = await getOrCreatePortfolioOwner();
  await prisma.portfolioTransaction.deleteMany({ where: { ownerId } });
  await prisma.connectedWallet.deleteMany({ where: { ownerId } });
  await prisma.walletSync.deleteMany({ where: { ownerId } });
};

export const recordConnectedWallet = async (connectedWalletAddress: string, proxyWallet?: string): Promise<string[]> => {
  const ownerId = await getOrCreatePortfolioOwner();
  const normalizedAddress = normalizeWalletAddress(connectedWalletAddress);
  if (!normalizedAddress) throw new Error("A valid connected wallet address is required.");

  await prisma.connectedWallet.upsert({
    where: {
      ownerId_connectedAddress: {
        ownerId,
        connectedAddress: normalizedAddress,
      },
    },
    update: {
      proxyWallet: normalizeWalletAddress(proxyWallet),
      updatedAt: new Date(),
    },
    create: {
      ownerId,
      connectedAddress: normalizedAddress,
      proxyWallet: normalizeWalletAddress(proxyWallet),
    },
  });

  const connectedWallets = await prisma.connectedWallet.findMany({
    where: { ownerId },
    orderBy: { connectedAddress: "asc" },
    select: { connectedAddress: true },
  });
  return connectedWallets.map((item) => item.connectedAddress);
};

export const removeConnectedWallet = async (
  connectedWalletAddress: string,
): Promise<{ disconnectedWallets: string[]; removedTransactions: number }> => {
  const ownerId = await getOrCreatePortfolioOwner();
  const normalizedAddress = normalizeWalletAddress(connectedWalletAddress);
  if (!normalizedAddress) throw new Error("A valid connected wallet address is required.");

  const deleted = await prisma.portfolioTransaction.deleteMany({
    where: {
      ownerId,
      sourceType: "wallet",
      OR: [{ sourceId: normalizedAddress }, { connectedWalletAddress: normalizedAddress }],
    },
  });
  await prisma.connectedWallet.deleteMany({
    where: {
      ownerId,
      connectedAddress: normalizedAddress,
    },
  });
  await prisma.walletSync.deleteMany({
    where: {
      ownerId,
      connectedWalletAddress: normalizedAddress,
    },
  });

  const connectedWallets = await prisma.connectedWallet.findMany({
    where: { ownerId },
    orderBy: { connectedAddress: "asc" },
    select: { connectedAddress: true },
  });

  return {
    disconnectedWallets: connectedWallets.map((item) => item.connectedAddress),
    removedTransactions: deleted.count,
  };
};

export const recordPortfolioWalletSync = async (status: WalletSyncStatus): Promise<WalletSyncStatus> => {
  const ownerId = await getOrCreatePortfolioOwner();
  const connectedWalletAddress = normalizeWalletAddress(status.connectedWalletAddress);
  const polymarketProxyWallet = normalizeWalletAddress(status.polymarketProxyWallet);
  const lastSyncedAt = normalizeTimestamp(status.lastSyncedAt);

  if (!connectedWalletAddress || !lastSyncedAt) {
    throw new Error("Invalid wallet sync status.");
  }

  await prisma.connectedWallet.upsert({
    where: {
      ownerId_connectedAddress: {
        ownerId,
        connectedAddress: connectedWalletAddress,
      },
    },
    update: {
      proxyWallet: polymarketProxyWallet,
      updatedAt: new Date(),
    },
    create: {
      ownerId,
      connectedAddress: connectedWalletAddress,
      proxyWallet: polymarketProxyWallet,
    },
  });

  const record = await prisma.walletSync.upsert({
    where: {
      ownerId_connectedWalletAddress: {
        ownerId,
        connectedWalletAddress,
      },
    },
    update: {
      polymarketProxyWallet,
      tradesFound: status.tradesFound,
      tradesImported: status.tradesImported,
      duplicatesSkipped: status.duplicatesSkipped,
      lastSyncedAt: new Date(lastSyncedAt),
      updatedAt: new Date(),
    },
    create: {
      ownerId,
      connectedWalletAddress,
      polymarketProxyWallet,
      tradesFound: status.tradesFound,
      tradesImported: status.tradesImported,
      duplicatesSkipped: status.duplicatesSkipped,
      lastSyncedAt: new Date(lastSyncedAt),
    },
  });

  return toWalletSyncStatus(record);
};

export const migratePortfolioState = async (state: PersistedState): Promise<PersistedState> => {
  for (const transaction of state.transactions) {
    if (transaction.sourceType === "wallet") {
      await importPortfolioTransactions([transaction]);
      continue;
    }

    const ownerId = await getOrCreatePortfolioOwner();
    const normalized = normalizeTransactionForDb(transaction);
    await prisma.portfolioTransaction.upsert({
      where: { id: normalized.id },
      update: {
        marketId: normalized.marketId,
        marketTitle: normalized.marketTitle,
        category: normalized.category,
        side: normalized.side,
        outcome: normalized.outcome,
        shares: normalized.shares,
        price: normalized.price,
        fee: normalized.fee,
        timestamp: new Date(normalized.timestamp),
        createdAt: new Date(normalized.createdAt),
        updatedAt: new Date(normalized.updatedAt),
        notes: normalized.notes,
        rawSource: toPrismaJson(normalized.rawSource),
      },
      create: {
        id: normalized.id,
        ownerId,
        sourceType: normalized.sourceType,
        sourceId: normalized.sourceId,
        walletAddress: normalized.walletAddress,
        connectedWalletAddress: normalized.connectedWalletAddress,
        proxyWallet: normalized.proxyWallet,
        marketId: normalized.marketId,
        marketTitle: normalized.marketTitle,
        category: normalized.category,
        side: normalized.side,
        outcome: normalized.outcome,
        shares: normalized.shares,
        price: normalized.price,
        fee: normalized.fee,
        timestamp: new Date(normalized.timestamp),
        createdAt: new Date(normalized.createdAt),
        updatedAt: new Date(normalized.updatedAt),
        notes: normalized.notes,
        externalTradeId: normalized.externalTradeId,
        importKey: getImportKey(normalized),
        rawSource: toPrismaJson(normalized.rawSource),
      },
    });
  }

  for (const connectedWallet of state.connectedWallets) {
    await recordConnectedWallet(connectedWallet);
  }

  for (const status of Object.values(state.walletSyncStatuses)) {
    await recordPortfolioWalletSync(status);
  }

  return loadPortfolioState();
};
