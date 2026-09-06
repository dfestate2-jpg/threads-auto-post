import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 追客管理システム側
        danger: '#dc2626',
        warn: '#ea580c',
        ok: '#16a34a',

        // センチメントダッシュボード側（/sentiment 配下）
        // warn は追客側が先に使っているため、こちらは caution とする。
        // 背景色に base という名前は付けない（Tailwind 標準の文字サイズ
        // text-base を色クラスで上書きしてしまい、追客側の見出しが崩れる）
        panel: '#12151c',
        line: '#1e232e',
        muted: '#7c879c',
        long: '#2fbf71',
        short: '#e0533d',
        caution: '#e2a33c',
        info: '#4a8fd4',
      },
      fontFamily: {
        num: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config
