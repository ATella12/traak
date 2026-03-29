import { NextResponse } from "next/server";

import { syncMarketsCatalog } from "@/src/lib/marketSync";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!process.env.DEV_ADMIN_TOKEN) {
    return NextResponse.json({ error: "DEV_ADMIN_TOKEN is not configured" }, { status: 400 });
  }

  try {
    const result = await syncMarketsCatalog();
    return NextResponse.json(result);
  } catch (error) {
    console.log("[dev/sync-markets][error]", String(error));
    return NextResponse.json({ error: "Market sync failed" }, { status: 500 });
  }
}
