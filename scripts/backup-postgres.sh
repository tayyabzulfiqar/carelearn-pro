#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TS="$(date +%Y%m%d_%H%M%S)"
FILE="$BACKUP_DIR/postgres_${TS}.sql.gz"
mkdir -p "$BACKUP_DIR"

set -a
source .env.production
set +a

docker compose -f docker-compose.production.yml exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$FILE"

echo "Backup created: $FILE"