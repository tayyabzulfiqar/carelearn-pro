/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,jsx}',
    './src/components/**/*.{js,jsx}',
    './src/app/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50:  '#E8EBF0',
          100: '#C5CDD9',
          200: '#9AAABB',
          300: '#6F879C',
          400: '#44637E',
          500: '#1E3A5F',
          600: '#162E4D',
          700: '#0F2038',
          800: '#0D1F3C',
          900: '#080F1E',
        },
        gold: {
          400: '#E8B84B',
          500: '#C9962A',
          600: '#A67A1E',
        },
        care: {
          teal:  '#0F6E56',
          green: '#3B6D11',
        }
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
