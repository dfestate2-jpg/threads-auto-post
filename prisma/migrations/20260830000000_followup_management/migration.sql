-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('NEW_INQUIRY', 'FIRST_CONTACTED', 'HEARING_DONE', 'PROPOSING', 'AWAITING_QUOTE', 'VIEWING_ARRANGING', 'VIEWED', 'APPLICATION_REVIEW', 'APPLIED', 'CONTRACTED', 'ON_HOLD', 'NO_REPLY', 'LOST', 'DORMANT');

-- CreateEnum
CREATE TYPE "FollowUpPriority" AS ENUM ('S', 'A', 'B', 'C');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('LINE', 'CALL', 'PROPOSE', 'VIEWING', 'QUOTE', 'MEETING', 'SYSTEM', 'OTHER');

-- CreateEnum
CREATE TYPE "FollowUpSource" AS ENUM ('MANUAL', 'ADMIN_REPLY', 'AUTO', 'LINE_INBOUND', 'LINE_OUTBOUND');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "autoFollowEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "contractAmount" INTEGER,
ADD COLUMN     "contractedAt" TIMESTAMP(3),
ADD COLUMN     "customFields" JSONB,
ADD COLUMN     "desiredArea" TEXT,
ADD COLUMN     "desiredRent" INTEGER,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "followUpStep" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "inquiredAt" TIMESTAMP(3),
ADD COLUMN     "inquirySource" TEXT,
ADD COLUMN     "lastContactAt" TIMESTAMP(3),
ADD COLUMN     "lostAt" TIMESTAMP(3),
ADD COLUMN     "lostReason" TEXT,
ADD COLUMN     "moveInBy" TIMESTAMP(3),
ADD COLUMN     "moveInTiming" TEXT,
ADD COLUMN     "nextActionAt" TIMESTAMP(3),
ADD COLUMN     "nextActionNote" TEXT,
ADD COLUMN     "nextActionType" "ActionType",
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "priority" "FollowUpPriority" NOT NULL DEFAULT 'B',
ADD COLUMN     "priorityOverride" "FollowUpPriority",
ADD COLUMN     "requirements" TEXT,
ADD COLUMN     "status" "CustomerStatus" NOT NULL DEFAULT 'NEW_INQUIRY',
ADD COLUMN     "statusSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "lineUserId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "follow_up_rules" (
    "id" TEXT NOT NULL,
    "status" "CustomerStatus" NOT NULL,
    "step" INTEGER NOT NULL,
    "offsetMinutes" INTEGER NOT NULL,
    "actionType" "ActionType" NOT NULL,
    "label" TEXT NOT NULL,
    "templateKey" TEXT,
    "notifyStaff" BOOLEAN NOT NULL DEFAULT false,
    "transitionTo" "CustomerStatus",
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "follow_up_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_logs" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "staffId" TEXT,
    "actionType" "ActionType" NOT NULL,
    "source" "FollowUpSource" NOT NULL DEFAULT 'MANUAL',
    "result" TEXT,
    "note" TEXT,
    "statusBefore" "CustomerStatus",
    "statusAfter" "CustomerStatus",
    "scheduledFor" TIMESTAMP(3),
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_up_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "CustomerStatus",
    "actionType" "ActionType",
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "follow_up_rules_status_enabled_idx" ON "follow_up_rules"("status", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "follow_up_rules_status_step_key" ON "follow_up_rules"("status", "step");

-- CreateIndex
CREATE UNIQUE INDEX "follow_up_logs_dedupeKey_key" ON "follow_up_logs"("dedupeKey");

-- CreateIndex
CREATE INDEX "follow_up_logs_customerId_occurredAt_idx" ON "follow_up_logs"("customerId", "occurredAt");

-- CreateIndex
CREATE INDEX "follow_up_logs_occurredAt_idx" ON "follow_up_logs"("occurredAt");

-- CreateIndex
CREATE INDEX "follow_up_logs_staffId_occurredAt_idx" ON "follow_up_logs"("staffId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_key_key" ON "message_templates"("key");

-- CreateIndex
CREATE INDEX "message_templates_status_enabled_idx" ON "message_templates"("status", "enabled");

-- CreateIndex
CREATE INDEX "customers_status_idx" ON "customers"("status");

-- CreateIndex
CREATE INDEX "customers_nextActionAt_idx" ON "customers"("nextActionAt");

-- CreateIndex
CREATE INDEX "customers_assigneeId_nextActionAt_idx" ON "customers"("assigneeId", "nextActionAt");

-- CreateIndex
CREATE INDEX "customers_priority_nextActionAt_idx" ON "customers"("priority", "nextActionAt");

-- AddForeignKey
ALTER TABLE "follow_up_logs" ADD CONSTRAINT "follow_up_logs_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_logs" ADD CONSTRAINT "follow_up_logs_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
