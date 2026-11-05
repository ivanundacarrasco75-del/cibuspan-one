# Sin parametros: solo diagnostico. -Eliminar: retira solo percha-* no protegidas.
# El propietario autorizo descartar fotos fisicas; conservar capturas En Percha.
param([switch]$Eliminar)
$ErrorActionPreference = 'Stop'
$raizProyecto = Split-Path -Parent $PSScriptRoot
$consulta = Join-Path $raizProyecto 'supabase\diagnosticos\diagnostico_fotos_percha.sql'
$validador = Join-Path $PSScriptRoot 'lib\fotosPerchaStorage.mjs'
$refEsperada = 'mkntfvsbmlgobettavnu'
Push-Location $raizProyecto
try {
    $rutaRef = Join-Path $raizProyecto 'supabase\.temp\project-ref'
    if (-not (Test-Path $rutaRef) -or (Get-Content -Raw $rutaRef).Trim() -ne $refEsperada) {
        throw 'El proyecto enlazado no coincide con CIBUSPAN ONE. No se consulto ni borro nada.'
    }
    & node --test pruebas/verificar_limpieza_perchas.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la verificacion de seleccion. No continuar.' }
    $ayuda = (& npx supabase db query --help | Out-String)
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar Supabase.' }
    $formato = @('--output','json')
    if ($ayuda -match '--output-format') { $formato = @('--output-format','json') }
    $carpetaInforme = Join-Path $raizProyecto ('diagnosticos_privados\fotos_percha_'+(Get-Date -Format 'yyyyMMdd_HHmmss_fff'))
    $null = New-Item -ItemType Directory -Path $carpetaInforme -Force
    $rutaPlan = Join-Path $carpetaInforme 'plan_solo_lectura.json'
    $rutaActual = Join-Path $carpetaInforme 'estado_actual.json'
    $rutaRegistro = Join-Path $carpetaInforme 'registro_limpieza.json'
    function Consultar-Fotos([string]$Destino) {
        $argumentos = @('supabase','db','query','--linked','--file',$consulta)+$formato
        $respuesta = & npx @argumentos
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar el estado de archivos. No continuar con la limpieza.' }
        $texto = ($respuesta -join [Environment]::NewLine).Trim()
        [System.IO.File]::WriteAllText($Destino,$texto,[System.Text.UTF8Encoding]::new($false))
        $validada = & node $validador clasificar $Destino
        if ($LASTEXITCODE -ne 0) { throw 'Diagnostico invalido o ambiguo. No se autoriza borrado.' }
        return ($validada -join [Environment]::NewLine) | ConvertFrom-Json -ErrorAction Stop
    }
    $plan = Consultar-Fotos $rutaPlan
    $plan.resumen | Format-List | Out-Host
    $megabytes = [Math]::Round($plan.resumen.bytes_percha_conocidos / 1MB,2)
    Write-Host ('Fotos fisicas candidatas: '+$plan.resumen.fotos_percha_eliminables+'; tamano conocido aproximado: '+$megabytes+' MiB.')
    Write-Host ('Capturas referenciadas protegidas: '+$plan.resumen.capturas_referenciadas+'.')
    Write-Host ('Diagnostico privado: '+$rutaPlan)
    if (-not $Eliminar) {
        Write-Host 'SOLO DIAGNOSTICO: no se borro ningun archivo ni se modifico la base.'
        Write-Host 'Copia el resumen de la terminal para revisar si estas fotos bastan para reducir el almacenamiento.'
        return
    }
    if ($plan.resumen.fotos_percha_eliminables -eq 0) { Write-Host 'No hay fotos de percha identificadas para eliminar.'; return }
    $ayudaStorage = (& npx supabase storage rm --help | Out-String)
    if ($LASTEXITCODE -ne 0 -or $ayudaStorage -notmatch '--linked') { throw 'El CLI no ofrece el destino remoto esperado. No se inicio el borrado.' }
    $destinoStorage = @('--linked')
    if ($ayudaStorage -match '--project-ref') { $destinoStorage += @('--project-ref',$refEsperada) }
    $registro = @{ iniciado_en=(Get-Date).ToString('o'); proyecto=$refEsperada; hash_capturas=$plan.hash_capturas; lotes=@() }
    function Guardar-Registro {
        [System.IO.File]::WriteAllText($rutaRegistro,($registro | ConvertTo-Json -Depth 20),[System.Text.UTF8Encoding]::new($false))
    }
    Guardar-Registro
    while ($true) {
        $actual = Consultar-Fotos $rutaActual
        $seleccion = & node $validador lote $rutaPlan $rutaActual
        if ($LASTEXITCODE -ne 0) { throw 'Cambio una foto o las referencias protegidas. Se detuvo la limpieza.' }
        $lote = @((($seleccion -join [Environment]::NewLine) | ConvertFrom-Json -ErrorAction Stop))
        if ($lote.Count -eq 0) { break }
        # Solo archivos individuales, sin -r, sin comodines ni directorios.
        $uris = @($lote | ForEach-Object { $_.uri })
        $intento = @{ solicitado_en=(Get-Date).ToString('o'); archivos=@($lote); estado='ENVIANDO'; confirmado_en=$null }
        $registro.lotes += $intento
        Guardar-Registro
        $argumentosRm = @('supabase','storage','rm')+$uris+$destinoStorage+@('--experimental','--yes')
        & npx @argumentosRm
        if ($LASTEXITCODE -ne 0) {
            $intento.estado='SIN_CONFIRMAR'; Guardar-Registro
            throw 'Storage rechazo el borrado o no confirmo el resultado. No se siguio con otros archivos. Si aparece 402/cuota, necesitamos soporte; este comando no elude la restriccion. Revisa sin -Eliminar para conocer el estado actual.'
        }
        $despues = Consultar-Fotos $rutaActual
        if ($despues.hash_capturas -ne $plan.hash_capturas -or $despues.resumen.archivos_captura_presentes -ne $plan.resumen.archivos_captura_presentes) {
            $intento.estado='REVISAR_CAMBIO_DE_CAPTURAS'; Guardar-Registro
            throw 'Se detecto un cambio concurrente en las capturas. Se detuvo la limpieza para revisar.'
        }
        $idsPresentes = @($despues.objetos | ForEach-Object { $_.id })
        if (@($lote | Where-Object { $_.id -in $idsPresentes }).Count -gt 0) {
            $intento.estado='SIN_CONFIRMAR'; Guardar-Registro
            throw 'La API respondio, pero alguna foto sigue registrada. No se anuncio como eliminada.'
        }
        $intento.estado='ELIMINADAS_POR_STORAGE_API'; $intento.confirmado_en=(Get-Date).ToString('o'); Guardar-Registro
        Write-Host ('Lote comprobado: '+$lote.Count+' fotos fisicas retiradas. Las capturas En Percha se conservan.')
    }
    $registro.finalizado_en=(Get-Date).ToString('o'); Guardar-Registro
    Write-Host ('Limpieza terminada. Informe privado: '+$rutaRegistro)
    Write-Host 'No se cambiaron pedidos, stock, datos de visitas ni recetas. La cuota facturable puede tardar en actualizarse y el bloqueo puede continuar hasta que Supabase lo levante.'
} finally { Pop-Location }
