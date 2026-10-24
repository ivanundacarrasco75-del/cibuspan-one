# Consumo de materias primas al registrar producción

Estado actualizado con resultado recibido el 24/10/2026. OP-07, primer alcance de nuevas producciones: instalado, verificado y publicado según Texto pegado(5).txt. Descargó main f11fe8a, compiló, superó los tres verificadores, registró 202610230003 y publicó Cloudflare 7faeb857. OP-12 y OP-13 conservados. Validación operativa por usuarios y regularización histórica pendientes; etapa 3 abierta.

## Uso diario

1. Seleccionar productos, paradas y cantidades como hasta ahora.
2. En la confirmación aparece Materias primas y empaques utilizados, por SKU. La receta VIGENTE consultada propone cantidades para las unidades indicadas; no constituye una certificación de consumo real ni de vigencia histórica.
3. Revisar cantidades, quitar materiales no utilizados, agregar los realmente utilizados y escribir diferencias/observaciones. Si cambian las unidades, se conserva lo declarado y se desmarca su confirmación; Volver a calcular con receta reemplaza las cantidades sólo a petición del usuario. Cambiar fecha/lote también exige confirmar otra vez.
4. Confirmar el consumo real de cada SKU y guardar la producción. Se guarda el ingreso PT/semielaborado, la salida MP, el comprobante y su detalle en la misma transacción.
5. Consultar los consumos en el detalle del historial y las salidas en el Kardex. Se conserva material, código, nombre, unidad, cantidad, fecha, identificador del movimiento y producción vinculada.

No se usa el stock contable de una importación de costos como existencia operativa. El saldo mostrado procede del Kardex. La disponibilidad definitiva se comprueba en el servidor al guardar, incluidos movimientos posteriores a una fecha retroactiva. Si falta saldo inicial, cambia la unidad, el artículo está inactivo o queda stock negativo, se revierte toda la operación: no queda entrada PT ni consumo parcial. No se aceptan consumos futuros o anteriores/al mismo día del cierre inicial.

Las recetas pueden estar desactualizadas, como advirtió Iván. Sus cantidades son propuestas que deben contrastarse con lo usado. Si no se puede consultar la receta, se permite ingreso manual; si falla consultar el catálogo, se muestra el error y no se permite confirmar sin consumos revisados. Ausencia de receta o de un componente no significa consumo cero. Un SKU sin consumo inventariable requiere motivo explícito de al menos diez caracteres y confirmación del usuario, que queda registrada.

Las referencias de receta reutilizan el comparador existente: fórmulas vinculadas activas, una versión VIGENTE inequívoca por fórmula, componentes y empaques. Se suman las fórmulas del Rollo y el empaque se cuenta una vez. Se identifican materiales por UUID; no se decide por códigos ambiguos. El comparador ya convierte kilos de receta a gramos cuando el catálogo usa G. No se convierten kilos a litros por una densidad supuesta ni se redondean empaques fraccionados a enteros sin revisión. Se conservan advertencias y las unidades KG/G/L/ML/UNIDAD del catálogo.

Un micro ya preparado se declara como material consumido cuando corresponde al catálogo; no se descuentan también sus ingredientes. El vínculo por nombre del comparador sigue siendo una propuesta que el usuario revisa; si no es inequívoco, se ingresa manualmente. La preparación/entrada al stock de micros como artículos MP sigue requiriendo registro real en el Kardex; no se crea una fabricación de micros automática en este alcance. Puede declararse el consumo directo de ingredientes cuando realmente se prepararon dentro de esa fabricación, sin duplicarlos con el micro.

## Qué se conserva y qué sigue pendiente

- Reintentos OP-13: la solicitud conserva el consumo y la referencia de receta junto con los productos antes de enviar. Repetir una solicitud confirmada no vuelve a sumar PT ni a descontar MP. Dos fabricaciones reales distintas sí tienen consumos distintos. No hay fallback al registro antiguo.
- Pendientes de una versión anterior sin consumo: los botones de recuperación comprueban primero el resultado. Si ya estaba registrado, lo recuperan; si no existe, cierran la clave y restauran la confirmación para completar consumos. No se añade consumo a un comprobante anterior ya confirmado. Si un reintento con consumo es rechazado y el servidor confirma que no se guardó, la interfaz restaura las cantidades para corregirlas, mientras los SKU sigan disponibles. Desde historial se carga primero el catálogo para no cerrar un intento antes de disponer de sus datos de edición.
- Editar unidades, fechas o lotes de una producción conserva los consumos reales originalmente declarados; no se recalculan por una receta ni por una proporción de rendimiento. El historial muestra fecha y unidades al declarar. Las correcciones de consumo se registran como movimientos compensatorios desde el Kardex, con motivo y referencia a la producción; no modifican la declaración original. Una futura conciliación debe incluir esos ajustes, no sumar sólo la tabla de declaraciones.
- Semielaborados: fabricar su base consume MP; convertir/etiquetar no vuelve a consumir la harina de esa base. La propuesta omite empaques en su fabricación cuando están identificados como tales. El empaque utilizado al etiquetar y la reposición de micros requieren movimientos explícitos en Kardex; aún no están automatizados en sus pantallas.
- Producciones APP anteriores y OP históricas: no se aplican consumos retroactivos. Un historial sin declaración muestra Sin consumo registrado por el nuevo circuito, nunca cero comprobado. Las OP históricas continúan siendo analíticas. Su regularización debe contrastar cantidades reales, fecha física, unidades, ajustes y posibles movimientos previos; no reingresar la fabricación ni descontar recetas actuales sobre el pasado.
- No se cambian recetas, costos, pedidos, reservas, despacho, saldos iniciales ni el inicio de octubre. No se declara inventario conciliado ni etapa 3 terminada por este cambio.

