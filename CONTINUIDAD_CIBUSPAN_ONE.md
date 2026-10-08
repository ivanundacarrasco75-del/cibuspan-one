# Continuidad de CIBUSPAN ONE

Guía de trabajo para el siguiente chat. Estado documentado: 8 de octubre de 2026. Leer primero `AGENTS.md` y comprobar los archivos y el último commit actual. Este documento explica el método; no sustituye el código ni demuestra qué versión está publicada.

## Proyecto y forma de trabajar

Iván mantiene una aplicación real en uso. Continuar sobre sus archivos actuales con cambios pequeños y comprobables. Implementar las solicitudes autorizadas, resolver los problemas y entregar el cambio completo; no limitarse a proponer un plan ni pedir confirmaciones repetidas para acciones ya solicitadas.

- Repositorio oficial: https://github.com/ivanundacarrasco75-del/cibuspan-one
- Rama oficial: `main`.
- Aplicación: https://cibuspan-one.pages.dev
- Entorno del usuario: Windows, VS Code, PowerShell, proyecto en `D:\CIBUSPAN_ONE`.
- Tecnología: React, TypeScript, Vite, Supabase/Postgres y PWA en Cloudflare Pages.
- Supabase del proyecto: `mkntfvsbmlgobettavnu`. Esto es un identificador, no una credencial.

El repositorio y sus archivos actuales son la fuente de verdad. Las capturas y los Excel sirven para diagnosticar y verificar datos. No reconstruir módulos desde un ZIP antiguo, sustituir la app por otra, cambiar de plataforma ni migrar a Sites. Si falta la copia local, obtener la rama oficial desde GitHub. La carpeta temporal del agente puede cambiar entre chats.

## Ciclo de implementación que ha funcionado

1. Revisar `git status --short`, `git log` y los archivos relacionados con la solicitud. Leer las instrucciones aplicables. Respetar cambios locales del usuario.
2. Diagnosticar el flujo completo: pantalla, validación, repositorio, respuesta de Supabase y permisos. Una captura con “Listo” no requiere otra conciliación; un mensaje de guardado no basta para afirmar que los datos persisten.
3. Modificar únicamente lo necesario. Mantener el diseño y las funciones existentes. Usar las páginas para la interacción, los repositorios/servicios para datos y los utilitarios para reglas reutilizables.
4. Revisar el diff y ejecutar comprobaciones pertinentes. `npm run build` debe pasar. Para reglas de inventario, importación o permisos, usar pruebas que comprueben resultados reales, errores y casos de duplicación. No ampliar pruebas sin una razón nueva ni crear pruebas que solo repitan el código.
5. Crear un commit estable y dejarlo en la rama oficial. Comunicar qué se cambió, qué se comprobó y qué falta publicar o instalar.
6. Entregar a Iván un bloque PowerShell completo, con comprobación de `$LASTEXITCODE` después de cada comando. No pedir que copie archivos o fragmentos de código fuente manualmente si ya están en GitHub.

En este chat se trabajó con una copia local del repositorio para editar y compilar, y con el conector GitHub para guardar cambios remotos. Cuando ese conector está disponible, el procedimiento es: leer el `HEAD` y su árbol, crear el árbol usando el anterior como base, crear el commit con el padre correcto y actualizar `main` sin forzar, comprobando el SHA esperado. Si la rama cambió, revisar los cambios antes de continuar. Después sincronizar la copia local sin descartar trabajo. Si se usa Git por CLI, conservar las mismas garantías.

No abrir una rama o PR por rutina en este flujo, ni publicar un nuevo proyecto paralelo. Si es necesario aislar cambios locales, hacerlo conservando `main` como destino y respetando lo que ya haya editado el usuario.

## Publicación: distinguir código de aplicación en producción

Guardar un commit en GitHub no publica automáticamente esta PWA. Habitualmente Iván publica desde su computadora; el agente no dispone de una sesión acreditada de Cloudflare o Supabase para hacerlo por él. No afirmar “publicado” solo porque el código pasó las pruebas.

Para un cambio de frontend, sin dependencias nuevas ni SQL, usar:

