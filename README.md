# 公式LINE 未返信リマインドシステム

不動産会社の公式LINEに届いた顧客メッセージのうち、**社内の誰も返信していないもの**を自動検知し、
社内LINEへ繰り返しリマインドするシステム。

> **設計の中心にある要件**
> 「顧客からLINEが来たのに、社内の誰も返信していない状態を絶対に見逃さない」
> かつ「二重通知・通知漏れ・返信済みなのに通知が続く問題を起こさない」

---

## ドキュメント

| # | 内容 |
|---|------|
| [**00. はじめての導入**](docs/00-beginner-setup.md) | **プログラム未経験の方向けの導入手順書。まずはここから** |
| [01. 実装前整理](docs/01-requirements.md) | 必要なAPI / アカウント / DB / システム構成 / **月額運用コスト** / セキュリティ |
| [02. システム設計](docs/02-architecture.md) | 状態機械、二重通知を防ぐ3段構え、通知漏れ対策 |
| [03. データベース設計](docs/03-database-design.md) | ER図・全テーブル定義・データ量見積り |
| [04. API設計](docs/04-api-design.md) | 全エンドポイントの仕様 |
| [05. UI設計](docs/05-ui-design.md) | 画面構成 |
| [06. セットアップ・運用手順](docs/06-operations.md) | LINE設定 → デプロイ → 監視 → トラブルシューティング |
| [07. 担当者の返信をどう検知するか](docs/07-line-reply-detection.md) | **LINE側の制約と、その回避策（必読）** |
| [10. 銀行入金のスプレッドシート自動反映](docs/10-bank-deposit-sync.md) | 取得方式の比較 / 構成 / 費用 / セキュリティ。コードと手順は [gas/](gas/README.md) |

---

## ⚠️ 導入前に必ず読むこと

**LINE Messaging API の Webhook は、担当者が LINE Official Account Manager のチャット画面から
送った返信をシステムに通知しない。** これは LINE 側の仕様であり、実装では回避できない。

そのため本システムは返信検知を4経路で担保している。

| 経路 | 確実性 |
|------|-------|
| **管理画面から返信する（推奨）** | ◎ 完全自動。送信と同時に「対応済み」になる |
| 管理画面の「対応済みにする」ボタン | ○ 手動 |
| 取り込みAPI `/api/ingest/outbound` | ○ 外部連携がある場合 |
| フェイルセーフ（通知を止めない） | ◎ 押し忘れても見逃さない |

**運用ルールとして「顧客への返信は管理画面から行う」と決めれば、依頼の要件は完全自動で満たされる。**
詳細 → [docs/07](docs/07-line-reply-detection.md)

---

## 実装した機能

### 未返信の検知【仕様①】
- 「顧客の最新メッセージ > 担当者の最新返信」で未返信と判定
- 顧客の追加メッセージで経過カウントを最新メッセージから再スタート
- **連投による通知先送りを打ち消す保険**：返信が無い限り、無通知区間が上限（既定3時間）を超えない

### リマインド間隔【仕様②・通知の工夫】
- 1時間ごと / 2時間ごと / 3時間ごと / 通知しない から選択（全体設定＋顧客ごとの上書き）
- 期限到来分をまとめて処理する設計のため、Cron が数回落ちても通知漏れが起きない

### 担当者の管理【仕様③】
- 顧客ごとに担当者を設定。担当者個人へ通知
- 未設定なら社内共通チャンネル（Slack）へ通知

### エスカレーション
- 経過時間の閾値ごとに通知先を追加（例：1時間→担当者 / 3時間→＋責任者 / 6時間→＋管理者）
- 到達済みルールの宛先を合算し、**同じ宛先には必ず1通だけ**

### 営業時間
- 曜日ごとの営業時間、土日祝の設定、臨時休業日・臨時営業日
- 営業時間外は**スキップではなく翌営業日へ繰り延べ**
- 経過時間を営業時間だけで数えるモードあり

### 管理画面【仕様④】
- **ダッシュボード**：未返信顧客数 / 1・3・24時間以上 / 本日の受信・対応済み数 / 担当者別件数 / ワースト10
- **未返信一覧**：顧客名・LINEユーザーID・担当者・最終メッセージ・受信日時・未返信経過・リマインド回数・対応状況・対応済み日時
- **顧客詳細**：メッセージ履歴・リマインド送信履歴・返信送信・状態変更・担当者/間隔設定
- 対応状況は 未対応 / 対応中 / 対応済み / 要確認

### 事故の防止
| 事故 | 対策 |
|------|------|
| 二重通知 | ① `FOR UPDATE SKIP LOCKED` による原子的な確保 ② `dedupeKey` の UNIQUE 制約 ③ 送信直前の再判定 |
| 通知漏れ | 期限超過分を全件処理 ／ 5分リースによる自動再取得 ／ 指数バックオフ再試行 ／ watchdog ／ `/api/health` 外部監視 |
| 返信済みなのに通知が続く | 返信記録と同一トランザクションで予定を取消 ＋ 送信直前の再判定 |
| 同時操作の競合 | `conversations.version` による楽観ロック（競合時 409） |

---

## 同梱：銀行入金のスプレッドシート自動反映（Google Apps Script）

このリポジトリには、LINEリマインドとは独立した **入金記帳の自動化** が同梱されている。
会社の銀行口座（ドコモSMTBネット銀行）への入金を自動取得し、
入金管理スプレッドシートへ **入金日 / 入金者 / 入金額** を重複なく積み上げる。

