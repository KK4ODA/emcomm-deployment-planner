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
      // New service workers activate on the next load; UpdatePrompt offers an
      // immediate reload when a fresh build is waiting.
      registerType: 'autoUpdate',
      // Registration happens in React (features/pwa/UpdatePrompt) so the
      // desktop build, which bundles its own assets, can skip it entirely.
      injectRegister: null,
      devOptions: { enabled: false },
      includeAssets: ['favicon.svg', 'login-bg.jpg', 'icons/*.png'],
      manifest: {
        name: 'EmComm Planner',
        short_name: 'EmComm',
        description: 'ARES emergency communications deployment planner',
        theme_color: '#0f172a',
        background_color: '#f4f6fa',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        categories: ['productivity', 'utilities'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell: everything Vite emits (fonts included) is precached so the
        // UI loads with no network at all.
        globPatterns: ['**/*.{js,css,html,ico,png,jpg,jpeg,svg,webp,woff2}'],
        // .htaccess is server configuration, not an asset (Apache 403s it).
        globIgnores: ['**/.htaccess'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/storage/, /^\/auth/, /supabase\.co/],
        runtimeCaching: [
          {
            // Reference data (deployments, sites, items, members...). Network
            // first so online users always see fresh rows; the last good
            // response is served when the server is unreachable, which lets
            // the dashboard render read-only after an offline reload.
            urlPattern: ({ url, request }) => request.method === 'GET' && /\.supabase\.co$/.test(url.hostname) && url.pathname.startsWith('/rest/v1/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-rest',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Profile photos
            urlPattern: /\/storage\/v1\/object\/public\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'supabase-storage', expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
          {
            // Map tiles: keep what has been viewed so recently used areas still
            // render offline. Tiles never change, so cache first.
            urlPattern: /^https:\/\/([a-z]\.tile\.openstreetmap\.org|server\.arcgisonline\.com)\//,
            handler: 'CacheFirst',
            options: { cacheName: 'map-tiles', expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
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
