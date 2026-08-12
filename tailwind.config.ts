import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';
import type { Config, PluginCreator } from 'tailwindcss/types/config';

const requireThemeString = (value: unknown, path: string) => {
  if (typeof value !== 'string') {
    throw new TypeError(`Expected Tailwind theme value "${path}" to be a string.`);
  }

  return value;
};

const containerPlugin: PluginCreator = (api) => {
  api.addComponents({
    '.container': {
      margin: 'auto',
      maxWidth: requireThemeString(api.theme('maxWidth.full'), 'maxWidth.full'),
      '@screen sm': {
        maxWidth: requireThemeString(api.theme('maxWidth.2xl'), 'maxWidth.2xl'),
      },
      '@screen md': {
        maxWidth: requireThemeString(api.theme('maxWidth.3xl'), 'maxWidth.3xl'),
      },
      '@screen lg': {
        maxWidth: requireThemeString(api.theme('maxWidth.5xl'), 'maxWidth.5xl'),
      },
      '@screen xl': {
        maxWidth: requireThemeString(api.theme('maxWidth.6xl'), 'maxWidth.6xl'),
      },
      '@screen 2xl': {
        maxWidth: requireThemeString(api.theme('maxWidth.6xl'), 'maxWidth.6xl'),
      },
    },
  });
};

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
  plugins: [forms, typography, containerPlugin],
} satisfies Config;
