# Continuidad de CIBUSPAN ONE

Guía de trabajo para el siguiente chat. Estado documentado: 7 de octubre de 2026. Leer primero `AGENTS.md` y comprobar los archivos y el último commit actual. Este documento explica el método; no sustituye el código ni demuestra qué versión está publicada.

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

Se agregó `supabase/migrations/202610070001_inicio_octubre.sql` y la opción “Empezar desde octubre” en Kardex > Cargar saldo inicial. El SQL solo instala la opción: no reinicia el inventario al ejecutarse. Falta que Iván instale ese SQL, registre únicamente su versión como aplicada y publique el frontend. Después debe cargar su Excel completo, resolver todas las filas y confirmar “Inicio de octubre” como administrador. No afirmar que el reinicio ya se ejecutó.

La confirmación guarda un respaldo completo de lotes, movimientos, cargas y catálogos en `inv_respaldos_inicio`, conserva IDs de los lotes anteriores, los marca con `inv_archivo_id`, deja su cantidad en cero y los excluye de la selección activa. Se sustituyen los movimientos y cargas activas por el Excel, dentro de la misma transacción. No borra pedidos, despachos ni recetas. Si aparece cualquier error de carga se revierte toda la operación. Los lotes archivados no se pueden reactivar ni borrar desde la app. Si una referencia inicial colisiona con un lote anterior, la nueva recibe un sufijo INICIO y el original queda respaldado.

Es un inicio único al 30/09/2026: las solicitudes idénticas se reconocen sin duplicar y un nuevo archivo no puede reiniciar otra vez los movimientos de octubre. Se exige MP y PT, y la pantalla incluye todas las filas para este modo. Los artículos fuera del archivo quedan sin existencias anteriores. Si hay reservas pendientes se bloquea la confirmación: deben resolverse desde los pedidos. El token de revisión detecta cambios de inventario, reservas o catálogo antes de confirmar. Los reintentos de movimientos ya archivados y los movimientos anteriores al 01/10 quedan bloqueados. El respaldo se puede descargar como JSON desde el Kardex por un administrador.

Se mantiene el aviso de inventario provisional mientras se reconstruye octubre. La carga de OP históricas y el consumo automático por receta siguen pendientes; este inicio no completa ese circuito. Pasaron 18 pruebas de frontend, 16 escenarios SQL y `npm run build`. La instalación, publicación y confirmación reales siguen pendientes de comprobar.

### Pendientes reales, no resueltos por cambiar de chat

1. Confirmar publicación y funcionamiento del botón “Crear artículo” en la sesión real del usuario. No afirmar que se crearon artículos o que se importó el saldo solo porque el código está guardado.
2. Resolver las filas pendientes usando el catálogo correcto y los permisos existentes. Los nuevos PT requieren vida útil y unidades por parada reales; MP, empaques y micros no requieren esos campos.
3. Las capturas del 07/10 mostraron SALDO_EXISTENTE de distintos lotes, registrado al activar el Kardex. Eso no demuestra duplicación por cada prueba. Iván autorizó expresamente un inicio desde octubre: el Excel al 30/09 debe sustituir todos los saldos anteriores, conservando respaldo. Se implementó el flujo específico descrito abajo; no quitar los controles de la carga habitual.
4. Confirmar la carga de saldos y luego conciliar octubre. El consumo automático de MP por producciones históricas todavía no se ha completado; no prometer que ese circuito ya cuadra automáticamente. Los micros creados desde esta carga controlan stock como artículos; no crean por sí solos sus recetas de producción.

## Comunicación con Iván

Responder en español, breve y sin negrillas. Explicar la acción y el resultado en términos operativos. Dar avisos de avance claros durante el trabajo. No repetir todo el historial ni forzar nuevos pasos de aprobación cuando ya están autorizados. Ante un bloqueo, explicar la causa concreta y lo que falta; nunca inventar resultados.

Pausar el desarrollo de funciones cuando Iván solicite una revisión o un traspaso como este. Reanudar con el objetivo que él indique y conservar el trabajo anterior.