```powershell
& {
    Set-Location "D:\CIBUSPAN_ONE" -ErrorAction Stop

    git pull --ff-only
    if ($LASTEXITCODE -ne 0) { throw "Falló la actualización." }

    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Falló la compilación." }

    npx wrangler pages deploy dist --project-name=cibuspan-one --branch=main
    if ($LASTEXITCODE -ne 0) { throw "Falló la publicación." }
}
```

Añadir `npm ci` y su comprobación cuando cambien las dependencias o el lockfile, o falten los paquetes. Después de publicar, recargar la PWA. Una vista previa de un Excel debe volver a leer el archivo para aplicar una nueva lógica de importación.

Si Git bloquea la actualización por cambios locales, diagnosticar y respaldar los archivos concretos. No usar `reset --hard`, borrar trabajo ni aplicar `npm audit fix` indiscriminadamente.

## Precaución concreta de la base de datos

El historial remoto de migraciones puede estar incompleto porque varias actualizaciones antiguas se ejecutaron manualmente. No recomendar `supabase db push` de rutina: podría intentar aplicar cambios antiguos sobre una base más avanzada. Antes de utilizarlo, revisar historial remoto y dry-run.

Cuando sea necesario instalar SQL nuevo, preparar y probar un archivo específico. Aplicar solo ese archivo con `npx supabase db query --linked --file "..."`, comprobar éxito y registrar únicamente esa nueva versión como aplicada con `supabase migration repair VERSION --status applied --linked`. No reparar versiones antiguas para hacer coincidir el historial sin verificar qué ocurrió.

No pedir ejecutar SQL si el cambio solo es de frontend. No alterar permisos, políticas RLS, funciones o vistas de otros módulos para resolver un problema distinto. Mantener las restricciones existentes y mostrar un error claro si el usuario no tiene permisos de escritura.

Un error real ya corregido: `app_profiles` utiliza `user_id`, no `id`. La migración del Kardex falló inicialmente por esa diferencia. Las pruebas SQL se ajustaron para reproducir el esquema de perfiles definido en la migración oficial de usuarios. No inventar columnas para que una prueba pase.

No versionar `.env`, contraseñas, claves, tokens ni `supabase/.temp/`. No solicitar secretos por chat ni confundir permisos del conector con acceso a la base o a Cloudflare.

## Funciones que deben preservarse

- `DashboardV2`: conservar pestañas, filtros, comparaciones y especialmente “COSTOS Y GASTOS POR DEVENGO”.
- Roles de pago: pertenece a Pagos y Finanzas; no trasladarlo al Dashboard.
- Mantener aliases de rutas y permisos de pantallas.
- Conservar los módulos operativos existentes: pedidos, producción, lotes, reservas, despachos, devoluciones y sus referencias.
- Crear catálogo e importar stock son acciones diferentes. No guardar stock o costos ficticios al crear un artículo, ni sobrescribir existencias para quitar una advertencia.
- En importaciones, conservar cantidades y unidades; no convertir blancos en cero sin indicación del usuario ni omitir filas inválidas silenciosamente.

## Trabajo activo: saldo inicial y Kardex

Iván quiere cargar inventarios al 30/09/2026 y después registrar pedidos, producciones, compras y salidas desde el 01/10/2026 para reconstruir y conciliar octubre. Una orden de pedido no prueba que el producto fue despachado. No descontar dos veces las existencias al cargar salidas históricas.

Archivo revisado: `Inventario_2026-09-30_corregido(1).xlsx`. Contiene materias primas, empaques, micros preparados y productos terminados, con cantidades en kilos y unidades. Las cantidades deben leerse del archivo vigente, no copiarse de esta guía. El nombre de la hoja es `AGOSTO`, pero el contenido y el corte corresponden a septiembre. No inferir la fecha del nombre de la hoja.

Iván confirmó en cero las cuatro cantidades antes vacías: funda ciabatta código 36, PT ciabatta códigos CB y CI y zanahoria deshidratada código 123. Luego añadió `FSM` a la funda sanduchero integral 800g SM. Los archivos adjuntos pueden necesitar recuperarse en un nuevo entorno; no asumir que una ruta temporal sigue existiendo.

