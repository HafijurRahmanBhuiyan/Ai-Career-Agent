/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
          950: "#1e1b4b",
        },
        surface: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        display: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(16 24 40 / 0.05), 0 1px 3px 0 rgb(16 24 40 / 0.06)",
        "card-hover":
          "0 2px 4px 0 rgb(16 24 40 / 0.06), 0 8px 24px -6px rgb(16 24 40 / 0.12)",
        pop: "0 8px 16px -4px rgb(16 24 40 / 0.08), 0 24px 48px -12px rgb(16 24 40 / 0.18)",
        "glow-primary":
          "0 8px 20px -8px rgb(79 70 229 / 0.55)",
        "glow-violet":
          "0 8px 20px -8px rgb(124 58 237 / 0.55)",
      },
      backgroundImage: {
        "app-mesh":
          "radial-gradient(60rem 40rem at 110% -10%, rgb(99 102 241 / 0.10), transparent 60%), radial-gradient(40rem 30rem at -10% 0%, rgb(139 92 246 / 0.08), transparent 55%), linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
        "hero-mesh":
          "radial-gradient(50rem 34rem at 100% -20%, rgb(99 102 241 / 0.35), transparent 60%), radial-gradient(40rem 30rem at -10% 10%, rgb(139 92 246 / 0.28), transparent 55%), radial-gradient(30rem 24rem at 50% 120%, rgb(34 211 238 / 0.12), transparent 55%)",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-1000px 0" },
          "100%": { backgroundPosition: "1000px 0" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.5s ease-out both",
        "fade-in": "fade-in 0.35s ease-out both",
        shimmer: "shimmer 1.6s infinite linear",
      },
    },
  },
  plugins: [],
};