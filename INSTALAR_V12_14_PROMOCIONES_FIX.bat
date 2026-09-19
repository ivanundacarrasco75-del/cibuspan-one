@echo off
setlocal
cd /d "%~dp0"

echo.
echo ===============================================
echo   CIBUSPAN ONE - V12.14 PROMOCIONES FIX
echo ===============================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALAR_V12_14_PROMOCIONES_FIX.ps1"
if errorlevel 1 (
    echo.
    echo ERROR: No se pudo aplicar la actualizacion.
    echo El Dashboard original permanece respaldado.
    pause
    exit /b 1
)

call npm run build
if errorlevel 1 (
    echo.
    echo ===============================================
    echo   LA COMPILACION FALLO - RESTAURANDO DASHBOARD
    echo ===============================================
    echo.
    if exist "%~dp0RESPALDOS_CODIGO\V12.14_AUTO\DashboardV2_ANTES_V12_14.tsx" (
        copy /Y "%~dp0RESPALDOS_CODIGO\V12.14_AUTO\DashboardV2_ANTES_V12_14.tsx" "%~dp0src\pages\DashboardV2.tsx" >nul
    )
    echo DashboardV2.tsx fue restaurado.
    echo Enviame una foto de esta ventana.
    pause
    exit /b 1
)

echo.
echo ===============================================
echo   V12.14 INSTALADA CORRECTAMENTE
echo ===============================================
echo.
echo Ejecuta npm run dev y luego Ctrl+F5 en el navegador.
echo.
pause
