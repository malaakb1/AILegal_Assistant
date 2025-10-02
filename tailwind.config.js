/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        cairo: ['Cairo', 'sans-serif'],
      },
      colors: {
        gold: {
          50: '#FFFBF0',
          100: '#FFF8E7',
          200: '#FFEFC7',
          300: '#FFE5A0',
          400: '#FFD670',
          500: '#C9A227',
          600: '#B08D57',
          700: '#8B6E1F',
          800: '#6B5417',
          900: '#4A3A10',
        },
        beige: {
          50: '#FFFEF9',
          100: '#FFF8E7',
          200: '#F5EEDC',
          300: '#EDE4CC',
          400: '#E0D3B8',
          500: '#D4C4A0',
          600: '#B8A07E',
          700: '#9A8260',
          800: '#7A6548',
          900: '#5C4D38',
        },
        darktext: {
          DEFAULT: '#1F1B16',
          light: '#2A2A2A',
        }
      },
    },
  },
  plugins: [],
};
