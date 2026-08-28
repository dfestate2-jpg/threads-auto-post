# Provider の接続メモ

`src/providers/types.ts` のインターフェースに合わせ、`ProviderResult<T>`（`ok` か `unavailable`）を返す。
**取得できない・想定と違う形式だった場合は、値を作らず `unavailable(source, reason)` を返す。**

---

## 検証状況（重要）

OANDA と CFTC のアダプタは実装済みだが、**ライブ API のレスポンスで動作確認できていない**。
開発環境から外部ホストへの接続がネットワークポリシーで遮断されているため
（`publicreporting.cftc.gov` / `api-fxtrade.oanda.com` へ CONNECT が 403 になる）。

そのため、レスポンスの形式が想定と違った場合に黙って誤った数字を出さないよう、
解析部分（`positionBook.ts` / `cot.ts`）を純粋関数に切り出し、想定外なら理由付きで失敗させている。
これらは `tests/providers.test.ts` で検証済み。

初回接続時は、以下の「確認手順」を実行して想定が合っているかを確かめること。

---

## Retail Sentiment

### OANDA — `src/providers/oanda`

- エンドポイント: `GET {OANDA_API_BASE}/v3/instruments/{instrument}/positionBook`
- 認証: `Authorization: Bearer {OANDA_API_TOKEN}`（実口座の API トークン）
- 更新頻度: **約 20 分ごとのスナップショット**（履歴は返らない）
- instrument の対応表は `OANDA_INSTRUMENTS`

#### 確認手順

```bash
curl -H "Authorization: Bearer $OANDA_API_TOKEN" \
  "https://api-fxtrade.oanda.com/v3/instruments/USD_JPY/positionBook" | jq '
    { time: .positionBook.time,
      longSum:  ([.positionBook.buckets[].longCountPercent  | tonumber] | add),
      shortSum: ([.positionBook.buckets[].shortCountPercent | tonumber] | add) }'
```

- `longSum + shortSum ≒ 100` なら想定どおり（`longSum` がそのまま Retail Long%）。
- `longSum ≒ 100` かつ `shortSum ≒ 100` の場合は、**片側ずつ正規化された値**であり
  この API からは Long/Short 比率を出せない。アダプタはこの場合に
  「合計が 200% で想定と異なる」として `unavailable` を返す（50/50 を出さない）。
  その際は OANDA の別データ（Open Position Ratios）か、IG / Myfxbook への切り替えを検討する。

#### 注意

- 取得できるのは OANDA の顧客ポジションであり、市場全体の個人ポジションではない。
  表示ラベルは `OANDA Retail Sentiment` のまま提供元名を残す。
- 取り扱い instrument は法人（OANDA Japan / Europe / US など）によって異なる。
  指数 CFD（JP225 / NAS100）や BTC は提供されない場合があり、その場合は 400 系が返る
  → アダプタは `API が 4xx を返した` として `unavailable` になる。

### IG — `src/providers/ig`（未接続）

- IG の Client Sentiment API。API キーとアカウントが必要。ほぼリアルタイム。
- 接続すると `src/lib/snapshot.ts` の `aggregateRetail` により
  自動的に `Aggregated Retail Sentiment` 表示へ切り替わる。

### FXCM — `src/providers/fxcm`（未接続）

- Speculative Sentiment Index (SSI)。公開提供が縮小しており取得経路が未確定。

---

## Large Trader / Institutional proxy

### CFTC COT / TFF — `src/providers/cftc`

- エンドポイント（CFTC Public Reporting / Socrata、認証不要）:
  - TFF Futures Only: `https://publicreporting.cftc.gov/resource/gpe5-46if.json`
  - Disaggregated Futures Only: `https://publicreporting.cftc.gov/resource/72hh-3qpy.json`
- 更新頻度: **週次**。対象は火曜、公表は金曜 15:30 ET。**リアルタイムにはできない。**
- どの分類を Large proxy として使うかは銘柄ごとに指定（`src/providers/cftc/cot.ts`）:
  - 通貨・NASDAQ: `Leveraged Funds`（TFF）
  - GOLD: `Managed Money`（Disaggregated）
  - 日経225: `Asset Manager`（TFF）

