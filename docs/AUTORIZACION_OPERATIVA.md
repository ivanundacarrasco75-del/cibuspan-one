# Autorización de operaciones: instalación específica

23/10/2026. Estado: código preparado y probado localmente; instalación en Supabase pendiente. Corresponde a OP-12. No resuelve todavía los reintentos que duplican producción ni aplica consumos MP.

## Cambio y alcance

La migración 202610230001_autorizacion_operativa.sql limita doce funciones existentes a sesiones/permisos válidos y procesos SQL autorizados. No modifica filas de inventario, pedidos, perfiles o permisos personales; no cambia los estados de despacho, cálculos o consumos.

Cada función conserva OID, firma, defaults, configuración y SECURITY DEFINER/INVOKER. Su cuerpo PL/pgSQL vigente queda íntegro dentro de un bloque exterior que verifica acceso antes de declarar variables o ejecutar negocio. No se copia desde el diagnóstico con acentos convertidos. obtener_produccion_sugerida conserva su consulta y contrato; cambia a PL/pgSQL para comprobar acceso antes de ejecutar esa misma consulta. Los accesos del Dashboard están incluidos.

| Operaciones | Permisos aceptados por el nuevo control |
| --- | --- |
| Registrar producción / convertir semielaborado | Producción |
| Editar producción | Producción o Administración, conservando también las validaciones interiores existentes |
| Preparar / confirmar / liberar / vincular factura / activar conciliación | Pedidos o Despachos; los triggers y controles interiores siguen aplicando sus requisitos |
| Ajustar lote / cambiar empaque | Inventario, Producción o Despachos |
| Devoluciones | Devoluciones |
| Consultar producción sugerida | Producción, Reportes o Dashboard |

app_exigir_operacion exige auth.uid(), perfil activo por user_id y app_puede_alguna. Retira EXECUTE de PUBLIC/anon en esas doce funciones y conserva/granta authenticated/service_role. Se respeta el rol SQL real service_role y mantenimiento SQL privilegiado; no basta un texto service_role en claims. No se sustituye current_setting('role') por current_user: éste cambia dentro de SECURITY DEFINER. No se eliminan restricciones originales: si una operación ya exigía condiciones adicionales a un proceso interno, las conserva.

No se cambia el trigger general de escritura ni funciones de otros módulos. La autorización del resto de la app no queda certificada por esta corrección.

## Instalación para Iván

Desde la terminal PowerShell de VS Code:

```powershell
& {
    Set-Location "D:\CIBUSPAN_ONE" -ErrorAction Stop
    git pull --ff-only
    if ($LASTEXITCODE -ne 0) { throw "Falló la actualización. No continuar." }
    & ".\scripts\Instalar-AutorizacionOperativa.ps1"
}
```

El script aplica sólo el SQL nuevo, consulta verificar_autorizacion_operativa.sql, exige correcto=true y versión 202610230001 y sólo después registra esa versión con migration repair. No ejecuta db push, migraciones antiguas, npm ci ni publicación Cloudflare. El proyecto Supabase ya vinculado debe ser el mismo que se diagnosticó para CIBUSPAN ONE.

Mensaje final esperado: «Protección instalada y verificada en las 12 funciones operativas.» Copiar el resultado de la terminal para cerrar el estado de instalación. No volver a cargar pedidos o producciones como prueba.

Si falta una firma o existe una variante no revisada, la transacción revierte la instalación completa. No borrar funciones/variantes para forzarla. Si se aplica el SQL pero falla la consulta/JSON, la protección puede haber quedado instalada, pero no se registra la migración ni se anuncia éxito: revisar el mensaje. Si falla repair después de verificar, no confundir el fallo de registro con una reversión del SQL.

Repetir este instalador es tolerado: no anida controles ni ejecuta operaciones. No indicar reinstalar como respuesta automática a cualquier error; leer primero el resultado concreto. No hay script que quite de nuevo las protecciones por defecto.

## Comprobación

La consulta de verificación sólo lee catálogos: marca, helper y permisos efectivos de las doce firmas. Debe mostrar doce funciones encontradas/protegidas, doce accesos anónimos cerrados, doce accesos authenticated conservados, doce accesos service_role conservados y pendientes vacío. No ejecuta las funciones de negocio ni prueba un endpoint HTTP o cada usuario real.

Pruebas locales:

- Sin sesión, sin permiso, perfil inactivo/sin perfil, rol sin grant y claim service_role sin rol SQL correspondiente: rechazo antes de cualquier efecto.
- Permisos por módulo, lectura Dashboard, service_role SQL real y mantenimiento con login administrativo temporal: conservados según contrato.
- Firmas/OID/defaults/configuración/cuerpo anterior conservados, rollback si falta una función o hay variantes, reinstalación sin efectos y SQL CRLF de Windows.
- Diagnóstico en BEGIN READ ONLY detecta acceso alterado y no lee filas de negocio.
- Con CIBUSPAN_PROBAR_AUTORIZACION=1, el ensayo privado aplica la migración a los cuerpos reales exportados y mantiene producción/reserva/liberación/confirmación/planificación/Kardex. También demuestra que OP-13 y el consumo MP siguen pendientes, sin declararlos reparados.

El test con funciones reales usa CIBUSPAN_AUDIT_FILE apuntando al TXT/JSON privado de Iván y CIBUSPAN_SQL_TEST_MODULE si PGlite no está instalado localmente. No subir ese diagnóstico al repositorio público. Escenario aislado, defaults y dependencias auxiliares modelados; no certifica concurrencia, RLS completo ni datos reales. PowerShell/CLI remoto y usuarios reales pendientes de verificación.

## Próximo trabajo

Confirmar instalación por su resultado; después OP-13: proteger reintentos de producción. Toda nueva firma o sustitución de esa función debe mantener esta autorización y actualizar sus verificaciones. No volver a implantar un cuerpo anterior sin el control. Etapa 3 de reorganización sigue abierta; no hay cambios de navegación en esta entrega.
