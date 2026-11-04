# Puesta en marcha de pedidos, producción e inventarios

Objetivo indicado por Iván el miércoles 04/11/2026: operar desde el lunes 09/11/2026. Se retoma la preparación del arranque físico para ese objetivo; su aplicación sigue pendiente de conteo completo, vista previa y confirmación. No se aplica nada por fijar una fecha objetivo. Reconstrucción histórica de octubre continúa en pausa.

## Qué ya está instalado

- Pedidos completos con recuperación: fbafd456.
- Alta de producción y declaración de consumo MP: 4e741568 / 7faeb857, según terminales recibidas. Aceptación operativa de cada rol aún pendiente.
- Corte físico: 10e6b372, instalado sin conteo aplicado.
- Preparar/liberar reservas y controles logísticos: 71953738.
- Corrección de despacho con ajuste por diferencia: abd0efe0.
- OP-09 definido: cerrar con lo realmente enviado, sin saldo pendiente; conservar pedido original para Fill Rate.

Último cambio preparado, aún pendiente de instalación/publicación: planificación por fechas de entrega (202611040003). Evita sumar pedidos atrasados o futuros a la jornada elegida. Ver PLANIFICACION_POR_FECHAS.md. No afirmar que el módulo completo ya está aceptado por usuarios sólo por las instalaciones o pruebas locales.

## Checklist de llegada al lunes

| Cuándo | Responsable por confirmar internamente | Tarea | Criterio para marcar listo |
| --- | --- | --- | --- |
| 4-5 noviembre | Iván / programación | Instalar planificación por fechas y revisar un cálculo con pedidos reales, sin confirmar fabricación de prueba | Sólo se incluyen las entregas elegidas, unidades y paradas entendidas; terminal de instalación correcta |
| 5-6 noviembre | Pedidos / producción | Comprobar pedidos realmente pendientes, SKU físicos/comerciales, unidad de manejo, paradas, lote/vida útil y receta actual | Cada SKU que se fabricará tiene datos válidos; consumos reales se revisan, no se toma receta vieja como verdad |
| 6 noviembre | Responsables de pedidos, producción y bodega | Entrar con cada usuario y recorrer el proceso; ensayar cantidades en entorno aislado y revisar las pantallas reales sin guardar documentos ficticios | Accesos y responsables confirmados; cada persona sabe guardar, despachar y comprobar un intento incierto |
| Último turno previo al lunes | Bodega + producción + Iván | Conteo de MP, empaques, micros inventariables, semielaborados y PT con lotes/fechas reales | Conteo completo y revisado; blancos resueltos, cero sólo cuando se contó cero; reservas/pedidos anteriores revisados |
| 8 noviembre al cierre o 9 antes del primer movimiento | Administrador | Kardex > Preparar arranque: elegir inicio 09/11, cargar conteo, revisar diferencias y aplicar una vez | Sin reservas activas; sin movimientos posteriores al conteo sin conciliar; físico/Kardex coinciden con el conteo aprobado |
| 9 noviembre | Equipo operativo + Iván | Primer circuito real y revisión de saldos al cierre | Pedido → producción/consumo → preparación → despacho, una sola vez; saldos y documentos comprobados |

El día/hora del conteo se coordina con el último movimiento real. Si se cuenta antes del domingo, comprobar y conciliar todo movimiento posterior hasta el inicio. Confirmar si hay producción/despachos el domingo 08/11. No asumir que la planta está cerrada. El módulo permite confirmar inicio hoy o mañana, por lo que el inicio 09/11 se confirma el 08/11 o el propio 09/11; no forzar fecha desde el 04/11.

## Puertas de arranque

No marcar inventario operativo hasta tener:

- [ ] Conteo completo por unidad y lote; cantidades y fechas reales revisadas.
- [ ] Pedidos realmente abiertos y reservas revisados. No volver a despachar lo ya entregado para cerrar registros antiguos ni descontarlo del stock contado.
- [ ] Ninguna operación incierta sin comprobar ni reservas activas al aplicar el corte.
- [ ] Ninguna entrada, salida o fabricación entre conteo e inicio sin conciliar.
- [ ] Vista previa del arranque revisada y comprobante APLICADO recibido; no sumar conteo como compra o segundo saldo inicial.
- [ ] Usuarios, permisos y responsables confirmados para pedidos/producción/bodega.
- [ ] Primer registro real revisado contra inventario y consumo; no crear pruebas ficticias en producción.

## Procedimiento mínimo del día 1

1. Pedidos ingresa sólo documentos reales y verifica cantidades/fecha/unidad de manejo. Elegir las entregas de la jornada en Producción sugerida.
2. Producción ajusta paradas si hace falta, registra el rendimiento real y revisa consumo MP/empaques. Confirmar una vez; ante incertidumbre comprobar el intento guardado.
3. Bodega guarda la preparación con lo que enviará. La reserva no es salida. Confirma al despachar: descuenta lo real y cierra sin saldo pendiente.
4. Si hay error de digitación en un despacho confirmado: Editar despacho, motivo y lotes reales; aplicar sólo diferencia. No tratarlo como devolución física o anulación total.
5. Cerrar el día comparando conteo/saldos, entradas, consumos y salidas. Toda diferencia lleva motivo y documento; no arreglar con otro reinicio.

Micros y empaque: durante esta primera etapa, registrar explícitamente en Kardex la preparación/entrada de micros y los materiales utilizados; al usar un micro preparado, consumir ese micro sin volver a consumir sus ingredientes. Empaque al etiquetar un semielaborado se registra aparte. Compras/entradas y ajustes también llevan documento. Estas operaciones todavía no están automatizadas en sus pantallas; requieren responsable y disciplina diaria para que MP cuadre. No dar por completo el balance de MP si se omiten.

## Qué puede esperar

Reconstrucción histórica, reordenamiento de menús, mejoras de dashboards y automatizaciones adicionales no desplazan el arranque. Numeración por cliente y stock mínimo no se cambian por suposición: se mantiene la regla actual hasta acordar otro criterio. La fecha objetivo no es una garantía de disponibilidad si falta conteo o validación operativa. No marcar etapa 3 completa todavía.

Checklist humano de dos páginas generado para este objetivo: CIBUSPAN_ONE_Checklist_Arranque_20261109.pdf, disponible en la conversación. Si hay que actualizarlo, conservar su identidad y revisar su versión vigente; no reemplaza los controles del corte ni acredita conteo aplicado.
