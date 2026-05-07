#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${1:-}" ]]; then
  echo "Usage: $0 <backup.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file not found: $BACKUP_FILE"
  exit 1
fi

set -a
source .env.production
set +a

gunzip -c "$BACKUP_FILE" | docker compose -f docker-compose.production.yml exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

echo "Restore complete from $BACKUP_FILE"