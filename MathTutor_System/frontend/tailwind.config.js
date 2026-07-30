/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: '#070A10',
          900: '#0B0F17',
          850: '#111726',
          800: '#161F33',
          700: '#1E2942',
          600: '#2A3859',
        },
        primary: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        accent: {
          violet: '#7c3aed',
          purple: '#9333ea',
          cyan: '#06b6d4',
          emerald: '#10b981',
          amber: '#f59e0b',
          rose: '#f43f5e',
        },
      },
      boxShadow: {
        'mobile-card': '0 4px 20px -2px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.03)',
        'mobile-header': '0 4px 20px 0 rgba(0, 0, 0, 0.06)',
        'drawer': '12px 0 40px rgba(0, 0, 0, 0.25)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.08)',
        'pro-card': '0 10px 30px -5px rgba(0, 0, 0, 0.05), 0 4px 12px -2px rgba(0, 0, 0, 0.025)',
        'pro-hover': '0 20px 40px -10px rgba(99, 102, 241, 0.15), 0 8px 20px -4px rgba(0, 0, 0, 0.05)',
        'glow-primary': '0 0 25px -5px rgba(79, 70, 229, 0.4)',
        'glow-accent': '0 0 25px -5px rgba(124, 58, 237, 0.4)',
        'glow-emerald': '0 0 25px -5px rgba(16, 185, 129, 0.4)',
        'glow-amber': '0 0 25px -5px rgba(245, 158, 11, 0.4)',
      },
      borderRadius: {
        'mobile': '1rem',
        'mobile-lg': '1.25rem',
        '2xl': '1.25rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
}
