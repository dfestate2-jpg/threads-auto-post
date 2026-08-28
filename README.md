# MARKET SENTIMENT — Retail vs Large Trader

FX / CFD トレーダー向けの、**個人と大口がどちらを向いているか** を一目で確認するためのダッシュボード。

サイトを開いて数秒で、次の 4 つが分かることだけを目的にしている。

- 個人 (Retail) はどっちを持っているか
- 大口 (Large Trader) はどっちを向いているか
- 個人と大口は同じ方向か
- どちら側に傾きが出ているか

高機能な分析サイトではなく、**一瞬で方向性を確認するダッシュボード**。情報は意図的に絞っている。

---

## 用語について（重要）

「Whale」は分かりやすさのための呼び名であり、正式な市場データではない。
このサイトが実際に表示しているのは、**CFTC の建玉報告などから推定した Large Trader / Institutional proxy** である。
世界中の大口のポジションを取得しているわけではない。UI 上の表記も `🐋 LARGE TRADER BIAS` に統一している。

同様に Retail Sentiment も、**提供元 (ブローカー) の顧客ポジション**であって市場全体の個人ポジションではない。
提供元が 1 社なら `OANDA Retail Sentiment` のように提供元名を残し、複数社を接続したときだけ
`Aggregated Retail Sentiment` として統合する。

表示するのは「どちら側に傾いているか」だけで、Buy / Sell シグナルは出さない。

---

## 画面

### TOP `/`

9 銘柄をカードで並べる。カードに出すのは以下だけ。

- Retail Long % / Short %
- Large Trader Bias（`LONG ↑` のように前週比の増減も表示）
- Status（`🟢 ALIGNED LONG` / `⚠️ DIVERGENCE` / `⚪ NEUTRAL` / `🔵 DATA UNAVAILABLE`）
- 最終更新時間（Retail は相対時間、Large Trader は週次なので日付）

### 詳細 `/market/{slug}`

カードをクリックすると開く。Retail の大きな数字と 1h / 24h 変化、Large Trader の Net Position と前週比、
Alignment（Retail → Large → Price → Status）、および Retail / Net Position / Price の履歴チャート。
チャートは形が分かれば十分という方針で、テクニカル分析機能は載せていない。

### API

- `GET /api/markets` … TOP と同じ内容（履歴なし）
- `GET /api/markets/{slug}` … 詳細と同じ内容（履歴込み）

---

## 対象銘柄（MVP）

| 表示 | slug | 分類 |
| --- | --- | --- |
| USD/JPY ドル円 | `usdjpy` | FX |
| EUR/JPY ユーロ円 | `eurjpy` | FX |
| GBP/JPY ポンド円 | `gbpjpy` | FX |
| EUR/USD ユーロドル | `eurusd` | FX |
| GBP/USD ポンドドル | `gbpusd` | FX |
| XAU/USD ゴールド | `xauusd` | METAL |
| BTC/USD ビットコイン | `btcusd` | CRYPTO |
| JP225 日経225 | `jp225` | INDEX |
| NAS100 ナスダック100 | `nas100` | INDEX |

追加は `src/lib/markets.ts` に 1 行足すだけで TOP / 詳細 / API すべてに反映されるが、MVP ではこの 9 銘柄以外を表示しない。

---

## データの扱い方

原則は 1 つだけ。**取れなかったデータは埋めない。**

- 取得できない場合は `DATA UNAVAILABLE` と表示する
- 推測値を実データとして表示しない
- Mock Data を使う場合は画面に `DEMO DATA` と明示する
- 各データに Source と Last Updated を必ず添える
- CFTC は週次データなので、日付表示 + `(weekly)` を付けてリアルタイムと誤解させない

### DATA_MODE

| 値 | 動作 |
| --- | --- |
| `demo`（既定） | Mock Provider を使う。全ての数値に `DEMO DATA` が付く |
| `live` | 実データ Provider を使う。未接続の Provider は `DATA UNAVAILABLE` になるだけで、値は作らない |

### 更新頻度（リアルタイム性）

データの種類によって更新頻度が違う。ここは実装ではなくデータ側の性質なので、揃えられない。

