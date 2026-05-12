#!/usr/bin/env bash
# Run this as root on the VPS from /root/carelearn-pro
# Usage: bash scripts/vps/fix-and-redeploy.sh
set -euo pipefail

COMPOSE="docker compose -f docker-compose.production.yml"
ENV_FILE=".env.production"

echo "=== [1/7] Pulling latest code ==="
git pull origin main

echo "=== [2/7] Verifying .env.production ==="
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found. Copy .env.production.example and fill in values."
  exit 1
fi

# Ensure NEXT_PUBLIC_API_URL is set (required build-time variable)
if ! grep -q "^NEXT_PUBLIC_API_URL=http" "$ENV_FILE"; then
  echo "WARNING: NEXT_PUBLIC_API_URL is missing or empty in $ENV_FILE"
  echo "  It must be set BEFORE building, e.g.:"
  echo "  NEXT_PUBLIC_API_URL=http://187.127.105.253/api/v1"
  echo ""
  echo "  Patching it now for bare-IP deployment..."
  # Remove any existing blank/empty line and add correct value
  sed -i '/^NEXT_PUBLIC_API_URL=/d' "$ENV_FILE"
  echo "NEXT_PUBLIC_API_URL=http://187.127.105.253/api/v1" >> "$ENV_FILE"
  echo "  Patched."
fi

echo "=== [3/7] Stopping existing stack ==="
$COMPOSE down --remove-orphans || true

echo "=== [4/7] Rebuilding web image (no cache) ==="
# Load env so NEXT_PUBLIC_API_URL is available as build-arg
set -a; source "$ENV_FILE"; set +a
$COMPOSE build --no-cache \
  --build-arg NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL" \
  web

echo "=== [5/7] Rebuilding api image ==="
$COMPOSE build --no-cache api

echo "=== [6/7] Starting full stack ==="
$COMPOSE up -d postgres
echo "  Waiting for postgres to become healthy..."
timeout 60 bash -c 'until docker inspect carelearn-postgres --format "{{.State.Health.Status}}" 2>/dev/null | grep -q healthy; do sleep 3; done'

$COMPOSE up -d api
echo "  Waiting for api to become healthy (up to 90s)..."
timeout 90 bash -c 'until docker inspect carelearn-api --format "{{.State.Health.Status}}" 2>/dev/null | grep -q healthy; do sleep 5; done'

$COMPOSE up -d web
echo "  Waiting for web to become healthy (up to 120s)..."
timeout 120 bash -c 'until docker inspect carelearn-web --format "{{.State.Health.Status}}" 2>/dev/null | grep -q healthy; do sleep 5; done'

$COMPOSE up -d nginx
echo "  Waiting for nginx to start (10s)..."
sleep 10

echo "=== [7/7] Verification ==="
echo ""
echo "--- Container status ---"
$COMPOSE ps

echo ""
echo "--- Health states ---"
for c in carelearn-postgres carelearn-api carelearn-web carelearn-edge; do
  STATUS=$(docker inspect "$c" --format "{{.State.Status}} / health={{.State.Health.Status}}" 2>/dev/null || echo "not found")
  echo "  $c: $STATUS"
done

echo ""
echo "--- HTTP checks ---"
HTTP_FRONT=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://127.0.0.1/ || echo "FAIL")
HTTP_API=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://127.0.0.1/api/v1/health || echo "FAIL")
API_BODY=$(curl -s --max-time 10 http://127.0.0.1/api/v1/health || echo "no response")

echo "  Frontend  http://187.127.105.253/          → HTTP $HTTP_FRONT"
echo "  API       http://187.127.105.253/api/v1/health → HTTP $HTTP_API"
echo "  API body: $API_BODY"

echo ""
if [[ "$HTTP_FRONT" == "200" ]] && [[ "$HTTP_API" == "200" ]]; then
  echo "SUCCESS: Stack is fully healthy and serving traffic."
else
  echo "ATTENTION: One or more checks did not return 200."
  echo "Showing recent web container logs:"
  docker logs carelearn-web --tail 40
  echo ""
  echo "Showing recent nginx logs:"
  docker logs carelearn-edge --tail 20
fi
