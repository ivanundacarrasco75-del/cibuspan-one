@echo off
setlocal
cd /d "%~dp0"

echo.
echo ==========================================
echo   CIBUSPAN ONE - V12.13 DESCUENTOS
echo ==========================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALAR_V12_13_DESCUENTOS.ps1"
if errorlevel 1 (
    echo.
    echo ERROR: No se pudo aplicar la actualizacion.
    echo No se ha ejecutado la compilacion.
    pause
    exit /b 1
)

call npm run build
if errorlevel 1 (
    echo.
    echo ==========================================
    echo   LA COMPILACION FALLO
    echo ==========================================
    echo.
    echo Se restaurara DashboardV2.tsx desde el respaldo automatico.
    if exist "%~dp0RESPALDOS_CODIGO\V12.13_AUTO\DashboardV2_ANTES_V12_13.tsx" (
        copy /Y "%~dp0RESPALDOS_CODIGO\V12.13_AUTO\DashboardV2_ANTES_V12_13.tsx" "%~dp0src\pages\DashboardV2.tsx" >nul
    )
    echo.
    echo DashboardV2.tsx fue restaurado.
    echo Enviame una foto de este mensaje y lo corregimos.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo   ACTUALIZACION INSTALADA CORRECTAMENTE
echo ==========================================
echo.
echo Ahora puedes ejecutar: npm run dev
echo.
pause
