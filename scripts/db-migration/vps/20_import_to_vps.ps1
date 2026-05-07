param(
  [Parameter(Mandatory = $true)] [string]$VpsUrl,
  [string]$InDir = "scripts/db-migration/vps/out"
)

$ErrorActionPreference = "Stop"

psql $VpsUrl -v ON_ERROR_STOP=1 -f "scripts/db-migration/vps/01_create_staging_tables.sql"

$tables = @("users","enrollments","assessment_attempts","progress","certificates")
foreach ($t in $tables) {
  $file = Join-Path $InDir "$t.csv"
  psql $VpsUrl -v ON_ERROR_STOP=1 -c "\copy migration_stage.$t from '$file' csv header"
}

psql $VpsUrl -v ON_ERROR_STOP=1 -f "scripts/db-migration/vps/02a_map_content_foreign_keys.sql"
psql $VpsUrl -v ON_ERROR_STOP=1 -f "scripts/db-migration/vps/02_merge_users.sql"
psql $VpsUrl -v ON_ERROR_STOP=1 -f "scripts/db-migration/vps/03_merge_enrollments.sql"
psql $VpsUrl -v ON_ERROR_STOP=1 -f "scripts/db-migration/vps/04_merge_assessment_attempts.sql"
psql $VpsUrl -v ON_ERROR_STOP=1 -f "scripts/db-migration/vps/05_merge_progress.sql"
psql $VpsUrl -v ON_ERROR_STOP=1 -f "scripts/db-migration/vps/06_merge_certificates.sql"
psql $VpsUrl -v ON_ERROR_STOP=1 -f "scripts/db-migration/vps/99_post_checks.sql"

Write-Host "VPS import/merge complete."
