import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // No activar una versión nueva mientras el usuario está llenando formularios.
      // La actualización se instalará al cerrar y volver a abrir la app.
      registerType: 'prompt',
      injectRegister: 'auto',
      manifest: {
        name: 'CIBUSPAN ONE',
        short_name: 'CIBUSPAN',
        description: 'Gestión de producción, inventario, despachos y reportes de CIBUSPAN.',
        theme_color: '#8F1D24',
        background_color: '#F8F5F1',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        lang: 'es-EC',
        orientation: 'any',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
})
