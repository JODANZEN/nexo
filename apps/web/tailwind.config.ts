import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';

// Design tokens extracted from docs/design.png.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        nexo: {
          navy: '#0B1F5B',
          navyLight: '#1B3A78', // gradient support
          teal: '#23C7B8',
          bg: '#F5F6F8',
          surface: '#FFFFFF',
          border: '#E5E7EB',
          text: '#0B1F5B',
          muted: '#6B7280',
          faint: '#9CA3AF',
          success: '#10B981',
          warning: '#F59E0B',
          error: '#EF4444',
          info: '#3B82F6',
        },
      },
      fontFamily: {
        sans: ['var(--font-poppins)', ...defaultTheme.fontFamily.sans],
      },
      borderRadius: {
        xl: '0.875rem',
      },
    },
  },
  plugins: [],
};

export default config;
