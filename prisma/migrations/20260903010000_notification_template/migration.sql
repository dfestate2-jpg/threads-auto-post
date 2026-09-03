-- リマインド本文を設定画面から編集できるようにする
ALTER TABLE "app_settings" ADD COLUMN "notificationTemplate" TEXT;
