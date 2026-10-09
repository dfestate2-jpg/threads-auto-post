-- 物件情報の一斉配信（メール / 将来的にSMS）

-- CreateEnum
CREATE TYPE "ContactSource" AS ENUM ('LINE_FORM', 'WEB_FORM', 'INQUIRY', 'IMPORT', 'MANUAL');
CREATE TYPE "ConsentStatus" AS ENUM ('OPTED_IN', 'UNKNOWN', 'UNSUBSCRIBED');
CREATE TYPE "PropertyType" AS ENUM ('MANSION', 'HOUSE', 'LAND', 'INVESTMENT', 'OTHER');
CREATE TYPE "CampaignChannel" AS ENUM ('EMAIL', 'SMS');
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'QUEUED', 'SENDING', 'PAUSED', 'SENT', 'FAILED');
CREATE TYPE "RecipientStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');
CREATE TYPE "SuppressionReason" AS ENUM ('UNSUBSCRIBED', 'BOUNCED', 'COMPLAINED', 'MANUAL');

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "kana" TEXT,
    "phone" TEXT,
    "source" "ContactSource" NOT NULL DEFAULT 'IMPORT',
    "consent" "ConsentStatus" NOT NULL DEFAULT 'UNKNOWN',
    "consentAt" TIMESTAMP(3),
    "consentNote" TEXT,
    "customerId" TEXT,
    "areas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "budgetMin" INTEGER,
    "budgetMax" INTEGER,
    "propertyTypes" "PropertyType"[] DEFAULT ARRAY[]::"PropertyType"[],
    "unsubscribedAt" TIMESTAMP(3),
    "bounceCount" INTEGER NOT NULL DEFAULT 0,
    "lastBouncedAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "suppressions" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "channel" "CampaignChannel" NOT NULL DEFAULT 'EMAIL',
    "reason" "SuppressionReason" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppressions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "propertyType" "PropertyType" NOT NULL DEFAULT 'OTHER',
    "area" TEXT,
    "address" TEXT,
    "price" INTEGER,
    "layout" TEXT,
    "sizeSqm" DOUBLE PRECISION,
    "stationAccess" TEXT,
    "description" TEXT,
    "url" TEXT,
    "imageUrl" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "CampaignChannel" NOT NULL DEFAULT 'EMAIL',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "segAreas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "segBudgetMin" INTEGER,
    "segBudgetMax" INTEGER,
    "segTypes" "PropertyType"[] DEFAULT ARRAY[]::"PropertyType"[],
    "segOptedInOnly" BOOLEAN NOT NULL DEFAULT true,
    "segLineSilentOnly" BOOLEAN NOT NULL DEFAULT false,
    "segLineSilentDays" INTEGER NOT NULL DEFAULT 30,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "queuedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "campaign_properties" (
    "campaignId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "campaign_properties_pkey" PRIMARY KEY ("campaignId","propertyId")
);

CREATE TABLE "campaign_recipients" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "name" TEXT,
    "status" "RecipientStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedUntil" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contacts_email_key" ON "contacts"("email");
CREATE UNIQUE INDEX "contacts_customerId_key" ON "contacts"("customerId");
CREATE INDEX "contacts_consent_active_idx" ON "contacts"("consent", "active");
CREATE INDEX "contacts_createdAt_idx" ON "contacts"("createdAt");

CREATE UNIQUE INDEX "suppressions_address_key" ON "suppressions"("address");
CREATE INDEX "suppressions_channel_createdAt_idx" ON "suppressions"("channel", "createdAt");

CREATE INDEX "properties_published_createdAt_idx" ON "properties"("published", "createdAt");

CREATE INDEX "campaigns_status_queuedAt_idx" ON "campaigns"("status", "queuedAt");

CREATE INDEX "campaign_properties_campaignId_position_idx" ON "campaign_properties"("campaignId", "position");

CREATE UNIQUE INDEX "campaign_recipients_campaignId_contactId_key" ON "campaign_recipients"("campaignId", "contactId");
CREATE INDEX "campaign_recipients_campaignId_status_idx" ON "campaign_recipients"("campaignId", "status");
CREATE INDEX "campaign_recipients_status_nextAttemptAt_idx" ON "campaign_recipients"("status", "nextAttemptAt");
CREATE INDEX "campaign_recipients_providerMessageId_idx" ON "campaign_recipients"("providerMessageId");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "campaign_properties" ADD CONSTRAINT "campaign_properties_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_properties" ADD CONSTRAINT "campaign_properties_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
