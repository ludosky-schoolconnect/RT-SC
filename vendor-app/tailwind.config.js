/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#0B2545',
          light: '#1a3a6b',
          dark: '#071830',
        },
        gold: {
          DEFAULT: '#C9A84C',
          light: '#E8C97A',
          pale: '#FDF6E3',
          dark: '#A8862B',
        },
        ink: {
          50: '#F0F2F5',
          100: '#E4E8EE',
          200: '#CBD2DC',
          300: '#AEB8C7',
          400: '#8A96A8',
          500: '#677488',
          600: '#4A5568',
          700: '#2F3947',
          800: '#1E2A3A',
        },
        success: { DEFAULT: '#1A7F4B', bg: '#EAF6F0', dark: '#0F5C36' },
        warning: { DEFAULT: '#B45309', bg: '#FEF3C7', dark: '#7C3A06' },
        danger: { DEFAULT: '#B91C1C', bg: '#FEE2E2', dark: '#8B1414' },
        info: { DEFAULT: '#0B2545', bg: '#EFF4FB' },
        'off-white': '#FAFBFD',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        body: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm: '6px',
        md: '12px',
        lg: '18px',
        xl: '24px',
      },
      boxShadow: {
        xs: '0 1px 3px rgba(11,37,69,0.06)',
        sm: '0 2px 8px rgba(11,37,69,0.08)',
        md: '0 4px 20px rgba(11,37,69,0.12)',
        lg: '0 8px 40px rgba(11,37,69,0.18)',
      },
      minHeight: {
        touch: '44px',
      },
    },
  },
  plugins: [],
}
