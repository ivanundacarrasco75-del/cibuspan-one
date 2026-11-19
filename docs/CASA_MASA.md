# Casa Masa: alcance inicial

## Primera entrega preparada en código — 19/11/2026

- Menú Casa Masa → Pedidos y empaque, con consulta por fechas, búsqueda y tarjetas.
- Nuevo pedido de los cuatro SKU, usando clientes, puntos de entrega y unidades de
  manejo existentes. Se guarda en el registro central mediante su control recuperable;
  la pertenencia a Casa Masa se guarda en la misma transacción.
- Datos de contacto, dirección/punto, responsable, repartidor y observaciones;
  secuencia Pendiente → En preparación → Empacado y etiquetado → Listo.
- Verificación manual de cantidades/etiquetas y reserva completa por detalle para
  confirmar empaque; repartidor obligatorio para Listo. No imprime etiquetas todavía.
- Acceso al pedido seleccionado en Preparación/Despachos existentes, para elegir
  lotes y confirmar la salida una sola vez. No marca entrega ni cobra automáticamente.
- Control de versión para evitar sobrescribir cambios de otra persona y auditoría
  de registro/actualizaciones. Un pedido del módulo CM debe estar Listo para salir,
  incluso si se confirma desde Despachos general. Corregir etapas antes de la salida
  es posible; después de salida se conserva el seguimiento sin edición de empaque.
- SQL nuevo `202611190001_casa_masa_empaque.sql`: fuente privada que excluye los
  detalles de los cuatro SKU CM antes de agrupar demanda por producto base en ambos
  cálculos existentes. Conserva los cuerpos de los cálculos, sustituyendo sólo la
  fuente de detalles; rechaza contratos no reconocidos. No modifica otras vistas.
- Permiso Casa Masa por defecto para administrador, gerente, operaciones y bodeguero.
  Requiere además Pedidos o Despachos para catálogos/registro central; el acceso a
  Preparación exige Despachos. Se amplía la lista válida de `admin-users` para poder
  guardar/revocar este permiso desde Usuarios y permisos.

Instalación y publicación **pendientes**. Ejecutar `scripts/Instalar-CasaMasa.ps1`:
compila, aplica sólo el SQL nuevo, valida el diagnóstico, registra sólo esa versión,
actualiza `admin-users` y publica Pages. Si falta un contrato anterior, se detiene;
no instala ni repara migraciones antiguas. No crea SKU, clientes ni pedidos de ejemplo.
Los pedidos históricos de otro canal no se trasladan al módulo automáticamente.

Pruebas locales: 32 aprobadas (cinco escenarios SQL, dos pruebas de reglas/acceso CM,
13 de registro recuperable y 12 de permisos). PGlite utiliza el registro real de pedidos
y modelos del esquema/permisos/planificación anterior; no certifica la definición ni
los datos de la base real, HTTP, simultaneidad de varias conexiones o aceptación humana.
Compilación correcta; sintaxis del instalador PowerShell comprobada.
Revisión visual intentada con una vista aislada en localhost y datos de ejemplo:
el navegador integrado no alcanzó el servidor y la herramienta de ventana local
falló por continuación expirada. **Recorrido visual pendiente**, sin datos reales escritos.

Pendientes siguientes: comprobar catálogo y clientes en la base real, instalar/publicar,
validar el recorrido de empaque/reserva/despacho en navegador, registrar fabricación
diaria independiente, cobros/comprobantes, facturación y conexión oficial de WhatsApp.
Las tarjetas de 20 unidades/día muestran la meta, no existencias disponibles.

---

Fecha: 19/11/2026. Propuesta funcional a partir del chat MODULO CM.
Base revisada: main, commit 07c2f36. Este documento inicia el diseño;
no acredita pantallas implementadas, SQL instalado ni WhatsApp conectado.

## Reglas confirmadas por el propietario

