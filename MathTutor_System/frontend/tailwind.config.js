/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
      boxShadow: {
        'mobile-card': '0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'mobile-header': '0 2px 12px rgba(0,0,0,0.06)',
        'drawer': '4px 0 24px rgba(0,0,0,0.12)',
      },
      borderRadius: {
        'mobile': '1rem',
        'mobile-lg': '1.25rem',
      },
    },
  },
  plugins: [],
}
