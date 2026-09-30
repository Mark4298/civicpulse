import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    screens: {
      xs: "320px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
      "4k": "2560px",
    },
    extend: {
      colors: {
        midnight: "#0B1020",
        surface: "#121833",
        "surface-raised": "#1A2345",
        aurora: {
          cyan: "#22D3EE",
          violet: "#8B5CF6",
          magenta: "#EC4899",
        },
        priority: {
          high: "#F43F5E",
          medium: "#F59E0B",
          low: "#10B981",
        },
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans Variable", "sans-serif"],
      },
      boxShadow: {
        "glow-cyan": "0 0 32px rgb(34 211 238 / 22%)",
        "glow-violet": "0 0 36px rgb(139 92 246 / 24%)",
        "glow-magenta": "0 0 32px rgb(236 72 153 / 18%)",
      },
      backgroundImage: {
        "aurora-gradient": "linear-gradient(110deg, #22D3EE 0%, #8B5CF6 52%, #EC4899 100%)",
      },
    },
  },
  plugins: [forms],
} satisfies Config;