- Módulo propio Casa Masa para organizar pedidos, empacar, etiquetar y dejar listos para despacho.
- SKU CM-001, CM-002, CM-003 y CM-004. Meta diaria: 20 unidades de cada uno, 80 en total.
- Los pedidos Casa Masa no generan órdenes de producción.
- Registrar cobros electrónicos con número de depósito/operación y evidencia.
- El repartidor puede cobrar al entregar y enviar información o captura por WhatsApp.
- La información debe vincularse al sistema y producir una lista para emitir facturas.

## Primera entrega propuesta: operación dentro del sistema

Menú principal Casa Masa con Pedidos y empaque, Cobros, Facturas por emitir e Historial.
Un solo registro central de pedido; no crear una segunda venta al pasar entre pantallas.
Identificar explícitamente el canal Casa Masa, además de validar los cuatro SKU.
No clasificar un pedido únicamente por el texto del nombre del cliente.

Tarjeta: número de pedido, cliente, contacto, fecha/hora y dirección de entrega,
detalle por SKU, cantidades, importes, observaciones, responsable de empaque,
repartidor y modalidad de cobro. Datos de facturación asociados al pedido.
Definir precios, impuestos y significado comercial de unidad antes de calcular totales;
no inventar precios ni asumir que una unidad equivale a una caja.

Controles independientes propuestos:

| Control | Estados |
| --- | --- |
| Empaque | Pendiente, En preparación, Empacado y etiquetado, Listo |
| Logística | Pendiente de salida, Despachado, Entregado, Incidencia |
| Pago | Pendiente, Por verificar, Parcial, Confirmado |
| Factura | Pendiente de pago, Por emitir, Emitida |

La pantalla debe mostrar esos controles juntos. Entregado no equivale a pagado;
empacado no equivale a despachado. Cobro contra entrega permite salir con pago pendiente.
Registrar incidentes de entrega sin cancelar automáticamente el pedido ni reingresar stock.

## Inventario y producción

Reutilizar pedidos, detalles, reservas, lotes y confirmación de despacho existentes.
Excluir la demanda CM de ambos cálculos de producción sugerida, con y sin período,
incluyendo sus posibles vínculos con productos base. Probar que pedidos de otros canales
conservan el cálculo actual. No basta con ocultar CM en la pantalla de producción.

La meta de 20 unidades es un plan, no una entrada de stock. Registrar fabricación real
por SKU, lote y vencimiento, utilizando el circuito de producción y consumos revisado.
Falta concretar cómo registrar esa producción diaria independiente de pedidos, sin
crear una OP por cada venta ni contabilizar consumos dos veces.

Reservar unidades por lote al preparar para evitar asignarlas a dos pedidos.
Descontar producto terminado una sola vez al confirmar despacho. Mostrar faltantes;
no generar producción adicional ni completar stock de forma automática.
Cancelar antes de salida debe liberar reservas; después de salida, utilizar el flujo
de devolución/incidencia correspondiente. Revisar reglas de despachos parciales:
el circuito actual avisa que cierra el pedido sin saldo pendiente.

## Cobro y facturación

Cada cobro tiene identificador propio, pedido, monto, moneda, método, entidad,
referencia original, fecha de operación, remitente y evidencia privada.
Registrar quién lo recibió, quién lo verificó y las fechas de cada acción.
Permitir varios abonos; calcular saldo con pagos confirmados, sin contar rechazados.
Una captura recibida queda Por verificar, nunca confirma el ingreso por sí sola.

Detectar posibles duplicados por entidad/cuenta receptora/referencia normalizada,
con revisión para referencias ambiguas; el mismo comprobante no debe producir dos cobros.
Proteger reintentos y operaciones simultáneas en base de datos.
Si hay discrepancia entre imagen, texto y pedido, solicitar revisión antes de aplicar.

Propuesta acordada en la conversación: al completar el pago verificado, el pedido aparece
una sola vez en Facturas por emitir. Mostrar datos fiscales, productos, cantidades,
importes y referencias de cobro. Registrar número y documento al emitir; la bandeja
no representa emisión electrónica ni autorización tributaria.
Definir con el responsable de facturación cuándo debe emitirse según la operación
antes de convertir esta secuencia en un bloqueo obligatorio de la aplicación.
No registrar automáticamente una venta contable nueva por recibir un comprobante.