Los códigos contables cortos se comparan sin ceros iniciales: `12` corresponde a `00012`. Esto ya se vincula automáticamente cuando la coincidencia es única. Conservar completos los códigos de barras y sufijos como `7868304262219T`. Si hay varias coincidencias, no adivinar ni crear un duplicado.

El Excel no contiene los lotes ni fechas de producción reales del PT. Iván autorizó usar el 30/09/2026 como producción estimada de referencia para este saldo y calcular vencimientos con la vida útil que tiene cada SKU en el catálogo. Se generan lotes `INICIAL-EST-...`; no presentarlos como lotes físicos comprobados. El cálculo es fecha de producción más vida útil del SKU, no 30 días para todos. Los campos siguen siendo editables; no inventar días si faltan en el catálogo.

Iván afirma que esas unidades iniciales ya salieron de bodega. Esto no aporta todavía fechas ni documentos de cada salida. No darlas de baja automáticamente ni tratarlas como stock disponible definitivo hoy: hay que reconstruir los movimientos reales y verificar qué información ya existe.

### Estado de código al elaborar esta guía

- `5ca7e4b`: Kardex y carga conjunta de saldos; SQL `supabase/migrations/202610060001_kardex_inventarios.sql`.
- `be7fac3`: corrección a `app_profiles.user_id` y pruebas del esquema de perfiles.
- `d3094e4`: lectura del Excel de septiembre, ceros iniciales, unidades y residuos numéricos de fórmulas.
- `289e47f`: lotes y vencimientos automáticos. Iván confirmó que aparecieron estos cambios en su app.
- `e5df3e2`: crear y vincular artículos faltantes desde la vista previa; activar un existente inactivo solo si el usuario lo confirma; mostrar solo pendientes; detectar filas repetidas. Pasaron 18 pruebas y la compilación. Se entregó el bloque de publicación, pero aún no se recibió confirmación de esa publicación.

Los dos últimos cambios son de frontend y no requieren SQL nuevo. El `HEAD` puede avanzar: leerlo antes de continuar.

Archivos principales actuales:

- `src/pages/KardexInventario.tsx`
- `src/repositories/kardexRepository.ts`
- `src/utils/inventarioInicialExcel.ts`
- `src/components/inventario/CrearArticuloInventario.tsx`
- `src/repositories/altaArticuloInventarioRepository.ts`
- `src/utils/altaArticuloInventario.ts`
- `pruebas/verificar_kardex.mjs`, `pruebas/verificar_alta_inventario.mjs` y `pruebas/verificar_kardex_sql.mjs`

Comprobación de las reglas de frontend:

```bash
node --experimental-strip-types --test pruebas/verificar_kardex.mjs pruebas/verificar_alta_inventario.mjs
npm run build
```

Las pruebas SQL utilizan PGlite y requieren la dependencia indicada en su archivo de prueba. No depender de la ruta temporal usada en otro chat.

### Inicio de octubre autorizado el 07/10/2026

Iván indicó que este chat es exclusivamente de programación de CIBUSPAN ONE y pidió programar el inicio desde octubre. La solicitud intercalada de ASAMA fue un error y debe ignorarse.

Se agregó `supabase/migrations/202610070001_inicio_octubre.sql` y la opción “Empezar desde octubre” en Kardex > Cargar saldo inicial. El SQL solo instala la opción: no reinicia el inventario al ejecutarse. Iván confirmó después de la corrección de omisiones: “LISTO YA TENEMOS EL INICIO”. El saldo inicial se considera completado según su confirmación; el agente no lo verificó mediante una consulta directa a la base. No pedir repetir el reinicio ni volver a cargar el saldo inicial.

