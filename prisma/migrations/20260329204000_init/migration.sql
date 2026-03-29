-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."Market" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Other',
    "raw" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PortfolioOwner" (
    "id" TEXT NOT NULL,
    "ownerKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioOwner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PortfolioTransaction" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "walletAddress" TEXT,
    "connectedWalletAddress" TEXT,
    "proxyWallet" TEXT,
    "marketId" TEXT NOT NULL,
    "marketTitle" TEXT NOT NULL,
    "category" TEXT,
    "side" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "shares" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "fee" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "externalTradeId" TEXT,
    "importKey" TEXT,
    "rawSource" JSONB,

    CONSTRAINT "PortfolioTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ConnectedWallet" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "connectedAddress" TEXT NOT NULL,
    "proxyWallet" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectedWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WalletSync" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "connectedWalletAddress" TEXT NOT NULL,
    "polymarketProxyWallet" TEXT,
    "tradesFound" INTEGER NOT NULL,
    "tradesImported" INTEGER NOT NULL,
    "duplicatesSkipped" INTEGER NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Market_slug_key" ON "public"."Market"("slug");

-- CreateIndex
CREATE INDEX "Market_question_idx" ON "public"."Market"("question");

-- CreateIndex
CREATE INDEX "Market_slug_idx" ON "public"."Market"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioOwner_ownerKey_key" ON "public"."PortfolioOwner"("ownerKey");

-- CreateIndex
CREATE INDEX "PortfolioTransaction_ownerId_idx" ON "public"."PortfolioTransaction"("ownerId");

-- CreateIndex
CREATE INDEX "PortfolioTransaction_ownerId_sourceType_sourceId_idx" ON "public"."PortfolioTransaction"("ownerId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "PortfolioTransaction_ownerId_marketId_idx" ON "public"."PortfolioTransaction"("ownerId", "marketId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioTransaction_ownerId_importKey_key" ON "public"."PortfolioTransaction"("ownerId", "importKey");

-- CreateIndex
CREATE INDEX "ConnectedWallet_ownerId_idx" ON "public"."ConnectedWallet"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedWallet_ownerId_connectedAddress_key" ON "public"."ConnectedWallet"("ownerId", "connectedAddress");

-- CreateIndex
CREATE INDEX "WalletSync_ownerId_idx" ON "public"."WalletSync"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletSync_ownerId_connectedWalletAddress_key" ON "public"."WalletSync"("ownerId", "connectedWalletAddress");

-- AddForeignKey
ALTER TABLE "public"."PortfolioTransaction" ADD CONSTRAINT "PortfolioTransaction_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."PortfolioOwner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConnectedWallet" ADD CONSTRAINT "ConnectedWallet_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."PortfolioOwner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WalletSync" ADD CONSTRAINT "WalletSync_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."PortfolioOwner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
