import { NextRequest, NextResponse } from "next/server";

import { buildWalletActivityUrl, isValidWalletAddress, normalizeWalletTrade, type WalletActivityTrade } from "@/src/lib/walletImport";
import type { TransactionInput } from "@/src/lib/storage";

const PAGE_SIZE = 500;
const MAX_FETCHED_TRADES = 2_000;

type WalletTradesResponse = {
  connectedWalletAddress: string;
  proxyWallet: string;
  tradesFound: number;
  transactions: TransactionInput[];
};

export async function GET(request: NextRequest) {
  const connectedWalletAddress = request.nextUrl.searchParams.get("connectedWalletAddress")?.trim().toLowerCase() ?? "";
  const proxyWallet = request.nextUrl.searchParams.get("proxyWallet")?.trim().toLowerCase() ?? "";

  if (!isValidWalletAddress(connectedWalletAddress) || !isValidWalletAddress(proxyWallet)) {
    return NextResponse.json({ error: "Valid connected and proxy wallet addresses are required." }, { status: 400 });
  }

  try {
    const allTrades: WalletActivityTrade[] = [];

    for (let offset = 0; offset < MAX_FETCHED_TRADES; offset += PAGE_SIZE) {
      const response = await fetch(buildWalletActivityUrl(proxyWallet, offset, PAGE_SIZE), {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Wallet trade fetch failed with status ${response.status}`);
      }

      const payload = (await response.json()) as unknown;
      const trades = Array.isArray(payload) ? (payload as WalletActivityTrade[]) : [];
      allTrades.push(...trades);

      if (trades.length < PAGE_SIZE) break;
    }

    const transactions = allTrades
      .map((trade) => normalizeWalletTrade({ connectedWalletAddress, proxyWallet }, trade))
      .filter((transaction): transaction is NonNullable<typeof transaction> => transaction !== null);

    const body: WalletTradesResponse = {
      connectedWalletAddress,
      proxyWallet,
      tradesFound: transactions.length,
      transactions,
    };

    return NextResponse.json(body);
  } catch {
    return NextResponse.json({ error: "Unable to fetch wallet trades right now." }, { status: 502 });
  }
}
