-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "ReplyState" AS ENUM ('AWAITING', 'REPLIED');

-- CreateEnum
CREATE TYPE "HandlingStatus" AS ENUM ('UNHANDLED', 'IN_PROGRESS', 'DONE', 'NEEDS_CHECK');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('STAFF', 'MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('ROUTINE', 'ESCALATION', 'GUARD', 'WATCHDOG');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('LINE_GROUP', 'LINE_USER', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "ChannelPurpose" AS ENUM ('DEFAULT_GROUP', 'ADMIN', 'FALLBACK');

-- CreateEnum
CREATE TYPE "ResolvedVia" AS ENUM ('ADMIN_REPLY', 'MANUAL', 'INGEST_API', 'WEBHOOK');

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lineUserId" TEXT,
    "email" TEXT,
    "role" "StaffRole" NOT NULL DEFAULT 'STAFF',
    "managerId" TEXT,
    "notifyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'STAFF',
    "staffId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "lineUserId" TEXT NOT NULL,
    "displayName" TEXT,
    "name" TEXT,
    "pictureUrl" TEXT,
    "note" TEXT,
    "assigneeId" TEXT,
    "reminderIntervalMinutes" INTEGER,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "replyState" "ReplyState" NOT NULL DEFAULT 'REPLIED',
    "handlingStatus" "HandlingStatus" NOT NULL DEFAULT 'DONE',
    "lastInboundAt" TIMESTAMP(3),
    "lastInboundMessageId" TEXT,
    "lastInboundText" TEXT,
    "lastOutboundAt" TIMESTAMP(3),
    "awaitingSince" TIMESTAMP(3),
    "firstUnrepliedAt" TIMESTAMP(3),
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "lastReminderAt" TIMESTAMP(3),
    "nextReminderAt" TIMESTAMP(3),
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "resolvedAt" TIMESTAMP(3),
    "resolvedVia" "ResolvedVia",
    "resolvedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "conversationId" TEXT,
    "direction" "Direction" NOT NULL,
    "lineMessageId" TEXT,
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "text" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "sentByStaffId" TEXT,
    "source" TEXT NOT NULL,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "unrepliedMinutes" INTEGER NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "targets" JSONB NOT NULL,
    "bodyText" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Tokyo',
    "defaultReminderIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "firstReminderDelayMinutes" INTEGER NOT NULL DEFAULT 60,
    "maxRemindersPerCycle" INTEGER NOT NULL DEFAULT 0,
    "businessHours" JSONB NOT NULL,
    "respectBusinessHours" BOOLEAN NOT NULL DEFAULT true,
    "openOnPublicHolidays" BOOLEAN NOT NULL DEFAULT false,
    "countBusinessHoursOnly" BOOLEAN NOT NULL DEFAULT false,
    "maxSilenceGuardMinutes" INTEGER NOT NULL DEFAULT 180,
    "watchdogDelayMinutes" INTEGER NOT NULL DEFAULT 20,
    "includeMessageBodyInNotification" BOOLEAN NOT NULL DEFAULT true,
    "messageExcerptLength" INTEGER NOT NULL DEFAULT 60,
    "dataRetentionMonths" INTEGER NOT NULL DEFAULT 24,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_holidays" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalation_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "thresholdMinutes" INTEGER NOT NULL,
    "notifyAssignee" BOOLEAN NOT NULL DEFAULT true,
    "notifyManager" BOOLEAN NOT NULL DEFAULT false,
    "notifyAdmins" BOOLEAN NOT NULL DEFAULT false,
    "notifyGroup" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "escalation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_channels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ChannelType" NOT NULL,
    "target" TEXT NOT NULL,
    "purpose" "ChannelPurpose" NOT NULL DEFAULT 'DEFAULT_GROUP',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "webhookEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "isRedelivery" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB NOT NULL,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cron_runs" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "claimed" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "cron_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_lineUserId_key" ON "staff"("lineUserId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_email_key" ON "staff"("email");

-- CreateIndex
CREATE INDEX "staff_active_idx" ON "staff"("active");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "customers_lineUserId_key" ON "customers"("lineUserId");

-- CreateIndex
CREATE INDEX "customers_assigneeId_idx" ON "customers"("assigneeId");

-- CreateIndex
CREATE INDEX "customers_blocked_idx" ON "customers"("blocked");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_customerId_key" ON "conversations"("customerId");

-- CreateIndex
CREATE INDEX "conversations_nextReminderAt_idx" ON "conversations"("nextReminderAt");

-- CreateIndex
CREATE INDEX "conversations_replyState_nextReminderAt_idx" ON "conversations"("replyState", "nextReminderAt");

-- CreateIndex
CREATE INDEX "conversations_handlingStatus_idx" ON "conversations"("handlingStatus");

-- CreateIndex
CREATE INDEX "conversations_awaitingSince_idx" ON "conversations"("awaitingSince");

-- CreateIndex
CREATE UNIQUE INDEX "messages_lineMessageId_key" ON "messages"("lineMessageId");

-- CreateIndex
CREATE INDEX "messages_customerId_sentAt_idx" ON "messages"("customerId", "sentAt");

-- CreateIndex
CREATE INDEX "messages_conversationId_sentAt_idx" ON "messages"("conversationId", "sentAt");

-- CreateIndex
CREATE INDEX "messages_direction_sentAt_idx" ON "messages"("direction", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "reminders_dedupeKey_key" ON "reminders"("dedupeKey");

-- CreateIndex
CREATE INDEX "reminders_conversationId_createdAt_idx" ON "reminders"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "reminders_status_scheduledFor_idx" ON "reminders"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "reminders_createdAt_idx" ON "reminders"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "business_holidays_date_key" ON "business_holidays"("date");

-- CreateIndex
CREATE INDEX "business_holidays_date_idx" ON "business_holidays"("date");

-- CreateIndex
CREATE UNIQUE INDEX "escalation_rules_thresholdMinutes_key" ON "escalation_rules"("thresholdMinutes");

-- CreateIndex
CREATE INDEX "escalation_rules_enabled_thresholdMinutes_idx" ON "escalation_rules"("enabled", "thresholdMinutes");

-- CreateIndex
CREATE INDEX "notification_channels_purpose_enabled_idx" ON "notification_channels"("purpose", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_webhookEventId_key" ON "webhook_events"("webhookEventId");

-- CreateIndex
CREATE INDEX "webhook_events_receivedAt_idx" ON "webhook_events"("receivedAt");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_targetType_targetId_idx" ON "audit_logs"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "cron_runs_job_startedAt_idx" ON "cron_runs"("job", "startedAt");

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sentByStaffId_fkey" FOREIGN KEY ("sentByStaffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

