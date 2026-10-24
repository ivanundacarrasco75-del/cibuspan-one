# Arranque operativo con inventario físico

Decisión registrada el 24/10/2026 a partir de la indicación de Iván. Prioridad actual: conservar los pedidos al día y preparar un corte real de inventario para el arranque diario de producción y bodega. La reconstrucción de consumos desde el 1 de octubre queda en pausa; no es requisito para arrancar con un saldo físico confiable.

## Estado y alcance

- Pedidos: continuar su registro. Conservar los existentes; comprobar cuáles siguen realmente pendientes al corte, sin volver a importarlos.
- Inventarios: los saldos anteriores no están conciliados con la operación física actual. No tratarlos como disponibilidad verificada para prometer entregas o decidir fabricación.
- Producción/bodega: preparar fecha y hora de inicio, responsables y conteo. La fecha de publicación del sitio no establece por sí sola el arranque físico.
- Consumo MP y protecciones OP-12/OP-13: instalados y conservados. No desinstalar ni quitar validaciones por este cambio de plan.
- Estado de esta entrega (24/10/2026): módulo implementado y probado localmente. SQL 202610240001 y frontend pendientes de instalar/publicar mediante el nuevo instalador. No se aplicó un corte ni un saldo real. Iván indica que la fecha se elegirá cuando el módulo esté listo; no volver a pedirla como requisito para programar.

La instrucción de trabajar por ahora con pedidos corresponde a la preparación de producción y bodega; no desactiva visitas ni otros módulos que ya usan las personas.

## Lista de preparación del corte

1. Preparar sin fecha obligatoria. Cuando el conteo esté listo, elegir inicio hoy o mañana (hora Ecuador), con existencias al cierre del día anterior. Si hubo movimientos entre conteo y arranque, conciliarlos antes de confirmar. El módulo no permite elegir una fecha antigua para reinterpretar operaciones ya realizadas.
2. Contar MP, empaques, micros/materiales preparados inventariables, semielaborados y producto terminado. Usar unidades del catálogo y cantidades físicas. Un artículo no contado queda pendiente; no se convierte automáticamente en cero.
3. Para PT/semielaborados, identificar los lotes y fechas reales disponibles, incluidos vencimientos cuando correspondan. Resolver identificaciones faltantes sin inventar fechas para hacer pasar FEFO.
4. Diferenciar stock físico, reservado y disponible. Revisar reservas existentes y pedidos realmente pendientes para no duplicar compromisos ni volver a producir pedidos ya atendidos. No cambiar estados sin comprobarlos.
5. Preparar una vista previa del corte: saldo que figura, conteo, diferencia, unidad, fecha y tratamiento propuesto por artículo/lote. Las cifras antiguas se conservan como historial, con su período identificado como no conciliado.
6. Revisar y aplicar una sola vez desde Kardex > Preparar arranque. La apertura registra ajustes por diferencia al cierre, conserva los movimientos previos y verifica que MP, físico PT, Kardex PT y semielaborados disponibles igualen los conteos. No aplicar hasta disponer del conteo real completo.
7. Establecer la frontera temporal para que movimientos anteriores ingresados después no alteren silenciosamente el saldo físico aprobado. No debe haber operaciones sin registrar entre conteo y arranque; si las hay, conciliarlas una sola vez antes de habilitar el nuevo período.
8. Desde el corte validado, registrar compras/entradas, producción con consumo, despacho/salidas, devoluciones y ajustes reales de forma continua. Validar los primeros documentos reales y su Kardex, sin crear operaciones ficticias como prueba.

## Conservación y límites

El inventario de septiembre y los movimientos anteriores no se borran ni se declaran conciliados. No volver a ejecutar el inicio de octubre, truncar tablas, eliminar lotes, cargar otro SALDO_INICIAL a ciegas ni sumar el conteo físico como si fuera una compra. El nuevo período debe partir de la existencia física aprobada, conservando evidencia del anterior y de la diferencia aplicada. Las estadísticas anteriores al corte no se presentan como movimientos de inventario completos.

La regularización histórica puede retomarse después para análisis, separando sus efectos del saldo operativo del corte. No cargar producciones antiguas otra vez para intentar alcanzar el conteo actual.

## Módulo implementado

Acceso: Kardex > Preparar arranque. Sólo administrador activo prepara/aplica; otros usuarios con acceso a inventario pueden consultar el estado general. La instalación no cambia saldos, pedidos ni disponibilidad.