| データ | 実際の更新頻度 | 画面の表示 |
| --- | --- | --- |
| Retail (OANDA Position Book) | 約 20 分ごとのスナップショット | 相対時間 + `(20 min ごと)` |
| Large Trader (CFTC COT / TFF) | **週次**（火曜集計 → 金曜 15:30 ET 公表） | 対象週の日付 + `(weekly)` |

画面は 60 秒ごとに自動で再取得する（タブが非表示の間は止まる）。
Provider 側は OANDA を 10 分、CFTC を 1 時間キャッシュしており、更新頻度以上に API を叩かない。

**大口 (CFTC) はリアルタイムにできない。** 週次かつ対象日から公表まで 3 日遅れるため、
Retail がほぼリアルタイム・Large が週次という非対称は避けられない。
UI ではこの 2 つを同じ鮮度に見せないよう、表示形式を分けている。

### Provider の接続状況

| 種別 | Provider | 状況 |
| --- | --- | --- |
| Retail | Mock | 実装済み（DEMO DATA） |
| Retail | OANDA | 実装済み・**実レスポンス未検証**（`OANDA_API_TOKEN` が必要） |
| Retail | IG | **このProviderはAPI接続待ち** |
| Retail | FXCM | **このProviderはAPI接続待ち**（SSI の公開提供が縮小しており取得経路が未確定） |
| Large Trader | Mock | 実装済み（DEMO DATA） |
| Large Trader | CFTC COT / TFF | 実装済み・**実レスポンス未検証**（認証不要） |
| Price | Mock | 実装済み（DEMO DATA） |
| Price | Price Feed | **このProviderはAPI接続待ち** |

「実レスポンス未検証」は、開発環境から外部ホストへ接続できずライブ API で動作確認できていないことを指す。
リソース ID・フィールド名・パーセンテージの意味が想定と違った場合は、**値を作らず理由付きで
`DATA UNAVAILABLE`** を返すようにしてある。初回接続時の確認手順は [`docs/providers.md`](docs/providers.md)。

### Retail の履歴（1h / 24h 変化とチャート）

OANDA が返すのは「今この瞬間の比率」だけで履歴が無いため、取得した値を自分で貯めて差分を出す。

| DATABASE_URL | 保存先 | 挙動 |
| --- | --- | --- |
| 未設定 | プロセス内メモリ | 起動後に貯まった分だけ 1h / 24h とチャートが出る。再起動で消える |
| 設定あり | PostgreSQL (`retail_sentiment`) | 永続化される。`npm run db:schema` でテーブルを作る |

まだ十分に貯まっていない間は、`0` や推測値ではなく `—`（変化なし表示ではない）と
「履歴がありません」を出す。比較の基準は壁時計ではなく**最新の観測時刻**に合わせているため、
データ自体が古いときに「変化 0」と誤表示することはない（古さは Updated 表示で分かる）。
履歴の保存が失敗しても現在値の表示は止めない。

### 定期取得 (cron)

