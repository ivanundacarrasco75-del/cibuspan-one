# Capturas de En Percha en R2

Estado: código preparado y probado el 04/11/2026. No acredita instalación, publicación, traslado ni restablecimiento de Supabase. El bloqueo `exceed_storage_size_quota` observado en la revisión de datos sigue pendiente de resolver en la cuenta real.

## Resultado solicitado

- Se retira la carga de fotos de perchas del registro de visitas. Se mantienen presencia, caras, GPS, fecha, cliente y local y los campos manuales. Rosado y Santamaría continúan con ingreso manual sin imágenes.
- Las nuevas capturas de En Percha de Favorita van a un depósito privado de Cloudflare R2. Se conservan sus bytes y resolución: no introducir otra pérdida de calidad en el OCR.
- Supabase sigue guardando los datos de visitas y las rutas. No se trasladan pedidos, inventarios, autenticación ni el resto de archivos de otros módulos.
- Las evidencias antiguas permanecen accesibles. Las fotos históricas de perchas no se borran ni trasladan con este cambio.

## Activación en la cuenta del propietario

1. En Cloudflare, abrir **R2 Object Storage** y activar R2 si aún no está activo. Revisar las condiciones que muestre Cloudflare: el nivel gratuito tiene límites y los excesos son facturables. No activar otro plan por rutina ni comunicar tarjetas/contraseñas por chat.
2. Crear un bucket llamado `cibuspan-one-capturas`, clase **Standard**. Mantener desactivados el acceso público `r2.dev` y los dominios públicos. No añadir reglas de borrado automático.
3. En **Workers & Pages > cibuspan-one > Settings > Bindings**, añadir un binding de bucket R2: nombre de variable `CAPTURAS_CAMPO`, bucket `cibuspan-one-capturas`, entorno **Production**. Guardar. Configurar Preview por separado si se quiere probar allí.
4. Ejecutar `scripts/Instalar-CapturasR2.ps1` desde el repositorio actualizado. No cambia la suscripción ni crea el depósito: verifica pruebas/build, permisos SQL nuevos, firma privada de enlaces, despliega y comprueba que estén presentes el binding y la firma. Instala `202611040004`. Si la función de planificación `202611040003` aún no existe, completa y verifica únicamente ese SQL nuevo previamente entregado antes de publicar el frontend. Si existe pero no cumple el contrato, se detiene. No hace `db push` ni reinstala SQL histórico.
5. Cerrar/reabrir la PWA y probar una captura real de Favorita: guardar, volver a abrir y comprobar la imagen y la persistencia de los campos. Rosado/Santamaría no deben pedir imágenes. Enlaces temporales previos pueden requerir abrir la evidencia otra vez al renovar la firma.

Si el proyecto ya usa un archivo Wrangler con bindings versionados/locales, integrar el binding allí también: el archivo de configuración puede prevalecer sobre el Dashboard. El script no reemplaza configuraciones existentes. En este repositorio no había un archivo Wrangler al preparar el cambio. La instalación verifica presencia, no realiza una carga ficticia ni una prueba de producción con documentos inventados.

Bloque para Iván:

```powershell
& {
    Set-Location "D:\CIBUSPAN_ONE" -ErrorAction Stop
    git pull --ff-only
    if ($LASTEXITCODE -ne 0) { throw "Fallo la actualizacion. No continuar." }
    & ".\scripts\Instalar-CapturasR2.ps1"
}
```

## Traslado controlado de capturas anteriores

Solo administración: **Campo comercial > Locales y reportes > Almacenamiento de capturas**.

