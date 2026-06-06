/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      colors: {
        brand: {
          DEFAULT: '#1168F8',
          dark: '#052698',
          mid: '#1a5fd4',
          light: '#EBF2FF',
          border: '#93B8FC',
        },
      },
    },
  },
  plugins: [],
}
