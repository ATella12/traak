import { NextRequest, NextResponse } from "next/server";

import { syncMarketsCatalog } from "@/src/lib/marketSync";

const getAuthToken = (request: NextRequest): string | null => {
  const headerToken = request.headers.get("x-admin-token");
  if (headerToken) return headerToken;

  const auth = request.headers.get("authorization");
  if (!auth) return null;
  const [scheme, token] = auth.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
};

export async function POST(request: NextRequest) {
  const expectedToken = process.env.ADMIN_TOKEN;
  const providedToken = getAuthToken(request);

  if (!expectedToken || !providedToken || providedToken !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncMarketsCatalog();
    return NextResponse.json(result);
  } catch (error) {
    console.log("[sync-markets][error]", String(error));
    return NextResponse.json({ error: "Market sync failed" }, { status: 500 });
  }
}
