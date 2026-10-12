# Continuidad de CIBUSPAN ONE

Guía de trabajo para el siguiente chat. Estado documentado: 12 de octubre de 2026. Leer primero `AGENTS.md` y comprobar los archivos y el último commit actual. Este documento explica el método; no sustituye el código ni demuestra qué versión está publicada.

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

### Trabajo activo: dashboard de visitas y rotación, 12/10/2026

Iván pidió pausar producción, pedidos e inventario y continuar el dashboard de visitas y rotación. Mantener pendientes las OP al Kardex, las producciones restantes y los despachos históricos; no reanudar ese trabajo sin que lo indique. Adjuntó captura del dashboard Comercial interactivo oscuro como referencia visual y pidió filtros de cliente, local e indicador y comparar todos los SKU en la semana actual y las cuatro anteriores.

Se sustituyó la vista Dashboard semanal de CampoComercial por DashboardVisitasRotacion, con diseño oscuro propio, cliente, local, indicador, tipo de visita (todas/mercaderista/KAM) y semana de referencia. Los filtros del dashboard son independientes del borrador y local de una visita en curso. Preserva registro, supervisión KAM, administración y evidencia de ubicación/fotos; no cambia DashboardV2 ni Comercial interactivo. El gráfico muestra cinco barras por SKU y una tabla con valores, cobertura y variación; conserva SKU sin dato y permite descargar CSV. Puede revisarse cualquier semana pasada con sus cuatro anteriores. Se carga hasta hoy en Quito para la semana en curso, sin inventar datos de los días futuros.

Las cinco semanas son calendario lunes-domingo, calculadas sin desplazamiento por UTC. Se usa la última revisión por cliente/local/SKU en cada semana, antes de agregar entre locales; no suma visitas repetidas ni arrastra valores de otras semanas o campos de una revisión anterior. Rotación, caras, precios y días se promedian entre locales con dato; stock del local se suma una vez; CD se promedia porque puede repetirse la misma referencia en distintos locales. Presencia, codificación, quiebres y con stock sin perchar son porcentajes entre observaciones verificables. Rotación es promedio diario reportado, no venta semanal comprobada. Cero se distingue de ausencia. Muestra cobertura y avisa que distintas coberturas pueden cambiar la comparación; semana actual señalada en curso.

El repositorio nuevo consulta com_kpi_campo_catalogo para opciones autorizadas y com_visitas_campo_sku con RLS y visita CONFIRMADA, paginando 500 hasta completar todas las filas. No usa el límite de 200 registros del RPC para reconstruir las series. El tipo de visita usa el rol guardado junto al autor coincidente; registros antiguos sin rol se mantienen en Todas. No instala SQL, no modifica visitas, recetas ni inventarios. No hay dependencias nuevas. La lectura real de Supabase sigue pendiente de comprobar desde la sesión de Iván. Falta publicar el frontend tras el commit.

Validación: 8 pruebas de semanas, timezone, filtros, últimas revisiones, sumas/promedios, ceros/nulos y variación; prueba de lectura simulada con 702 filas, paginación y error de permisos. No afirmar que se verificó visualmente en navegador: el ejecutable de Chromium no estaba disponible y la descarga falló; revisar la pantalla tras publicar. Scripts: `node --experimental-strip-types --test pruebas/verificar_dashboard_visitas.mjs`, `node pruebas/verificar_dashboard_lectura.mjs`, `npm run build`.

### Diagnóstico activo: visitas con SKU pero sin información, 12/10/2026

Iván informa que las visitas y SKU constan, pero faltan los valores que deberían leerse de las capturas. La revisión del código muestra que guardar() permite adjuntar imágenes sin ejecutar analizar(); subir archivos no ejecuta OCR. analizar() acepta lecturaTieneDatos() con solo local/código/nombre, por lo que puede anunciar lectura terminada sin cantidades. Son defectos comprobados del flujo, pero no prueban qué ocurrió en cada registro de producción. No afirmar que se consultó su base ni que las imágenes faltan: no hay acceso autenticado de Supabase del agente.

Se preparó `supabase/diagnosticos/visitas_capturas.sql`, SELECT de solo lectura para los 20 SKU guardados más recientemente. Incluye fechas de visita y guardado, número de capturas referenciadas y objetos presentes en storage, cantidades en columnas y en datos_ia, advertencias/confianza y definición instalada de la función concreta de guardado. No consulta archivos de otros módulos ni expone claves, no modifica datos ni permisos y no es una migración. Permite distinguir valores guardados ocultos por filtros/semana, datos en JSON sin columnas, imágenes faltantes y capturas almacenadas sin cantidades. Si solo hay imágenes sin cantidades, para distinguir lector no ejecutado vs lector que no reconoció datos hará falta una captura real o un registro de procesamiento: las visitas antiguas no guardan ese estado explícito. No reinterpretar ausencia como cero ni reemplazar automáticamente datos históricos.

