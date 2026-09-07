-- 2回目以降のリマインドを1通にまとめる設定
ALTER TABLE "app_settings" ADD COLUMN "digestRepeatReminders" BOOLEAN NOT NULL DEFAULT true;
