# 04. API設計

すべて JSON。エラー時は `{ "error": "日本語メッセージ" }` を返す。

## 認証区分

| 区分 | 認証方法 | 対象 |
|------|---------|------|
| LINE | `x-line-signature`（生ボディの HMAC-SHA256 / base64） | `/api/line/webhook` |
| Cron | `x-cron-secret` または `Authorization: Bearer <CRON_SECRET>`（定数時間比較） | `/api/cron/reminders` |
| Ingest | `x-ingest-secret`（定数時間比較） | `/api/ingest/outbound` |
| 管理画面 | HttpOnly セッションCookie ＋ `Origin` 検証（CSRF対策） | それ以外すべて |
| 公開 | なし | `/api/health` |

管理APIの権限は `STAFF < MANAGER < ADMIN`。設定変更系は `MANAGER` 以上。

---

## 1. `POST /api/line/webhook` — 顧客メッセージ受信

LINE Developers の Webhook URL に設定する。

**処理の流れ**

1. **生のリクエストボディ**で署名検証（不一致は `401`）
2. `timestamp` が現在時刻から ±10分を超えていたら破棄（リプレイ対策。ただし再送フラグ付きは通す）
3. `webhookEventId` を `webhook_events` に INSERT。UNIQUE 制約に当たれば**既に処理済みとして無視**
4. イベント種別ごとに処理

| イベント | 処理 |
|---------|------|
| `message`（`source.type='user'`） | メッセージを保存し、会話を未返信にして `nextReminderAt` を計算 |
| `follow` | 顧客を作成 / `blocked` を解除 |
| `unfollow` | `blocked = true`（送信対象から外す） |
| `send` / `sendMessage` | **拡張ポイント。** 担当者の送信イベントを受け取れる環境では OUTBOUND として取り込み、自動で対応済みにする（[07](./07-line-reply-detection.md) 参照） |

**必ず `200` を返す。** 1件の処理失敗で他のイベントを巻き込まず、LINE 側の再送も誘発しない。
グループ・ルームからのイベントは顧客対応の対象外として無視する。

```jsonc
// 応答
{ "ok": true }
```

---

## 2. `POST /api/cron/reminders` — 定期実行（GET も可）

**5分ごと**の起動を推奨。`nextReminderAt <= now` のものを全件処理するため、
数回起動に失敗しても次回で回収され、通知漏れが構造的に発生しない。

```bash
curl -X POST https://<host>/api/cron/reminders -H "x-cron-secret: $CRON_SECRET"
```

```jsonc
{
  "ok": true,
  "claimed": 12,     // 確保した会話数
  "sent": 9,         // 送信できた件数
  "skipped": 3,      // 返信済み・営業時間外・通知OFF等でスキップ
  "failed": 0,       // 全宛先失敗（再試行予定）
  "watchdog": 0,     // 配信遅延を検知した件数
  "durationMs": 842
}
```

---

## 3. `POST /api/ingest/outbound` — 外部連携からの返信取り込み

LINE公式アカウントManagerからの返信を外部システム（iPaaS / CRM / LINE Module Channel）が
検知できる場合に、ここへ POST すると自動的に「対応済み」になる。
`INGEST_SECRET` が未設定なら `404` を返して無効化される。

```jsonc
// リクエスト  (header: x-ingest-secret)
{
  "lineUserId": "Uxxxxxxxx",
  "text": "ご連絡ありがとうございます",
  "sentAt": "2026-08-24T04:30:00.000Z",   // 省略時は現在時刻
  "staffLineUserId": "Uyyyyyyyy",          // 省略可
  "lineMessageId": "123456789"             // 省略可
}
// 応答
{ "ok": true, "conversationId": "...", "stillAwaiting": false, "nextReminderAt": null }
```

---

## 4. `GET /api/health` — 死活監視