Pedir ejecutar únicamente git pull y esta consulta con db query --linked --file y devolver la salida. No pedir otra publicación para obtener el diagnóstico. El guardado SQL versionado recibe las columnas numéricas explícitas y las conserva además en datos_ia, pero hay que verificar la función instalada. No cambiar todavía datos históricos ni atribuir la causa al usuario sin evidencia. Producción e inventario continúan pausados.

Consulta verificada en PGlite con cinco escenarios: columnas con cero real, cantidades solo en JSON, referencia a imagen inexistente, imagen existente sin cantidades y revisión física sin capturas. Una referencia repetida a una imagen existente no se confunde con archivo faltante. La consulta conserva filas y valores; no instala SQL ni requiere publicar. Para devolver el resultado desde PowerShell, db query --linked --file y --output json con Out-File -Encoding utf8; comprobar LASTEXITCODE antes de anunciar que el diagnóstico se generó.

### Resultado real del diagnóstico y corrección de capturas, 12/10/2026

Iván adjuntó `diagnostico_visitas.json` (Library `libfile_d9a8f45a55648191a7d99238ea813a0e`). Consulta 12/10 a las 17:31 UTC: 20 registros, 40 capturas referenciadas y 40 objetos presentes en storage. 19 registros tienen únicamente stock_local_unidades; uno no tiene cantidades. Ninguno tiene rotación, precios, código/nombre leído ni confianza de OCR. Columnas y datos_ia coinciden. Las caras ingresadas están conservadas. La función instalada corresponde al guardado completo versionado y sí recibe los campos numéricos. Evidencia: no faltan referencias de imágenes en este conjunto; las cantidades del lector no llegaron al guardado. No afirmar que se probó cada imagen visualmente ni que jamás se intentó el lector: no hay estado de procesamiento en los registros antiguos. La revisión abarca solo los 20 registros del archivo, no todas las visitas.

Se corrigió CampoComercial: capturas para lectura requieren ejecutar OCR y revisar antes de guardar; pulsar Guardar sin lectura ejecuta el lector y deja pendiente una segunda pulsación tras revisar. Reconocer solo local/nombre/código ya no anuncia lectura completa; exige al menos una cantidad reconocida. Puede elegirse explícitamente capturas solo de respaldo para ingreso manual. Sin capturas conserva el flujo manual. Guarda estado del lector y texto OCR limitado a 20.000 caracteres para diagnosticar errores futuros.

En Dashboard semanal > registros de visitas se agregó Releer capturas: abre las imágenes originales con URLs privadas, ejecuta OCR gratuito, muestra dato guardado / reconocido / valor a guardar. Conserva cantidades previas por defecto (incluso cero) y solo envía valores nuevos o corregidos. Comprueba códigos de SKU y coincidencia única de local cuando el lector los reconoce. Si no reconoce cantidades, permite revisar el texto y completar valores manualmente verificables, sin inventarlos. Nunca lee capturas ni guarda cambios en masa de forma automática.

SQL nuevo específico `supabase/migrations/202610120001_completar_lecturas_campo.sql`: instala solo RPC com_kpi_campo_completar_lectura. No cambia guardado existente ni políticas. Actualiza el detalle por su ID, sin nueva visita/SKU. Exige sesión, permiso Campo comercial, acceso al cliente y autor original o gerencia (ADMINISTRADOR/GERENTE, usando com_es_gerencia_kpi existente); bloquea visita no confirmada y token actualizado_en obsoleto. Lista estricta de campos numéricos/metadatos OCR; no permite cambiar fechas, SKU, autor, caras, fotos, georreferencia ni cobertura. Valores nulos no borran cantidades previas, cero explícito sí se conserva. Estado de recuperación y editor se añaden sin alterar responsable original. La instalación no completa datos de visitas: Iván debe releer y revisar en su sesión.

Aplicar únicamente este SQL con db query --linked --file, reparar exclusivamente 202610120001 después del éxito y publicar frontend. No db push. No se dispone de autenticación Supabase/Cloudflare del agente. Las visitas históricas aún no se han recuperado ni se ha verificado OCR contra las capturas reales, porque el archivo de diagnóstico no incluye imágenes descargables. Si el lector falla, obtener el texto reconocido o una captura real para ajustar su interpretación.

Pruebas: `node --experimental-strip-types --test pruebas/verificar_lectura_capturas.mjs`, `CIBUSPAN_SQL_TEST_MODULE=RUTA_PGLITE node --test pruebas/verificar_recuperacion_campo_sql.mjs`, lectura/dashboard existentes y compilación. Pruebas SQL usan las definiciones reales de com_visitas_campo/com_visitas_campo_sku de la migración original y simulan autenticación/alcance para probar permisos, token concurrente, conservación y ausencia de duplicados.

### Acceso visible a recuperar capturas, 12/10/2026

Iván informó que no encuentra “Releer capturas”. En el código anterior estaba dentro de dos desplegables, al final de una tabla ancha; no se dispone de confirmación de qué versión tiene publicada. Se agregó un botón visible “Releer capturas / visitas” inmediatamente debajo de los filtros de Dashboard semanal. Esa vista muestra tarjetas por fecha/local/SKU con botón directo “Releer capturas (n)” cuando hay imágenes guardadas, conservando filtros y la evolución semanal en su propia vista. La tabla de revisión de cantidades aparece después de leer; el guardado sigue actualizando el mismo detalle y requiere revisión del usuario. No se lee ni guarda en masa.

