import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

export default {
  content: ["./client/index.html", "./client/src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: "#0c111d",
        panel: "#121a29",
        border: "#273142",
        accent: "#56d6c2",
        accentWarm: "#f5a76c",
        danger: "#fb7185"
      },
      boxShadow: {
        glow: "0 12px 40px rgba(8, 20, 35, 0.45)"
      },
      backgroundImage: {
        aurora:
          "radial-gradient(circle at top left, rgba(86, 214, 194, 0.18), transparent 32%), radial-gradient(circle at top right, rgba(245, 167, 108, 0.14), transparent 28%), linear-gradient(180deg, #0a0f18 0%, #111827 100%)"
      }
    }
  },
  plugins: [forms]
} satisfies Config;