La confirmación guarda un respaldo completo de lotes, movimientos, cargas y catálogos en `inv_respaldos_inicio`, conserva IDs de los lotes anteriores, los marca con `inv_archivo_id`, deja su cantidad en cero y los excluye de la selección activa. Se sustituyen los movimientos y cargas activas por el Excel, dentro de la misma transacción. No borra pedidos, despachos ni recetas. Si aparece cualquier error de carga se revierte toda la operación. Los lotes archivados no se pueden reactivar ni borrar desde la app. Si una referencia inicial colisiona con un lote anterior, la nueva recibe un sufijo INICIO y el original queda respaldado.

Es un inicio único al 30/09/2026: las solicitudes idénticas se reconocen sin duplicar y un nuevo archivo no puede reiniciar otra vez los movimientos de octubre. Se exige MP y PT y se deben incluir todas las filas con existencias. La captura posterior mostró cuatro artículos obsoletos con stock cero (Chocobits 450g, CB, CI y zanahoria deshidratada), bloqueados por catálogo o unidad. Se añadió “Omitir sin existencias” para excluir explícitamente filas con cantidad cero y costo nulo o cero, conservando el listado y la opción de volver a incluir. No se permite excluir cantidades positivas, vacías o costos pendientes durante el inicio. No se crean artículos innecesarios ni se cambian unidades para poder omitirlos. Esta corrección es de frontend y no requiere otro SQL; pasaron 20 pruebas de frontend y la compilación. Iván confirmó posteriormente que ya tiene el inicio establecido. Los artículos fuera del archivo quedan sin existencias anteriores. Si hay reservas pendientes se bloquea la confirmación: deben resolverse desde los pedidos. El token de revisión detecta cambios de inventario, reservas o catálogo antes de confirmar. Los reintentos de movimientos ya archivados y los movimientos anteriores al 01/10 quedan bloqueados. El respaldo se puede descargar como JSON desde el Kardex por un administrador.

Se mantiene el aviso de inventario provisional mientras se reconstruye octubre. La carga de OP históricas y el consumo automático por receta siguen pendientes; este inicio no completa ese circuito. Pasaron 18 pruebas de frontend, 16 escenarios SQL y `npm run build`. Iván confirmó el inicio real; no se dispone de una verificación independiente de la base.

### Pedidos de octubre: trabajo iniciado después del saldo

Iván pidió cargar pedidos desde el 01/10 hasta el 07/10/2026 y adjuntó tres PDF de TUTI, un CSV múltiple de Santamaría y `SMXB2B-PANGOLIN 26-10-07.zip`. Indicó que por ahora los pedidos de El Rosado se ingresarán manualmente desde la app. No cambiar ese flujo por otra importación.

Se agregó carga directa del ZIP de Favorita en Pedidos, leyendo solo los listados F…txt: cada orden aparece en cinco formatos en el ZIP y no debe importarse cinco veces. Conserva el número de orden completo del contenido, convierte cajas por unidades de empaque y quita únicamente el relleno con ceros de los códigos EAN de 13 dígitos. Los duplicados idénticos dentro del ZIP se unen y los conflictos bloquean la lectura. Mantiene el TXT antiguo. TUTI permite seleccionar varios PDF juntos. Todos usan vista previa y las comprobaciones existentes contra pedidos registrados; las fechas y cantidades inválidas de Favorita no se omiten silenciosamente.

Lectura comprobada de estos adjuntos: Favorita 7 órdenes y 5.878 unidades, entrega 01–08/10; Santamaría 5 órdenes y 416 unidades, fechas de cancelación 05 y 07/10; TUTI 3 órdenes y 4.380 unidades, entrega 05 y 08/10. Hay dos pedidos futuros para el 08/10: Favorita `100628082385` (811 unidades) y TUTI `4500378088` (140 cajas de 12 = 1.680 unidades). El pedido Favorita `100627393603` fue emitido el 30/09 y se entrega el 01/10: incluirlo en la reconstrucción de salidas de octubre. Los documentos no prueban cumplimiento ni son evidencia de despacho. El CSV de Santamaría identifica su fecha como cancelación; no asumir que es fecha real de salida.

