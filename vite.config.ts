import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

const API_PORT = 4000

export default defineConfig({
  plugins: [react()],
  // Surfaced in the sidebar footer via src/lib/version.ts, so the displayed
  // version can never drift from package.json.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { proxy: { '/api': `http://localhost:${API_PORT}` } },
})
