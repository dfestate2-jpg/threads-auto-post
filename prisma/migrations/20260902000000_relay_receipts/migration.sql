-- Webhook 受け口の受信記録。
-- 入口が詰まったことに気づけるようにするための最小限の記録で、本文は保存しない。
CREATE TABLE "relay_receipts" (
    "id" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endpoint" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "detail" TEXT NOT NULL,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "shape" TEXT,

    CONSTRAINT "relay_receipts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "relay_receipts_receivedAt_idx" ON "relay_receipts"("receivedAt");
