/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Warm parchment tones replacing neutral gray
        gray: {
          50:  '#faf5eb',
          100: '#f2e8d4',
          200: '#e0ccad',
          300: '#c8ae8a',
          400: '#a8906a',
          500: '#876f50',
          600: '#685438',
          700: '#4a3c28',
          800: '#2e2518',
          900: '#1c1509',
        },
        // Cartographic sea-ink blue replacing indigo
        indigo: {
          300: '#82b9d0',
          400: '#5a9ab8',
          500: '#3d7a96',
          600: '#2b6280',
          700: '#1f4f69',
          800: '#163a52',
          900: '#0d2435',
        },
        // Muted cartographic violet for gradients
        violet: {
          500: '#7c6a9e',
        },
        // Slightly more golden-ochre amber
        amber: {
          100: '#fef3c4',
          300: '#f0c44a',
          400: '#e8aa20',
          500: '#d49018',
          800: '#7a5010',
          900: '#4a3008',
        },
      },
    },
  },
  plugins: [],
};
