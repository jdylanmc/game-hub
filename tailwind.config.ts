import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx,html}', './.storybook/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
    },
    extend: {
      flex: {
        2: '2 2 0%',
        3: '3 3 0%',
      },
      fontFamily: {
        display: ['Space Grotesk', 'ui-sans-serif', 'system-ui'],
        body: ['Inter', 'ui-sans-serif', 'system-ui'],
      },
      height: {
        112: '28rem',
        128: '32rem',
      },
      boxShadow: {
        glow: '0 0 45px rgba(96, 165, 250, 0.2)',
      },
      maxHeight: {
        'half-screen': '50vh',
      },
      minHeight: {
        48: '12rem',
        96: '24rem',
      },
    },
  },
  plugins: [
    forms,
    typography,
    ({ addComponents, theme }) => {
      addComponents({
        '.container': {
          margin: 'auto',
          maxWidth: theme('maxWidth.full'),
          '@screen sm': {
            maxWidth: theme('maxWidth.2xl'),
          },
          '@screen md': {
            maxWidth: theme('maxWidth.3xl'),
          },
          '@screen lg': {
            maxWidth: theme('maxWidth.5xl'),
          },
          '@screen xl': {
            maxWidth: theme('maxWidth.6xl'),
          },
          '@screen 2xl': {
            maxWidth: theme('maxWidth.6xl'),
          },
        },
      });
    },
  ],
} satisfies Config;
