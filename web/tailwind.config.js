/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Cloudflare-inspired warm orange used for primary actions and highlights.
        brand: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f6821f',
          600: '#e06b0a',
          700: '#bc5308',
          800: '#9a450c',
          900: '#7c3a0d',
          950: '#431d04'
        },
        // Neutral surfaces. Kept as a separate scale so existing utility classes
        // retain their meaning while adopting the flatter dashboard look.
        cf: {
          bg: '#f7f7f5',
          surface: '#ffffff',
          sidebar: '#ffffff',
          ink: '#1c1c19',
          muted: '#64645e',
          50: '#fafaf9',
          100: '#f4f4f2',
          200: '#e8e8e4',
          300: '#d6d6d0',
          400: '#a7a7a0',
          500: '#77776f',
          600: '#5c5c55',
          700: '#464640',
          800: '#2d2d29',
          900: '#1c1c19',
          950: '#11110f'
        },
        cyber: {
          950: '#0b0d10',
          900: '#121418',
          850: '#181b20',
          800: '#292d34',
          700: '#3a3f48',
          accent: '#f6821f',
          glow: '#fb923c'
        },
        // Replace Tailwind's cool blue-gray neutrals with a warmer, flatter
        // scale that matches the dashboard surfaces throughout older pages.
        slate: {
          50: '#fafaf9',
          100: '#f4f4f2',
          200: '#e8e8e4',
          300: '#d6d6d0',
          400: '#a7a7a0',
          500: '#77776f',
          600: '#5c5c55',
          700: '#464640',
          750: '#343430',
          800: '#2d2d29',
          850: '#242420',
          900: '#1c1c19',
          950: '#11110f'
        }
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        display: ['Ubuntu', '"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }]
      },
      spacing: {
        '4.5': '1.125rem',
        '13': '3.25rem'
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(15 23 42 / 0.04)',
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.03)',
        popover: '0 12px 32px -8px rgb(15 23 42 / 0.18), 0 2px 8px -2px rgb(15 23 42 / 0.08)'
      },
      borderRadius: {
        '4xl': '2rem'
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' }
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' }
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px) scale(0.99)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' }
        },
        'enter': {
          from: { opacity: '0', transform: 'translateY(-6px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' }
        },
        'leave': {
          from: { opacity: '1', transform: 'translateY(0) scale(1)' },
          to: { opacity: '0', transform: 'translateY(-6px) scale(0.98)' }
        },
        'shimmer': {
          '100%': { transform: 'translateX(100%)' }
        }
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out',
        'scale-in': 'scale-in 150ms ease-out',
        'slide-up': 'slide-up 220ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'enter': 'enter 180ms ease-out both',
        'leave': 'leave 140ms ease-in both',
        'shimmer': 'shimmer 1.6s infinite'
      }
    }
  },
  plugins: []
};