La vista previa muestra fecha del pedido si el archivo la aporta y fecha de entrega. La base existente de pedidos sigue guardando `fecha_entrega` y `creado_en` (fecha de carga); la fecha original de pedido es informativa en esta vista previa, no se agregó una columna ni se cambió el dashboard. No afirmar que las estadísticas de fecha de creación ya reflejan octubre histórico. La importación registra estado INGRESADO y no registra un despacho. No hay nueva migración SQL ni dependencias.

Pendientes:

1. Iván confirmó el 08/10: “YA FUNCIONA LA CARGA DE PEDIDOS PERFECTO”. La carga de pedidos se considera funcional según su confirmación. El agente no consultó la base para comprobar qué pedidos quedaron guardados. Revisar el número de pedidos ya existentes en la vista previa y errores de catálogo/unidad por cliente. No crear aliases ficticios: el CSV usa también EAN Santa María `7861169008213` (sanduchero integral) y TUTI usa `7868304262219T`.
2. Confirmar cuáles pedidos ya fueron entregados y sus fechas/cantidades/lotes reales; reconstruir despachos sin duplicar salidas ni volver a tratar los entregados como pedidos pendientes definitivos.
3. Cargar producciones, compras y otras salidas de octubre y conciliar el Kardex. El consumo automático de MP por producciones históricas todavía no se ha completado. Los micros creados desde el saldo inicial no crean por sí solos sus recetas de producción.
4. Conservar el respaldo y el inicio único: no reiniciar otra vez el inventario para quitar errores de pedidos.

### OP confirmadas y comparación de consumos, 08/10/2026

Iván confirmó que funcionan los pedidos y quiere reconstruir producción y despachos del 1 al 8 de octubre sin exigir lotes físicos históricos; empezar con lotes reales desde el 09/10/2026. El criterio propuesto es referencias históricas por SKU/fecha, conservar las OP y sus consumos, contar el saldo físico al cierre y no hacer un nuevo reinicio del inventario.

Archivo revisado: `OP OCT 1-8.pdf` (Library `libfile_0e752d7a9b508191b02f0fc1e7327ae7`). Es ÓRDENES DE PRODUCCIÓN CONFIRMADAS (EGRESOS DE MATERIA PRIMA), distinto al reporte de OP liquidadas. La cabecera pide 01–08/10, pero sus 218 líneas y 28 OP corresponden solo al 01–03/10: 25 OP de PT (12 SKU) y 3 de MICRO ROLLO CHOCOLATE. Las fundas indican 6.764 unidades de PT; esto es una inferencia de empaque consumido, no una declaración independiente de producción neta. Micros: 159,201 kg (sumando ingredientes por OP, redondeados); costo total de líneas 4.935,80601 USD frente a 4.935,80600 impreso. No sumar la columna general Cantidad como PT: mezcla kilos y empaques. Totales de cantidad 9.882,54174 frente a 9.882,54173 impreso sirven únicamente para controlar lectura, no para stock.

Se agregó lector de PDF confirmado y comparación de consumo en la vista previa de Producción > Importar OP / revisar consumos. Se mantiene el lector de OP liquidadas y el Excel. El lector confirmado conserva las 218 líneas, exige números consecutivos y controles contra totales del PDF y rechaza una lectura incompleta. PDF.js a veces une número de fila+sucursal y cantidad+código; se separan sin convertir vacíos en cero. Especialmente las fundas de TUTI (1.920 y 1.010 unidades) deben leerse enteras aunque empiecen a la izquierda de otras cantidades. Un OP puede contener varios SKU y la agrupación sigue OP+SKU.

“Comparar consumos con recetas” consulta recetas FM vigentes en la sesión del usuario: vínculos reales de SKU a fórmula, versiones vigentes, fórmula final, recetas de micro, materiales y empaques. No equipara receta vigente hoy a receta históricamente usada en cada OP. Las cantidades se escalan al rendimiento de SKU o al kilo producido de micro. Rollo suma sus dos fórmulas y agrega empaque una sola vez. Se comparan los micros consumidos en PT como mezcla; las OP que producen micro comparan sus ingredientes por composición, evitando presentar su consumo nuevamente como consumo directo de PT. Código contable con ceros iniciales vincula si es único; no se crean aliases ni se adivina una receta o micro ambiguo. Una receta estructuralmente incompleta no genera una diferencia contra un subtotal. Los componentes no reportados se muestran sin cantidad real comprobada; los sin referencia no generan diferencias ficticias. Se usa tolerancia de 1% o 0,002 kg. “Descargar comparación” genera un JSON con referencias y resultados para que Iván pueda adjuntarlo a este chat.

