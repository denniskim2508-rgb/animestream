import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { spawn } from 'child_process'

function startServerPlugin() {
  let serverProcess
  return {
    name: 'start-server',
    configureServer() {
      if (serverProcess) return
      serverProcess = spawn('node', ['server.js'], {
        stdio: 'inherit',
        shell: true,
      })
      serverProcess.on('error', (err) => {
        console.error('Failed to start server:', err.message)
      })
    },
    closeBundle() {
      if (serverProcess) serverProcess.kill()
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), startServerPlugin()],
  server: {
    open: '/about',
    // Dedicated origin for AnimeStream; Travelverse uses 5174/4174 so the two
    // apps never share a browser favicon cache key.
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  preview: {
    port: 4173,
  },
})
