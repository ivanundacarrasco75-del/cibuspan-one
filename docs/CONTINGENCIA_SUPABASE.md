# Contingencia de CIBUSPAN ONE

Estado al 10/11/2026: Supabase original `mkntfvsbmlgobettavnu` restringió Auth y Storage por cuota; se mantiene íntegro, con sus imágenes. El proyecto vacío `cibuspan-one-recuperacion` de esa organización se pausó. En la organización separada `CIBUSPAN CONTINGENCIA`, el proyecto `eodcwkuexldsbomflthe` aparece sano y Auth respondió HTTP 200 con la clave publicable. El ticket SU-540390 sigue como seguimiento del servicio original.

## Qué se comprobó

- Se creó un respaldo lógico privado del original. Se restauró primero en un contenedor aislado y después en contingencia, excluyendo únicamente metadatos del esquema gestionado Storage de la copia de datos usada para la restauración. Coincidieron 6 usuarios y perfiles activos, 42 pedidos, 209 líneas, 85 lotes y 1056 registros de visitas. Se comprobó localmente acceso del administrador a 18 pantallas.
- Con Data API apagada, el destino reportó cero tablas públicas sin RLS, 61 objetos con permiso anónimo, 17 funciones privilegiadas ejecutables por anónimos y ausencia del trigger de creación automática de perfiles. Iván ejecutó el bloque de retiro de permisos de anon y PUBLIC y obtuvo `API SIN PERMISOS ANONIMOS VERIFICADA`. Se conservaron los permisos previos de los roles autenticado y de servicio. La revisión no demuestra todavía inicio de sesión real, funcionamiento de cada rol ni subida de imágenes en la app.
- La base restaurada no incluye binarios históricos de Storage. Los originales del proyecto anterior no se borraron. R2 es el destino de capturas nuevas; las capturas ya copiadas y verificadas en R2 pueden abrirse si el enlace al mismo depósito y la autorización funcionan. Las demás siguen pendientes.

## Prueba antes del cambio público

1. En contingencia, mantener apagados los registros públicos de nuevos usuarios y el acceso anónimo de Auth. Reactivar Data API después del control de permisos. No activar exposición automática de nuevas tablas.
2. En PowerShell, desde la copia de GitHub actualizada, ejecutar `& .\scripts\Probar-Contingencia.ps1`. Usa solo la clave Publishable del destino, se ejecuta en loopback y no altera archivos de configuración ni la vinculación del CLI. Abrir `http://127.0.0.1:5174` en una ventana privada. Validar con cuentas existentes el login y la lectura de Pedidos e Inventario; no crear registros ficticios. Detener Vite con Ctrl+C.
3. Probar R2 en una publicación preliminar de Cloudflare Pages. Compilar el frontend con `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` del destino; en el entorno Preview configurar `CAPTURAS_SUPABASE_URL=https://eodcwkuexldsbomflthe.supabase.co` y comprobar los enlaces privados `CAPTURAS_CAMPO` y `CAPTURAS_FIRMA`. El endpoint `/api/capturas/estado` identifica el proyecto efectivo. Si falta la variable, la función sigue usando el original; no usar esa configuración para probar contingencia. Verificar permisos y guardado de una captura real autorizada. El traslado y retiro de imágenes originales permanecen bloqueados desde contingencia.
4. Revisar aparte funciones de administración de usuarios y correo que no trae el respaldo SQL. El alta de cuentas no debe usar metadatos editables por usuarios para otorgar un rol. No cambiar la app pública hasta verificar login, acceso por rol y el circuito necesario; conciliar registros realizados durante la interrupción y mantener una sola base de escritura para el equipo.

El ajuste de código permite elegir entre las dos URLs conocidas y no publica automáticamente. La base restaurada y la app publicada son estados separados. No compartir respaldos SQL, certificados con claves privadas, contraseñas o credenciales de servicio.

## Preparación de la vista previa — 11/11/2026

En Cloudflare Pages, proyecto `cibuspan-one`, seleccionar **Preview** en Settings. En Variables and Secrets agregar la variable de texto `CAPTURAS_SUPABASE_URL` con la URL de contingencia. En Bindings añadir el enlace R2 `CAPTURAS_CAMPO` al depósito privado existente `cibuspan-one-capturas`. Conservar deshabilitado el acceso público al depósito.

`scripts/Publicar-VistaPreviaContingencia.ps1` comprueba Git y la última rama de producción, compila con la clave publicable de contingencia, conserva la firma existente de Preview o genera una privada si falta, y publica en una rama de prueba única. Comprueba en Pages que la publicación figure como Preview y en el endpoint de capturas que se usen contingencia, R2 y firma. Si Cloudflare Access protege la vista previa, comprobar ese endpoint desde el navegador autorizado. No ejecuta SQL ni cambia la conexión de producción. La prueba local del usuario fue respondida con «listo», sin detalle de módulos ni confirmación de una carga real; no registrar aceptación completa.
