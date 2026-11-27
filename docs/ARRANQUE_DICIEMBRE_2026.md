# Arranque de Producción y Despachos — 1 de diciembre de 2026

Revisión del 27/11/2026 sobre main `57ee87e` y consulta de sólo lectura al proyecto
operativo `eodcwkuexldsbomflthe`. Iván cargará los inventarios físicos reales ese día,
antes de registrar las primeras operaciones. No se han aplicado cortes de MP ni PT.

## Comprobado

- Aperturas separadas de MP/empaques y PT implementadas. Aplicarlas con inicio
  01/12/2026 representa el saldo anterior a las operaciones de ese día. La fecha
  de cierre queda en 30/11. No ingresar producción ni despachos de diciembre antes
  de confirmar sus saldos. La pantalla sólo permite aplicar hoy o mañana.
- Semielaborados disponibles: 0. PT existente: 13.260 unidades en lotes anteriores.
  Este PT todavía no es el saldo físico del arranque. La toma física ajustará los
  saldos y conservará la trazabilidad; dejar la base operativa en cero no requiere
  borrar documentos históricos ni inventar un físico de cero.
- 24 pedidos INGRESADOS con entrega entre 07/08 y 08/10; 18 DESPACHADOS históricos.
  Sin reservas activas. Revisar los 24 pendientes desde Pedidos antes de confirmar
  la revisión del corte. La apertura no los elimina ni cambia sus estados.
  La planificación por período excluye entregas fuera del rango elegido.
- Dos productos activos sin fórmula vigente vinculada: BLANCO SANTA
  (`7861169097071`) y SANDUCHERO BLANCO SANTA (`7861169008206`). Completar sus fórmulas
  y revisar rendimiento/costos si se fabricarán desde el arranque.

## Ensayo aislado del circuito actual

Se exportaron sólo definiciones del servidor, sin filas de negocio. En PGlite se
ejecutaron los cuerpos actuales, columnas, defaults, checks, claves internas,
vistas y triggers, incluidas las dependencias incorporadas por Casa Masa.

Resultado: pedido de 30 unidades → planificación de necesidad de 30 → fabricación
de 50 con consumo de 20 kg de una MP cuyo saldo inicial era 100 kg → reserva de 30
sin salida física → despacho de 30 con referencia de factura. Saldos finales:
20 PT y 80 kg de MP. Repetir las solicitudes no duplicó ninguna operación.
Un consumo superior al saldo revirtió también la entrada de PT y la producción.

Pasaron 5 pruebas del circuito actual y 76 pruebas de apertura separada,
recuperación de pedidos/producción/logística y corrección de permisos. Build correcto,
con advertencia habitual de tamaño de chunks. Este ensayo modela un permiso de
módulo autorizado; no certifica RLS global, concurrencia HTTP, impresión visual ni
el recorrido autenticado completo. No se crearon operaciones de prueba en la base real.

Repetición del circuito: ejecutar `auditoria_arranque_diciembre.sql` con el CLI en
formato JSON y guardar su salida privada en `supabase/.temp/`. Definir
`CIBUSPAN_ESQUEMA_ACTUAL` con su ruta y ejecutar
`node --test pruebas/verificar_circuito_actual.mjs`. No versionar el JSON.
El ensayo antiguo basado en el exportador de octubre no carga todas las dependencias
actuales; su fallo de preparación no demuestra una falla de la app.

## Corrección publicada el 27/11/2026

La restauración dejó TRUNCATE, REFERENCES y TRIGGER para authenticated/service_role
en cinco tablas privadas de comprobantes de reintentos. La nueva migración
`202611270004_privadas_produccion_despachos.sql` retira los accesos directos previstos
como privados, tras comprobar sus marcas y RLS. Conserva comprobantes y funciones.
La prueba verifica datos intactos, reaplicación segura y rechazo de TRUNCATE.
El diagnóstico nuevo no depende de comentarios internos de funciones que se
perdieron durante la restauración; los verificadores antiguos pueden reportarlos
como pendientes aunque sus funciones existan. No reinstalar migraciones antiguas
para silenciar esos avisos.

Iván aprobó su publicación. Se revisó el historial remoto, se aplicó únicamente
este SQL nuevo y se registró su versión después del éxito. El diagnóstico real
pasó sus cinco controles. Las huellas de 17 tablas, funciones y vistas públicas
coincidieron antes y después. La app principal conserva el proyecto operativo,
R2 y firma. No se ejecutó `db push` del historial ni se cambiaron archivos de
interfaz; no fue necesario un nuevo despliegue de Cloudflare.

## Pendientes de operación

1. Revisar pedidos antiguos y completar las dos fórmulas si se usarán.
2. El 01/12 cargar y confirmar el físico real de MP, empaques y PT. Ceros sólo
   cuando el conteo real sea cero. Confirmar también que no quedó semielaborado físico.
3. Desde ese saldo: pedido real → sugerencia del período → hoja de producción →
   fabricación con consumo revisado → preparación → documento/checklist → despacho.
   Comprobar responsables, lotes, vencimientos y cantidades antes de confirmar.
4. La fabricación de semielaborado consume sus MP; etiquetarlo no vuelve a consumir
   harina. El empaque usado al etiquetar requiere salida manual en Kardex. La
   preparación/reposición de micros también requiere movimientos explícitos. Sus
   pantallas todavía no automatizan estas dos operaciones.
5. Verificar visualmente la hoja de producción, el Anexo Supermaxi y el documento
   de despacho con el primer caso real. La referencia de factura vinculada no
   equivale a emisión de un comprobante tributario.

No se borraron los 18 pedidos despachados, producciones anteriores ni información
de otros módulos. No hay una limpieza destructiva pendiente de ejecución automática.
