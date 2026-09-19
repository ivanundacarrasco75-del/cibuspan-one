$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dashboard = Join-Path $root "src\pages\DashboardV2.tsx"
$componente = Join-Path $root "src\components\dashboard\DashboardPromocionesPanel.tsx"
$respaldoDir = Join-Path $root "RESPALDOS_CODIGO\V12.13_AUTO"
$respaldo = Join-Path $respaldoDir "DashboardV2_ANTES_V12_13.tsx"

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

if ($texto -notmatch [regex]::Escape($import)) {
    $texto = $import + [Environment]::NewLine + $texto
}

$inicio = $texto.IndexOf("function DashboardComercial({")
$fin = $texto.IndexOf("function RankingVentasDashboard(", $inicio)

if ($inicio -lt 0 -or $fin -lt 0) {
    throw "No se pudo localizar DashboardComercial de forma segura."
}

$segmento = $texto.Substring($inicio, $fin - $inicio)

if ($segmento -notmatch "<DashboardPromocionesPanel\s*/>") {
    $marca = '<div className="commercial-columns">'
    $inicioColumnas = $segmento.IndexOf($marca)

    if ($inicioColumnas -lt 0) {
        throw 'No se encontro el bloque commercial-columns dentro de DashboardComercial.'
    }

    $cierreFragmento = $segmento.IndexOf("</>", $inicioColumnas)

    if ($cierreFragmento -lt 0) {
        throw "No se encontro el cierre del fragmento de DashboardComercial."
    }

    $ultimoDiv = $segmento.LastIndexOf("</div>", $cierreFragmento)

    if ($ultimoDiv -lt 0) {
        throw "No se encontro el cierre del bloque de rankings."
    }

    $posInsertar = $ultimoDiv + "</div>".Length
    $insercion = [Environment]::NewLine + [Environment]::NewLine + "          <DashboardPromocionesPanel />"
    $segmento = $segmento.Insert($posInsertar, $insercion)

    $texto = $texto.Substring(0, $inicio) + $segmento + $texto.Substring($fin)
}

[System.IO.File]::WriteAllText($dashboard, $texto, $utf8)

Write-Host ""
Write-Host "V12.13 aplicada. Ejecutando compilacion..." -ForegroundColor Green
Write-Host ""
