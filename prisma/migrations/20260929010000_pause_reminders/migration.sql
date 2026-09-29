-- リマインド全体の一時停止
ALTER TABLE "app_settings"
  ADD COLUMN "remindersPausedUntil" TIMESTAMP(3),
  ADD COLUMN "pauseMinutes" INTEGER NOT NULL DEFAULT 60;
