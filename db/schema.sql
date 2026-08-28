-- ===========================================================================
--  Retail vs Large Trader Sentiment Dashboard — テーブル定義 (PostgreSQL)
--
--  psql "$DATABASE_URL" -f db/schema.sql で適用する。
--  何度実行しても安全なように書いてある。
-- ===========================================================================

CREATE TABLE IF NOT EXISTS markets (
  id       SERIAL PRIMARY KEY,
  symbol   TEXT NOT NULL UNIQUE,
  slug     TEXT NOT NULL UNIQUE,
  name     TEXT NOT NULL,
  category TEXT NOT NULL,
  enabled  BOOLEAN NOT NULL DEFAULT TRUE
);

-- 個人トレーダーのポジション比率 (提供元ごとに 1 行)
CREATE TABLE IF NOT EXISTS retail_sentiment (
  id            BIGSERIAL PRIMARY KEY,
  market_id     INTEGER NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,
  long_percent  NUMERIC(5, 2) NOT NULL,
  short_percent NUMERIC(5, 2) NOT NULL,
  timestamp     TIMESTAMPTZ NOT NULL,
  UNIQUE (market_id, provider, timestamp)
);

CREATE INDEX IF NOT EXISTS retail_sentiment_market_time_idx
  ON retail_sentiment (market_id, timestamp DESC);

-- 大口 (Large Trader / Institutional proxy) の建玉。CFTC は週次。
CREATE TABLE IF NOT EXISTS large_trader_positions (
  id             BIGSERIAL PRIMARY KEY,
  market_id      INTEGER NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  provider       TEXT NOT NULL,
  trader_category TEXT NOT NULL,
  long_position  BIGINT NOT NULL,
  short_position BIGINT NOT NULL,
  net_position   BIGINT NOT NULL,
  timestamp      TIMESTAMPTZ NOT NULL,
  UNIQUE (market_id, provider, trader_category, timestamp)
);

CREATE INDEX IF NOT EXISTS large_trader_positions_market_time_idx
  ON large_trader_positions (market_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS market_prices (
  id        BIGSERIAL PRIMARY KEY,
  market_id INTEGER NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  provider  TEXT NOT NULL,
  price     NUMERIC(18, 8) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  UNIQUE (market_id, provider, timestamp)
);

CREATE INDEX IF NOT EXISTS market_prices_market_time_idx
  ON market_prices (market_id, timestamp DESC);

-- 判定結果のスナップショット
CREATE TABLE IF NOT EXISTS alignment_scores (
  id        BIGSERIAL PRIMARY KEY,
  market_id INTEGER NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  score     INTEGER NOT NULL,
  bias      TEXT NOT NULL,
  status    TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS alignment_scores_market_time_idx
  ON alignment_scores (market_id, timestamp DESC);
