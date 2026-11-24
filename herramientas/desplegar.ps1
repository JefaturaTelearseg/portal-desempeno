# Publica el API del portal en Cloudflare (base de datos con usuarios y evaluaciones).
# La página sigue en GitHub Pages: https://jefaturatelearseg.github.io/portal-desempeno/public/
#   .\desplegar.ps1              -> actualiza el API (los datos de la nube NO se tocan)
#   .\desplegar.ps1 -SubirDatos  -> REEMPLAZA parámetros, horario y turnos de la nube por data\datos.json (las evaluaciones no se tocan)
param([switch]$SubirDatos)
$ErrorActionPreference = 'Stop'
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
$raiz = Split-Path $PSScriptRoot -Parent
$cf = Join-Path $raiz 'cloudflare'
$proyecto = 'portal-desempeno'
$base = 'portal-desempeno'
$utf8 = New-Object Text.UTF8Encoding $false
Set-Location $cf

# wrangler escribe avisos en la salida de errores: solo cuenta el código de salida
function Wr { $ErrorActionPreference = 'Continue'; & wrangler @args 2>&1 | ForEach-Object { "$_" }; if ($LASTEXITCODE) { throw "wrangler $($args -join ' ') falló" } }
function Sql([string]$texto) {
  $tmp = Join-Path $env:TEMP 'portal-desempeno.sql'
  [IO.File]::WriteAllText($tmp, $texto, $utf8)
  Wr d1 execute $base --remote --file $tmp --yes
  Remove-Item $tmp
}
function Consulta([string]$texto) {
  $ErrorActionPreference = 'Continue'
  $s = (& wrangler d1 execute $base --remote --command $texto --json 2>$null) -join "`n"
  if ($LASTEXITCODE) { throw "consulta falló: $texto" }
  return ($s | ConvertFrom-Json)[0].results
}

# 1) Base de datos y archivo de configuración: solo la primera vez
$toml = Join-Path $cf 'wrangler.toml'
if (-not (Test-Path $toml)) {
  $salida = (& wrangler d1 create $base 2>&1) -join "`n"
  $id = [regex]::Match($salida, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}').Value
  if (-not $id) { throw "No se pudo crear la base de datos:`n$salida" }
  [IO.File]::WriteAllText($toml, @"
name = "$proyecto"
pages_build_output_dir = "./sitio"
compatibility_date = "2026-11-01"

[[d1_databases]]
binding = "DB"
database_name = "$base"
database_id = "$id"
"@, $utf8)
  Write-Host "Base de datos creada: $id"
}
Sql ([IO.File]::ReadAllText((Join-Path $cf 'esquema.sql')))

# 2) Datos iniciales: la primera vez (o con -SubirDatos) se cargan desde esta PC
$hay = @(Consulta "SELECT clave FROM config WHERE clave = 'datos'").Count
if ($SubirDatos -or -not $hay) {
  $d = [IO.File]::ReadAllText((Join-Path $raiz 'data\datos.json'), $utf8) | ConvertFrom-Json
  $evs = $d.evaluaciones
  $d.PSObject.Properties.Remove('evaluaciones')
  $txt = ($d | ConvertTo-Json -Depth 30 -Compress) -replace "'", "''"
  $sql = "INSERT INTO config (clave, valor) VALUES ('datos', '$txt') ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor;`n"
  $sql += "INSERT INTO config (clave, valor) VALUES ('version', '$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())') ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor;`n"
  if (-not $hay -and $evs) {
    foreach ($sem in $evs.PSObject.Properties) { foreach ($op in $sem.Value.PSObject.Properties) {
      $j = ($op.Value | ConvertTo-Json -Depth 10 -Compress) -replace "'", "''"
      $sql += "INSERT OR IGNORE INTO evaluaciones (semana, op, datos, por, creado) VALUES ('$($sem.Name)', '$($op.Name)', '$j', 'esta computadora', '$((Get-Date).ToString('s'))');`n"
    } }
  }
  Sql $sql
  Write-Host 'Datos cargados en la nube.'
}

# 3) Sitio mínimo: quien abra la dirección de Cloudflare va a la página de GitHub
$sitio = Join-Path $cf 'sitio'
New-Item -ItemType Directory -Force $sitio | Out-Null
[IO.File]::WriteAllText((Join-Path $sitio 'index.html'), '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=https://jefaturatelearseg.github.io/portal-desempeno/public/"><title>Portal de Desempeño</title>', $utf8)

# 4) Proyecto, clave secreta de sesiones y código para crear la cuenta de administrador: solo la primera vez
$ErrorActionPreference = 'Continue'
$proyectos = (& wrangler pages project list 2>&1) -join "`n"
$ErrorActionPreference = 'Stop'
if ($proyectos -notmatch [regex]::Escape($proyecto)) {
  Wr pages project create $proyecto --production-branch main
  $secreto = -join ((1..48) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
  $secreto | & wrangler pages secret put SECRETO --project-name $proyecto
  $codigo = -join ((1..8) | ForEach-Object { 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[(Get-Random -Maximum 32)] })
  $codigo | & wrangler pages secret put CODIGO --project-name $proyecto
  [IO.File]::WriteAllText((Join-Path $raiz 'data\codigo-inicial.txt'), "Código para crear tu cuenta de administrador (solo sirve una vez): $codigo`r`n", $utf8)
  Write-Host 'Código inicial guardado en data\codigo-inicial.txt'
}

# 5) Publicar
Wr pages deploy sitio --project-name $proyecto --branch main --commit-dirty=true
Write-Host "Listo: https://$proyecto.pages.dev/api/estado"
