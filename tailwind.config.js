/** @type {import('tailwindcss').Config} */

/**
 * Helper: build a color value that consumes a CSS variable as RGB
 * triplet and supports Tailwind's <alpha-value> placeholder so
 * utilities like `bg-navy/40` keep working.
 *
 *   token('navy') → 'rgb(var(--color-navy) / <alpha-value>)'
 */
const token = (name) => `rgb(var(--color-${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: token('navy'),
          light:   token('navy-light'),
          dark:    token('navy-dark'),
        },
        gold: {
          DEFAULT: token('gold'),
          light:   token('gold-light'),
          pale:    token('gold-pale'),
          dark:    token('gold-dark'),
        },
        white:     token('white'),
        'off-white': token('off-white'),
        ink: {
          50:  token('ink-50'),
          100: token('ink-100'),
          200: token('ink-200'),
          300: token('ink-300'),
          400: token('ink-400'),
          500: token('ink-500'),
          600: token('ink-600'),
          700: token('ink-700'),
          800: token('ink-800'),
        },
        success: {
          DEFAULT: token('success'),
          bg:      token('success-bg'),
          dark:    token('success-dark'),
        },
        warning: {
          DEFAULT: token('warning'),
          bg:      token('warning-bg'),
          dark:    token('warning-dark'),
        },
        danger: {
          DEFAULT: token('danger'),
          bg:      token('danger-bg'),
          dark:    token('danger-dark'),
        },
        info: {
          DEFAULT: token('info'),
          bg:      token('info-bg'),
        },
        'serie-a': { DEFAULT: token('serie-a'), bg: token('serie-a-bg') },
        'serie-b': { DEFAULT: token('serie-b'), bg: token('serie-b-bg') },
        'serie-c': { DEFAULT: token('serie-c'), bg: token('serie-c-bg') },
        'serie-d': { DEFAULT: token('serie-d'), bg: token('serie-d-bg') },
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
