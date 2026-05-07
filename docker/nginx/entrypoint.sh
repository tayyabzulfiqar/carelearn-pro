#!/usr/bin/env sh
set -eu

if [ -z "${DOMAIN:-}" ]; then
  echo "DOMAIN env var is required"
  exit 1
fi

envsubst '${DOMAIN}' < /etc/nginx/conf.d/carelearn.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'