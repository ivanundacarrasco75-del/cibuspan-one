# CIBUSPAN ONE

Aplicación interna para pedidos, inventario, producción, despachos, devoluciones,
reportes, documentos y administración.

## Requisitos

- Node.js 20 o posterior.
- Un proyecto de Supabase.
- Las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Desarrollo

```bash
npm install
npm run dev
```

## Compilación

```bash
npm run build
```

La salida para publicación queda en `dist/`. La aplicación está configurada como
PWA instalable y actualiza sus archivos automáticamente después de cada nueva
publicación.

## Usuarios y permisos

Las migraciones se encuentran en `supabase/migrations` y la función administrativa
en `supabase/functions/admin-users`. Consulta `PASOS_ACTIVACION.md` para realizar la
activación inicial y publicar la aplicación.

