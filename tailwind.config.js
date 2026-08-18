/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        neonBlue: '#0ea5e9',
        neonCyan: '#06b6d4',
        softPurple: '#8b5cf6'
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(31, 38, 135, 0.07)',
        'neon': '0 0 20px rgba(6, 182, 212, 0.4)',
      },
      backgroundImage: {
        'gradient-futuristic': 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)',
      }
    },
  },
  plugins: [],
}
