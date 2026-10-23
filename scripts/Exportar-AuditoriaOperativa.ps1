# Consulta únicamente definiciones del esquema. No instala ni modifica la base.
$ErrorActionPreference = 'Stop'
$raizProyecto = Split-Path -Parent $PSScriptRoot
$rutaSql = Join-Path $raizProyecto 'supabase\diagnosticos\auditoria_flujo_operativo.sql'
if (-not (Test-Path $rutaSql)) { throw 'No se encontró la consulta de auditoría.' }
Push-Location $raizProyecto
try {
    $ayudaConsulta = (& npx supabase db query --help | Out-String)
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar la ayuda de Supabase.' }
    $argumentosConsulta = @('supabase', 'db', 'query', '--linked', '--file', $rutaSql)
    if ($ayudaConsulta -match '--output-format') {
        $argumentosConsulta += @('--output-format', 'json')
    } else {
        $argumentosConsulta += @('--output', 'json')
    }
    $salidaConsulta = & npx @argumentosConsulta
    if ($LASTEXITCODE -ne 0) { throw 'Falló la consulta. No se modificó la base.' }
    $contenidoConsulta = ($salidaConsulta -join [Environment]::NewLine).Trim()
    if (-not $contenidoConsulta) { throw 'Supabase no devolvió el resultado; no se generó un archivo vacío.' }
    try { $null = $contenidoConsulta | ConvertFrom-Json -ErrorAction Stop }
    catch { throw 'La respuesta no llegó en JSON. Copia el mensaje de la terminal para revisar la versión del CLI; no se guardó un resultado incompleto.' }
    if (-not $contenidoConsulta.Contains('auditoria_flujo_operativo')) { throw 'La respuesta no contiene el diagnóstico esperado.' }
    $nombreResultado = 'auditoria_flujo_operativo_' + (Get-Date -Format 'yyyyMMdd_HHmmss') + '.json'
    $rutaResultado = Join-Path $raizProyecto $nombreResultado
    [System.IO.File]::WriteAllText($rutaResultado, $contenidoConsulta, [System.Text.UTF8Encoding]::new($false))
    Write-Host ('Archivo generado: ' + $rutaResultado)
    Write-Host 'Adjunta ese archivo en el chat. Incluye definiciones del esquema, no pedidos ni existencias reales.'
} finally {
    Pop-Location
}
