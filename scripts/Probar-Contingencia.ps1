# Abre una prueba local. No escribe .env, no enlaza el CLI y no publica la app.
$ErrorActionPreference = 'Stop'
$proyecto = 'https://eodcwkuexldsbomflthe.supabase.co'
Read-Host 'Copia la clave Publishable de cibuspan-one-contingencia y presiona Enter sin pegarla' | Out-Null
$clave = ([string](Get-Clipboard -Raw)).Trim()
if ($clave -notmatch '^sb_publishable_[A-Za-z0-9_-]+$') {
    throw 'Copia solo la clave Publishable del proyecto de contingencia.'
}
$anteriorUrl = [Environment]::GetEnvironmentVariable('VITE_SUPABASE_URL', 'Process')
$anteriorClave = [Environment]::GetEnvironmentVariable('VITE_SUPABASE_PUBLISHABLE_KEY', 'Process')
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    if (-not (Test-Path -LiteralPath 'node_modules/.bin/vite.cmd')) {
        throw 'Faltan dependencias. Desde D:\CIBUSPAN_ONE ejecuta npm ci y vuelve a intentar.'
    }
    $env:VITE_SUPABASE_URL = $proyecto
    $env:VITE_SUPABASE_PUBLISHABLE_KEY = $clave
    Write-Host 'Abre http://127.0.0.1:5174 en una ventana privada.'
    & npm.cmd run dev -- --host 127.0.0.1 --port 5174 --strictPort
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar la prueba local.' }
} finally {
    [Environment]::SetEnvironmentVariable('VITE_SUPABASE_URL', $anteriorUrl, 'Process')
    [Environment]::SetEnvironmentVariable('VITE_SUPABASE_PUBLISHABLE_KEY', $anteriorClave, 'Process')
    Pop-Location
}
