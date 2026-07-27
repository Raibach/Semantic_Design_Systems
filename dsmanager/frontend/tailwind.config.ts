import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}", "./index.html"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        manrope: ['Manrope', 'sans-serif'],
      },
      colors: {
        // New Design Colors
        'grace-bg-main': '#1D122C',        // Main dark purple background
        'grace-purple-border': '#9162C2',  // Primary purple border
        'grace-purple-light': '#D4A0EE',   // Light purple text
        'grace-green': '#45D690',          // Green accent
        'grace-chat-bg': '#121B2C',        // Dark chat background
        'grace-input-bg': '#2E2236',       // Dark input/button background
        'grace-gray-border': '#787878',    // Gray borders
        'grace-gray-button': '#A3A5A7',    // Gray button background
        'grace-blue-dark': '#2F4366',      // Dark blue text

        // Legacy Writing Area Colors (keeping for compatibility)
        'grace-bg': '#3F4654',
        'grace-header': '#222936',
        'grace-purple': '#622F66',
        'grace-blue': '#2F4366',
        'grace-gray': '#A3A5A7',
        'grace-border': '#787878',
        'grace-content': '#D9D9D9',

        // Teacher Chat Panel Colors (legacy)
        'grace-dark': '#0C0F18',
        'grace-panel': '#404755',
        'grace-container': '#222936',
        'grace-response': '#D9D9D9',
        'grace-button': '#A3A5A7',
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        "rainbow-border": {
          "0%": { borderColor: "#45D690" },
          "25%": { borderColor: "#9162C2" },
          "50%": { borderColor: "#D4A0EE" },
          "75%": { borderColor: "#45D690" },
          "100%": { borderColor: "#45D690" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "rainbow-border": "rainbow-border 3s linear infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