#### 確認手順

リソース ID・`cftc_contract_market_code`・フィールド名の 3 つを実レスポンスで確認する。

```bash
# 1. 契約コードが合っているか（市場名で探す）
curl -s "https://publicreporting.cftc.gov/resource/gpe5-46if.json?\$limit=1&\$where=market_and_exchange_names%20like%20'%25JAPANESE%20YEN%25'" | jq '.[0] | {market_and_exchange_names, cftc_contract_market_code, report_date_as_yyyy_mm_dd}'

# 2. フィールド名が合っているか
curl -s "https://publicreporting.cftc.gov/resource/gpe5-46if.json?cftc_contract_market_code=097741&\$order=report_date_as_yyyy_mm_dd%20DESC&\$limit=2" | jq '.[0] | keys'
```

`CFTC_MAPPINGS`（契約コード）と `CotDataset`（リソース ID・フィールド名）を実レスポンスに合わせて直す。
フィールド名が違えば、アダプタは「どのフィールドが読めないか」を理由にして `unavailable` を返すので、
画面を見れば何を直すべきか分かる。

#### 対象外にしている銘柄

- **EUR/JPY・GBP/JPY** … 対応する単一の建玉報告が存在しない。EUR と JPY の 2 契約から
  合成しても契約単位（1 枚あたりの想定元本）が違い、根拠のない数字になるため対象外にしている。
  クロス円にも何か出したい場合は「合成ではなく、構成通貨それぞれの Large Trader を並べて表示する」
  ほうが誤解が少ない。
- **BTC/USD** … Retail 側と揃う粒度の建玉報告がない（CME のビットコイン先物はあるが、
  現物中心の Retail データと同じ土俵で比較すると誤解を招く）。

---

## Price

### Price Feed — `src/providers/price`（未接続）

- Alignment の補助にしか使っていないため、取得できない場合は
  Retail / Large だけで判定する（価格なしでも Status は出る）。
- 24 時間変化率から `UP` / `DOWN` / `FLAT` を決めている（しきい値 ±0.1%、`src/lib/snapshot.ts`）。

---

## Retail 履歴の保存

`src/lib/history/` に、Retail の Long% を貯める層がある（OANDA が履歴を返さないため）。

- `DATABASE_URL` 未設定 … `InMemoryRetailHistoryStore`（プロセス内・再起動で消える）
- `DATABASE_URL` 設定あり … `PostgresRetailHistoryStore`（`retail_sentiment` テーブル）

Postgres 実装は開発環境から DB に接続できないため**実データベースでの動作確認ができていない**。
SQL とパラメータの組み立ては `tests/history.test.ts` でフェイクのクライアントを使って検証してある。
初回接続時は次を確認する。

```bash
npm run db:schema                  # テーブル作成
psql "$DATABASE_URL" -c "SELECT slug FROM markets;"
psql "$DATABASE_URL" -c "SELECT * FROM retail_sentiment ORDER BY timestamp DESC LIMIT 5;"
```

現在は「アクセスがあったタイミングで貯まる」ため、誰も見ていない時間帯は歯抜けになる。
連続した履歴が要る場合は、20 分ごとに `/api/markets` を叩く cron を用意する。

## キャッシュ

`src/lib/cache.ts` にプロセス内キャッシュがある。

- 成功: OANDA 10 分 / CFTC 1 時間
- 失敗: 60 秒（復旧後に古い失敗を返し続けないため）

サーバーレスではインスタンスごとに独立し、再起動で消える。
履歴を貯める用途には使わない（DB 接続時に分ける）。

---

## 新しい Provider を足すとき

1. `src/providers/{name}/index.ts` にインターフェース実装を置く
2. レスポンス解析は純粋関数に切り出し、テストを書く（ネットワークなしで検証できるようにする）
3. `src/providers/registry.ts` の該当リストに追加する
4. データがない銘柄・想定外の形式は必ず `unavailable(source, reason)` を返す
