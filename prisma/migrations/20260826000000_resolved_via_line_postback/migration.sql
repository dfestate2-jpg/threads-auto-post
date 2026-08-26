-- 社内LINE通知の「対応済みにする」ボタン経由の解決を記録できるようにする
ALTER TYPE "ResolvedVia" ADD VALUE IF NOT EXISTS 'LINE_POSTBACK';
