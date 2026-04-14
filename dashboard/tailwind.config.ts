import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Anthropic-inspired palette
        brand: {
          50: "#FFF5F0",
          100: "#FFE8DC",
          200: "#FFC9AB",
          300: "#FFA678",
          400: "#FF7F45",
          500: "#D97757", // Primary coral/warm orange
          600: "#C25F3A",
          700: "#9E4622",
          800: "#7A3014",
          900: "#5C1E08",
        },
        surface: {
          900: "#0D0D14",
          800: "#13131E",
          700: "#1A1A2E",
          600: "#22223B",
          500: "#2D2D4A",
        },
        gauge: {
          green: "#22C55E",
          amber: "#F59E0B",
          red: "#EF4444",
          track: "#1E1E30",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
        "needle": "needleSwing 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        needleSwing: {
          "0%": { transform: "rotate(-10deg)" },
          "100%": { transform: "rotate(0deg)" },
        },
      },
      boxShadow: {
        glow: "0 0 20px rgba(217, 119, 87, 0.3)",
        "glow-green": "0 0 20px rgba(34, 197, 94, 0.3)",
        "glow-red": "0 0 20px rgba(239, 68, 68, 0.3)",
        card: "0 4px 24px rgba(0, 0, 0, 0.4)",
      },
    },
  },
  plugins: [],
};

export default config;
