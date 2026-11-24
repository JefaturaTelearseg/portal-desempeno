# Servidor local SOLO para trabajar en esta computadora: http://localhost:8081/
# Basado en servidor-referencia.ps1 (Plantilla TeleArseg). El Portal de Monitoreo usa el 8080.
# - Sirve la pagina (public\)
# - Guarda las evaluaciones y parametros del administrador en data\datos.json (con respaldo)
param([int]$Puerto = 8081)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
$data = Join-Path $raiz 'data'
New-Item -ItemType Directory -Force (Join-Path $data 'respaldos') | Out-Null
$utf8 = New-Object Text.UTF8Encoding $false
$tipos = @{ '.html' = 'text/html; charset=utf-8'; '.js' = 'application/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.gif' = 'image/gif'; '.webp' = 'image/webp'; '.svg' = 'image/svg+xml'; '.bmp' = 'image/bmp' }

function Responder($ctx, [int]$estado, $contenido, [string]$tipo = 'application/json; charset=utf-8', [string]$cache = 'no-store') {
  $ctx.Response.StatusCode = $estado
  $ctx.Response.ContentType = $tipo
  $ctx.Response.Headers['Cache-Control'] = $cache
  $bytes = if ($contenido -is [byte[]]) { $contenido } else { $utf8.GetBytes([string]$contenido) }
  # Texto (datos, código, estilos) se envía comprimido
  if ($bytes.Length -gt 1024 -and $tipo -match 'json|javascript|css|html' -and [string]$ctx.Request.Headers['Accept-Encoding'] -match 'gzip') {
    $ms = New-Object IO.MemoryStream
    $gz = New-Object IO.Compression.GZipStream($ms, [IO.Compression.CompressionLevel]::Fastest)
    $gz.Write($bytes, 0, $bytes.Length); $gz.Close()
    $bytes = $ms.ToArray()
    $ctx.Response.Headers['Content-Encoding'] = 'gzip'
  }
  # Con el tamaño declarado la respuesta sale de una vez
  $ctx.Response.ContentLength64 = $bytes.Length
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
}
function Leer-Cuerpo($ctx) {
  $ms = New-Object IO.MemoryStream
  $ctx.Request.InputStream.CopyTo($ms)
  return $ms.ToArray()
}

$memo = @{}
$archDatos = [IO.Path]::Combine($data, 'datos.json')
$l = New-Object Net.HttpListener
$l.Prefixes.Add("http://localhost:$Puerto/")
$l.Start()
Write-Host "Portal en http://localhost:$Puerto/public/  (Ctrl+C para detener)"
while ($l.IsListening) {
  $ctx = $l.GetContext()
  try {
    $req = $ctx.Request
    $ruta = [Uri]::UnescapeDataString($req.Url.AbsolutePath)

    if ($ruta -eq '/') { $ctx.Response.Redirect('/public/') }
    elseif ($ruta -eq '/api/sesion') {
      Responder $ctx 200 '{"rol":"admin","correo":"Esta computadora","local":true}'
    }
    elseif ($ruta -eq '/api/datos' -and $req.HttpMethod -eq 'GET') {
      $ctx.Response.Headers['X-Version'] = [string][IO.File]::GetLastWriteTimeUtc($archDatos).Ticks
      Responder $ctx 200 ([IO.File]::ReadAllBytes($archDatos))
    }
    elseif ($ruta -eq '/api/datos' -and $req.HttpMethod -eq 'PUT') {
      $cuerpo = $utf8.GetString((Leer-Cuerpo $ctx))
      $verCliente = [string]$req.Headers['X-Version']
      $verActual = [string][IO.File]::GetLastWriteTimeUtc($archDatos).Ticks
      if (-not $cuerpo.TrimStart().StartsWith('{')) { Responder $ctx 400 '{"error":"datos no validos"}' }
      elseif ($verCliente -ne $verActual) { Responder $ctx 409 '{"error":"version vieja"}' }
      else {
        $sello = Get-Date -Format 'yyyyMMdd-HHmmss'
        if (Test-Path $archDatos) { Copy-Item $archDatos (Join-Path $data "respaldos\datos-$sello.json") }
        Get-ChildItem (Join-Path $data 'respaldos') -Filter 'datos-2*.json' | Sort-Object Name -Descending | Select-Object -Skip 50 | Remove-Item -Force
        [IO.File]::WriteAllText($archDatos, $cuerpo, $utf8)
        $motivo = [Uri]::UnescapeDataString([string]$req.Headers['X-Motivo'])
        Add-Content -LiteralPath (Join-Path $data 'cambios.log') -Value ("{0} | {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $motivo) -Encoding UTF8
        $ctx.Response.Headers['X-Version'] = [string](Get-Item $archDatos).LastWriteTimeUtc.Ticks
        Responder $ctx 200 '{"ok":true}'
      }
    }
    else {
      if ($ruta.EndsWith('/')) { $ruta += 'index.html' }
      $archivo = [IO.Path]::GetFullPath([IO.Path]::Combine($raiz, $ruta.TrimStart('/')))
      if ($archivo.StartsWith($raiz) -and -not $archivo.StartsWith($data) -and [IO.File]::Exists($archivo)) {
        $ext = [IO.Path]::GetExtension($archivo).ToLower()
        $tipo = if ($tipos.ContainsKey($ext)) { $tipos[$ext] } else { 'application/octet-stream' }
        # Imágenes: el navegador las guarda 30 días. El resto se revalida y responde 304 si no cambió.
        $mod = [IO.File]::GetLastWriteTimeUtc($archivo)
        $fecha = $mod.ToString('R')
        $cache = if ($ruta.StartsWith('/public/img/')) { 'public, max-age=2592000' } else { 'no-cache' }
        $ctx.Response.Headers['Last-Modified'] = $fecha
        if ([string]$req.Headers['If-Modified-Since'] -eq $fecha) {
          $ctx.Response.StatusCode = 304; $ctx.Response.Headers['Cache-Control'] = $cache
        } else {
          $m = $memo[$archivo]
          if (-not $m -or $m.t -ne $mod.Ticks) { $m = @{ t = $mod.Ticks; b = [IO.File]::ReadAllBytes($archivo) }; $memo[$archivo] = $m }
          Responder $ctx 200 $m.b $tipo $cache
        }
      } else { Responder $ctx 404 '{"error":"no encontrado"}' }
    }
  } catch {
    try { Responder $ctx 500 ('{"error":"' + ($_.Exception.Message -replace '"', "'") + '"}') } catch {}
  }
  try { $ctx.Response.Close() } catch {}
}
