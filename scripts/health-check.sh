#!/usr/bin/env bash
set -euo pipefail

set -a
source .env.production
set +a

docker compose -f docker-compose.production.yml ps
curl -fsS "https://${DOMAIN}/" >/dev/null
curl -fsS "https://${DOMAIN}/api/v1/courses" -H "Authorization: Bearer ${SMOKE_TEST_TOKEN:-invalid}" >/dev/null || true
docker compose -f docker-compose.production.yml exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"

echo "Health checks complete."