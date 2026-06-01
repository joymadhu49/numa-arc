import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        // Retires ad-hoc text-[10px]/[11px] with a single legible caption size.
        '2xs': ['0.6875rem', { lineHeight: '0.875rem' }], // 11px
      },
      boxShadow: {
        'elevation-1': '0 1px 2px 0 rgb(0 0 0 / 0.20)',
        'elevation-2': '0 2px 8px -2px rgb(0 0 0 / 0.25)',
        'elevation-3': '0 8px 24px -4px rgb(0 0 0 / 0.35)',
        // Brand glow (token-driven) — replaces the inline hex on the avatar.
        glow: '0 0 12px oklch(var(--primary) / 0.40)',
      },
      zIndex: {
        sticky: '30',
        dropdown: '40',
        modal: '50',
        toast: '60',
      },
      keyframes: {
        'card-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'card-in': 'card-in 0.28s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.6s ease-in-out infinite',
      },
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
