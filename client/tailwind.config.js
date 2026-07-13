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
        // Light: warm parchment — Dark: midnight starry-night blues
        gray: {
          50:  '#faf5eb',  // light bg (parchment)
          100: '#dce8f8',  // dark primary text (cool starlight)
          200: '#e0ccad',  // light border
          300: '#c8ae8a',  // light muted border
          400: '#7a96c0',  // dark secondary text (muted star-blue)
          500: '#876f50',  // light secondary text
          600: '#253655',  // dark hover/active borders
          700: '#1a2740',  // dark borders
          800: '#0f1a2e',  // dark card bg (deep navy)
          900: '#090d1a',  // dark main bg (midnight sky)
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
