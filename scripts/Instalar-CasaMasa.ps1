# Instala sólo Casa Masa y publica. No aplica migraciones históricas ni carga datos.
$ErrorActionPreference = 'Stop'
$raizProyecto = Split-Path -Parent $PSScriptRoot
$rutaSql = Join-Path $raizProyecto 'supabase\migrations\202611190002_casa_masa_empaque.sql'
$rutaVerificacion = Join-Path $raizProyecto 'supabase\diagnosticos\verificar_casa_masa.sql'
$anteriorUrl = [Environment]::GetEnvironmentVariable('VITE_SUPABASE_URL', 'Process')
$anteriorClave = [Environment]::GetEnvironmentVariable('VITE_SUPABASE_PUBLISHABLE_KEY', 'Process')
foreach ($ruta in @($rutaSql, $rutaVerificacion)) {
    if (-not (Test-Path -LiteralPath $ruta)) { throw 'Faltan archivos de Casa Masa. Actualiza el repositorio.' }
}
Push-Location $raizProyecto
try {
    # La vinculación local puede seguir apuntando al proyecto original pausado.
    # Conservar la conexión de la app pública sin cambiar .env ni supabase/.temp.
    $pagina = (Invoke-WebRequest -Uri 'https://cibuspan-one.pages.dev' -UseBasicParsing -TimeoutSec 30).Content
    $archivo = [regex]::Match($pagina, 'src="(/assets/index-[^"]+\.js)"').Groups[1].Value
    if (-not $archivo) { throw 'No se identifico la app publicada. No se inicio SQL.' }
    $bundle = (Invoke-WebRequest -Uri ('https://cibuspan-one.pages.dev'+$archivo) -UseBasicParsing -TimeoutSec 30).Content
    $urls = @([regex]::Matches($bundle, 'https://[a-z0-9]+\.supabase\.co') | ForEach-Object Value | Sort-Object -Unique)
    $claves = @([regex]::Matches($bundle, 'sb_publishable_[A-Za-z0-9_-]+') | ForEach-Object Value | Sort-Object -Unique)
    if ($urls.Count -ne 1 -or $claves.Count -ne 1 -or $urls[0] -notin @('https://mkntfvsbmlgobettavnu.supabase.co','https://eodcwkuexldsbomflthe.supabase.co')) {
        throw 'La configuracion publica requiere revision. No se inicio SQL.'
    }
    $proyectoRef = ([uri]$urls[0]).Host.Split('.')[0]
    $estadoCapturas = Invoke-RestMethod -Uri 'https://cibuspan-one.pages.dev/api/capturas/estado' -TimeoutSec 30
    if ($estadoCapturas.proyecto -ne $urls[0] -or $estadoCapturas.r2 -ne $true -or $estadoCapturas.firma -ne $true) {
        throw 'La conexion de capturas no coincide con la app. No se inicio SQL.'
    }
    $env:VITE_SUPABASE_URL = $urls[0]
    $env:VITE_SUPABASE_PUBLISHABLE_KEY = $claves[0]
    Write-Host ('Destino verificado contra produccion: '+$proyectoRef)
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la compilacion. No se inicio SQL.' }
    $ayuda = (& npx supabase db query --help | Out-String)
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar Supabase. No se inicio SQL.' }
    $formato = @('--output','json')
    if ($ayuda -match '--output-format') { $formato = @('--output-format','json') }
    & npx supabase db query --linked --project-ref $proyectoRef --file $rutaSql
    if ($LASTEXITCODE -ne 0) { throw 'No se confirmo la instalacion de Casa Masa. Copia el error; no continuar.' }
    $argumentos = @('supabase','db','query','--linked','--project-ref',$proyectoRef,'--file',$rutaVerificacion)+$formato
    $salida = & npx @argumentos
    if ($LASTEXITCODE -ne 0) { throw 'SQL aplicado; fallo el diagnostico. No se registro ni publico.' }
    try {
        $respuesta = ($salida -join [Environment]::NewLine).Trim() | ConvertFrom-Json -ErrorAction Stop
        if ($respuesta.PSObject.Properties.Name -contains 'rows') { $filas = @($respuesta.rows) }
        else { $filas = @($respuesta) }
    }
    catch { throw 'Diagnostico sin JSON valido. No se registro ni publico.' }
    if ($filas.Count -ne 1) { throw 'Diagnostico con formato inesperado. No se registro ni publico.' }
    $resultado = $filas[0].casa_masa
    if ($resultado -is [string]) {
        try { $resultado = $resultado | ConvertFrom-Json -ErrorAction Stop }
        catch { throw 'Diagnostico incompleto. No se registro ni publico.' }
    }
    if ($resultado.tipo -ne 'casa_masa' -or $resultado.version -ne '202611190002' -or
        $resultado.correcto -isnot [bool] -or $resultado.correcto -ne $true) {
        $resultado | ConvertTo-Json -Depth 5 | Write-Host
        throw 'No se confirmo el contrato de Casa Masa. No se registro ni publico.'
    }
    & npx supabase migration repair 202611190002 --status applied --linked --project-ref $proyectoRef
    if ($LASTEXITCODE -ne 0) { throw 'Casa Masa verificada; fallo el registro de la version nueva. Copia el error.' }
    & npx supabase functions deploy admin-users --project-ref $proyectoRef
    if ($LASTEXITCODE -ne 0) { throw 'SQL instalado; falta actualizar el administrador de permisos. No se publico la app.' }
    & npx wrangler pages deploy dist --project-name=cibuspan-one --branch=main
    if ($LASTEXITCODE -ne 0) { throw 'Casa Masa instalada; falta publicar la app. Copia el error de Cloudflare.' }
    Write-Host 'Casa Masa instalada, verificada y publicada. No se cargaron pedidos ni existencias.'
    Write-Host 'Cierra y abre la PWA. Revisa los cuatro SKU, clientes, puntos de entrega y unidades de manejo antes de registrar un pedido real.'
    Write-Host 'Cobros, facturacion, WhatsApp y registro de la fabricacion diaria siguen pendientes.'
} finally {
    [Environment]::SetEnvironmentVariable('VITE_SUPABASE_URL', $anteriorUrl, 'Process')
    [Environment]::SetEnvironmentVariable('VITE_SUPABASE_PUBLISHABLE_KEY', $anteriorClave, 'Process')
    Pop-Location
}
