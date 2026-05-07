#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="docker-compose.production.yml"

if [[ ! -f .env.production ]]; then
  echo "Missing .env.production. Copy .env.production.example first."
  exit 1
fi

set -a
source .env.production
set +a

docker compose -f "$COMPOSE_FILE" up -d --build postgres api web nginx

docker compose -f "$COMPOSE_FILE" run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" \
  --email "$LETSENCRYPT_EMAIL" \
  --agree-tos --no-eff-email

docker compose -f "$COMPOSE_FILE" restart nginx

echo "Production deploy complete."