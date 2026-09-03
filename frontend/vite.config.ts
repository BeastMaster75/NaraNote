import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Anything starting with /api is forwarded to Spring Boot, so the browser
    // only ever talks to one origin and there is no CORS to configure.
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})
