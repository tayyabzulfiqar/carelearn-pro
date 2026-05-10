#!/usr/bin/env bash
set -euo pipefail

cd /root/carelearn-pro

echo "== Compose status =="
docker compose --env-file .env.production -f docker-compose.production.yml ps

echo "== Compose config check =="
docker compose --env-file .env.production -f docker-compose.production.yml config >/tmp/carelearn-compose-expanded.yml

echo "== Recent logs =="
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=200 web || true
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=200 api || true
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=200 nginx || true
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=200 edge || true

echo "== Rebuild and restart =="
docker compose --env-file .env.production -f docker-compose.production.yml down --remove-orphans
docker builder prune -af
docker image prune -af
git fetch origin
git reset --hard origin/main
npm run web:prebuild
docker compose --env-file .env.production -f docker-compose.production.yml build --no-cache
docker compose --env-file .env.production -f docker-compose.production.yml up -d

echo "== Post checks =="
docker compose --env-file .env.production -f docker-compose.production.yml ps
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=80 web || true
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=80 api || true
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=80 nginx || true
curl -I --max-time 20 http://localhost
curl -I --max-time 20 http://localhost/api/v1/health
