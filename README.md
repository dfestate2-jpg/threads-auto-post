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
| [08. 物件情報の一斉メール配信](docs/08-email-campaign.md) | **配信の手順 / 法令対応 / 到達率を落とさない設定（配信前に必読）** |

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

### 物件情報の一斉メール配信
LINE一斉配信で反応が取れなかった層を、メールで追いかけるための機能。
→ 手順と法令対応は [docs/08](docs/08-email-campaign.md)（配信前に必読）

- **CSV取込**：列名の表記揺れ（「メールアドレス」「メアド」「email」等）を吸収。予算は「5000万」「1億2000万」「50000000」を万円に正規化
- **セグメント配信**：希望エリア / 価格帯 に加え、**「公式LINEで反応が無い人だけ」**（ブロック済み・LINE未登録・指定日数こちらへの発信なし）で絞れる
- **法定表示の自動付与**：送信者名・住所・配信停止リンクを本文末尾に必ず付ける（担当者が消せない）。未設定なら配信を開始できない
- **ワンクリック配信停止**：`List-Unsubscribe` ヘッダ対応。Gmail / Yahoo の一括送信者要件を満たす
- **キュー送信**：1分ごとのCronで分割送信（既定 約6,000通/時）。途中で落ちても再開する

### 事故の防止
| 事故 | 対策 |
|------|------|
| 二重通知 | ① `FOR UPDATE SKIP LOCKED` による原子的な確保 ② `dedupeKey` の UNIQUE 制約 ③ 送信直前の再判定 |
| 通知漏れ | 期限超過分を全件処理 ／ 5分リースによる自動再取得 ／ 指数バックオフ再試行 ／ watchdog ／ `/api/health` 外部監視 |
| 返信済みなのに通知が続く | 返信記録と同一トランザクションで予定を取消 ＋ 送信直前の再判定 |
| 同時操作の競合 | `conversations.version` による楽観ロック（競合時 409） |
| 配信停止した人への誤送信 | ① 抽出条件に常に除外を含める ② 対象確定時に停止台帳を照合 ③ **送信直前にもう一度照合** ④ CSV再取込でも停止状態を復活させない |
| 同じ配信が二重に届く | `campaign_recipients` の `(campaignId, contactId)` UNIQUE 制約 ＋ `FOR UPDATE SKIP LOCKED` |

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
