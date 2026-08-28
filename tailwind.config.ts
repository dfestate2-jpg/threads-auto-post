import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0a0c10",
        panel: "#12151c",
        line: "#1e232e",
        muted: "#7c879c",
        long: "#2fbf71",
        short: "#e0533d",
        warn: "#e2a33c",
        info: "#4a8fd4",
      },
      fontFamily: {
        num: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
