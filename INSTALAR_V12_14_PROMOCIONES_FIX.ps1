$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dashboard = Join-Path $root "src\pages\DashboardV2.tsx"
$componente = Join-Path $root "src\components\dashboard\DashboardPromocionesPanel.tsx"
$respaldoDir = Join-Path $root "RESPALDOS_CODIGO\V12.14_AUTO"
$respaldo = Join-Path $respaldoDir "DashboardV2_ANTES_V12_14.tsx"

if (-not (Test-Path $dashboard)) {
    throw "No se encontro: $dashboard"
}

if (-not (Test-Path $componente)) {
    throw "No se encontro: $componente"
}

New-Item -ItemType Directory -Force -Path $respaldoDir | Out-Null

if (-not (Test-Path $respaldo)) {
    Copy-Item $dashboard $respaldo
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
$texto = [System.IO.File]::ReadAllText($dashboard, [System.Text.Encoding]::UTF8)

$import = 'import DashboardPromocionesPanel from "../components/dashboard/DashboardPromocionesPanel"'

# Eliminar import duplicado si existiera y dejar uno solo al inicio.
$lineas = $texto -split "`r?`n"
$lineas = $lineas | Where-Object { $_.Trim() -ne $import }
$texto = $import + [Environment]::NewLine + ($lineas -join [Environment]::NewLine)

# Eliminar cualquier insercion anterior del panel para evitar duplicados.
$texto = [regex]::Replace(
    $texto,
    '(?m)^[ \t]*<DashboardPromocionesPanel\s*/>[ \t]*\r?\n?',
    ''
)

# Insertar el panel SIEMPRE junto al DashboardComercial que realmente se renderiza
# cuando la pestaña activa es "comercial".
$patron = '(?s)(\{tabActiva\s*===\s*"comercial"\s*&&\s*\(\s*)(<DashboardComercial\b.*?\/>\s*)(\)\})'

$regex = New-Object System.Text.RegularExpressions.Regex($patron)

if (-not $regex.IsMatch($texto)) {
    throw 'No se pudo localizar el render activo de tabActiva === "comercial". No se modifico el archivo.'
}

$reemplazo = @'
${1}<>
          ${2}
          <DashboardPromocionesPanel />
        </>
      ${3}
'@

$texto = $regex.Replace($texto, $reemplazo, 1)

[System.IO.File]::WriteAllText($dashboard, $texto, $utf8)

Write-Host ""
Write-Host "V12.14 aplicada. El panel de promociones quedo conectado al render ACTIVO de Comercial." -ForegroundColor Green
Write-Host ""
