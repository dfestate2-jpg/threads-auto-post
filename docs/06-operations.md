# 06. セットアップ・運用手順

## 1. 事前準備

### 1-1. LINE チャネル①（顧客対応用）

1. [LINE Official Account Manager](https://manager.line.biz/) で公式アカウントを作成
2. [LINE Developers](https://developers.line.biz/) でプロバイダーを作成し、
   上記アカウントに紐づく **Messaging API チャネル**を開く
3. 「チャネル基本設定」→ **チャネルシークレット** を控える → `LINE_CHANNEL_SECRET`
4. 「Messaging API設定」→ **チャネルアクセストークン（長期）** を発行 → `LINE_CHANNEL_ACCESS_TOKEN`
5. 「Messaging API設定」で以下を設定
   - Webhook URL: `https://<あなたのドメイン>/api/line/webhook`
   - **Webhookの利用: オン**
   - **応答メッセージ: オフ**（自動応答が返信と誤解されるのを防ぐ）
   - あいさつメッセージ: 任意

### 1-2. LINE チャネル②（社内通知Bot用）

顧客向けと社内向けでメッセージ通数を分けて管理できるよう、**別チャネルを推奨**する。

1. 新しい Messaging API チャネルを作成
2. チャネルアクセストークン（長期）を発行 → `LINE_NOTIFY_CHANNEL_ACCESS_TOKEN`
3. **社内LINEグループにこの Bot を招待する**
4. グループIDの取得方法（どちらでも可）
   - 一時的に Webhook URL をチャネル②にも設定し、グループで何か発言 → `join` / `message` イベントの `source.groupId` を控える
   - もしくは本システムのログ（`[line-webhook]`）から確認
5. 控えた ID → `INTERNAL_LINE_GROUP_ID`

> **コストに注意：** グループ宛の push は「グループ内の人数分」としてカウントされる。
> 5人のグループへ1通送ると5通消費する。詳細は [01-requirements.md](./01-requirements.md#5-1-lineメッセージ通数の見積り)。
> コストを抑えるなら、通知チャネルを Slack / Discord / LINE WORKS の Webhook に切り替える（本システムは対応済み）。

### 1-3. データベース

[Supabase](https://supabase.com/) または [Neon](https://neon.tech/) で PostgreSQL を作成し、
接続文字列を `DATABASE_URL` に設定する（**`?sslmode=require` を必ず付ける**）。

### 1-4. シークレットの生成

```bash
openssl rand -hex 32   # CRON_SECRET
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 32   # INGEST_SECRET（外部連携を使う場合のみ）
```

---

## 2. デプロイ

### 2-A. Netlify（無料枠で商用利用可・最安構成）

```bash
npm i -g netlify-cli
netlify init
netlify env:import .env      # 環境変数を投入
netlify deploy --prod
```

`netlify.toml` と `netlify/functions/reminders-cron.mts` により、
**5分ごとのスケジュール実行**が自動で設定される。

### 2-B. Vercel

```bash
npm i -g vercel
vercel link
vercel env add DATABASE_URL   # 以下、必要な変数を順に追加
vercel --prod
```

`vercel.json` の `crons` で5分ごとの実行が設定される。

> ⚠️ **Vercel の Hobby プランは商用利用不可。** 不動産会社の業務利用は商用に該当するため Pro（$20/月）が必要。
> また Hobby プランの Cron は1日1回までという制限があるため、いずれにせよ Pro が前提になる。

### 2-C. スケジューラだけ外部に置く場合

ホスティング側に Cron が無い場合は、`.github/workflows/cron-reminders.yml`（GitHub Actions）または
[cron-job.org](https://cron-job.org/) 等から下記を叩く。

```bash
curl -X POST https://<host>/api/cron/reminders -H "x-cron-secret: $CRON_SECRET"
```

> GitHub Actions のスケジュールは数分〜十数分の遅延が発生することがある。
> リマインド精度を重視するなら Vercel Cron / Netlify Scheduled Functions を推奨。

### 2-D. マイグレーションと初期データ

```bash
npx prisma migrate deploy    # スキーマ適用
npm run seed                 # 設定・エスカレーション・祝日・管理者ユーザー
```

`seed` は `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` から初期管理者を作成する。
**ログイン後、必ずパスワードを変更すること。**

---

## 3. 導入後の初期設定（管理画面）

1. `/settings` → **担当者**を登録する
   - 個人LINEへ通知するには、担当者に社内通知Bot（チャネル②）と友だちになってもらい、
     その LINEユーザーID を登録する
   - 「責任者」を設定するとエスカレーションが機能する
2. `/settings` → **通知チャネル**に社内共通グループを登録し、**テスト送信で疎通確認する**
3. `/settings` → **営業時間**を実態に合わせる（既定：月〜土 9:00〜20:00、日曜休）
4. `/settings` → **祝日**を確認（2026年分は seed 済み。翌年分は毎年追加が必要）
5. `/settings` → **エスカレーション**を確認（既定：1時間→担当者 / 3時間→＋責任者 / 6時間→＋管理者）
6. `/customers` → 顧客ごとに**担当者を割り当てる**

---

## 4. 死活監視（必ず設定すること）

Cron が停止すると通知が完全に止まる。**これが本システム最大の単一障害点**であり、
外部からの監視で必ず二重化する。

1. [UptimeRobot](https://uptimerobot.com/) 等に `https://<host>/api/health` を **5分間隔**で登録
2. HTTP ステータスが `200` 以外でアラートするよう設定

`/api/health` は次の場合に **503** を返す。
- 最終Cron実行から20分以上経過している
- 30分以上滞留している未返信会話がある

管理画面のダッシュボード上部にも同じ条件で赤帯の警告が出る。

---

## 5. 定期的な運用作業

| 頻度 | 作業 |
|------|------|
| 毎日 | ダッシュボードで「要確認」「24時間以上未返信」を確認 |
| 毎月 | LINE のメッセージ通数を確認（プラン超過の有無） |
| 毎年12月 | 翌年の祝日を `/settings` に登録 |
| 半年ごと | LINE チャネルアクセストークンのローテーション |
| 半年ごと | `npm audit` と依存パッケージの更新 |
| 24ヶ月ごと | 古いメッセージの削除（`app_settings.dataRetentionMonths`） |

---

## 6. 動作確認

### ユニットテスト（判定ロジック）

```bash
npm test          # 72ケース。DBもネットワークも不要
```

### 結合確認（実DBに対する挙動）

```bash
DATABASE_URL=postgresql://... npx tsx scripts/e2e-check.ts
```

以下の10項目を、実際のトランザクション・行ロック・冪等キーを通して検証する。

1. 顧客メッセージ受信 → 未返信として管理される
2. 1時間後に1回目、2時間後に2回目のリマインドが送られる
3. **Cronが3並列で起動しても送信は1通だけ**
4. 担当者が返信すると対応済みになり、以降通知が止まる
5. 顧客の追加メッセージでカウントが再スタートする
6. 連投で通知が先送りされ続けても、保険で必ず通知される
7. エスカレーションは1サイクル1回だけ発火する
8. Webhook の再送は二重登録されない
9. 「通知しない」設定の顧客にはリマインドしない
10. 営業時間外は翌営業日へ繰り延べられる

通知は LINE ではなくローカルの受信サーバーへ送るため、外部サービスに接続せず確認できる。

---

## 7. トラブルシューティング

| 症状 | 確認すること |
|------|-------------|
| 顧客メッセージが取り込まれない | ① LINE Developers の Webhook URL と「Webhookの利用」がオン<br/>② `LINE_CHANNEL_SECRET` がチャネル①のものか<br/>③ サーバーログに `signature verification failed` が出ていないか |
| リマインドが送られない | ① `/api/health` の `cronHealthy`<br/>② `/settings` の通知チャネルでテスト送信<br/>③ 顧客の通知間隔が「通知しない」になっていないか<br/>④ 営業時間外でないか<br/>⑤ 顧客詳細の「リマインド送信履歴」の `status` と `error` |
| 返信したのに通知が続く | LINE公式Managerから返信した可能性。管理画面から返信するか、「対応済みにする」を押す（[07](./07-line-reply-detection.md)） |
| 通知が多すぎる | `/settings` の既定間隔を2〜3時間に変更するか、顧客ごとに個別設定する |
| 「要確認」が増える | 送信失敗が3回続いた／通知先が解決できない／ブロック済み顧客。顧客詳細のリマインド履歴に理由が残っている |
| 管理画面にログインできない | 5回失敗で15分ロックされる。解除は `users.lockedUntil` を NULL にする |
