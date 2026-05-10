#!/usr/bin/env sh
set -eu

if [ -z "${DOMAIN:-}" ]; then
  DOMAIN="_"
fi

CERT_FILE="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"

if [ -f "$CERT_FILE" ]; then
  echo "SSL cert found for ${DOMAIN} — enabling HTTPS"
  envsubst '${DOMAIN}' < /etc/nginx/conf.d/carelearn.conf.template > /etc/nginx/conf.d/default.conf
else
  echo "No SSL cert at ${CERT_FILE} — starting HTTP-only mode"
  envsubst '${DOMAIN}' < /etc/nginx/conf.d/carelearn-http.conf.template > /etc/nginx/conf.d/default.conf
fi

exec nginx -g 'daemon off;'
