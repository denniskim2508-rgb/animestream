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
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
