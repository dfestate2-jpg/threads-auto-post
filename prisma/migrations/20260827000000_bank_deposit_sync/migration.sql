-- 銀行入金 → スプレッドシート自動反映のためのテーブル追加

-- CreateEnum
CREATE TYPE "DepositSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "bank_deposits" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'freee',
    "externalId" TEXT NOT NULL,
    "depositDate" DATE NOT NULL,
    "payerName" TEXT NOT NULL,
    "rawDescription" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "walletableId" INTEGER,
    "companyId" INTEGER,
    "status" "DepositSyncStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "sheetTitle" TEXT,
    "sheetRow" INTEGER,
    "syncedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bank_deposits_externalId_key" ON "bank_deposits"("externalId");

-- CreateIndex
CREATE INDEX "bank_deposits_status_depositDate_idx" ON "bank_deposits"("status", "depositDate");

-- CreateIndex
CREATE INDEX "bank_deposits_depositDate_idx" ON "bank_deposits"("depositDate");

-- CreateIndex
CREATE INDEX "bank_deposits_sheetTitle_sheetRow_idx" ON "bank_deposits"("sheetTitle", "sheetRow");

-- CreateTable
CREATE TABLE "integration_credentials" (
    "provider" TEXT NOT NULL,
    "accessToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshToken" TEXT NOT NULL,
    "seedFingerprint" TEXT,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_credentials_pkey" PRIMARY KEY ("provider")
);

-- CreateTable
CREATE TABLE "job_locks" (
    "name" TEXT NOT NULL,
    "leaseUntil" TIMESTAMP(3) NOT NULL,
    "holder" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_locks_pkey" PRIMARY KEY ("name")
);
