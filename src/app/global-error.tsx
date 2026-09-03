'use client'

/**
 * ルートレイアウト自体が壊れたときの最後の受け皿。
 * ここは layout.tsx の外側なので、html / body を自前で書く必要があり、
 * globals.css も当たらない前提で素のスタイルだけで組む。
 *
 * error.tsx と同じく、デプロイ直後のチャンク読み込み失敗は
 * 再読み込みで必ず直るため、人に見せる前に1回だけ自動で回復させる。
 */
const RELOAD_FLAG = 'reload-after-stale-asset'

function isStaleAssetError(error: Error): boolean {
  const text = `${error.name} ${error.message}`
  return /chunk|dynamically imported module|module script failed|importing a module/i.test(text)
}

export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  if (typeof window !== 'undefined' && isStaleAssetError(error)) {
    try {
      if (sessionStorage.getItem(RELOAD_FLAG) !== '1') {
        sessionStorage.setItem(RELOAD_FLAG, '1')
        location.reload()
      }
    } catch {
      /* sessionStorage が使えない環境では自動リロードしない */
    }
  }

  return (
    <html lang="ja">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, padding: 24, background: '#f8fafc' }}>
        <div
          style={{
            maxWidth: 480,
            margin: '15vh auto',
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 24,
          }}
        >
          <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>画面を表示できませんでした</h1>
          <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.7 }}>
            一時的な不具合の可能性があります。下のボタンで開き直してください。
            <br />
            <strong>リマインドの検知と通知は、この画面とは別に動き続けています。</strong>
          </p>
          <button
            type="button"
            onClick={() => location.reload()}
            style={{
              marginTop: 8,
              padding: '12px 20px',
              fontSize: 15,
              borderRadius: 8,
              border: 'none',
              background: '#0f172a',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            再読み込み
          </button>
          {error.digest ? (
            <p style={{ marginTop: 16, fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>
              エラーID: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  )
}
