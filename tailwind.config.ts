import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // --- Legacy RGB tokens (kept so existing utilities never break) ---
        background: 'rgb(var(--background) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',

        // --- Semantic OKLCH tokens ---
        bg: 'oklch(var(--bg) / <alpha-value>)',
        card: 'oklch(var(--card) / <alpha-value>)',
        popover: 'oklch(var(--popover) / <alpha-value>)',
        fg: 'oklch(var(--fg) / <alpha-value>)',

        // `muted` is overloaded: legacy RGB surface + a semantic fg variant.
        // Default (bg-muted / text-muted) → legacy RGB. text-muted-fg → semantic.
        muted: {
          DEFAULT: 'rgb(var(--muted) / <alpha-value>)',
          bg: 'oklch(var(--muted-bg) / <alpha-value>)',
          fg: 'oklch(var(--muted-fg) / <alpha-value>)',
        },

        // `border` is overloaded: legacy RGB default + semantic OKLCH variant.
        border: {
          DEFAULT: 'rgb(var(--border) / <alpha-value>)',
          c: 'oklch(var(--border-c) / <alpha-value>)',
        },

        ring: 'oklch(var(--ring) / <alpha-value>)',

        primary: {
          DEFAULT: 'oklch(var(--primary) / <alpha-value>)',
          fg: 'oklch(var(--primary-fg) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'oklch(var(--success) / <alpha-value>)',
          fg: 'oklch(var(--success-fg) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'oklch(var(--warning) / <alpha-value>)',
          fg: 'oklch(var(--warning-fg) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'oklch(var(--danger) / <alpha-value>)',
          fg: 'oklch(var(--danger-fg) / <alpha-value>)',
        },
      },
      borderColor: {
        // Make `border-border` resolve to the legacy RGB token (back-compat).
        border: 'rgb(var(--border) / <alpha-value>)',
      },
      ringColor: {
        ring: 'oklch(var(--ring) / <alpha-value>)',
      },
    },
  },
  plugins: [],
}

export default config
