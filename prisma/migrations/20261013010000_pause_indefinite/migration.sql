-- 期限を決めない停止（「再開」を押すまで止まったまま）。
-- 期限付きの停止（remindersPausedUntil）とは別に持つ。期限切れで自動復帰する
-- 仕組みをそのまま残したいため、同じ列を使い回さない。
ALTER TABLE "app_settings" ADD COLUMN "remindersPauseIndefinite" BOOLEAN NOT NULL DEFAULT false;