Comprobado localmente: lectura del PDF real con PDF.js, 218 líneas, 28 OP, totales e inferencia de 6.764 unidades; 7 pruebas de parser y comparación y compilación. El agente no tiene sesión de Supabase para consultar las recetas vigentes ni afirmar diferencias definitivas de la base. El código SQL versionado contiene recetas iniciales, pero no prueba que sigan iguales después de cambios en la app.

Esta actualización no instala SQL ni modifica stock: la importación existente sigue alimentando el historial/dashboard. Falta publicar el frontend, ejecutar la comparación en la sesión real y revisar referencias pendientes. Para reconstruir el inventario faltan los documentos o confirmación de ausencia de producción del 04–08/10 y la cantidad neta de PT; luego completar el puente de OP a stock y consumos con idempotencia, validación de saldos y revisión cronológica de micros/compras. No descontar dos veces sus ingredientes y no decir que comparar equivale a cargar stock. Los despachos históricos todavía necesitan las salidas reales por pedido.

### Fechas reales y consumos históricos: aclaración del 08/10/2026

Iván aclaró que los consumos a conservar son los de las OP, pues las recetas vigentes de CIBUSPAN ONE pueden estar desactualizadas. No sustituir los consumos reportados por los teóricos ni actualizar recetas automáticamente a partir de diferencias. El JSON `comparacion_consumos_OP.json` consultado el 08/10 mostró 50 diferencias repetidas entre OP, 25 filas de agua no reportada y 40 consumos sin referencia; varios micros tienen nombres diferentes entre catálogo y fórmula. Integral se comparó contra v4 actual. Manjar mostró un patrón aproximado de mitad de consumo para las fundas, pero esto no demuestra cuál dato es incorrecto.

Iván dijo que el 01/10 no se produjo Manjar. El documento sí registra OP 26100102 con ambas fechas contables 01/10 y 96 fundas. Después explicó que las OP se ingresan al sistema contable uno o dos días después de producirse; por tanto las fechas del documento no necesariamente son las reales. La fecha real de esa OP sigue sin confirmarse. No anularla, moverla a un día inventado ni restar automáticamente uno o dos días a todas las OP. En operación regular de CIBUSPAN ONE se pretende registrar producción el mismo día, usando la sugerencia existente según pedidos.

Se agregó edición de fecha de producción por OP+SKU en la vista previa de importación histórica. Conserva fecha_registro y fecha_fin_original; guarda una observación de corrección o fecha provisional, recalcula rango y orden de la vista previa y comparación, y usa las fechas revisadas en el RPC existente. Los días vacíos o imposibles impiden enviar el lote. El JSON de comparación conserva también las fechas contables y las observaciones. Reimportar sigue actualizando por OP+SKU sin crear otra OP. No hay migración SQL nueva: estos campos ya existen en el historial. Esta edición aún no carga PT ni descuenta MP del Kardex. La fecha de Manjar permanece como propuesta del documento hasta que Iván indique el día real. Falta publicar el frontend; el agente no lo despliega por guardar un commit.

Validación de esta edición: 10 pruebas de lectura, comparación y revisión de fechas aprobadas; compilación aprobada. No se ha probado el guardado en la base real desde la sesión del agente.

## Comunicación con Iván

Responder en español, breve y sin negrillas. Explicar la acción y el resultado en términos operativos. Dar avisos de avance claros durante el trabajo. No repetir todo el historial ni forzar nuevos pasos de aprobación cuando ya están autorizados. Ante un bloqueo, explicar la causa concreta y lo que falta; nunca inventar resultados.

Pausar el desarrollo de funciones cuando Iván solicite una revisión o un traspaso como este. Reanudar con el objetivo que él indique y conservar el trabajo anterior.
