import {createServer, build} from 'vite'
import react from '@vitejs/plugin-react'
import {datos} from './datos.mjs'
import {fileURLToPath} from 'node:url'
const root = fileURLToPath(new URL('../..', import.meta.url))
const entrada = 'pruebas/vista_preliminar_sku/index.html'
const config = {
  configFile: false, root,
  plugins: [{name: 'sku-datos-de-ejemplo', enforce: 'pre', load(id) {
    if (id.replaceAll('\\', '/').endsWith('/src/repositories/tableroSkuRepository.ts')) {
      return 'export async function obtenerTableroSku(){return ' + JSON.stringify(datos) + '}'
    }
  }}, react()],
  optimizeDeps: {entries: [entrada]},
  server: {host: '127.0.0.1', port: 5192, strictPort: true},
  build: {outDir: '.wrangler/sku-preview/build', rollupOptions: {input: entrada}},
}
if (process.argv.includes('--build')) await build(config)
else {
  const server = await createServer(config)
  await server.listen()
  console.log('Vista preliminar con datos ficticios: http://127.0.0.1:5192/' + entrada)
}
