/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Paleta corporativa "Yaku Qhawaq" — azules profundos, verde agua,
        // grises técnicos y blanco. Ver frontend/README.md sección Branding.
        river: {
          950: "#031B2E",
          900: "#052A44",
          800: "#0A3D5C",
          700: "#0F5273",
          600: "#146A8F",
          500: "#1A83AC",
          400: "#3FA3C7",
          300: "#7FC3DD",
          200: "#BEE1EE",
          100: "#E4F3F8",
        },
        aqua: {
          700: "#0D7C66",
          600: "#12997E",
          500: "#17B896",
          400: "#4FD1B3",
          300: "#8CE3CB",
          200: "#C4F1E3",
        },
        slate_tech: {
          900: "#12181F",
          800: "#1B232C",
          700: "#28323D",
          600: "#3A4650",
          500: "#57646F",
          400: "#7C8894",
          300: "#A9B2BB",
          200: "#D3D8DD",
          100: "#EEF1F3",
        },
        critical: "#E4483C",
        warning: "#F0A93E",
        ok: "#17B896",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["'Space Grotesk'", "Inter", "sans-serif"],
      },
      boxShadow: {
        card: "0 4px 24px -4px rgba(5, 42, 68, 0.12)",
        "card-hover": "0 8px 32px -4px rgba(5, 42, 68, 0.20)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "slide-in": "slideIn 0.35s ease-out",
      },
      keyframes: {
        slideIn: {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};