## Implementación e instalación

La migración específica crea pro_consumos_detalle y un trigger AFTER UPDATE OF estado en pro_solicitudes_registro, sólo para REGISTRANDO → CONFIRMADA. El trigger exige la transacción, actor y autorización válidos; valida cada detalle, obtiene los bloqueos MP en orden usando la misma clave que inv_kardex_registrar, escribe salidas y conserva referencias. inv_kardex_validar_mp comprueba toda la secuencia temporal. Un fallo aborta también la fabricación y la confirmación OP-13.

No reemplaza cuerpos del servidor exportados ni modifica las firmas o controles OP-12/OP-13. El trigger permanece si se reinstalan esas migraciones. Reinstalar consumo no aplica movimientos a registros previos ni repite salidas. Tabla con RLS, lectura para módulos autorizados y sin escritura directa de roles API; función del trigger privada. Se conserva la lectura por user_id de app_profiles. El consumo es una declaración manual revisada, no una medición independiente.

```powershell
& {
    Set-Location "D:\CIBUSPAN_ONE" -ErrorAction Stop
    git pull --ff-only
    if ($LASTEXITCODE -ne 0) { throw "Fallo la actualizacion. No continuar." }
    & ".\scripts\Instalar-ConsumoMpProduccion.ps1"
}
```

El instalador compila primero, aplica sólo 202610230003, consulta los diagnósticos de autorización, registro seguro y consumo, exige JSON/versión/correcto=true de cada uno, registra sólo la versión nueva y publica Cloudflare cibuspan-one/main. No npm ci ni db push del historial; no ejecuta operaciones de prueba. Requiere el proyecto Supabase ya vinculado y SQL/frontend juntos. Mientras se publica, un cliente antiguo que intente crear una producción sin consumos recibe error y no modifica inventario. Cerrar y abrir la app al terminar.

Si SQL se aplica y falla verificación, repair o Cloudflare, copiar el error y terminar el paso pendiente; no retirar las protecciones ni repetir producciones reales. No volver a ejecutar el inicio de octubre. La terminal Texto pegado(5).txt recibida confirma ejecución completa en Windows/Supabase/Cloudflare; no repetir el instalador por los avisos de versión o tamaño de chunks.

## Instalación confirmada por terminal

Resultado recibido el 24/10/2026: Texto pegado(5).txt ejecuta Instalar-ConsumoMpProduccion.ps1, actualiza d12e18b → f11fe8a, compila 281 módulos, supera los verificadores de autorización/registro/consumo, registra migration repair 202610230003 y publica 67 archivos (21 existentes) en https://7faeb857.cibuspan-one.pages.dev. Mensaje final: «Consumo MP instalado, verificado y publicado; autorizacion y reintentos conservados.» No faltan comandos de instalación/publicación de este alcance. Cerrar y abrir la app antes de la próxima fabricación nueva; no reingresar producciones anteriores como prueba.

El aviso de Wrangler sobre cambios locales no bloqueó la publicación. No se inspeccionaron esas diferencias; no descartarlas automáticamente ni suponer un checkout limpio. Los avisos de CLI y chunks no fueron errores de instalación.

## Evidencia

102 pruebas locales pasan y npm run build correcto, con advertencia habitual de tamaño de chunks. Incluyen autorización, diagnóstico, Kardex, comparación OP y registro/consumo. Se aplica la migración a las funciones exportadas privadas en PGlite: confirmación conjunta, repetición, dos SKU/material compartido, dos fabricaciones legítimas, insuficiencia con rollback total, material inactivo/sin saldo, fecha/cierre, negativo posterior, unidades de catálogo, semielaborado, permisos, RLS de consumos, service_role, edición sin recalcular MP y reinstalación CRLF. El diagnóstico READ ONLY detecta trigger deshabilitado.

La utilidad prueba propuestas, consolidación, falta de referencia/unidad, gramos, empaques fraccionados, exclusión de empaque en semielaborados, validación manual y conservación del consumo/versiones tras pérdida de respuesta. El comprobante previo sin consumo se recupera sin reescribir el pasado.

Ensayo: CIBUSPAN_PROBAR_CONSUMO=1, CIBUSPAN_AUDIT_FILE con el TXT/JSON privado y CIBUSPAN_SQL_TEST_MODULE si PGlite está fuera del proyecto. No se publica ese archivo. El escenario sigue modelando defaults, permisos y dependencias auxiliares no completas; para el cambio de rendimiento se modelan tablas vacías de auditoría/despacho/empaque. No certifica concurrencia HTTP, todos los RLS, saldos reales, recorridos visuales o aceptación del usuario. Las pruebas de fabricación descritas se ejecutaron localmente. Texto pegado(5).txt confirma ahora instalación, verificación y publicación reales por Iván; no equivale a aceptación de una fabricación real ni a ensayo concurrente en vivo.

Siguiente paso: validar el circuito cuando ocurra una nueva producción real y preparar la regularización de consumos históricos con evidencia real, sin repetir fabricación ni aplicar movimientos todavía en esa preparación; precisar automatización de empaque/micros. Pedido transaccional y reglas de parcial/numeración/stock mínimo continúan pendientes. La reorganización de menús sigue en pausa durante estas conexiones.
