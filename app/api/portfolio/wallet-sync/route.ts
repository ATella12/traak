import { NextRequest, NextResponse } from "next/server";

import { recordPortfolioWalletSync } from "@/src/lib/portfolioPersistence.server";
import type { WalletSyncStatus } from "@/src/lib/storage";

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as { status?: WalletSyncStatus };
  if (!payload.status) {
    return NextResponse.json({ error: "Missing wallet sync payload." }, { status: 400 });
  }

  const status = await recordPortfolioWalletSync(payload.status);
  return NextResponse.json({ status });
}
