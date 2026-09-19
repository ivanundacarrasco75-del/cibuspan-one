$ErrorActionPreference = "Stop"

$proyecto = "D:\CIBUSPAN_ONE"
$destinoRaiz = "D:\CIBUSPAN_RESPALDOS"
$destinoOneDrive = "D:\OneDrive\CIBUSPAN_RESPALDOS"
$dockerBin = "C:\Users\ACER\AppData\Local\Programs\DockerDesktop\resources\bin"
$dockerExe = Join-Path $dockerBin "docker.exe"
$dockerDesktop = "C:\Users\ACER\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe"
$fecha = Get-Date -Format "yyyy-MM-dd_HHmm"
$etiquetas = @("DIARIO")

if ((Get-Date).DayOfWeek -eq "Sunday") {
  $etiquetas += "SEMANAL"
}

if ((Get-Date).Day -eq 1) {
  $etiquetas += "MENSUAL"
}

$carpetaRespaldo = Join-Path $destinoRaiz ($fecha + "_" + ($etiquetas -join "_"))
$archivoLog = Join-Path $destinoRaiz "historial_respaldos.log"

function Escribir-Log([string]$mensaje) {
  "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - $mensaje" |
    Out-File -FilePath $archivoLog -Append -Encoding utf8
}

try {
  New-Item -ItemType Directory -Force -Path $destinoRaiz | Out-Null
  New-Item -ItemType Directory -Force -Path $carpetaRespaldo | Out-Null
  Escribir-Log "INICIO $carpetaRespaldo"

  if (-not (Test-Path $proyecto)) {
    throw "No se encontró la carpeta $proyecto"
  }

  if (-not (Test-Path $dockerExe)) {
    throw "No se encontró Docker en $dockerExe"
  }

  $env:Path = "$dockerBin;$env:Path"

  & $dockerExe info *> $null
  $dockerListo = $LASTEXITCODE -eq 0

  if (-not $dockerListo) {
    if (-not (Test-Path $dockerDesktop)) {
      throw "No se encontró Docker Desktop."
    }

    Start-Process $dockerDesktop

    for ($intento = 1; $intento -le 36; $intento++) {
      Start-Sleep -Seconds 5
      & $dockerExe info *> $null
      if ($LASTEXITCODE -eq 0) {
        $dockerListo = $true
        break
      }
    }
  }

  if (-not $dockerListo) {
    throw "Docker no estuvo disponible después de 3 minutos."
  }

  Set-Location $proyecto
  $npx = (Get-Command npx.cmd -ErrorAction Stop).Source

  & $npx supabase db dump --linked --file (Join-Path $carpetaRespaldo "estructura.sql")
  if ($LASTEXITCODE -ne 0) {
    throw "Falló el respaldo de la estructura."
  }

  & $npx supabase db dump --linked --data-only --use-copy --file (Join-Path $carpetaRespaldo "datos.sql")
  if ($LASTEXITCODE -ne 0) {
    throw "Falló el respaldo de los datos."
  }

  "Respaldo completado correctamente el $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')." |
    Out-File -FilePath (Join-Path $carpetaRespaldo "RESPALDO_CORRECTO.txt") -Encoding utf8

  
  New-Item -ItemType Directory -Force -Path $destinoOneDrive | Out-Null
Copy-Item -Path $carpetaRespaldo -Destination $destinoOneDrive -Recurse -Force
Escribir-Log "OK $carpetaRespaldo"
  Write-Host "Respaldo completado correctamente en: $carpetaRespaldo" -ForegroundColor Green
  exit 0
}
catch {
  Escribir-Log "ERROR $($_.Exception.Message)"
  Write-Error $_.Exception.Message
  exit 1
}
