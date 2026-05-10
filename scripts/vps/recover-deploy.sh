#!/usr/bin/env bash
set -euo pipefail

cd /root/carelearn-pro

echo "=== Git pull latest ==="
git fetch origin
git reset --hard origin/main

echo "=== Compose status before rebuild ==="
docker compose --env-file .env.production -f docker-compose.production.yml ps || true

echo "=== Compose config check ==="
docker compose --env-file .env.production -f docker-compose.production.yml config > /tmp/carelearn-compose-expanded.yml

echo "=== Container logs (last 50 lines each) ==="
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=50 web   || true
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=50 api   || true
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=50 nginx || true

echo "=== Tearing down ==="
docker compose --env-file .env.production -f docker-compose.production.yml down --remove-orphans

echo "=== Pruning builder cache ==="
docker builder prune -af
docker image prune -af

echo "=== Rebuilding ==="
docker compose --env-file .env.production -f docker-compose.production.yml build --no-cache

echo "=== Starting stack ==="
docker compose --env-file .env.production -f docker-compose.production.yml up -d

echo "=== Waiting 30s for containers to settle ==="
sleep 30

echo "=== Post-start status ==="
docker compose --env-file .env.production -f docker-compose.production.yml ps

echo "=== Post-start logs ==="
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=80 web   || true
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=80 api   || true
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=80 nginx || true

echo "=== Connectivity checks ==="
curl -sf --max-time 10 http://localhost               && echo "HTTP /         : OK"  || echo "HTTP /         : FAILED"
curl -sf --max-time 10 http://localhost/api/v1/health && echo "API health     : OK"  || echo "API health     : FAILED"
