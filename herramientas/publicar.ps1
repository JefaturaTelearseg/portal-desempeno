# Publica la copia de solo lectura en GitHub Pages (repositorio publico).
# Sube la pagina y data\datos.json. Ejecutalo cada vez que quieras actualizar lo que ven los demas.
param([string]$Mensaje = ('Actualizacion ' + (Get-Date -Format 'yyyy-MM-dd HH:mm')))
$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
Push-Location $raiz
try {
  git add -A
  git diff --cached --quiet
  if ($LASTEXITCODE -eq 0) { Write-Host 'No hay cambios para publicar.' }
  else {
    git commit -m $Mensaje | Out-Null
    git push origin main
    Write-Host 'Publicado. GitHub tarda 1 o 2 minutos en actualizar la pagina.'
  }
} finally { Pop-Location }
