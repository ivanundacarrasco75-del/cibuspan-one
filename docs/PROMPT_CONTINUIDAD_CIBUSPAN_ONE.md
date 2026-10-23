# Prompt para continuar CIBUSPAN ONE en otro chat

Copia desde «Soy Iván» hasta el final, o adjunta este archivo al nuevo chat y pide que lo lea completo. Sirve tanto para cambiar de chat ahora como cuando este se agote. Versión: 23 de octubre de 2026. El estado vigente de GitHub y los documentos del proyecto tienen prioridad sobre este resumen si hay avances posteriores.

---

Soy Iván Unda, gerente de CIBUSPAN/Pangolín. Continúa el proyecto CIBUSPAN ONE existente. Responde en español, de forma breve y sin negrillas. Necesito continuidad, trabajo concreto y que no me hagas repetir decisiones ya tomadas.

## 1. Fuente oficial y primera acción

Repositorio oficial: https://github.com/ivanundacarrasco75-del/cibuspan-one
Rama oficial: main. Es una aplicación React/TypeScript/Vite, con Supabase y publicación PWA en Cloudflare Pages.

Antes de programar, consulta la rama main actual y lee, en este orden:

1. AGENTS.md.
2. CONTINUIDAD_CIBUSPAN_ONE.md, especialmente las entradas más recientes.
3. docs/AUDITORIA_ESTRUCTURA_CIBUSPAN_ONE.md.
4. Los archivos del proceso concreto que vayas a revisar o modificar.

No empieces otro sistema ni reconstruyas desde ZIP, capturas o recuerdos. Comprueba HEAD remoto, estado local y diferencias. Puede existir un checkout local cuyo HEAD sea anterior, pero que ya contenga archivos de commits enviados por el conector GitHub: no descartes esos cambios ni vuelvas a subir una versión antigua. Si hay diferencias, compáralas con main antes de actuar.

No me pidas que pegue toda la app si puedes consultar el repositorio con las herramientas disponibles. Si falta acceso real, identifica exactamente el bloqueo y continúa con lo que sí puedas revisar. No inventes contenido ni afirmes que publicaste sin comprobarlo.

## 2. Objetivo activo y acuerdo de trabajo

Estamos reorganizando la app, que tiene accesos repetidos, reportes repartidos y pantallas pendientes. El 23/10/2026 di «ok, empecemos» al plan de revisión y renovación por módulos. No vuelvas a comenzar por discutir si hacemos la auditoría o por diseñar otra portada.

La app actual debe seguir funcionando para sus usuarios. Prepararemos la renovación del mismo proyecto en un entorno de prueba separado, reutilizando componentes, datos y reglas que sirven. No se autorizó crear otro repositorio, duplicar operaciones en producción, borrar funciones o reemplazar la base real. La creación de entornos, cambios de navegación y publicación se concretan con el alcance revisado; no son hechos ya realizados.

Mapa base de siete bloques:

- Dirección: indicadores ejecutivos, resultados y alertas.
- Comercial: clientes/acuerdos, pedidos, ventas, descuentos, devoluciones, visitas, revisión de lecturas y gestión KAM.
- Producción: fórmulas, planificación, órdenes, producción real, consumos, semielaborados y etiquetado.
- Bodega y Despachos: MP, empaques, semielaborados/PT, Kardex, lotes, recepciones, ajustes, vencimientos y despachos.
- Compras y Abastecimiento: proveedores, necesidades/órdenes de compra y seguimiento; usar las recepciones/documentos existentes.
- Finanzas y Costos: facturas, CxC/CxP, cobros/pagos, nómina, caja, devengo, resultados y rentabilidad.
- Administración y Sistema: usuarios/permisos, maestros únicos, configuración, importaciones, auditoría del sistema e integraciones.

Usa este mapa como base, afinando límites con evidencia del proceso. Un solo dueño y una sola fuente por operación; otros bloques consultan/enlazan la misma información. No confundir varias vistas con varias copias de datos. No trasladar datos manualmente a una segunda base que se desactualice mientras producción sigue trabajando.

## 3. Qué se auditó y qué falta

Ya existe una primera auditoría real de navegación: 53 opciones de submenú, 39 con componente y 14 destinos En construcción; 89 nombres de ruta incluyendo alias; siete grupos de accesos visibles abren el mismo componente con los mismos parámetros. Son cifras del código auditado, no prueba de datos duplicados ni de funcionalidad completa. Recalcula si el código cambió.

Ejemplos: Resumen/Planificación/Producción abren ProduccionV2 sin diferenciar contexto; tres Análisis abren Reportes; Compras/Facturas y varias opciones financieras abren PagosGastos. El historial de producción sí usa parámetros propios. Algunas capacidades que figuran como En construcción ya existen dentro de otra pantalla: localízalas antes de desarrollarlas otra vez.

El documento de auditoría tiene hallazgos H01-H14, inventario completo, diagramas y seguimiento ORG-01 a ORG-18. Es la lista de control del proyecto: actualizar estados, evidencia, ubicación y pendientes, no dejarlo congelado ni depender sólo de este chat.

