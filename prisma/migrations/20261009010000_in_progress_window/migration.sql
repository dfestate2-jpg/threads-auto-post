-- 「対応中」の期限。公式LINEからの返信を検知できないため、✅ を押した時点から
-- 一定時間は鳴らさないことで、やり取り1往復ごとに偽のリマインドが出るのを止める。
ALTER TABLE "conversations" ADD COLUMN "inProgressUntil" TIMESTAMP(3);

CREATE INDEX "conversations_inProgressUntil_idx" ON "conversations"("inProgressUntil");

ALTER TABLE "app_settings" ADD COLUMN "inProgressMinutes" INTEGER NOT NULL DEFAULT 180;