## Segunda entrega propuesta: conexión de WhatsApp

Utilizar integración oficial de WhatsApp con recepción de eventos en servidor.
Proveedor, cuenta, número y capacidades pendientes de seleccionar y verificar
en documentación oficial durante la implementación. No hay conexión habilitada.

Flujo esperado:

1. Identificar al repartidor autorizado y el pedido asignado por número o selección.
2. Recibir mensaje y adjunto; conservar identificador del mensaje para deduplicación.
3. Guardar evidencia privada y asociarla a un intento de cobro persistente.
4. Extraer campos de la imagen como propuesta; no inventar datos ilegibles.
5. Pedir información faltante, o enviar a revisión si la asociación no es inequívoca.
6. Mostrar el cobro Por verificar en Casa Masa para revisión autorizada.
7. Confirmado el pago completo, actualizar la bandeja de facturación.

No asociar pagos por monto solamente. Verificar autenticidad de eventos del proveedor,
limitar archivos y acceso, y conservar trazabilidad. Procesar reenvíos, reintentos y eventos
fuera de orden sin duplicar pedidos o cobros. Si falla la lectura de imagen, permitir
registro manual del mismo intento en el sistema.
El repartidor puede presentar evidencia, pero no confirmar su propio cobro.
Definir permisos por tarea en servidor, además de controles en pantalla.

## Información pendiente del propietario

- El propietario confirma que todavía no tienen número de WhatsApp para Casa Masa.
  Preparar un número exclusivo y verificar su alta con la integración elegida;
  no bloquea desarrollar el registro manual de comprobantes dentro del sistema.
- Quién ingresa pedidos, quién verifica ingresos y quién emite las facturas.
- Métodos electrónicos y cuentas receptoras que se utilizarán.
- Datos y sistema de facturación; precios y unidad comercial de cada SKU.

Pedir esta información según corresponda a cada entrega, sin solicitar claves por chat.

## Puntos del código revisados

- Navegación: src/components/layout/Layout.tsx y src/App.tsx.
- Acceso: src/utils/permisosAplicacion.ts y src/services/usuarioService.ts.
- Pedidos persistentes: src/repositories/pedidoRepository.ts y registrar_pedido_seguro.
- Producción: src/repositories/produccionRepository.ts, obtener_produccion_sugerida
  y obtener_produccion_sugerida_periodo.
- Despacho y reservas: src/pages/DespachosV2.tsx, src/repositories/despachoRepository.ts
  y src/repositories/logisticaSeguraRepository.ts.

Comprobar tablas, catálogo CM y contratos reales antes de preparar SQL.
No usar el servicio antiguo de pedidos basado en localStorage como registro central.
No reutilizar permisos de otros módulos para conceder acceso financiero accidental.

## Comprobaciones para aceptar la implementación

- Pedido CM persiste una vez y no añade demanda a OP; pedidos generales sin regresiones.
- Meta diaria no crea existencias; ingreso real conserva lote y trazabilidad de consumos.
- Reserva concurrente no sobreasigna; preparación no descuenta PT; despacho descuenta una vez.
- Salida contra entrega admite pago pendiente; entrega y pago son controles separados.
- Evidencia manual o WhatsApp queda Por verificar; repartidor no puede autoaprobarse.
- Abonos parciales, rechazos, referencias repetidas y mensajes reenviados no duplican saldo.
- Pago completo confirmado aparece una vez en facturación; registrar factura la retira
  de pendientes y conserva el vínculo histórico.
- Datos de clientes y comprobantes sólo accesibles por usuarios autorizados.
- npm run build, pruebas de reglas y permisos, y recorrido de navegador antes de entregar.

Instalación futura: revisar historial remoto y dry-run antes de cualquier db push.
Aplicar sólo SQL nuevo revisado cuando corresponda y registrar sólo su versión al terminar.
Estado actual: diseño documentado; implementación, instalación, publicación e integración pendientes.
