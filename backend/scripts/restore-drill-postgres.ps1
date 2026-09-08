[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string]$BackupPath,
  [Parameter(Mandatory = $true)] [string]$TargetDatabase,
  [string]$PgBinDir = $env:PG_BIN_DIR
)

$ErrorActionPreference = 'Stop'
if (!$TargetDatabase.StartsWith('amc_restore_drill_')) {
  throw 'Por seguridad, la base de simulacro debe comenzar por amc_restore_drill_.'
}
if ($TargetDatabase -eq $env:PGDATABASE) { throw 'No se permite restaurar sobre la base de producción.' }
if (!(Test-Path -LiteralPath $BackupPath)) { throw 'No se encontró el archivo de backup indicado.' }
if ([string]::IsNullOrWhiteSpace($PgBinDir)) { $PgBinDir = 'C:\Program Files\PostgreSQL\18\bin' }
$createdb = Join-Path $PgBinDir 'createdb.exe'
$pgRestore = Join-Path $PgBinDir 'pg_restore.exe'
if (!(Test-Path -LiteralPath $createdb) -or !(Test-Path -LiteralPath $pgRestore)) { throw 'Configure PG_BIN_DIR con las herramientas de PostgreSQL.' }

& $pgRestore --list $BackupPath | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'El archivo no es un backup PostgreSQL válido.' }

& $createdb $TargetDatabase
if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear la base de simulacro.' }
& $pgRestore --dbname=$TargetDatabase --no-owner --no-privileges $BackupPath
if ($LASTEXITCODE -ne 0) { throw 'La restauración de simulacro falló.' }
Write-Output "Simulacro terminado correctamente en $TargetDatabase. Revise tablas y conteos antes de eliminar esa base."
