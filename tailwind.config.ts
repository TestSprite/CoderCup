import type { Config } from 'tailwindcss';

/**
 * Tailwind exists alongside the design system in app/design.css (the source
 * of truth for tokens). We map the legacy semantic class names that older
 * components (detail page, AgentCard, etc.) reference into the design CSS
 * variables so visuals stay coherent during the redesign cutover.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx,mdx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        display: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg: 'var(--bg)',
        paper: 'var(--paper)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        line: 'var(--line)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        'accent-ink': 'var(--accent-ink)',
        positive: 'var(--positive)',
        warning: 'var(--warning)',
        negative: 'var(--negative)',
        // legacy aliases — keep older components functional during cutover
        fg: 'var(--ink)',
        mute: 'var(--ink-2)',
        border: 'var(--line)',
        surface: 'var(--paper)',
        'surface-2': 'var(--bg)',
        success: 'var(--positive)',
        warn: 'var(--warning)',
        danger: 'var(--negative)',
        info: 'var(--ink-2)',
      },
      boxShadow: {
        soft: '0 1px 2px rgb(0 0 0 / 0.04), 0 1px 6px rgb(0 0 0 / 0.04)',
        lift: '0 4px 12px rgb(0 0 0 / 0.06), 0 2px 4px rgb(0 0 0 / 0.04)',
      },
      borderRadius: {
        DEFAULT: '10px',
        sm: '6px',
        md: '10px',
        lg: '16px',
        xl: '22px',
      },
    },
  },
  plugins: [],
};

export default config;
