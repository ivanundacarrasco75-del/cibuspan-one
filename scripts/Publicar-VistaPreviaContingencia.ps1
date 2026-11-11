# Publica solo Preview; no altera la configuracion Production.
$ErrorActionPreference = 'Stop'
$proyectoPages = 'cibuspan-one'
$proyectoSupabase = 'https://eodcwkuexldsbomflthe.supabase.co'
$wrangler = 'wrangler@4.147.0'
$rama = 'contingencia-prueba-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
$anteriorUrl = [Environment]::GetEnvironmentVariable('VITE_SUPABASE_URL', 'Process')
$anteriorClave = [Environment]::GetEnvironmentVariable('VITE_SUPABASE_PUBLISHABLE_KEY', 'Process')
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    $pendientes = & git status --porcelain
    if ($LASTEXITCODE -ne 0 -or $pendientes) {
        throw 'Hay cambios locales o no se pudo revisar Git. No se publico la vista previa.'
    }
    if (-not (Test-Path -LiteralPath 'node_modules/.bin/vite.cmd')) {
        throw 'Faltan dependencias. Ejecuta npm ci y vuelve a intentar.'
    }

    $produccionJson = (& npx.cmd --yes $wrangler pages deployment list --project-name $proyectoPages --environment production --json | Out-String)
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar Cloudflare. Verifica tu sesion de Wrangler.' }
    $produccion = ConvertFrom-Json -InputObject $produccionJson
    $actual = @($produccion)[0]
    if (-not $actual -or $actual.Environment -ne 'Production' -or $actual.Branch -ne 'main') {
        throw 'No se pudo confirmar que main es la rama de la publicacion de produccion. No se desplego nada.'
    }

    Read-Host 'Copia la clave Publishable de cibuspan-one-contingencia y presiona Enter sin pegarla' | Out-Null
    $clave = ([string](Get-Clipboard -Raw)).Trim()
    if ($clave -notmatch '^sb_publishable_[A-Za-z0-9_-]+$') { throw 'Copia solo la clave Publishable de contingencia.' }
    try {
        $salud = Invoke-WebRequest -Uri "$proyectoSupabase/auth/v1/health" -Headers @{ apikey = $clave } -UseBasicParsing -TimeoutSec 15
    } catch {
        throw 'No se confirmo Auth del proyecto de contingencia con la clave copiada. No se publico nada.'
    }
    if ($salud.StatusCode -ne 200) { throw 'Auth no respondio 200. No se publico nada.' }
    $env:VITE_SUPABASE_URL = $proyectoSupabase
    $env:VITE_SUPABASE_PUBLISHABLE_KEY = $clave
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo compilar la app. No se publico nada.' }

    $secretos = (& npx.cmd --yes $wrangler pages secret list --project-name $proyectoPages --env preview | Out-String)
    if ($LASTEXITCODE -ne 0 -or $secretos -notmatch 'The "preview" environment') {
        throw 'No se pudieron comprobar los secretos de Preview. No se publico nada.'
    }
    if ($secretos -notmatch '(?m)^\s*-\s+CAPTURAS_FIRMA:') {
        $aleatorios = New-Object byte[] 32
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        try {
            $rng.GetBytes($aleatorios)
            [Convert]::ToBase64String($aleatorios) | & npx.cmd --yes $wrangler pages secret put CAPTURAS_FIRMA --project-name $proyectoPages --env preview
            if ($LASTEXITCODE -ne 0) { throw 'No se pudo guardar la firma en Preview.' }
        } finally {
            $rng.Dispose()
            [Array]::Clear($aleatorios, 0, $aleatorios.Length)
        }
    }

    & npx.cmd --yes $wrangler pages deploy dist --project-name $proyectoPages --branch $rama
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo completar el despliegue de Preview.' }
    $previasJson = (& npx.cmd --yes $wrangler pages deployment list --project-name $proyectoPages --environment preview --json | Out-String)
    if ($LASTEXITCODE -ne 0) { throw 'El despliegue termino, pero no se pudo verificar su entorno.' }
    $previas = ConvertFrom-Json -InputObject $previasJson
    $previa = $previas | Where-Object { $_.Environment -eq 'Preview' -and $_.Branch -eq $rama } | Select-Object -First 1
    $url = ([string]$previa.Deployment).TrimEnd('/')
    if ($url -notmatch '^https://[a-z0-9-]+\.cibuspan-one\.pages\.dev$') {
        throw 'No se pudo verificar una URL de Preview para la rama de prueba.'
    }
    Write-Host "VISTA PREVIA: $url"
    try {
        $estado = Invoke-RestMethod -Uri "$url/api/capturas/estado" -TimeoutSec 15
    } catch {
        Write-Host "No se pudo leer el estado desde la terminal. Abre $url/api/capturas/estado en el navegador."
        return
    }
    if ($estado.proyecto -ne $proyectoSupabase -or $estado.r2 -ne $true -or $estado.firma -ne $true) {
        throw 'La vista previa existe, pero no estan confirmados Supabase, R2 y la firma. No guardar visitas.'
    }
    Write-Host 'VISTA PREVIA VERIFICADA: Supabase de contingencia, R2 y firma configurados.'
} finally {
    [Environment]::SetEnvironmentVariable('VITE_SUPABASE_URL', $anteriorUrl, 'Process')
    [Environment]::SetEnvironmentVariable('VITE_SUPABASE_PUBLISHABLE_KEY', $anteriorClave, 'Process')
    Pop-Location
}
