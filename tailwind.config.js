/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        lmu: {
          bg: '#0B0E14',
          card: '#151A23',
          border: '#232A36',
          accent: '#E63946',
          gold: '#FFB703',
          blue: '#219EBC',
          cyan: '#8ECAE6',
          green: '#2A9D8F',
          text: '#F8F9FA',
          muted: '#8D99AE'
        }
      }
    },
  },
  plugins: [],
}
