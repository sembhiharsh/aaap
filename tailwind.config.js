/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './app/**/*.{js,ts,jsx,tsx}',
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        primary: 'hsl(210, 80%, 44%)',
        "primary-light": 'hsl(210, 90%, 60%)', // added for hover state
        "primary-dark": 'hsl(210, 80%, 38%)', // high-contrast for light backgrounds
        secondary: 'hsl(210, 30%, 40%)',
        accent: 'hsl(210, 90%, 60%)',
      },
    },
  },
  plugins: [],
};
