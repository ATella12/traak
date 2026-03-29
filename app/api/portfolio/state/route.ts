import { NextRequest, NextResponse } from "next/server";

import { loadPortfolioState, migratePortfolioState } from "@/src/lib/portfolioPersistence.server";
import type { Transaction, WalletSyncStatus } from "@/src/lib/storage";

type MigrationPayload = {
  transactions?: Transaction[];
  connectedWallets?: string[];
  walletSyncStatuses?: Record<string, WalletSyncStatus>;
};

export async function GET() {
  const state = await loadPortfolioState();
  return NextResponse.json(state);
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as MigrationPayload;
  const state = await migratePortfolioState({
    transactions: Array.isArray(payload.transactions) ? payload.transactions : [],
    connectedWallets: Array.isArray(payload.connectedWallets) ? payload.connectedWallets : [],
    walletSyncStatuses: payload.walletSyncStatuses ?? {},
  });

  return NextResponse.json(state);
}
