import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#02060b",
          900: "#05101b",
          800: "#0a1724"
        },
        fitdog: {
          orange: "#ff9f1c",
          blue: "#4da3ff",
          green: "#68f77f",
          violet: "#b77cff"
        },
        lobby: {
          orange: "#F15F2A",
          card: "#171E24",
          "card-2": "#222B32",
          cream: "#FFF8EF",
          muted: "#B9C2CC"
        }
      },
      boxShadow: {
        glowBlue: "0 0 28px rgba(77, 163, 255, 0.28)",
        glowOrange: "0 0 28px rgba(255, 159, 28, 0.28)",
        lobbyGlow: "0 0 28px rgba(241, 95, 42, 0.28)"
      },
      animation: {
        "fade-up": "fadeUp 420ms ease-out both",
        pulseSoft: "pulseSoft 2.4s ease-in-out infinite"
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(12px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" }
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.7", transform: "scale(0.94)" }
        }
      }
    }
  },
  plugins: []
};

export default config;