画面を開いたときにも履歴は貯まるが、それだけだと誰も見ていない時間帯が歯抜けになる。
`/api/cron/collect` を 20 分ごと（OANDA の更新間隔）に叩くと、全銘柄をまとめて取得して貯める。

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/collect
```

- `CRON_SECRET` が未設定なら 503 を返す（誰でも叩ける状態にしない）
- レスポンスに銘柄ごとの結果と、貯めなかった理由が入る

**定期取得が意味を持つのは `DATABASE_URL` を設定したときだけ。** 保存先がメモリの場合、
貯まるのは cron を処理したプロセスの中だけで、画面を出すインスタンスとは別になり得る。
その状態で叩くと、レスポンスの `warning` にその旨が入る。

スケジューラは環境に合わせて用意する。

| 環境 | 設定 |
| --- | --- |
| Vercel | `vercel.json` の `crons` に設定済み（`*/20 * * * *`）。プランによって最短間隔の制限があるので要確認 |
| Netlify | Scheduled Functions で同じ URL を叩く |
| その他 | 任意の cron から `curl` する（GitHub Actions の `schedule` でも可） |

### live モードでまだ出ないもの

- **EUR/JPY・GBP/JPY の Large Trader** … 対応する単一の CFTC 建玉報告がない。
  2 契約から合成しても契約単位が異なり根拠のない数字になるため `DATA UNAVAILABLE` にしている
- **BTC/USD の Large Trader** … Retail 側と揃う粒度の建玉報告がない
- **Price** … Provider 未接続

接続時の想定エンドポイントなどは [`docs/providers.md`](docs/providers.md) を参照。

---

## 判定ロジック

`src/lib/alignment.ts` に集約してある（UI 側にロジックを持たせない）。

- **Retail Bias**: Long% が 55% 以上で `LONG`、45% 以下で `SHORT`、その間は `NEUTRAL`
- **Large Trader Bias**: Net Position が総建玉の ±5% を超えた側。CFTC TFF の `Leveraged Funds`
  （商品は `Managed Money`、株価指数は `Asset Manager`）を Large / Institutional proxy として扱う
- **増減（↑ / ↓）**: Net Position の前週比が ±3% を超えたとき
- **Status**:

  | Retail | Large | Status |
  | --- | --- | --- |
  | LONG | LONG | 🟢 ALIGNED LONG |
  | SHORT | SHORT | 🟢 ALIGNED SHORT |
  | LONG | SHORT | ⚠️ DIVERGENCE |
  | SHORT | LONG | ⚠️ DIVERGENCE |
  | どちらかが中立 | | ⚪ NEUTRAL |
  | どちらかが欠測 | | 🔵 DATA UNAVAILABLE |

- **Alignment Score (0-100)**: 一致していれば 50 から上、乖離していれば下に振れる。

  ```
  50
   ± (15〜25)  Retail と Large が同方向か逆方向か（傾きの強さで加減）
   ± 7         Large が前週比でその方向に積み増しているか
   ± 5         価格トレンドが Large の方向と一致しているか
  ```

  「一致度の強さ」を表す指標であり、売買シグナルではない。意図的に 0 / 100 へは振り切らない。

---

## 開発

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # ロジックのテスト (vitest)
npm run typecheck
npm run build
```

環境変数は `.env.example` を参照（未設定でも `DATA_MODE=demo` で動く）。

### 構成

```
src/
  app/                    Next.js App Router（TOP / 詳細 / API / cron）
  components/             カード・バッジ・チャートなどの表示部品
  lib/
    markets.ts            対象銘柄の定義
    alignment.ts          Retail vs Large Trader の判定・スコア
    snapshot.ts           Provider から集めて 1 銘柄分にまとめる層
    format.ts             表示フォーマッタ
    collect.ts            定期取得（全銘柄を取得して履歴に貯める）
    cache.ts              Provider 結果の短期キャッシュ
    history/              Retail 履歴の保存 (メモリ / PostgreSQL)
  providers/
    types.ts              共通インターフェース
    registry.ts           DATA_MODE に応じて使う Provider を決める
    mock/ oanda/ ig/ fxcm/ cftc/ price/
db/schema.sql             テーブル定義 (PostgreSQL)
tests/                    判定ロジックと Provider の挙動のテスト
```

Provider は 3 つのインターフェースだけを実装すればよい。

```ts
getRetailSentiment(market)     // Retail Provider
getLargeTraderPosition(market) // Large Trader Provider
getPrice(market)               // Price Provider
```

いずれも「値」か「取得できない理由」のどちらかを返す（`ProviderResult<T>`）。

### DB

`db/schema.sql` に `markets` / `retail_sentiment` / `large_trader_positions` / `market_prices` /
`alignment_scores` を定義してある。適用は `npm run db:schema`（`psql "$DATABASE_URL" -f db/schema.sql`）。

現在アプリが読み書きするのは `markets` と `retail_sentiment` の 2 つ（Retail の履歴用）。
残りのテーブルは、Large Trader / 価格 / 判定結果を貯める段階で使う。

ORM は使わず `pg` で直接 SQL を書いている。ビルド時のコード生成が要らず、
テーブル定義の出どころを `db/schema.sql` 1 つに保てるため。

---

## 今後の順番

1. ~~OANDA Retail Data の接続~~ → 実装済み。実レスポンスでの検証待ち
2. ~~CFTC COT / TFF の接続~~ → 実装済み。実レスポンスでの検証待ち
3. ~~Retail 履歴の保存~~ → 実装済み（メモリ / PostgreSQL）。実 DB での検証待ち
4. ~~定期取得（20 分ごとに履歴へ貯める cron）~~ → 実装済み（`/api/cron/collect`）
5. Price Data の接続
6. 必要なら Retail の提供元を追加（IG / FXCM）して Aggregated 表示にする