Faltan auditoría funcional con usuarios, revisión de fuentes/cálculos, dependencias, permisos reales y validación de datos. No se inspeccionó la sesión de producción ni se creó aún el entorno de ensayo. No digas que la auditoría completa está terminada.

## 4. Tarea inmediata: empieza aquí

Revisa el recorrido pedido → planificación → producción/consumo → inventario/Kardex → preparación/despacho, antes de cambiar pantallas.

Lee las páginas PedidosV2, ProduccionV2, InventarioV2, KardexInventario, DespachosV2, HistorialDespachos y sus repositorios pedidoRepository, produccionRepository, inventarioRepository, kardexRepository y despachoRepository; luego sigue sus RPC/migraciones y dependencias. No presupongas que los nombres reflejan toda la lógica.

Entrega una matriz concreta con:

- Paso del proceso y usuario responsable.
- Pantalla, origen del dato y tablas/RPC realmente utilizados.
- Qué crea o modifica existencias/documentos y en qué momento.
- Qué está conectado, qué se repite y qué falta comprobar o desarrollar.
- Decisión propuesta: conservar, reubicar, unificar, completar o retirar tras verificar.
- Prueba y criterio de aceptación para evitar duplicar pedidos, producción, consumo o descarga de inventario.

Actualiza los puntos ORG correspondientes y el diagrama. Después prepara la primera adaptación delimitada para revisión. No hagas todavía un cambio masivo de menú ni ejecutes pruebas de escritura en producción para diagnosticar.

## 5. Método de programación que debes conservar

- Revisar código y datos disponibles antes de preguntar; resolver decisiones técnicas rutinarias sin detenerte a pedir permiso repetidamente.
- Cambios puntuales en la implementación existente, con diff revisado y dependencias trazadas.
- Ejecutar npm run build cuando haya cambios funcionales y las pruebas pertinentes al riesgo. Una pantalla que compila no equivale a un proceso aceptado.
- Guardar los cambios estables en GitHub main usando las herramientas disponibles y respetar cambios concurrentes. No dar sólo instrucciones como si ya hubieras programado.
- Actualizar CONTINUIDAD_CIBUSPAN_ONE.md y el seguimiento de auditoría al cerrar cada etapa.
- Mantener estados distintos: código preparado, instalado en base, probado con datos, aceptado, publicado y verificado en vivo. No usar «listo» para ocultar un paso pendiente.
- Normalmente Iván publica en PowerShell desde D:\CIBUSPAN_ONE con git pull --ff-only, npm run build y npx wrangler pages deploy dist --project-name=cibuspan-one --branch=main. No suponer que esto despliega funciones Supabase o instala SQL.
- No pedir npm ci si no hace falta. Nunca indicar supabase db push de todo el historial a ciegas: revisar y aplicar sólo la migración nueva necesaria; migration repair sólo tras éxito.
- No cambiar roles/permisos al mover rutas sin revisar el acceso por usuario. app_profiles usa user_id como clave, no id.
- No guardar secretos en GitHub, VITE_*, reportes o chat. Las pruebas con correo deben evitar destinatarios reales ajenos a una prueba autorizada.

## 6. Funciones y datos que debemos proteger

DashboardV2 y sus paneles existentes, especialmente COSTOS Y GASTOS POR DEVENGO, permanecen hasta revisión y aceptación expresa del reemplazo. Roles de pago pertenece a Finanzas.

Visitas conserva cliente/local/GPS durante varios SKU, fotos de percha y capturas separadas. El lector es sólo para capturas Favorita; Rosado/Santamaría son ingreso manual y sus fotos no deben generar revisión OCR. Cantidad del CD está excluida de lectura/guardado/revisión. Campos dudosos se corrigen individualmente, quedan REVISION_MANUAL y no se vuelven a auditar; valores provisionales aparecen identificados y hay acceso al campo pendiente. No reactivar auditoría masiva al entrar. Existe Visitas diarias. No rehacer ese trabajo por perder el contexto.

La regularización operativa de octubre partió de existencias iniciales al 30 de septiembre; hubo problemas anteriores de importaciones duplicadas. No reiniciar Kardex, reimportar existencias ni eliminar movimientos para ordenar la interfaz. Los pedidos se reportaron funcionando; producciones históricas/consumos/recetas y sell-out quedaron pendientes de revisión, no se declaran conciliados sin evidencia.

Correos de descuentos: código y SQL preparados, pero instalación/activación real no confirmadas. Se acordó crear cuenta dedicada, propuesta avisos@cibuspan.com; falta confirmar dirección y secreto privado. No activar papolo@cibuspan.com como si siguiera siendo el remitente definitivo. Servidor observado mail.cibuspan.com, SSL/TLS, puerto 465. Lee docs/CORREOS_DESCUENTOS.md antes de retomar. No pedir contraseñas por chat ni registrar otra promoción para probar reenvíos. El worker SMTP requiere revisar un intento incierto antes de reenviarlo; no inventar garantía de entrega/lectura.

## 7. Cómo arrancar tu respuesta

Confirma en pocas líneas el estado realmente leído de main y el próximo entregable. Empieza la revisión del recorrido operativo indicado. No vuelvas a pedirme todo el contexto ni propongas empezar desde cero. Mantén un registro en archivos del proyecto para que otro chat continúe desde el mismo punto.
