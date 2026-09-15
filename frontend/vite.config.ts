import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Anything starting with /api is forwarded to Spring Boot, so the browser
    // only ever talks to one origin and there is no CORS to configure.
    // Overridable because inside the dev container the backend isn't
    // localhost — it's the `backend` compose service.
    proxy: {
      '/api': process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080',
    },
    // A Windows host directory bind-mounted into Docker Desktop's Linux VM
    // doesn't deliver native filesystem events to chokidar, so HMR silently
    // stops noticing edits — polling is the standard workaround. Off by
    // default (it burns CPU) and only turned on for the frontend container.
    watch: process.env.VITE_USE_POLLING ? { usePolling: true, interval: 300 } : undefined,
  },
})
