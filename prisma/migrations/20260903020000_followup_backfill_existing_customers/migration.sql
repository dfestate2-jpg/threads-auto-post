-- 稼働中の環境へ追客管理を後から入れるための移行処理。
--
-- 追加した列の既定値のままだと、既にやり取りしているお客様まで
-- 「新規反響・今すぐ電話」として扱われ、移行した瞬間に
-- 「今日やること」が既存のお客様で埋まってしまう。
-- 初日から数百件の期限超過が並ぶ画面は、誰も使わなくなる。
--
-- そこで移行時点で既にいるお客様は、
--   ・初回対応済（すでに接触済み）として扱う
--   ・追客リズムの起点を「移行した時刻」にする（過去に遡って期限超過にしない）
--   ・自動追客は既定でオフにする
-- とし、いま動いている運用を一切乱さずに、新しいお客様から順に
-- 追客管理へ乗せられるようにする。
--
-- 既存のお客様を追客の対象にするときは、顧客画面の
-- 「自動追客の対象にする」をオンにする（オンにした時点からリズムが始まる）。
--
-- 新規インストールでは customers が空のため、この処理は何もしない。

-- 会話（未返信リマインドの記録）がある顧客
UPDATE "customers" c
SET
  "status"            = 'FIRST_CONTACTED',
  "statusSince"       = NOW(),
  "autoFollowEnabled" = false,
  "lastContactAt"     = COALESCE(cv."lastOutboundAt", cv."lastInboundAt"),
  "inquiredAt"        = COALESCE(c."inquiredAt", cv."lastInboundAt", c."createdAt")
FROM "conversations" cv
WHERE cv."customerId" = c."id";

-- 会話の記録が無い顧客（LINE未連携で手登録された等）
UPDATE "customers"
SET
  "status"            = 'FIRST_CONTACTED',
  "statusSince"       = NOW(),
  "autoFollowEnabled" = false,
  "inquiredAt"        = COALESCE("inquiredAt", "createdAt")
WHERE NOT EXISTS (
  SELECT 1 FROM "conversations" cv WHERE cv."customerId" = "customers"."id"
);
