import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        danger: '#dc2626',
        warn: '#ea580c',
        ok: '#16a34a',
      },
    },
  },
  plugins: [],
} satisfies Config
