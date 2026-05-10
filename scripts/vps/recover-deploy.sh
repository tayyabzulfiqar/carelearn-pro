#!/usr/bin/env bash
set -euo pipefail

cd /root/carelearn-pro

echo "== Compose status =="
docker compose --env-file .env.production -f docker-compose.production.yml ps

echo "== Recent logs =="
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=200 web || true
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=200 api || true
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=200 nginx || true

echo "== Rebuild and restart =="
docker compose --env-file .env.production -f docker-compose.production.yml down --remove-orphans
docker builder prune -af
docker image prune -af
git fetch origin
git reset --hard origin/main
docker compose --env-file .env.production -f docker-compose.production.yml build --no-cache
docker compose --env-file .env.production -f docker-compose.production.yml up -d

echo "== Post checks =="
docker compose --env-file .env.production -f docker-compose.production.yml ps
curl -I --max-time 20 http://localhost
curl -I --max-time 20 http://localhost/api/v1/health