```
銀行に入金 → freee会計（口座同期） → freee API → Apps Script → 既存スプレッドシート
                                                （4時間ごと・重複チェック付き）
```

| | |
|---|---|
| コード | [`gas/入金自動記入.gs`](gas/入金自動記入.gs) |
| 導入手順 | [`gas/README.md`](gas/README.md) |
| 方式の比較・費用・セキュリティ | [`docs/10`](docs/10-bank-deposit-sync.md) |

**Next.js アプリ側には何も足していない。** 既に社内で稼働している
「振込自動記入（出金版）」が Apps Script なので、同じ流儀にそろえてある。
サーバーもDBも増えないため、**この機能の追加費用は ¥0/月**。

### なぜ freee 経由なのか

- **銀行のログイン情報をスクリプトが一切持たない。** 銀行に接続するのは freee 側だけ
- **スクレイピングをしない。** 取得は freee の公開APIのみ
- 銀行の参照系APIは登録済みの提携事業者向けの枠組みで、一般の事業会社が直接使えない

### 重複させない仕組み

| # | 仕組み |
|---|--------|
| ① | `_sync_入金` シートに明細IDを記録し、同じIDは二度書かない |
| ② | 書き込めた分のIDを `finally` で必ず保存する |
| ③ | `LockService` で多重起動を防ぐ |
| ④ | `取り込み開始日` より前（手入力済みの期間）は取り込まない |

### freee の連携が切れたことに気づく仕組み

freee 側で口座連携が切れると **エラーは出ないのに明細だけが来なくなる**。
`入金が途絶えていないか見張る` を毎日動かし、
最後に確認できた明細から5日過ぎたら `ALERT_MAIL` へ通知する。

---

## 技術構成

| 層 | 採用 |
|----|------|
| アプリ | Next.js 15（App Router） / TypeScript / Tailwind CSS |
| DB | PostgreSQL（Supabase / Neon）+ Prisma |
| 定期実行 | Netlify Scheduled Functions（既定）/ Vercel Cron / GitHub Actions（要手動有効化）|
| 社内通知 | **Slack Incoming Webhook（採用）** ／ Discord・LINE WORKS・Google Chat ／ LINE push（グループ・個人）も選択可 |
| 認証 | scrypt + HMAC署名付き HttpOnly Cookie（外部依存なし） |
| テスト | Vitest（77ケース）＋ 実DB結合確認スクリプト（10シナリオ）。GitHub Actions で自動実行 |

**月額運用コスト：¥0（Netlify + Supabase 無料枠 + Slack通知）〜 約¥5,000**
社内通知を Slack にしたことで、社内リマインド分（想定1,500通/月）の LINE 通数はゼロ。
残る LINE コストは顧客への返信分のみ（月200通を超えるならライトプラン ¥5,000/月）。
内訳 → [docs/01](docs/01-requirements.md#5-月額運用コスト)

---

## セットアップ

```bash
# 1. 依存パッケージ
npm install

# 2. 環境変数
cp .env.example .env
#    DATABASE_URL / LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN /
#    INTERNAL_SLACK_WEBHOOK_URL / CRON_SECRET / SESSION_SECRET を設定

# 3. データベース
npx prisma migrate deploy   # 本番デプロイ時は build:deploy が自動実行するため不要
npm run seed                # 設定・エスカレーション・祝日・管理者ユーザー（初回のみ）

# 4. 起動
npm run dev         # http://localhost:3000
```

LINE Developers の Webhook URL に `https://<host>/api/line/webhook` を設定し、
**「Webhookの利用」をオン・「応答メッセージ」をオフ**にする。

詳細手順 → [docs/06](docs/06-operations.md)

## 動作確認

PR と `main` への push で GitHub Actions が自動実行する（`.github/workflows/ci.yml`）。
PostgreSQL のサービスコンテナを立てて結合確認まで流すため、行ロックや冪等キーに依存する
中核の保証もCIで担保される。

手元で実行する場合:

```bash
npm test                                          # 判定ロジック 77ケース
npm run typecheck                                 # 型チェック
npm run build                                     # 本番ビルド（DB不要）
DATABASE_URL=postgresql://... npx tsx scripts/e2e-check.ts   # 実DBでの結合確認 10シナリオ
```

## ディレクトリ構成

```
src/
├── app/
│   ├── api/
│   │   ├── line/webhook/     LINE Webhook（署名検証・冪等化・未返信化）
│   │   ├── cron/reminders/   定期実行（確保 → 判定 → 通知）
│   │   ├── ingest/outbound/  外部連携からの返信取り込み
│   │   ├── health/           死活監視
│   │   └── ...               管理API
│   ├── page.tsx              ダッシュボード
│   ├── customers/            未返信一覧・顧客詳細
│   └── settings/             設定
├── lib/
│   ├── domain/               ★ 副作用なしの判定ロジック（テスト対象）
│   │   ├── businessHours.ts    営業時間・休日・繰り延べ
│   │   ├── reminderSchedule.ts 次回通知時刻の決定
│   │   ├── escalation.ts       段階判定・通知先解決
│   │   ├── notificationText.ts 通知本文
│   │   └── dedupe.ts           冪等キー
│   ├── services/             DBトランザクション・通知送信
│   ├── line/                 Messaging API クライアント・署名検証
│   ├── notify/               通知チャネルのディスパッチ（Slack / Discord / LINE WORKS / LINE）
│   └── auth/                 セッション・パスワード
├── components/               画面コンポーネント
prisma/                       スキーマ・マイグレーション・seed
tests/                        ユニットテスト
scripts/e2e-check.ts          実DB結合確認
docs/                         設計ドキュメント
```
