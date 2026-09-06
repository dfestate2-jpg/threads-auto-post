-- 追客の担当と顧客の担当を1つにする。
--
-- 「常に同じはず」の値を2か所に持つと、いつか必ず食い違う。
-- 顧客の担当（customers.assigneeId）ただ1つを正とし、追客側の列は落とす。

-- 落とす前に、追客側にしか入っていない担当を顧客側へ移す。
-- ヒアリングシートで担当を選んだのに、顧客の担当が空のまま／別人のまま、
-- というデータがここで揃う。以後この顧客のリマインドもその担当者へ届く
UPDATE "customers" AS c
SET "assigneeId" = b."assigneeId"
FROM "board_entries" AS b
WHERE b."customerId" = c."id"
  AND b."assigneeId" IS NOT NULL
  AND (c."assigneeId" IS NULL OR c."assigneeId" <> b."assigneeId");

-- DropIndex
DROP INDEX IF EXISTS "board_entries_assigneeId_dueAt_idx";

-- DropForeignKey
ALTER TABLE "board_entries" DROP CONSTRAINT IF EXISTS "board_entries_assigneeId_fkey";

-- AlterTable
ALTER TABLE "board_entries" DROP COLUMN "assigneeId";
