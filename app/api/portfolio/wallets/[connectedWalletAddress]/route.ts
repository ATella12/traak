import { NextRequest, NextResponse } from "next/server";

import { removeConnectedWallet } from "@/src/lib/portfolioPersistence.server";

export async function DELETE(_request: NextRequest, context: { params: Promise<{ connectedWalletAddress: string }> }) {
  const { connectedWalletAddress } = await context.params;
  const result = await removeConnectedWallet(connectedWalletAddress);
  return NextResponse.json(result);
}
