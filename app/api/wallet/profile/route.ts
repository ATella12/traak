import { NextRequest, NextResponse } from "next/server";

import { isValidWalletAddress } from "@/src/lib/walletImport";

const POLYMARKET_PUBLIC_PROFILE_URL = "https://gamma-api.polymarket.com/public-profile";

type PublicProfileResponse = {
  proxyWallet?: string | null;
  pseudonym?: string | null;
  name?: string | null;
};

export async function GET(request: NextRequest) {
  const connectedWalletAddress = request.nextUrl.searchParams.get("address")?.trim().toLowerCase() ?? "";

  if (!isValidWalletAddress(connectedWalletAddress)) {
    return NextResponse.json({ error: "A valid connected wallet address is required." }, { status: 400 });
  }

  try {
    const url = new URL(POLYMARKET_PUBLIC_PROFILE_URL);
    url.searchParams.set("address", connectedWalletAddress);

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (response.status === 404) {
      return NextResponse.json({
        connectedWalletAddress,
        polymarketProxyWallet: null,
      });
    }

    if (!response.ok) {
      throw new Error(`Public profile fetch failed with status ${response.status}`);
    }

    const profile = (await response.json()) as PublicProfileResponse;
    const polymarketProxyWallet =
      typeof profile.proxyWallet === "string" && profile.proxyWallet.trim() ? profile.proxyWallet.trim().toLowerCase() : null;

    return NextResponse.json({
      connectedWalletAddress,
      polymarketProxyWallet,
      profileName: profile.name ?? profile.pseudonym ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Unable to resolve the Polymarket proxy wallet right now." }, { status: 502 });
  }
}