1. **Copiar y verificar capturas anteriores** recorre capturas vinculadas de todas las visitas, independientemente del filtro del dashboard. La paginación es por ruta, sin OFFSET. Cada archivo se copia con la misma ruta a R2 y se vuelve a leer/comparar SHA-256. Puede detenerse al terminar el archivo actual y repetirse sin duplicados.
2. Descargar el informe JSON y abrir evidencias desde Revisión de datos. La app sirve primero la copia R2; si no existe, solicita al Storage antiguo un enlace con los permisos del usuario.
3. Solo después de revisar, desplegar **Liberar espacio de las capturas ya verificadas**. Escribir `RETIRAR COPIAS VERIFICADAS` y pulsar el botón correspondiente. Esto inicia una operación distinta, nunca automática al copiar o instalar. Requiere administrador y que la ruta siga vinculada a una captura histórica.
4. El servidor relee R2 y el original y compara sus archivos completos antes de retirar el original mediante Storage API. Confirma su ausencia antes de mostrar éxito. Una diferencia, falta de copia, error o falta de permisos detiene el proceso conservando R2. Reintentar un retiro ya completado comprueba la copia y reconoce la ausencia del original.
5. Descargar el informe final. Las referencias en Supabase no se cambian y R2 permanece privado. No ejecutar SQL para borrar `storage.objects`/`storage.buckets`: puede dejar archivos físicos huérfanos y no liberar cuota.

El informe contiene rutas y hashes, no tokens; tratarlo como información interna. Las copias verificadas y el avance se pueden recuperar ejecutando de nuevo el traslado; las copias reales están en R2, aunque se cierre el navegador. Un retiro que se interrumpa al responder se comprueba en el reintento.

## Bloqueo actual y límites

La autorización consulta Supabase con la sesión real y su clave pública. No usa service-role, no elude las políticas ni incluye credenciales R2 en el navegador. Por eso un proyecto que rechace consultas por cuota puede impedir tanto la aplicación como el traslado: antes debe permitir autorización y descarga de originales. Migrar no levanta por sí solo una restricción y retirar copias no garantiza que la cuota media del ciclo baje inmediatamente. Revisar Usage/Billing y, si hace falta, soporte; no prometer desbloqueo inmediato ni activar cargos sin decisión del propietario.

Las fotos históricas de perchas, archivos huérfanos y otros buckets quedan fuera de esta limpieza. Su volumen sigue contando en Supabase. Si aún se excede la cuota, inventariar referencias/uso antes de proponer una limpieza adicional.

R2 Standard: 10 GB-mes incluidos; sobre el nivel gratuito USD 0,015/GB-mes; 1 millón de operaciones A y 10 millones B incluidos, sin cargo de salida directa. R2 y Pages Functions tienen cuotas independientes: no prometer almacenamiento ni procesamiento ilimitados o coste cero permanente. Consultado 04/11/2026:

- https://developers.cloudflare.com/r2/pricing/
- https://developers.cloudflare.com/r2/get-started/
- https://developers.cloudflare.com/pages/functions/bindings/
- https://supabase.com/docs/guides/platform/manage-your-usage/storage-size

## Archivos y verificación

- `functions/api/capturas/[[accion]].js`: subida, enlaces HMAC de 10 minutos, copia/verificación/retiro. MIME y bytes limitados a 10 MB; solo PNG/JPEG/WebP; rutas cerradas. Las subidas usan nombre por contenido/usuario/día y escritura condicional sin sobrescritura.
- `src/repositories/capturasR2Repository.ts`: sesión, cargas originales y errores. Sin fallback de nuevas cargas a Supabase.
- `supabase/migrations/202611040004_capturas_r2.sql`: dos funciones de autorización/listado de solo lectura; replica propietario/admin y supervisión por cliente confirmado. Revoca anónimo y exige administrador para el traslado.
- `scripts/Instalar-CapturasR2.ps1` y diagnóstico específico. La clave de firma se genera en memoria y se entrega directamente a Cloudflare, sin archivos ni salida de su valor.
- Pruebas de servicio con R2/HTTP aislados, permisos SQL PGlite y regresiones de revisión/GPS/visita. No equivalen a aceptación en las cuentas reales.

No se han modificado existencias, pedidos, producción, finanzas ni datos de visitas reales. La fecha de arranque y el conteo físico del 08/09 de noviembre siguen pendientes; mantener el bloqueo de infraestructura como requisito de salida en vivo.

Verificación local final: 10 pruebas de servicio HTTP/R2, 6 pruebas de permisos SQL con PGlite y 22 regresiones de revisión/GPS/visita (38 aprobadas), compilación TypeScript/Vite/PWA y compilación del Worker con Wrangler 4.147.0. No se conectó a la base real ni a un depósito R2 del propietario.

Además, 134 escenarios de integración operativa aislada aprobados, incluyendo el diagnóstico de planificación ampliado (172 comprobaciones en total). Sin ejecución en la base real.
