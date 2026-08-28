# Provider の接続メモ

現状の Provider はすべて「値を作らない」実装になっている。
接続できない間は `DATA UNAVAILABLE` を返すだけで、推測値を実データとして返してはならない。

実装するときは `src/providers/types.ts` のインターフェースに合わせ、
`ProviderResult<T>`（`ok` か `unavailable`）を返すこと。

---

## Retail Sentiment

### OANDA — `src/providers/oanda`

- 想定エンドポイント: `GET {OANDA_API_BASE}/v3/instruments/{instrument}/positionBook`
- 認証: `Authorization: Bearer {OANDA_API_TOKEN}`（口座付きの API トークンが必要）
- instrument の対応表は `OANDA_INSTRUMENTS` に定義済み
- 注意: 取得できるのは OANDA の顧客ポジションであり市場全体ではない。
  表示ラベルは `OANDA Retail Sentiment` のまま提供元名を残す。

### IG — `src/providers/ig`

- IG の Client Sentiment API。API キーとアカウントが必要。
- 接続後は OANDA と合わせて `Aggregated Retail Sentiment` として統合される
  （統合処理は `src/lib/snapshot.ts` の `aggregateRetail`）。

### FXCM — `src/providers/fxcm`

- Speculative Sentiment Index (SSI)。公開提供が縮小しており取得経路が未確定。
  経路が確定するまで未接続のままにしておく。

---

## Large Trader / Institutional proxy

### CFTC COT / TFF — `src/providers/cftc`

- 想定エンドポイント（CFTC Public Reporting / Socrata）:
  - TFF Futures Only: `https://publicreporting.cftc.gov/resource/gpe5-46if.json`
  - Disaggregated Futures Only: `https://publicreporting.cftc.gov/resource/6dca-aqww.json`
- 銘柄と contract code の対応は `CFTC_MAPPINGS` に定義済み。
- どの分類を Large proxy として使うかは銘柄ごとに `traderCategory` で指定している。
  - 通貨: `Leveraged Funds`（TFF）
  - 商品 (GOLD): `Managed Money`（Disaggregated）
  - 株価指数: `Asset Manager`（TFF）
- **週次データ**である点に注意。対象は火曜、公表は金曜 15:30 ET。
  `meta.cadence = "weekly"` を必ず立て、UI 側で日付表示にする。
- 前週比を出すため、最低 2 週分（チャート用には 26 週分）取得する。
- 対応する建玉報告がない銘柄（BTC/USD など）は `unavailable` を返す。

---

## Price

### Price Feed — `src/providers/price`

- Alignment の補助にしか使っていないため、取得できない場合は
  Retail / Large だけで判定する（価格なしでも Status は出る）。
- 24 時間変化率から `UP` / `DOWN` / `FLAT` を決めている（しきい値 ±0.1%、`src/lib/snapshot.ts`）。

---

## 新しい Provider を足すとき

1. `src/providers/{name}/index.ts` にインターフェース実装を置く
2. `src/providers/registry.ts` の該当リストに追加する
3. Retail を増やした場合、自動的に `Aggregated Retail Sentiment` 表示に切り替わる
4. データがない銘柄は必ず `unavailable(source, reason)` を返す
