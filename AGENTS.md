# CIBUSPAN ONE: reglas de continuidad

## Fuente oficial

- Este repositorio y la rama `main` son la única fuente oficial del proyecto.
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

## Seguridad

- No versionar `.env`, credenciales, secretos ni `supabase/.temp/`.
- No descartar cambios locales sin autorización expresa.