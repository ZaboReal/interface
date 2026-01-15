import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Grey/Monochrome color palette
        primary: "#e4e4e7",
        "primary-dim": "rgba(228, 228, 231, 0.6)",
        "primary-glow": "rgba(228, 228, 231, 0.2)",

        background: {
          DEFAULT: "#09090b",
          light: "#18181b",
          card: "#1f1f23",
          elevated: "rgba(39, 39, 42, 0.8)",
        },

        border: {
          DEFAULT: "#27272a",
          bright: "rgba(228, 228, 231, 0.2)",
          dim: "rgba(228, 228, 231, 0.1)",
        },

        text: {
          primary: "#fafafa",
          secondary: "#a1a1aa",
          muted: "rgba(161, 161, 170, 0.6)",
          dim: "rgba(161, 161, 170, 0.4)",
        },

        status: {
          online: "#22c55e",
          success: "#22c55e",
          warning: "#f59e0b",
          error: "#ef4444",
          idle: "rgba(161, 161, 170, 0.3)",
        },
      },

      fontFamily: {
        display: ["Space Grotesk", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Consolas", "monospace"],
      },

      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "1rem" }],
      },

      borderRadius: {
        DEFAULT: "0.125rem",
        sm: "0.125rem",
        md: "0.25rem",
        lg: "0.5rem",
      },

      boxShadow: {
        glow: "0 0 8px rgba(228, 228, 231, 0.3)",
        "glow-sm": "0 0 4px rgba(228, 228, 231, 0.2)",
        "glow-lg": "0 0 16px rgba(228, 228, 231, 0.4)",
      },

      animation: {
        "pulse-glow": "pulseGlow 2s ease-in-out infinite",
        "cursor-blink": "cursorBlink 1s step-end infinite",
        "scanline": "scanline 8s linear infinite",
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
      },

      keyframes: {
        pulseGlow: {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 8px rgba(228, 228, 231, 0.3)" },
          "50%": { opacity: "0.7", boxShadow: "0 0 4px rgba(228, 228, 231, 0.15)" },
        },
        cursorBlink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        scanline: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
