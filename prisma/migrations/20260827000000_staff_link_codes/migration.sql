-- 担当者のLINEユーザーIDを本人操作で紐づけるための使い捨てコード
CREATE TABLE "staff_link_codes" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedByLineUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_link_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_link_codes_codeHash_key" ON "staff_link_codes"("codeHash");
CREATE INDEX "staff_link_codes_staffId_idx" ON "staff_link_codes"("staffId");
CREATE INDEX "staff_link_codes_expiresAt_idx" ON "staff_link_codes"("expiresAt");

ALTER TABLE "staff_link_codes" ADD CONSTRAINT "staff_link_codes_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
