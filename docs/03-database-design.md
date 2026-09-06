# 03. データベース設計

DBMS: **PostgreSQL 14+** / ORM: **Prisma**
DDL は [`prisma/migrations/20260823000000_init/migration.sql`](../prisma/migrations/20260823000000_init/migration.sql)、
スキーマ定義は [`prisma/schema.prisma`](../prisma/schema.prisma)。

## ER 図

```
  staff ─────┐ assignee                    ┌── manager (自己参照: 責任者)
    │        │                             │
    │        └──────────┐                  │
    │                   ▼                  │
  users              customers ────────────┘
                       │  │  │
        1:1 ───────────┘  │  └───────────┐
          │               │              │
          ▼               ▼              ▼
    conversations      messages       reminders
          │                               ▲
          └───────────────────────────────┘

  app_settings (単一行)   escalation_rules   notification_channels
  business_holidays       webhook_events     audit_logs   cron_runs
```

## テーブル一覧

### `conversations` — 中核（顧客ごとに1行）

未返信の状態と次回通知予定を保持する。**このテーブルだけを見れば「今どうすべきか」が確定する**ように設計している。

| カラム | 型 | 説明 |
|--------|-----|------|
| `customerId` | text UNIQUE | 顧客と 1:1 |
| `replyState` | enum | `AWAITING`（未返信） / `REPLIED`（返信済み）。システムが自動判定 |
| `handlingStatus` | enum | `UNHANDLED` 未対応 / `IN_PROGRESS` 対応中 / `DONE` 対応済み / `NEEDS_CHECK` 要確認。人が管理 |
| `lastInboundAt` | timestamp | 顧客からの最新メッセージ時刻 |
| `lastInboundText` | text | 通知本文用の抜粋（300字） |
| `lastOutboundAt` | timestamp | 担当者からの最新返信時刻 |
| `awaitingSince` | timestamp | **仕様①のカウント起点。追加メッセージでリセットされる** |
| `firstUnrepliedAt` | timestamp | **最初の未返信メッセージ時刻。返信まで動かない** |
| `reminderCount` | int | この未返信サイクルで送った通知回数 |
| `lastReminderAt` | timestamp | 最後に通知した時刻 |
| `nextReminderAt` | timestamp | **次回通知予定。NULL = 送らない。Cron の主索引** |
| `escalationLevel` | int | 発火済みのエスカレーション段階（分） |
| `resolvedAt` / `resolvedVia` / `resolvedById` | | 対応済みになった日時・経路・実行者 |
| `version` | int | 楽観ロック |

**索引**
- `(nextReminderAt)` — Cron の期限抽出
- `(replyState, nextReminderAt)` — 同上の複合絞り込み
- `(handlingStatus)` — 一覧のフィルタ
- `(awaitingSince)` — ソート

> #### `replyState` と `handlingStatus` を分けた理由
> `replyState` は **事実**（返信したか）。`handlingStatus` は **人の判断**（対応中なのか、要確認なのか）。
> 混ぜると「返信済みだが要確認のまま残したい」「未返信だが対応中として着手済みを示したい」が表現できない。
> リマインドの発火は `replyState` のみが決めるため、`handlingStatus` をどう変えても通知漏れは起きない。
> ただし `DONE`（対応済み）への変更だけは「リマインドを止める確定操作」として扱い、`replyState` も更新する。

### `customers` — 顧客

| カラム | 説明 |
|--------|------|
| `lineUserId` UNIQUE | LINE の userId |
| `displayName` | LINE プロフィール名（自動取得） |
| `name` | 管理画面で編集する顧客名（表示はこちらを優先） |
| `assigneeId` | 担当者。NULL なら社内共通グループへ通知【仕様③】 |
| `reminderIntervalMinutes` | 顧客ごとの通知間隔上書き。**NULL = 全体設定に従う / 0 = 通知しない** |
| `blocked` | unfollow 済み。送信対象から外し `要確認` にする |

### `messages` — 送受信ログ

| カラム | 説明 |
|--------|------|
| `direction` | `INBOUND`（顧客→） / `OUTBOUND`（担当者→） |
| `lineMessageId` UNIQUE | **Webhook 再送の冪等性担保**。同じIDは二度登録されない |
| `source` | `LINE_WEBHOOK` / `ADMIN_CONSOLE` / `INGEST_API` / `MANUAL` |
| `sentByStaffId` | 返信した担当者 |
| `raw` | 元イベントの JSON（調査用） |

手動で「対応済み」にした操作も `messageType='manual_resolution'` の OUTBOUND として1件残る。
状態機械の一貫性が保たれ、かつ「誰がいつ対応済みにしたか」が監査できる。

### `reminders` — 通知の記録（二重通知防止の要）

| カラム | 説明 |
|--------|------|
| `dedupeKey` **UNIQUE** | 冪等キー。この制約が二重送信の最終的な保証 |
| `kind` | `ROUTINE` / `ESCALATION` / `GUARD` / `WATCHDOG` |
| `sequence` | サイクル内の通知回数 |
| `unrepliedMinutes` | 送信時点の未返信経過（監査用） |
| `status` | `PENDING` / `SENT` / `FAILED` / `SKIPPED` |
| `attempts` | 試行回数（バックオフの決定に使う） |
| `targets` | jsonb。解決済みの宛先一覧 |
| `bodyText` | 実際に送った本文 |

### `staff` — 社内担当者

`role`（`STAFF` / `MANAGER` / `ADMIN`）と `managerId`（自己参照＝責任者）を持つ。
エスカレーションの「責任者へ」「管理者へ」はここを辿る。
`lineUserId` が未登録なら個人宛通知はできないため、共通グループへ回る。

### `app_settings` — 全体設定（id=1 の単一行）

営業時間（jsonb）、既定の通知間隔、初回待ち時間、無通知の上限、watchdog閾値、
通知本文の設定、データ保持期間などを保持する。

### `escalation_rules` / `notification_channels` / `business_holidays`

- `escalation_rules`: `thresholdMinutes` UNIQUE ＋ 4つの通知先フラグ
- `notification_channels`: `type`（LINE_GROUP / LINE_USER / WEBHOOK）× `purpose`（DEFAULT_GROUP / ADMIN / FALLBACK）
- `business_holidays`: `date` UNIQUE、`isOpen=true` で臨時営業日

### `webhook_events` / `audit_logs` / `cron_runs`

- `webhook_events.webhookEventId` UNIQUE — LINE Webhook の再送を無視する
- `audit_logs` — 誰が何を変更したかの監査
- `cron_runs` — 実行履歴。`/api/health` と外部監視が参照する

## データ量の見積り

問い合わせ 30件/日、メッセージ 5通/件、リマインド 2通/件 と仮定：

| テーブル | 年間行数 | 概算サイズ |
|---------|---------|-----------|
| `messages` | 約 55,000 | 約 40 MB（`raw` 込み） |
| `reminders` | 約 22,000 | 約 10 MB |
| `conversations` | 約 11,000 | 約 3 MB |
| `webhook_events` | 約 55,000 | 約 30 MB |
| **合計** | | **約 85 MB / 年** |

Supabase / Neon の無料枠（500MB / 0.5GB）で数年運用できる。
`app_settings.dataRetentionMonths`（既定24ヶ月）で古いメッセージを削除する運用を想定。

## 運用上の注意

- `DATABASE_URL` には必ず `sslmode=require` を付ける。
- Prisma Migrate を使う（`npx prisma migrate deploy`）。本番で `db push` は使わない。
- `webhook_events` は増え続けるため、90日より古い行を定期削除してよい（冪等性の実用上の必要期間を大きく超えている）。
