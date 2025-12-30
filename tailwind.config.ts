import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: [
    './frontend/app/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        // True Dark Theme - Pure Black (#000000) background with OKLCH colors
        border: 'oklch(0.20 0 0)',
        input: 'oklch(0.20 0 0)',
        ring: 'oklch(0.65 0.15 270)',
        background: 'oklch(0 0 0)', // Pure black
        foreground: 'oklch(0.98 0 0)',
        primary: {
          DEFAULT: 'oklch(0.70 0.20 270)', // Neon purple
          foreground: 'oklch(0.98 0 0)',
        },
        secondary: {
          DEFAULT: 'oklch(0.15 0 0)',
          foreground: 'oklch(0.98 0 0)',
        },
        destructive: {
          DEFAULT: 'oklch(0.60 0.25 30)',
          foreground: 'oklch(0.98 0 0)',
        },
        muted: {
          DEFAULT: 'oklch(0.15 0 0)',
          foreground: 'oklch(0.65 0 0)',
        },
        accent: {
          DEFAULT: 'oklch(0.65 0.20 180)', // Neon cyan
          foreground: 'oklch(0.98 0 0)',
        },
        popover: {
          DEFAULT: 'oklch(0.10 0 0)',
          foreground: 'oklch(0.98 0 0)',
        },
        card: {
          DEFAULT: 'oklch(0.08 0 0)',
          foreground: 'oklch(0.98 0 0)',
        },
        // Neon-pastel palette for charts
        chart: {
          '1': 'oklch(0.70 0.20 270)', // Neon purple
          '2': 'oklch(0.65 0.20 180)', // Neon cyan
          '3': 'oklch(0.65 0.20 120)', // Neon green
          '4': 'oklch(0.70 0.20 60)',  // Neon yellow
          '5': 'oklch(0.65 0.20 30)',  // Neon orange
          '6': 'oklch(0.65 0.20 330)', // Neon pink
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
