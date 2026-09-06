-- リマインド間隔のバックオフ設定
ALTER TABLE "app_settings"
  ADD COLUMN "reminderBackoffEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "maxReminderIntervalMinutes" INTEGER NOT NULL DEFAULT 480,
  ADD COLUMN "lineMonthlyFreeQuota" INTEGER NOT NULL DEFAULT 5000;

-- LINEグループの人数（通数は人数分カウントされるため実測に必要）
ALTER TABLE "notification_channels" ADD COLUMN "memberCount" INTEGER;

-- LINEの消費通数の実測記録
CREATE TABLE "message_usage" (
    "id" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" "ChannelType" NOT NULL,
    "target" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,

    CONSTRAINT "message_usage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "message_usage_sentAt_idx" ON "message_usage"("sentAt");
