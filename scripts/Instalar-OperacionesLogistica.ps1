# Installs operation protection only. Does not delete orders or confirm shipments.
$ErrorActionPreference = 'Stop'
$raizProyecto = Split-Path -Parent $PSScriptRoot
$rutaSql = Join-Path $raizProyecto 'supabase\migrations\202610270002_operaciones_logistica_seguras.sql'
$verificaciones = @(
    @{ Archivo='verificar_autorizacion_operativa.sql'; Campo='autorizacion_operativa'; Version='202610230001' },
    @{ Archivo='verificar_registro_produccion.sql'; Campo='registro_produccion_seguro'; Version='202610230002' },
    @{ Archivo='verificar_consumo_mp_produccion.sql'; Campo='consumo_mp_produccion'; Version='202610230003' },
    @{ Archivo='verificar_arranque_operativo.sql'; Campo='arranque_operativo'; Version='202610240001' },
    @{ Archivo='verificar_registro_pedidos.sql'; Campo='registro_pedidos_seguro'; Version='202610270001' },
    @{ Archivo='verificar_operaciones_logistica.sql'; Campo='operaciones_logistica'; Version='202610270002' }
)
if (-not (Test-Path $rutaSql)) { throw 'Falta SQL. Ejecuta git pull --ff-only.' }
foreach ($v in $verificaciones) {
    if (-not (Test-Path (Join-Path $raizProyecto ('supabase\diagnosticos\'+$v.Archivo)))) {
        throw 'Falta un archivo de verificacion. Ejecuta git pull --ff-only.'
    }
}
Push-Location $raizProyecto
try {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la compilacion. No se modifico Supabase.' }
    $ayuda = (& npx supabase db query --help | Out-String)
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar Supabase. No se inicio SQL.' }
    $formato = @('--output','json')
    if ($ayuda -match '--output-format') { $formato = @('--output-format','json') }
    # No db push, no reinstalacion de SQL historico, no cargas de inventario.
    & npx supabase db query --linked --file $rutaSql
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la instalacion del modulo. Copia el error; no continuar.' }
    foreach ($v in $verificaciones) {
        $ruta = Join-Path $raizProyecto ('supabase\diagnosticos\'+$v.Archivo)
        $argumentos = @('supabase','db','query','--linked','--file',$ruta)+$formato
        $salida = & npx @argumentos
        if ($LASTEXITCODE -ne 0) { throw ('SQL aplicado; fallo la verificacion '+$v.Campo+'. Copia el error.') }
        try { $filas = @(($salida -join [Environment]::NewLine).Trim() | ConvertFrom-Json -ErrorAction Stop) }
        catch { throw 'Verificacion sin JSON valido. No se registro ni publico. Copia la terminal.' }
        if ($filas.Count -ne 1) { throw 'Verificacion con formato inesperado. No se registro ni publico.' }
        $resultado = $filas[0].($v.Campo)
        if ($resultado -is [string]) {
            try { $resultado = $resultado | ConvertFrom-Json -ErrorAction Stop }
            catch { throw 'Verificacion incompleta. No se registro ni publico.' }
        }
        if ($resultado.tipo -ne $v.Campo -or $resultado.version -ne $v.Version -or
            $resultado.correcto -isnot [bool] -or $resultado.correcto -ne $true) {
            throw ('No se confirmo '+$v.Campo+'. No se registro ni publico. Copia la terminal.')
        }
    }
    & npx supabase migration repair 202610270002 --status applied --linked
    if ($LASTEXITCODE -ne 0) { throw 'Modulo verificado; fallo el registro de migracion. Copia el error.' }
    & npx wrangler pages deploy dist --project-name=cibuspan-one --branch=main
    if ($LASTEXITCODE -ne 0) { throw 'SQL instalado; falta publicar la app. Copia el error de Cloudflare.' }
    Write-Host 'Operaciones logisticas instaladas, verificadas y publicadas. No se eliminaron pedidos ni se confirmaron despachos.'
    Write-Host 'Cierra y abre la app para usar eliminacion y confirmacion completas. El arranque de inventarios sigue en pausa.'
} finally { Pop-Location }
