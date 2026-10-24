# Arranque operativo con inventario físico

Decisión registrada el 24/10/2026 a partir de la indicación de Iván. Prioridad actual: conservar los pedidos al día y preparar un corte real de inventario para el arranque diario de producción y bodega. La reconstrucción de consumos desde el 1 de octubre queda en pausa; no es requisito para arrancar con un saldo físico confiable.

## Estado y alcance

- Pedidos: continuar su registro. Conservar los existentes; comprobar cuáles siguen realmente pendientes al corte, sin volver a importarlos.
- Inventarios: los saldos anteriores no están conciliados con la operación física actual. No tratarlos como disponibilidad verificada para prometer entregas o decidir fabricación.
- Producción/bodega: preparar fecha y hora de inicio, responsables y conteo. La fecha de publicación del sitio no establece por sí sola el arranque físico.
- Consumo MP y protecciones OP-12/OP-13: instalados y conservados. No desinstalar ni quitar validaciones por este cambio de plan.
- Estado de esta entrega: planificación y seguimiento actualizados. No se modificó la app, no se bloqueó técnicamente ningún módulo y no se aplicó un corte ni un saldo nuevo.

La instrucción de trabajar por ahora con pedidos corresponde a la preparación de producción y bodega; no desactiva visitas ni otros módulos que ya usan las personas.

## Lista de preparación del corte

1. Definir fecha/hora efectiva del conteo y del arranque. Confirmar si se contará al cierre anterior o en el momento de apertura; no elegir una fecha ni un saldo sin evidencia.
2. Contar MP, empaques, micros/materiales preparados inventariables, semielaborados y producto terminado. Usar unidades del catálogo y cantidades físicas. Un artículo no contado queda pendiente; no se convierte automáticamente en cero.
3. Para PT/semielaborados, identificar los lotes y fechas reales disponibles, incluidos vencimientos cuando correspondan. Resolver identificaciones faltantes sin inventar fechas para hacer pasar FEFO.
4. Diferenciar stock físico, reservado y disponible. Revisar reservas existentes y pedidos realmente pendientes para no duplicar compromisos ni volver a producir pedidos ya atendidos. No cambiar estados sin comprobarlos.
5. Preparar una vista previa del corte: saldo que figura, conteo, diferencia, unidad, fecha y tratamiento propuesto por artículo/lote. Las cifras antiguas se conservan como historial, con su período identificado como no conciliado.
6. Aplicar el corte una sola vez con trazabilidad, protección contra reintentos y conciliación de totales. La forma de apertura/ajuste y su comprobación en la base existente deben desarrollarse o verificarse antes de aplicarla; no se da por resuelta por el mero hecho de existir un importador inicial.
7. Establecer la frontera temporal para que movimientos anteriores ingresados después no alteren silenciosamente el saldo físico aprobado. No debe haber operaciones sin registrar entre conteo y arranque; si las hay, conciliarlas una sola vez antes de habilitar el nuevo período.
8. Desde el corte validado, registrar compras/entradas, producción con consumo, despacho/salidas, devoluciones y ajustes reales de forma continua. Validar los primeros documentos reales y su Kardex, sin crear operaciones ficticias como prueba.

## Conservación y límites

El inventario de septiembre y los movimientos anteriores no se borran ni se declaran conciliados. No volver a ejecutar el inicio de octubre, truncar tablas, eliminar lotes, cargar otro SALDO_INICIAL a ciegas ni sumar el conteo físico como si fuera una compra. El nuevo período debe partir de la existencia física aprobada, conservando evidencia del anterior y de la diferencia aplicada. Las estadísticas anteriores al corte no se presentan como movimientos de inventario completos.

La regularización histórica puede retomarse después para análisis, separando sus efectos del saldo operativo del corte. No cargar producciones antiguas otra vez para intentar alcanzar el conteo actual.

## Próximo entregable

Preparar el corte de arranque con vista previa y trazabilidad, usando lo existente y conservando pedidos, autorizaciones y comprobantes. Faltan fecha/hora acordadas y conteo físico. No hay autorización implícita para aplicar cifras desconocidas ni resetear datos. Etapa 3 de revisión sigue abierta; pedido transaccional y automatizaciones de empaque/micros siguen pendientes.
