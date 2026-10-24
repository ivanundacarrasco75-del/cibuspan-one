# Registro de producción y recuperación de reintentos

23/10/2026. OP-12 instalado y verificado. OP-13 instalado, verificado y publicado según Texto pegado(3).txt de Iván: build correcto, verificación superada, repair 202610230002 aplicado y despliegue Cloudflare 4e741568. Código desplegado: d12e18b. Pendiente validación operativa por usuarios; etapa 3 de reorganización continúa abierta.

## Comportamiento

Una confirmación tiene una solicitud UUID propia. Esa misma solicitud y sus datos se conservan en el navegador antes de enviar. El servidor guarda el comprobante y la fabricación en la misma transacción; repetir la solicitud devuelve la producción existente sin otra entrada PT/Kardex. El bloqueo transaccional serializa peticiones de la misma clave. No se deduplica por SKU, fecha ni cantidades: dos fabricaciones reales iguales deben seguir siendo posibles.

Si se pierde la respuesta, la app intenta recuperar el resultado automáticamente. Si no puede confirmarlo, conserva el intento, cierra la confirmación editable y muestra:

- Reintentar registro: envía los mismos datos y la misma clave; recupera el registro si ya existe.
- Comprobar para corregir: recupera lo registrado; si no existe, el servidor cierra esa clave antes de permitir otro intento. Una petición atrasada con la clave cerrada ya no podrá producir después. Los datos se restauran para editar si sus productos siguen en el catálogo; de lo contrario se seleccionan de nuevo tras el cierre confirmado.

No permite abrir otra fabricación mientras haya un resultado incierto en ese usuario/proyecto/navegador. Fallos al actualizar el historial o limpiar el almacenamiento local después de confirmar no se presentan como un fallo de fabricación. Los pendientes se aíslan por proyecto y usuario; el backend comprueba también que la sesión corresponde al usuario esperado.

No borrar almacenamiento, reinstalar la app ni pasar a otro dispositivo como forma de resolver un intento incierto: la recuperación automática requiere su clave local. Si se pierde, consultar el historial antes de ingresar otra fabricación. No se detectan duplicados anteriores ni reingresos manuales con una clave nueva desde otro dispositivo. Una solicitud previa al despliegue no recibe protección retroactiva.

## Instalación en el proyecto ya vinculado

```powershell
& {
    Set-Location "D:\CIBUSPAN_ONE" -ErrorAction Stop
    git pull --ff-only
    if ($LASTEXITCODE -ne 0) { throw "Fallo la actualizacion. No continuar." }
    & ".\scripts\Instalar-RegistroProduccionSeguro.ps1"
}
```

El instalador compila primero, aplica sólo 202610230002_registro_produccion_seguro.sql, verifica metadatos, exige correcto=true/versión correcta, registra únicamente esa versión y publica dist en cibuspan-one/main de Cloudflare. No ejecuta db push, migraciones antiguas, npm ci ni operaciones de inventario. No requiere actualizar Supabase CLI por su aviso de versión disponible.

Este cambio requiere SQL y frontend juntos. Tras aplicar SQL, las versiones antiguas de la app no pueden guardar por la firma anterior sin solicitud y reciben un mensaje para actualizar. Cerrar y volver a abrir la app tras publicar. Si SQL se instala pero falla verificación, repair o Cloudflare, copiar el error y terminar el paso pendiente: no quitar el control ni registrar otra fabricación para probar. El script completo se puede repetir y no suma existencias. No ejecutar los ensayos de fabricación contra datos reales.

## Resultado de instalación recibido

Texto pegado(3).txt confirma actualización de main 4aef964 → d12e18b, compilación correcta, verificación SQL aceptada por el instalador, repair 202610230002 aplicado, subida de 66 archivos y publicación en https://4e741568.cibuspan-one.pages.dev. Mensaje final: «Registro seguro de produccion instalado, verificado y publicado.» No repetir la instalación por los avisos de versión del CLI o tamaño de chunks. El aviso de cambios locales de Wrangler no bloqueó el despliegue; no se comprobó el contenido de esas diferencias y no se deben descartar automáticamente. Cerrar y volver a abrir la app para cargar el cliente nuevo. No reingresar una producción real como prueba.

## Contrato del servidor

