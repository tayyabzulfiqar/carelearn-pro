#!/usr/bin/env sh
set -eu

if [ -z "${DOMAIN:-}" ]; then
  DOMAIN="_"
fi

envsubst '${DOMAIN}' < /etc/nginx/conf.d/carelearn.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
