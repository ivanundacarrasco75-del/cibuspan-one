# CIBUSPAN ONE: reglas de continuidad

## Fuente oficial

- Este repositorio y la rama `main` son la única fuente oficial del proyecto.
- Al retomar el proyecto en un nuevo chat, leer también `CONTINUIDAD_CIBUSPAN_ONE.md`. Su estado está fechado: comprobar el `HEAD` actual antes de usarlo como referencia.
- Mantener actualizado el estado de esa guía cuando cambien los pendientes, la instalación de SQL o la publicación, distinguiendo lo comprobado de lo pendiente.
- Antes de modificar código, revisar `git status`, el último commit y los archivos actuales.
- No reconstruir el proyecto desde capturas, archivos ZIP ni copias antiguas.
- No sustituir archivos completos para resolver cambios puntuales.

## Funcionalidad que debe preservarse

- `src/pages/DashboardV2.tsx` contiene el Dashboard ejecutivo estable y completo.
- Conservar sus pestañas, filtros, comparaciones, navegación y paneles existentes.
- Preservar especialmente el panel “COSTOS Y GASTOS POR DEVENGO”.
- “Roles de pago” pertenece a “Pagos y Finanzas”; no debe volver al Dashboard.
- Mantener la compatibilidad de rutas antiguas cuando sea posible.

## Proceso obligatorio

1. Leer los archivos actuales y comprobar Git.
2. Modificar solamente los archivos necesarios.
3. Revisar `git diff`.
4. Ejecutar `npm run build`.
5. Informar los archivos modificados y el resultado.
6. Crear un commit por cada estado estable.

## Actualizaciones de la base existente

- Antes de recomendar `supabase db push`, revisar el historial remoto y su `--dry-run`.
- El historial de esta base puede omitir cambios que ya se ejecutaron manualmente. Una migración pendiente en el CLI no demuestra que falten sus tablas o funciones.
- Si aparecen migraciones antiguas pendientes sobre estructuras más avanzadas, aplicar solo el SQL nuevo revisado con `supabase db query --linked --file`, sin modificar vistas de otros módulos ni marcar migraciones antiguas como aplicadas sin verificarlas.
- Registrar como aplicada únicamente la versión nueva después de que su ejecución haya terminado correctamente.

## Seguridad

- No versionar `.env`, credenciales, secretos ni `supabase/.temp/`.
- No descartar cambios locales sin autorización expresa.
