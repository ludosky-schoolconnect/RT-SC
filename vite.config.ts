import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * RT-SC · Vite config.
 *
 * PWA integration notes:
 *
 *   - `manifest: false` — we intentionally do NOT let the plugin generate
 *     or inject a manifest. The existing deploy-school.sh pipeline writes
 *     a per-school `public/manifest.json` before build so each school
 *     appears with its own name when installed to the home screen. Letting
 *     the plugin also manage the manifest would collide with that.
 *     The `<link rel="manifest" href="/manifest.json" />` tag in index.html
 *     is already pointing at that file; Vite copies it to dist/ as-is.
 *
 *   - `registerType: 'prompt'` — we surface an "Actualiser pour charger les
 *     dernières modifications" toast when a new SW is ready, instead of
 *     auto-updating silently or forcing a reload mid-session. The user
 *     taps Actualiser to trigger the reload at a safe moment.
 *
 *   - `injectRegister: null` — we register the SW ourselves from main.tsx
 *     using the plugin's `virtual:pwa-register/react` module, so we can
 *     wire the update prompt into our UI. Letting the plugin auto-inject
 *     a script tag would bypass that.
 *
 *   - Workbox `navigateFallback: '/'` — any SPA route that hasn't been
 *     precached falls back to the root index.html from cache, so deep
 *     links keep working offline.
 *
 *   - `cleanupOutdatedCaches: true` — when a new SW activates, old
 *     workbox-precache entries are deleted automatically.
 *
 *   - Firestore endpoints (firestore.googleapis.com) are explicitly NOT
 *     cached by the service worker. Firestore's SDK has its own offline
 *     persistence via IndexedDB (already enabled in src/firebase.ts).
 *     Intercepting those requests at the SW layer would break writes
 *     and double-cache reads.
 */
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      manifest: false,
      workbox: {
        // Skip workbox-build's internal terser pass on the generated
        // sw.js. On memory-constrained environments (Termux on Android),
        // that pass can exhaust Node's heap and crash the build with
        // "Unexpected early exit" on terser's renderChunk hook. Setting
        // mode to 'development' tells workbox-build to emit an
        // unminified sw.js (~10 KB instead of ~5 KB — meaningless for
        // a file that's cached on first load). The MAIN app bundle
        // continues to be minified by Vite normally; this scopes only
        // to the service worker output.
        mode: 'development',
        // Precache the app shell — everything in dist/ that matches
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,jpeg,webp,woff,woff2,ico}'],
        // Make SPA routing work offline
        navigateFallback: '/index.html',
        // Don't SW-intercept any route starting with /reset-sw so the
        // kill switch always reaches our React page even if the SW is
        // stale/broken
        navigateFallbackDenylist: [/^\/reset-sw/],
        cleanupOutdatedCaches: true,
        // If precaching grows past the default 2 MiB per-asset limit,
        // raise it to 4 MiB. Our largest JS chunks + hero image stay
        // well under this; header prevents build-time warnings.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          // Google Fonts — stylesheet (small, update-on-background)
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          // Google Fonts — actual woff2 files (rarely change; cache long)
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Firebase Storage — school logos, uploaded images, attachments
          {
            urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'firebase-storage',
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Firestore is explicitly not listed — handled by the SDK's
          // built-in persistence (IndexedDB). Intercepting here would
          // conflict.
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    // Each role gets its own chunk — lazy-loaded at runtime
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
          'vendor-query': ['@tanstack/react-query', '@tanstack/react-virtual'],
          'vendor-motion': ['framer-motion'],
          'vendor-icons': ['lucide-react'],
          'vendor-charts': ['recharts'],
        },
      },
    },
  },
})
