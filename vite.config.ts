import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      ignored: ['**/server/data/**'],
    },
    proxy: Object.fromEntries(
      ['/events', '/runtime', '/healthz', '/presence', '/org', '/auth', '/chat', '/approvals', '/dev', '/a2a']
        .map((path) => [path, { target: 'http://127.0.0.1:8080' }]),
    ),
  },
})
