import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Forward API calls from the dev server to the Express backend (npm start in the project root).
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