- Borrador por proyecto/usuario en el navegador; permite descargar/restaurar JSON. No es un borrador compartido entre computadoras. Conservar el archivo descargado como respaldo del trabajo.
- MP, empaques y micros inventariables: ingreso manual o cantidades de Excel .xlsx. Códigos numéricos cortos sin ceros iniciales se vinculan automáticamente si son únicos; alias ambiguos, unidades distintas, artículos desconocidos y filas repetidas requieren resolución. No se suman bodegas ni se crea catálogo silenciosamente. Crear/reactivar lo faltante en su catálogo y actualizar conservando conteos.
- PT y semielaborados: total físico y desglose en lotes/fechas reales. El Excel sólo asigna cantidades, no inventa fechas/lotes ni costos. Los ceros se declaran explícitamente; campos vacíos siguen pendientes. Se conserva toda exclusión/resolución y fuente del archivo en el informe.
- Vista previa sin escrituras: sistema, Kardex anterior, físico contado, diferencias, avisos y bloqueos. Reservas activas y movimientos/fabricaciones desde la fecha elegida bloquean. Revisar/liberar reservas en Despachos y verificar pedidos pendientes; el corte no cambia sus estados.
- Confirmación con dos declaraciones y confirmación final. Verifica la sesión, guarda el intento antes del envío y usa el mismo UUID para recuperar una respuesta perdida. Resolver ausencia sella el intento para impedir que una solicitud atrasada lo aplique después. No borrar almacenamiento ni cambiar de dispositivo para resolver incertidumbre.
- Aplicación atómica con bloqueo breve de escrituras y comprobación de la versión completa de stock/catálogos/pedidos vista en la previa. Si algo cambió, pide una nueva revisión. Una segunda apertura se rechaza, aunque se cambie el UUID.
- Respaldo privado descargable del estado anterior, conteos y resultado. No se eliminan filas históricas ni se fabrica stock mediante producciones ficticias. Los semielaborados preservan conversiones: cantidad inicial se ajusta a convertido anterior + físico disponible contado. Lotes PT archivados sólo se reabren si se incluyen expresamente en el conteo.
- Frontera temporal en servidor: impide movimientos de stock y cambios a producciones/conversiones anteriores que alteren el saldo aprobado. Si el inicio es mañana, stock queda cerrado hasta ese día; pedidos pueden continuar. Un material nuevo posterior recibe base cero; sus entradas reales siguen por Kardex. Las correcciones del nuevo período son movimientos trazables, sin reescribir la apertura ni identidades confirmadas.

El ajuste usa unidades del catálogo, no revaloriza costos. Lotes vencidos se cuentan físicamente con advertencia; la función FEFO instalada no los reserva. Esto no certifica todos los cálculos de planificación/caducidad ni los flujos pendientes de empaque y micros. No reingresar producciones antiguas para reconstruir stock tras el corte: su futura regularización requiere un flujo analítico separado.

## Instalación y publicación

Desde PowerShell en D:\CIBUSPAN_ONE, actualizar main y ejecutar scripts/Instalar-ArranqueOperativo.ps1. Compila primero, aplica únicamente 202610240001_arranque_operativo.sql, exige cuatro diagnósticos de metadatos (autorización, registro seguro, consumo MP y arranque), registra sólo esa versión y publica en Cloudflare. No ejecuta db push, migraciones antiguas, importaciones ni el corte físico. Si algún paso falla, copiar el error y completar sólo lo pendiente; no retirar controles ni repetir fabricaciones.

SQL y frontend preparados en esta entrega; instalación/publicación no confirmadas hasta recibir la terminal. Fecha y conteo siguen pendientes por decisión del usuario. Siguiente paso: instalar módulo, preparar conteo real, revisar previa y confirmar el arranque cuando esté listo. Etapa 3 abierta; pedido transaccional y automatizaciones empaque/micros continúan pendientes.

## Verificación y límites de evidencia

Resultado local de esta entrega: 92 pruebas superadas (57 en escenario SQL exportado y 35 de cliente/registro de producción), compilación TypeScript/Vite/PWA correcta.

Pruebas de cliente: números/ceros/cobertura, lotes reales, códigos, duplicados/unidades de Excel, conservación del borrador, copia previa al envío, doble clic, respuesta perdida, recarga, cierre sellado, almacenamiento lleno/corrupto y aislamiento por sesión/proyecto. Regresión del cliente de producción existente incluida.

Pruebas SQL sobre el esquema/cuerpos exportados privados del 23/10 (PGlite aislado, defaults/auxiliares modelados): instalación sin cambios de stock, previa READ ONLY, ajuste exacto y repetición, conservación de pedidos/historia, invalidación por cambios de pedido/stock, reservas activas, cierre hoy/mañana, período anterior negativo sin contaminar el nuevo, descuadre previo PT, semielaborados convertidos, lotes archivados/nuevos, rollback tardío, permisos, intento sellado y reinstalación CRLF con OP-12/13/07 conservados. Diagnóstico READ ONLY detecta trigger deshabilitado y acceso anónimo.

No se ejecutaron operaciones de prueba en producción, ni se certificaron HTTP concurrente, sesiones reales de empleados o recorrido visual en navegador. El instalador verifica contratos de la base antes de publicar; el primer conteo real aún requiere revisión humana. El archivo privado exportado no se publica en GitHub.

