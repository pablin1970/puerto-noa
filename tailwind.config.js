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
        sans: ['DM Sans', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      colors: {
        green: {
          DEFAULT: '#1D9E75',
          dark: '#085041',
          mid: '#0F6E56',
          light: '#E1F5EE',
          border: '#5DCAA5',
        },
      },
    },
  },
  plugins: [],
}