Cambio limitado a DashboardVisitasRotacion.tsx, su CSS y RecuperarLecturaVisita.tsx. No hay SQL nuevo. Sigue siendo necesaria la función de la actualización anterior 202610120001 para guardar lecturas recuperadas; su instalación y publicación no han sido confirmadas por Iván. Validación: compilación y revisión del diff; sin comprobación visual en navegador ni guardado en la base real.

### Lectura al seleccionar imágenes y recuperación conjunta autorizada, 12/10/2026

Iván solicitó que las capturas anteriores se relean juntas y que la mercaderista registre toda la información de una vez. Esto sustituye el criterio anterior de recuperar únicamente de forma individual: autoriza completar automáticamente cantidades verificadas de las capturas guardadas. Producción e inventario siguen pausados.

CampoComercial ahora ejecuta OCR local al seleccionar capturas, completa cantidades vacías y preserva los datos manuales (incluido cero). No sube archivos al leer: se cargan al guardar el SKU. El flujo habitual es elegir imágenes, revisar los campos completados y Guardar SKU una sola vez. Si un borrador restaurado no tiene lectura, Guardar puede ejecutarla y guardar usando directamente el resultado retornado, sin depender de que React haya aplicado los estados. Lecturas sin cantidades o de otro SKU/local bloquean ese guardado; sigue disponible el ingreso manual y capturas solo de respaldo. Hay protección contra resultados después de desmontar la pantalla y lectura simultánea. Mantiene cliente/local/GPS de la visita.

Dashboard semanal incluye botón directo “Leer y completar todas las capturas pendientes”. Procesa las visitas con imágenes y campos vacíos de las cinco semanas visibles, respetando cliente/local/tipo; omite capturas explícitamente solo de respaldo. Proceso secuencial por ID único: descarga URLs privadas, OCR, verifica local único y EAN coincidente (incluye alias T), confianza al menos 0,8, ausencia de valores contradictorios y cantidades válidas; completa exclusivamente campos vacíos mediante el RPC existente y token actualizado_en. Nunca crea visitas ni cambia fechas, caras, ubicación o cantidades previas. Los casos dudosos quedan REVISAR y los errores se muestran por visita sin anunciar éxito. Permite detener después de la lectura en curso; no puede deshacer un guardado ya enviado. Mantener la app abierta. Filtros se bloquean durante el proceso. El resultado distingue visitas con campos completados de las que no produjeron cantidades nuevas; “completada” no implica que la captura contenga los 14 campos.

El RPC existente conserva estado RECUPERADA_REVISADA. Para distinguir estas lecturas automáticas de una revisión humana, se agrega “Recuperación automática: campos vacíos completados; cantidades previas conservadas.” en advertencias de datos_ia, además del texto OCR y editor/fecha que ya audita el RPC. No hay nueva migración; sigue requiriendo la función 202610120001 de la actualización anterior. No se ha confirmado que Iván la haya instalado/publicado y el agente no tiene sesión para ejecutar la recuperación real.

Se corrigió el parser de OCR: las etiquetas de rotación/participación/predicción dejan de usar expresiones que podían consumir hasta otra etiqueta; valores se leen solo inmediatamente después de su propia etiqueta, sin usar números de otro campo. Campos vacíos/N/D permanecen nulos, negativos no se convierten a positivos, formatos numéricos mixtos ambiguos quedan sin reconocer y etiquetas con cantidades contradictorias se advierten. Local se reconoce solo en su cabecera, no en “Existencia en local”; múltiples locales o EAN diferentes no verifican identidad automática. Estas pruebas verifican texto simulado y reglas; no prueban la precisión del OCR sobre las imágenes reales.

Validación: 8 pruebas nuevas de parser y recuperación conjunta (ceros, datos manuales, identidad/calidad, contradicciones, ejecución secuencial, duplicados, cancelación, repetición), 3 pruebas anteriores de recuperación y compilación. Archivos: CampoComercial, DashboardVisitasRotacion/CSS, RecuperarLecturaVisita, nuevo RecuperarCapturasPendientes, campoComercialRepository, ocrFavorita, nuevo recuperacionCapturasCampo y pruebas/verificar_recuperacion_automatica.mjs. Falta publicar y procesar las capturas en la sesión de Iván; no afirmar datos históricos recuperados ni OCR real validado.

## Comunicación con Iván

Responder en español, breve y sin negrillas. Explicar la acción y el resultado en términos operativos. Dar avisos de avance claros durante el trabajo. No repetir todo el historial ni forzar nuevos pasos de aprobación cuando ya están autorizados. Ante un bloqueo, explicar la causa concreta y lo que falta; nunca inventar resultados.

Pausar el desarrollo de funciones cuando Iván solicite una revisión o un traspaso como este. Reanudar con el objetivo que él indique y conservar el trabajo anterior.