- Tabla privada pro_solicitudes_registro: solicitud, actor, datos, estado, transacción y producción resultante. RLS habilitado, sin acceso directo PUBLIC/anon/authenticated/service_role. No cambia filas previas.
- registrar_produccion_segura(uuid,date,jsonb,uuid): control de acceso OP-12, usuario esperado, bloqueo por solicitud, comparación del payload y ejecución única de la función instalada. Devuelve solicitud_id, produccion_id y repetida.
- resolver_registro_produccion(uuid,uuid): mismo control y bloqueo; devuelve CONFIRMADA con identificador o sella ANULADA sin fabricación. Una solicitud ajena no se puede recuperar/cerrar.
- registrar_produccion_completa(date,jsonb) conserva OID, contrato y cuerpo vigente con la protección OP-12. Se añade una comprobación privada inmediatamente después del guard de autorización; sólo consume una solicitud válida, no ejecutada y creada en esa misma transacción. Ni una llamada antigua ni un GUC inventado bastan. No existe fallback al guardado inseguro.
- Los nuevos RPC conservan acceso authenticated/service_role y cierran anon/PUBLIC. Los auxiliares privados no se exponen a esos roles. Reinstalar OP-12 u OP-13 conserva ambos controles y comprobantes existentes.

Este cambio conserva las reglas de producción, edición, lotes y destinos de la función instalada. No aplica todavía consumo MP ni modifica recetas, pedidos, despachos, inicio de octubre o saldos históricos. No duplica un asiento PT manual: el Kardex sigue observando el delta del inventario existente.

## Evidencia y límites

pruebas/verificar_registro_produccion_seguro.mjs comprueba conservación previa al envío, doble clic, respuesta perdida, recarga, bloqueo ante incertidumbre/cambio de datos, cierre confirmado, respuesta inválida, almacenamiento lleno/corrupto, fallo de limpieza, aislamiento y mapeo RPC.

Con CIBUSPAN_PROBAR_REGISTRO=1, pruebas/verificar_flujo_servidor_exportado.mjs aplica OP-12 y OP-13 en PGlite sobre las funciones reales exportadas: repetición sin entrada adicional, dos fabricaciones legítimas, reintento después del despacho, rollback completo, cambio de payload, cierre que bloquea llegada atrasada, entrada antigua/GUC inválido, otra identidad, permisos y service_role. El diagnóstico funciona en READ ONLY, detecta grants alterados y ambas migraciones se pueden reinstalar con CRLF sin perder controles/comprobantes.

El ensayo requiere CIBUSPAN_AUDIT_FILE con el JSON/TXT privado de Iván y CIBUSPAN_SQL_TEST_MODULE si PGlite está fuera del proyecto. El exportado no se publica. Son pruebas locales secuenciales con dependencias/defaults de ensayo: no certifican concurrencia real entre conexiones, HTTP, todos los RLS ni usuarios reales. Resultado conjunto con autorización, diagnóstico y Kardex: 69 pruebas pasan y npm run build correcto (sólo advertencia de tamaño de chunks). La compilación verifica la integración TypeScript; no sustituye una prueba visual ni la instalación real. La terminal de Iván confirma ejecución completa de scripts/Instalar-RegistroProduccionSeguro.ps1 en Windows/Supabase/Cloudflare, incluida la verificación previa al repair y publicación. No se hizo desde este entorno un recorrido autenticado de producción ni ensayo HTTP concurrente en vivo.

La consulta supabase/diagnosticos/verificar_registro_produccion.sql sólo consulta catálogos y espera cinco controles correctos. No certifica datos reales ni crea una producción de prueba. Instalación OP-13 confirmada. La ampliación posterior OP-07 de nuevas fabricaciones también está instalada/publicada, según la sección siguiente; los consumos históricos no se derivan automáticamente de recetas actuales.


## Ampliación de consumo instalada, posterior a la instalación OP-13

OP-07 agrega consumo_mp al payload de detalles sin cambiar las firmas OP-13. El cliente conserva ese consumo con la solicitud; un trigger nuevo sobre su confirmación registra MP junto con la fabricación o revierte todo. OP-13 sigue instalado y las solicitudes anteriores confirmadas se recuperan sin aplicar consumos al pasado. Un intento antiguo sin consumo pendiente se comprueba/cierra antes de restaurar la confirmación y completar datos. SQL 202610230003 y frontend instalados/verificados/publicados según Texto pegado(5).txt recibido 24/10/2026: main f11fe8a, tres verificadores superados, repair aplicado y Cloudflare 7faeb857. Ver docs/CONSUMO_MP_PRODUCCION.md. Falta validación operativa por usuarios; no se aplicaron consumos históricos. No reinstalar OP-12/OP-13 como sustituto de esta ampliación. El instalador verifica los tres controles antes de repair/publicar.
