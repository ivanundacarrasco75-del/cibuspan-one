# Requiere R2 activado y el binding CAPTURAS_CAMPO configurado en Pages.
# No crea suscripciones, no traslada ni borra archivos al instalar.
$ErrorActionPreference = 'Stop'
$raizProyecto = Split-Path -Parent $PSScriptRoot
Push-Location $raizProyecto
try {
    & node --test pruebas/verificar_capturas_r2.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la verificacion de capturas. No continuar.' }
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la compilacion. No se modifico Supabase.' }
    $ayuda = (& npx supabase db query --help | Out-String)
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar Supabase. No continuar.' }
    $formato = @('--output','json')
    if ($ayuda -match '--output-format') { $formato = @('--output-format','json') }
    # La planificacion por fechas estaba entregada, sin confirmacion de instalacion.
    # Instalar ese SQL nuevo SOLO si la funcion esta ausente; no reinstalar anteriores.
    $previos = @('supabase','db','query','--linked','--file','.\supabase\diagnosticos\verificar_planificacion_periodo.sql')+$formato
    $previa = & npx @previos
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la verificacion previa de planificacion. No continuar.' }
    $filasPrevias = @(($previa -join [Environment]::NewLine).Trim() | ConvertFrom-Json -ErrorAction Stop)
    if ($filasPrevias.Count -ne 1) { throw 'Respuesta previa inesperada. No continuar.' }
    $plan = $filasPrevias[0].planificacion_periodo
    if ($plan -is [string]) { $plan = $plan | ConvertFrom-Json -ErrorAction Stop }
    if ($plan.instalada -isnot [bool] -or $plan.version -ne '202611040003') { throw 'No se confirmo el estado previo de planificacion.' }
    if ($plan.instalada -eq $false) {
        Write-Host 'Completando la planificacion por fechas pendiente, antes de publicar el frontend.'
        & npx supabase db query --linked --file '.\supabase\migrations\202611040003_planificacion_periodo.sql'
        if ($LASTEXITCODE -ne 0) { throw 'Fallo la planificacion pendiente. No continuar.' }
        $previa = & npx @previos
        if ($LASTEXITCODE -ne 0) { throw 'Fallo la verificacion de planificacion instalada. No continuar.' }
        $filasPrevias = @(($previa -join [Environment]::NewLine).Trim() | ConvertFrom-Json -ErrorAction Stop)
        if ($filasPrevias.Count -ne 1) { throw 'Respuesta inesperada despues de instalar planificacion.' }
        $plan = $filasPrevias[0].planificacion_periodo
        if ($plan -is [string]) { $plan = $plan | ConvertFrom-Json -ErrorAction Stop }
        if ($plan.correcto -isnot [bool] -or $plan.correcto -ne $true -or $plan.version -ne '202611040003') { throw 'Planificacion sin verificar. No continuar.' }
        & npx supabase migration repair 202611040003 --status applied --linked
        if ($LASTEXITCODE -ne 0) { throw 'Fallo el registro de planificacion. Copia la terminal.' }
    }
    if ($plan.correcto -isnot [bool] -or $plan.correcto -ne $true) {
        throw 'La planificacion existente no cumple el contrato. No se reinstalo ni publico. Copia la terminal.'
    }
    & npx supabase db query --linked --file '.\supabase\migrations\202611040004_capturas_r2.sql'
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la instalacion de permisos de capturas. No continuar.' }
    $argumentos = @('supabase','db','query','--linked','--file','.\supabase\diagnosticos\verificar_capturas_r2.sql')+$formato
    $salida = & npx @argumentos
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la verificacion SQL. No continuar.' }
    $filas = @(($salida -join [Environment]::NewLine).Trim() | ConvertFrom-Json -ErrorAction Stop)
    if ($filas.Count -ne 1) { throw 'La verificacion no devolvio una fila. No continuar.' }
    $resultado = $filas[0].capturas_r2
    if ($resultado -is [string]) { $resultado = $resultado | ConvertFrom-Json -ErrorAction Stop }
    if ($resultado.tipo -ne 'capturas_r2' -or $resultado.version -ne '202611040004' -or $resultado.correcto -isnot [bool] -or $resultado.correcto -ne $true) {
        throw 'No se confirmaron los permisos de R2. No continuar.'
    }
    & npx supabase migration repair 202611040004 --status applied --linked
    if ($LASTEXITCODE -ne 0) { throw 'Permisos verificados; fallo el registro. Copia la terminal.' }
    # Se genera en memoria: no pedir, imprimir ni guardar esta clave en archivos.
    # Renueva enlaces temporales; las evidencias pueden abrirse de nuevo desde la app.
    $secretoFirma = & node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
    if ($LASTEXITCODE -ne 0 -or $secretoFirma.Length -lt 32) { throw 'No se pudo generar la firma privada.' }
    $secretoFirma | & npx wrangler pages secret put CAPTURAS_FIRMA --project-name=cibuspan-one
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la configuracion de firma en Cloudflare. No publicar aun.' }
    Remove-Variable secretoFirma -ErrorAction SilentlyContinue
    & npx wrangler pages deploy dist --project-name=cibuspan-one --branch=main
    if ($LASTEXITCODE -ne 0) { throw 'Falta publicar la app. Copia el error de Cloudflare.' }
    $estado = Invoke-RestMethod -Uri ('https://cibuspan-one.pages.dev/api/capturas/estado?t='+[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) -Method Get
    if ($estado.version -ne '202611040004' -or $estado.r2 -ne $true -or $estado.firma -ne $true) {
        throw 'La app se publico, pero falta el binding R2 o su firma. Configura CAPTURAS_CAMPO en Pages y vuelve a ejecutar este script. No se trasladaron ni borraron fotos.'
    }
    Write-Host 'Servicio R2 instalado y publicado; binding y firma presentes. No se trasladaron ni borraron archivos.'
    Write-Host 'Cierra y abre la app. Primero comprueba una carga real y abre su captura. Luego ve a Campo comercial > Locales y reportes > Almacenamiento de capturas.'
    Write-Host 'El bloqueo actual de Supabase sigue pendiente hasta comprobar que permite guardar. Este script no cambia el plan ni levanta restricciones.'
} finally {
    Remove-Variable secretoFirma -ErrorAction SilentlyContinue
    Pop-Location
}
