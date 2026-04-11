import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { HttpsProxyAgent } from 'https-proxy-agent'

// Route Vite's Node.js proxy through the local VPN HTTP proxy (Clash/V2Ray etc.)
// Windows system proxy is read automatically; fallback to common ports if not set.
const WIN_PROXY = process.env.HTTPS_PROXY
  || process.env.HTTP_PROXY
  || 'http://127.0.0.1:7897'   // ← detected from Windows registry

const agent = new HttpsProxyAgent(WIN_PROXY)

export default defineConfig({
  plugins: [react()],
  base: '/AfterHours/',
  server: {
    port: 5173,
    host: true,
    allowedHosts: true,
    proxy: {
      '/api/police': {
        target: 'https://data.police.uk',
        changeOrigin: true,
        agent,
        rewrite: (path) => path.replace(/^\/api\/police/, '/api'),
      },
      '/api/tfl': {
        target: 'https://api.tfl.gov.uk',
        changeOrigin: true,
        agent,
        rewrite: (path) => path.replace(/^\/api\/tfl/, ''),
      },
    },
  },
})
