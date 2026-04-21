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
          dark: '#A8862B',  // deeper amber for text on light backgrounds
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
        success: {
          DEFAULT: '#1A7F4B',
          bg: '#EAF6F0',
          dark: '#0F5C36',
        },
        warning: {
          DEFAULT: '#B45309',
          bg: '#FEF3C7',
          dark: '#7C3A06',
        },
        danger: {
          DEFAULT: '#B91C1C',
          bg: '#FEE2E2',
          dark: '#8B1414',
        },
        info: {
          DEFAULT: '#0B2545',
          bg: '#EFF4FB',
        },
        'serie-a': { DEFAULT: '#7C3AED', bg: '#EDE9FE' },
        'serie-b': { DEFAULT: '#0284C7', bg: '#E0F2FE' },
        'serie-c': { DEFAULT: '#059669', bg: '#D1FAE5' },
        'serie-d': { DEFAULT: '#D97706', bg: '#FEF3C7' },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        body: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Overridden with tighter letter-spacing for display
      },
      letterSpacing: {
        display: '-0.02em',
        tight: '-0.01em',
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
        xl: '0 16px 60px rgba(11,37,69,0.24)',
        'ring-gold': '0 0 0 2px rgba(201,168,76,0.3)',
      },
      transitionTimingFunction: {
        'out-soft': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'spring': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.25s ease-out',
        'fade-in-up': 'fadeInUp 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        'shimmer': 'shimmer 1.5s linear infinite',
        'spin-slow': 'spin 1s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      minHeight: {
        'touch': '44px',
      },
      minWidth: {
        'touch': '44px',
      },
    },
  },
  plugins: [],
}
