/** @type {import('tailwindcss').Config} */
/** Separate Tailwind config for Lab 2 — does NOT modify the main app config */
module.exports = {
  content: [
    "./lab2/index.html"
  ],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        resq: {
          dark: '#0B1120',
          darker: '#060A13',
          card: '#131D31',
          cardBorder: '#1E293B',
          red: '#DC2626',
          redGlow: 'rgba(220, 38, 38, 0.25)',
          orange: '#F97316',
          amber: '#F59E0B',
          emerald: '#10B981',
          cyan: '#06B6D4',
          blue: '#2563EB',
          indigo: '#4F46E5',
          purple: '#8B5CF6',
          muted: '#94A3B8'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace']
      },
      animation: {
        'pulse-fast': 'pulse 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'ping-slow': 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
      }
    },
  },
  plugins: [],
}

