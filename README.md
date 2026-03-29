# Traak

Prediction market portfolio tracker built with Next.js App Router + TypeScript + Tailwind.

## Portfolio persistence

Portfolio data is persisted through Prisma-backed API routes instead of relying on browser-only localStorage.

- Manual transactions are saved in the database until explicitly deleted.
- Wallet imports are saved in the database and tied to the connected wallet address.
- Disconnecting a wallet removes only that wallet's imported records.
- Existing browser-stored portfolio data is migrated to the backend on first load when the API is available.

For production, set `DATABASE_URL` to your deployed database. The current Prisma schema uses SQLite for local development.

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create environment file:

```bash
cp .env.example .env
```

3. Generate Prisma client and create the database schema:

```bash
npm run prisma:generate
npx prisma db push
```

4. Run app:

```bash
npm run dev
```

## Market search behavior

`/api/markets/search` proxies Polymarket Gamma `GET /public-search` and keeps a short in-memory cache to smooth over transient failures.

Defaults:

- `keep_closed_markets=1` (closed/resolved markets included)
- `limit_per_type=10`
- searches run when query length is at least 2

## Optional: build local market index

Set `ADMIN_TOKEN` in `.env`, then call the admin sync endpoint.

```powershell
$token = "replace-with-a-strong-token"
Invoke-RestMethod -Method POST `
  -Uri "http://localhost:3000/api/admin/sync-markets" `
  -Headers @{ "x-admin-token" = $token }
```

This indexes Polymarket markets into local SQLite for local data workflows.

## Dev-only sync endpoint

`POST /api/dev/sync-markets` works only when `NODE_ENV !== "production"` and `DEV_ADMIN_TOKEN` is set.
