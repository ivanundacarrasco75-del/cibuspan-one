# Activación de CIBUSPAN ONE

Este proyecto ya incluye usuarios, roles, permisos, auditoría e instalación tipo
app. Para ponerlo en operación hay que activar la base de datos, publicar la función
segura y desplegar el sitio.

## 1. Hacer una copia de seguridad

Antes de ejecutar cambios en producción, crea una copia de seguridad de la base de
datos de Supabase.

## 2. Activar usuarios y permisos en Supabase

En Supabase abre **SQL Editor**, crea una consulta nueva y ejecuta los archivos en
este orden:

1. `supabase/migrations/202608090001_usuarios_permisos.sql`
2. `supabase/migrations/202608090002_seguridad_modulos.sql`

El usuario más antiguo de Supabase queda como administrador inicial. Después se
pueden crear los demás usuarios desde **Administración → Sistema → Usuarios y
permisos**.

Roles iniciales:

| Rol | Acceso inicial |
|---|---|
| Administrador | Todos los módulos y gestión de usuarios |
| Gerente | Todos los módulos, sin gestión de usuarios |
| Bodeguero | Despachos |
| Gerente de operaciones | Pedidos, Inventario, Despachos, Devoluciones y Documentos |
| Jefa de facturación | Reportes y Documentos |

El administrador puede personalizar los módulos de cada usuario. El acceso a
**Usuarios y permisos** siempre queda reservado al rol Administrador.

## 3. Publicar la función segura de administración

Desde una terminal ubicada en la carpeta del proyecto:

```bash
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase functions deploy admin-users
```

`TU_PROJECT_REF` es el identificador que aparece en la dirección del panel de
Supabase. La función utiliza `SUPABASE_SERVICE_ROLE_KEY` únicamente dentro de
Supabase; esa llave nunca debe agregarse a `.env.local` ni al navegador.

## 4. Probar localmente

```bash
npm install
npm run dev
```

Abre la dirección que muestre la terminal e ingresa con el administrador inicial.
Verifica cada rol con un usuario de prueba antes de publicar.

## 5. Publicar en internet

Una opción sencilla es Vercel:

1. Sube el proyecto a un repositorio privado de GitHub.
2. En Vercel selecciona **Add New → Project** e importa ese repositorio.
3. Agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en **Environment Variables**.
4. Usa `npm run build` como comando de compilación y `dist` como carpeta de salida.
5. Publica el proyecto.

También funciona con Cloudflare Pages o Netlify usando los mismos valores de
compilación. La publicación debe utilizar HTTPS para permitir la instalación PWA.

## 6. Instalarla en cada dispositivo

- Android/Chrome o computador: abre el sitio una sola vez y pulsa **Instalar
  CIBUSPAN ONE**.
- iPhone/iPad: abre el sitio en Safari, pulsa **Compartir** y luego **Añadir a
  pantalla de inicio**.

Después se abre desde su propio ícono, como cualquier otra app. Para la primera
instalación sí es necesario abrir la dirección publicada una vez.

## 7. Publicar actualizaciones posteriores

Se puede seguir cambiando el código normalmente. Cada vez que se publique una nueva
versión, la PWA detecta y descarga los archivos actualizados de forma automática.
Los cambios de estructura de base de datos deben agregarse como una nueva migración,
sin modificar migraciones que ya se ejecutaron en producción.