外部監視サービス（UptimeRobot / Better Stack 等）から5分間隔で叩く。
**Cron 自体が停止した場合の最後の砦**であり、必ず設定すること。

```jsonc
{
  "ok": true,
  "cronHealthy": true,            // 最終実行から20分以内か
  "lastRunAt": "2026-08-24T04:35:00.000Z",
  "lastRunAgeMinutes": 3,
  "lastRunError": null,
  "overdueConversations": 0       // 30分以上滞留している未返信
}
```

`cronHealthy` が false、または `overdueConversations > 0` のとき **HTTP 503** を返すため、
監視サービスの標準設定（ステータスコード監視）だけでアラートできる。

---

## 5. 管理API

### `POST /api/auth/login` / `POST /api/auth/logout`

`{ "email": "...", "password": "..." }`。
5回失敗で15分ロック。存在しないアカウントでも同じ応答を返し、アカウントの有無を推測させない。

### `PATCH /api/customers/{id}` — 顧客情報・担当者・通知間隔・対応状況

```jsonc
{
  "name": "田中",
  "note": "3LDK希望",
  "assigneeId": "staff_id",              // null で未設定（共通グループへ通知）
  "reminderIntervalMinutes": 120,        // null=全体設定 / 0=通知しない / 60,120,180
  "handlingStatus": "IN_PROGRESS",       // UNHANDLED | IN_PROGRESS | DONE | NEEDS_CHECK
  "version": 7                           // 楽観ロック（不一致なら 409）
}
```

- `handlingStatus: "DONE"` はリマインドを止める確定操作として扱われる。
- 担当者・通知間隔を変更すると、その会話の `nextReminderAt` を即座に引き直す。
- `409` の応答には `currentVersion` が含まれるので、画面はそれを見て再取得できる。

### `POST /api/customers/{id}/reply` — 顧客へ返信（**返信検知の主経路**）

```jsonc
{ "text": "お問い合わせありがとうございます。..." }
```

LINE への push が成功したときにのみ「対応済み」へ遷移させる。
送信に失敗した場合は `502` を返し、**リマインドは止めない**（返信できていないのに通知が止まる事故を防ぐ）。

### `POST /api/customers/{id}/resolve` — 手動で対応済みにする

LINE公式アカウントManager 側で返信した場合に使う。
監査できるよう `manual_resolution` の OUTBOUND レコードを1件残す。

### `PATCH /api/settings` — 全体設定（MANAGER 以上）

営業時間・既定間隔・保険の上限・通知本文設定など。
**保存すると未返信中の全会話の `nextReminderAt` を再計算する**（`rescheduled` 件数を返す）。

### `GET|PUT /api/escalation-rules` — エスカレーション設定（MANAGER 以上）

`PUT` は全置換。同じ `thresholdMinutes` が重複していれば `400`。保存後に全会話を再スケジュールする。

### `GET|POST /api/staff` / `PATCH /api/staff/{id}` — 担当者

`managerId` に自分自身を指定すると `400`。

### `GET|POST /api/channels` / `DELETE /api/channels/{id}` / `POST /api/channels/{id}/test`

`/test` は実際に1通送るテスト送信。**設定ミスを本番の未返信で気付くことがないよう必ず実行する。**

### `POST /api/holidays` / `DELETE /api/holidays/{id}`

`{ "date": "2026-09-21", "name": "敬老の日", "isOpen": false }`。
`isOpen: true` は臨時営業日。保存後に全会話を再スケジュールする。

---

## エラーコード

| コード | 意味 |
|--------|------|
| `400` | 入力値が不正 |
| `401` | 未認証 / 署名・シークレット不一致 |
| `403` | 権限不足 / クロスオリジン |
| `404` | 対象が存在しない / 機能が無効 |
| `409` | 楽観ロック競合（他の担当者が更新した） |
| `429` | ログイン試行のロック中 |
| `502` | LINE API への送信失敗 |
| `503` | ヘルスチェック異常 |
