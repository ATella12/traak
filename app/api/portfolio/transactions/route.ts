import { NextRequest, NextResponse } from "next/server";

import { clearPortfolioTransactions, createPortfolioTransaction, importPortfolioTransactions, loadPortfolioState } from "@/src/lib/portfolioPersistence.server";
import type { TransactionInput } from "@/src/lib/storage";

type CreatePayload = {
  transaction?: TransactionInput;
  transactions?: TransactionInput[];
};

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as CreatePayload;

  if (Array.isArray(payload.transactions)) {
    const result = await importPortfolioTransactions(payload.transactions);
    return NextResponse.json(result);
  }

  if (!payload.transaction) {
    return NextResponse.json({ error: "Missing transaction payload." }, { status: 400 });
  }

  const transaction = await createPortfolioTransaction(payload.transaction);
  return NextResponse.json({ transaction });
}

export async function DELETE() {
  await clearPortfolioTransactions();
  const state = await loadPortfolioState();
  return NextResponse.json(state);
}
