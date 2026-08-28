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

### Provider の接続状況

| 種別 | Provider | 状況 |
| --- | --- | --- |
| Retail | Mock | 実装済み（DEMO DATA） |
| Retail | OANDA | **このProviderはAPI接続待ち**（Position Book 取得にトークンが必要） |
| Retail | IG | **このProviderはAPI接続待ち** |
| Retail | FXCM | **このProviderはAPI接続待ち**（SSI の公開提供が縮小しており取得経路が未確定） |
| Large Trader | Mock | 実装済み（DEMO DATA） |
| Large Trader | CFTC COT / TFF | **このProviderはAPI接続待ち**（銘柄と contract code の対応は実装済み） |
| Price | Mock | 実装済み（DEMO DATA） |
| Price | Price Feed | **このProviderはAPI接続待ち** |

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
  app/                    Next.js App Router（TOP / 詳細 / API）
  components/             カード・バッジ・チャートなどの表示部品
  lib/
    markets.ts            対象銘柄の定義
    alignment.ts          Retail vs Large Trader の判定・スコア
    snapshot.ts           Provider から集めて 1 銘柄分にまとめる層
    format.ts             表示フォーマッタ
  providers/
    types.ts              共通インターフェース
    registry.ts           DATA_MODE に応じて使う Provider を決める
    mock/ oanda/ ig/ fxcm/ cftc/ price/
prisma/schema.prisma      履歴保存用のスキーマ
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

`prisma/schema.prisma` に `markets` / `retail_sentiment` / `large_trader_positions` / `market_prices` /
`alignment_scores` を定義してある。MVP は Provider の値をそのまま表示しており、DB は
実データ接続と同時に「取得 → 保存 → 表示」に切り替えるための保存先として用意している。

---

## 今後の順番

1. OANDA Retail Data の接続
2. CFTC COT / TFF の接続
3. Price Data の接続
4. 履歴の DB 保存（1h / 24h 変化と週次推移を実データで出す）
