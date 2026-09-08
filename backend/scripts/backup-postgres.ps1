[CmdletBinding()]
param(
  [ValidateRange(1, 3650)]
  [int]$RetentionDays = 30,
  [string]$PgBinDir = $env:PG_BIN_DIR
)

$ErrorActionPreference = 'Stop'

# Credenciales y destino se obtienen exclusivamente de variables de entorno o
# del Programador de tareas. Nunca se guardan en el repositorio.
$backupDir = $env:AMC_BACKUP_DIR
if ([string]::IsNullOrWhiteSpace($backupDir)) {
  throw 'Defina AMC_BACKUP_DIR en una unidad distinta al proyecto, por ejemplo D:\AMC-Backups.'
}
if ([string]::IsNullOrWhiteSpace($env:PGHOST) -or [string]::IsNullOrWhiteSpace($env:PGDATABASE) -or [string]::IsNullOrWhiteSpace($env:PGUSER) -or [string]::IsNullOrWhiteSpace($env:PGPASSWORD)) {
  throw 'Defina PGHOST, PGDATABASE, PGUSER y PGPASSWORD antes de ejecutar el backup.'
}

if ([string]::IsNullOrWhiteSpace($PgBinDir)) { $PgBinDir = 'C:\Program Files\PostgreSQL\18\bin' }
$pgDump = Join-Path $PgBinDir 'pg_dump.exe'
$pgRestore = Join-Path $PgBinDir 'pg_restore.exe'
if (!(Test-Path -LiteralPath $pgDump) -or !(Test-Path -LiteralPath $pgRestore)) {
  throw "No se encontraron pg_dump.exe y pg_restore.exe en $PgBinDir. Configure PG_BIN_DIR."
}

$resolvedBackupDir = [System.IO.Path]::GetFullPath($backupDir)
New-Item -ItemType Directory -Path $resolvedBackupDir -Force | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$baseName = "amc-postgres-$timestamp"
$partialPath = Join-Path $resolvedBackupDir "$baseName.partial"
$backupPath = Join-Path $resolvedBackupDir "$baseName.backup"
$manifestPath = Join-Path $resolvedBackupDir "$baseName.manifest.json"

try {
  & $pgDump --format=custom --compress=9 --no-owner --no-privileges --file=$partialPath
  if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $partialPath)) { throw 'pg_dump no finalizó correctamente.' }

  # Verifica la estructura del backup antes de marcarlo como utilizable.
  & $pgRestore --list $partialPath | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'El backup generado no superó la verificación de pg_restore.' }

  Move-Item -LiteralPath $partialPath -Destination $backupPath -Force
  $file = Get-Item -LiteralPath $backupPath
  $hash = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash
  $manifest = [ordered]@{
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
    database = $env:PGDATABASE
    format = 'PostgreSQL custom'
    file = $file.Name
    bytes = $file.Length
    sha256 = $hash
    verifiedWith = 'pg_restore --list'
    retentionDays = $RetentionDays
  }
  $manifest | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding UTF8

  # Solo elimina backups AMC ya vencidos y sus manifiestos asociados.
  $cutoff = (Get-Date).AddDays(-$RetentionDays)
  Get-ChildItem -LiteralPath $resolvedBackupDir -Filter 'amc-postgres-*.backup' -File |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    ForEach-Object {
      $expiredManifest = [System.IO.Path]::ChangeExtension($_.FullName, '.manifest.json')
      Remove-Item -LiteralPath $_.FullName -Force
      if (Test-Path -LiteralPath $expiredManifest) { Remove-Item -LiteralPath $expiredManifest -Force }
    }

  Write-Output "Backup verificado: $backupPath"
} catch {
  if (Test-Path -LiteralPath $partialPath) { Remove-Item -LiteralPath $partialPath -Force }
  throw
}
