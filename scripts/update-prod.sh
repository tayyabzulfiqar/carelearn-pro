#!/usr/bin/env bash
set -euo pipefail

docker compose -f docker-compose.production.yml build api web
docker compose -f docker-compose.production.yml up -d --remove-orphans

echo "Production update complete."