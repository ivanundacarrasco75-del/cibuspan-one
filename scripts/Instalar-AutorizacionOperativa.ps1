# Instala sólo la corrección operativa nueva y comprueba el resultado antes de registrarla.
$ErrorActionPreference = 'Stop'
$raizProyecto = Split-Path -Parent $PSScriptRoot
$rutaInstalacion = Join-Path $raizProyecto 'supabase\migrations\202610230001_autorizacion_operativa.sql'
$rutaVerificacion = Join-Path $raizProyecto 'supabase\diagnosticos\verificar_autorizacion_operativa.sql'
if (-not (Test-Path $rutaInstalacion) -or -not (Test-Path $rutaVerificacion)) {
    throw 'Faltan los archivos de esta actualización. Ejecuta git pull --ff-only y revisa el resultado.'
}
Push-Location $raizProyecto
try {
    $ayudaConsulta = (& npx supabase db query --help | Out-String)
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar Supabase. No se inició la instalación.' }
    $formatoJson = @('--output', 'json')
    if ($ayudaConsulta -match '--output-format') { $formatoJson = @('--output-format', 'json') }

    & npx supabase db query --linked --file $rutaInstalacion
    if ($LASTEXITCODE -ne 0) { throw 'Falló la instalación. No continuar ni publicar. Copia el error de la terminal.' }

    $argumentosVerificacion = @('supabase', 'db', 'query', '--linked', '--file', $rutaVerificacion) + $formatoJson
    $salidaVerificacion = & npx @argumentosVerificacion
    if ($LASTEXITCODE -ne 0) { throw 'La instalación terminó, pero no se pudo verificar. No se registró la migración.' }
    $textoVerificacion = ($salidaVerificacion -join [Environment]::NewLine).Trim()
    try { $filasVerificacion = @($textoVerificacion | ConvertFrom-Json -ErrorAction Stop) }
    catch { throw 'No se recibió la verificación en JSON. No se registró la migración. Copia el mensaje de la terminal.' }
    if ($filasVerificacion.Count -ne 1) { throw 'La respuesta de verificación no tiene el formato esperado. No se registró la migración.' }
    $verificacion = $filasVerificacion[0].autorizacion_operativa
    if ($verificacion -is [string]) {
        try { $verificacion = $verificacion | ConvertFrom-Json -ErrorAction Stop }
        catch { throw 'La verificación está incompleta. No se registró la migración.' }
    }
    if ($verificacion.tipo -ne 'autorizacion_operativa' -or $verificacion.version -ne '202610230001' -or
        $verificacion.correcto -isnot [bool] -or $verificacion.correcto -ne $true) {
        throw 'La protección no quedó confirmada. No se registró la migración. Copia la terminal para revisarla.'
    }

    & npx supabase migration repair 202610230001 --status applied --linked
    if ($LASTEXITCODE -ne 0) { throw 'La protección se verificó, pero falló el registro de la migración. Copia el error de la terminal.' }
    Write-Host 'Protección instalada y verificada en las 12 funciones operativas.'
    Write-Host 'No es necesario publicar la app en Cloudflare para este cambio.'
} finally {
    Pop-Location
}
