import type { Config } from "tailwindcss";

// Nexo brand: navy + teal (same family as apps/web). Swap hexes here if the app's
// tailwind.config.ts uses slightly different values.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#0F2A44", deep: "#0A1E31", soft: "#1C3D5E" },
        teal: { DEFAULT: "#0E9F8E", dark: "#0B7F72", light: "#D5F0EC" },
        mist: "#EEF4F3",
        slate: { DEFAULT: "#4A5B6C", light: "#8597A8" },
        marigold: "#F2C14E",
        line: "#D9E3E6",
      },
      fontFamily: {
        sans: ["Poppins", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      maxWidth: { page: "1160px" },
    },
  },
  plugins: [],
};

export default config;
