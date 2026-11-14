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
      // El registro se controla desde ActualizacionPwa para mostrar un aviso
      // antes de recargar y no perder formularios en curso.
      injectRegister: null,
      manifest: {
        name: 'CIBUSPAN ONE',
        short_name: 'CIBUSPAN ONE',
        description: 'Gestión de producción, inventario, despachos y reportes de CIBUSPAN.',
        theme_color: '#051142',
        background_color: '#F3F6FA',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        lang: 'es-EC',
        orientation: 'any',
        icons: [
          {
            src: 'cibuspan-one-icon.png',
            sizes: '1254x1254',
            type: 'image/png',
            purpose: 'any',
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
