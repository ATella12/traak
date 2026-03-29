import { NextRequest, NextResponse } from "next/server";

import { recordConnectedWallet } from "@/src/lib/portfolioPersistence.server";

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as { connectedWalletAddress?: string; polymarketProxyWallet?: string };
  if (!payload.connectedWalletAddress) {
    return NextResponse.json({ error: "Missing connected wallet address." }, { status: 400 });
  }

  const connectedWallets = await recordConnectedWallet(payload.connectedWalletAddress, payload.polymarketProxyWallet);
  return NextResponse.json({ connectedWallets });
}
