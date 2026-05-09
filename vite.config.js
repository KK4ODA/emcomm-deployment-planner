import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  logLevel: 'error',
  plugins: [
    react(),
    VitePWA({
      // 'prompt' = user clicks "reload to update" instead of silent auto-update.
      // Avoids stomping on operators mid-task while still letting them get fresh code.
      registerType: 'prompt',
      // Don't run the SW in dev (would interfere with HMR)
      devOptions: { enabled: false },
      includeAssets: ['login-bg.jpg', '.htaccess'],
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
        // Generated SW updates take effect on next page load (with prompt)
        skipWaiting: false,
        clientsClaim: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  }
})
