-- 担当者が設定されていても社内共通の通知先へ同報する（担当者以外が返信する運用のため既定で有効）
ALTER TABLE "app_settings" ADD COLUMN "alwaysNotifyDefaultGroup" BOOLEAN NOT NULL DEFAULT true;
