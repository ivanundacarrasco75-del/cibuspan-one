# Compile first, install only this migration, verify, record and publish the matching app.
# ASCII source/messages also work when Windows PowerShell 5.1 reads UTF-8 without BOM.
$ErrorActionPreference = 'Stop'
$raizProyecto = Split-Path -Parent $PSScriptRoot
$rutaInstalacion = Join-Path $raizProyecto 'supabase\migrations\202610230002_registro_produccion_seguro.sql'
$rutaVerificacion = Join-Path $raizProyecto 'supabase\diagnosticos\verificar_registro_produccion.sql'
if (-not (Test-Path $rutaInstalacion) -or -not (Test-Path $rutaVerificacion)) {
    throw 'Faltan archivos de esta actualizacion. Ejecuta git pull --ff-only.'
}
Push-Location $raizProyecto
try {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la compilacion. No se modifico Supabase.' }

    $ayudaConsulta = (& npx supabase db query --help | Out-String)
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar Supabase. No se inicio la instalacion.' }
    $formatoJson = @('--output', 'json')
    if ($ayudaConsulta -match '--output-format') { $formatoJson = @('--output-format', 'json') }

    & npx supabase db query --linked --file $rutaInstalacion
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la instalacion SQL. No continuar. Copia el error.' }
    $argumentosVerificacion = @('supabase', 'db', 'query', '--linked', '--file', $rutaVerificacion) + $formatoJson
    $salidaVerificacion = & npx @argumentosVerificacion
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo verificar SQL. No se registro ni publico. Copia el error.' }
    try { $filas = @(($salidaVerificacion -join [Environment]::NewLine).Trim() | ConvertFrom-Json -ErrorAction Stop) }
    catch { throw 'Verificacion sin JSON valido. No se registro ni publico. Copia la terminal.' }
    if ($filas.Count -ne 1) { throw 'Formato inesperado de verificacion. No se registro ni publico.' }
    $v = $filas[0].registro_produccion_seguro
    if ($v -is [string]) {
        try { $v = $v | ConvertFrom-Json -ErrorAction Stop }
        catch { throw 'Verificacion incompleta. No se registro ni publico.' }
    }
    if ($v.tipo -ne 'registro_produccion_seguro' -or $v.version -ne '202610230002' -or
        $v.correcto -isnot [bool] -or $v.correcto -ne $true) {
        throw 'SQL no confirmado. No se registro ni publico. Copia la terminal para revisar.'
    }
    & npx supabase migration repair 202610230002 --status applied --linked
    if ($LASTEXITCODE -ne 0) { throw 'SQL verificado; fallo el registro de migracion. Copia el error.' }

    & npx wrangler pages deploy dist --project-name=cibuspan-one --branch=main
    if ($LASTEXITCODE -ne 0) {
        throw 'SQL instalado; falta publicar la app. No registres otra produccion para probar. Copia el error de Cloudflare para terminar la publicacion.'
    }
    Write-Host 'Registro seguro de produccion instalado, verificado y publicado.'
    Write-Host 'Cierra y vuelve a abrir la app antes de registrar produccion.'
} finally {
    Pop-Location
}
