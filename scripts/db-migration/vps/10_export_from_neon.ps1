param(
  [Parameter(Mandatory = $true)] [string]$NeonUrl,
  [string]$OutDir = "scripts/db-migration/vps/out"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$tables = @(
  "users",
  "enrollments",
  "assessment_attempts",
  "progress",
  "certificates"
)

foreach ($t in $tables) {
  $file = Join-Path $OutDir "$t.csv"
  psql $NeonUrl -v ON_ERROR_STOP=1 -c "\copy (select * from public.$t order by 1) to '$file' csv header"
}

Write-Host "Neon export complete -> $OutDir"
