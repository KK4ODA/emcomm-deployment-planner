import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  // Single source of truth for the version shown in the UI: package.json
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version) },
  // Tauri dev server needs a fixed port and no HMR reconnect surprises
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          leaflet: ['leaflet', 'react-leaflet'],
          pdf: ['jspdf'],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      // 'autoUpdate' silently activates new SW versions on next page load.
      // Operators don't get a "reload to update" banner — they just get fresh
      // code on their next refresh. Trade-off: if you push during active use,
      // their next navigation reloads the page; with the event log + outbox,
      // unsaved work survives, so this is safe in practice.
      registerType: 'autoUpdate',
      // Don't run the SW in dev (would interfere with HMR)
      devOptions: { enabled: false },
      // Don't include .htaccess — Apache serves it 403 (server config, not a
      // public asset), which makes Workbox's precache install fail and prevents
      // SW activation entirely.
      includeAssets: ['login-bg.jpg'],
      manifest: {
        name: 'EmComm Planner',
        short_name: 'EmComm',
        description: 'ARES emergency communications deployment planner',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/',
        // No icons yet — browser uses fallback. Add /pwa-192x192.png and
        // /pwa-512x512.png to public/ later for proper homescreen icons.
      },
      workbox: {
        // Precache the app shell (HTML, JS, CSS, images that Vite emits)
        globPatterns: ['**/*.{js,css,html,ico,png,jpg,jpeg,svg,webp,woff2}'],
        // Navigation requests fall back to index.html when offline → SPA routing works
        navigateFallback: '/index.html',
        // Don't cache Supabase API; always go to network when online
        navigateFallbackDenylist: [/^\/api/, /^\/storage/, /^\/auth/, /supabase\.co/],
        // Runtime cache: Supabase Storage avatars (network-first with offline fallback)
        runtimeCaching: [
          {
            urlPattern: /\/storage\/v1\/object\/public\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'supabase-storage',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
        // With autoUpdate, the new SW takes over next page load
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/components/ui/**', 'src/test/**', 'src/**/*.test.{js,jsx}'],
    },
  },
})
