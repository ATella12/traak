import { NextRequest, NextResponse } from "next/server";

import { deletePortfolioTransaction, updatePortfolioTransaction } from "@/src/lib/portfolioPersistence.server";
import type { TransactionUpdate } from "@/src/lib/storage";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const payload = (await request.json()) as { updates?: TransactionUpdate };

  if (!payload.updates) {
    return NextResponse.json({ error: "Missing transaction updates." }, { status: 400 });
  }

  const transaction = await updatePortfolioTransaction(id, payload.updates);
  if (!transaction) {
    return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
  }

  return NextResponse.json({ transaction });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  await deletePortfolioTransaction(id);
  return NextResponse.json({ ok: true });
}
