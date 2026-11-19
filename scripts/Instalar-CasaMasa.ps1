# Instala sólo Casa Masa y publica. No aplica migraciones históricas ni carga datos.
$ErrorActionPreference = 'Stop'
$raizProyecto = Split-Path -Parent $PSScriptRoot
$rutaSql = Join-Path $raizProyecto 'supabase\migrations\202611190001_casa_masa_empaque.sql'
$rutaVerificacion = Join-Path $raizProyecto 'supabase\diagnosticos\verificar_casa_masa.sql'
foreach ($ruta in @($rutaSql, $rutaVerificacion)) {
    if (-not (Test-Path -LiteralPath $ruta)) { throw 'Faltan archivos de Casa Masa. Actualiza el repositorio.' }
}
Push-Location $raizProyecto
try {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la compilacion. No se inicio SQL.' }
    $ayuda = (& npx supabase db query --help | Out-String)
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar Supabase. No se inicio SQL.' }
    $formato = @('--output','json')
    if ($ayuda -match '--output-format') { $formato = @('--output-format','json') }
    & npx supabase db query --linked --file $rutaSql
    if ($LASTEXITCODE -ne 0) { throw 'No se confirmo la instalacion de Casa Masa. Copia el error; no continuar.' }
    $argumentos = @('supabase','db','query','--linked','--file',$rutaVerificacion)+$formato
    $salida = & npx @argumentos
    if ($LASTEXITCODE -ne 0) { throw 'SQL aplicado; fallo el diagnostico. No se registro ni publico.' }
    try { $filas = @(($salida -join [Environment]::NewLine).Trim() | ConvertFrom-Json -ErrorAction Stop) }
    catch { throw 'Diagnostico sin JSON valido. No se registro ni publico.' }
    if ($filas.Count -ne 1) { throw 'Diagnostico con formato inesperado. No se registro ni publico.' }
    $resultado = $filas[0].casa_masa
    if ($resultado -is [string]) {
        try { $resultado = $resultado | ConvertFrom-Json -ErrorAction Stop }
        catch { throw 'Diagnostico incompleto. No se registro ni publico.' }
    }
    if ($resultado.tipo -ne 'casa_masa' -or $resultado.version -ne '202611190001' -or
        $resultado.correcto -isnot [bool] -or $resultado.correcto -ne $true) {
        $resultado | ConvertTo-Json -Depth 5 | Write-Host
        throw 'No se confirmo el contrato de Casa Masa. No se registro ni publico.'
    }
    & npx supabase migration repair 202611190001 --status applied --linked
    if ($LASTEXITCODE -ne 0) { throw 'Casa Masa verificada; fallo el registro de la version nueva. Copia el error.' }
    & npx supabase functions deploy admin-users
    if ($LASTEXITCODE -ne 0) { throw 'SQL instalado; falta actualizar el administrador de permisos. No se publico la app.' }
    & npx wrangler pages deploy dist --project-name=cibuspan-one --branch=main
    if ($LASTEXITCODE -ne 0) { throw 'Casa Masa instalada; falta publicar la app. Copia el error de Cloudflare.' }
    Write-Host 'Casa Masa instalada, verificada y publicada. No se cargaron pedidos ni existencias.'
    Write-Host 'Cierra y abre la PWA. Revisa los cuatro SKU, clientes, puntos de entrega y unidades de manejo antes de registrar un pedido real.'
    Write-Host 'Cobros, facturacion, WhatsApp y registro de la fabricacion diaria siguen pendientes.'
} finally { Pop-Location }
