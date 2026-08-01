#!/usr/bin/env bash
set -euo pipefail

# Example only. Keep real deployment control planes and credentials private.
ROOT_DIR=${ROOT_DIR:-}
ENV_FILE=${ENV_FILE:-}
COMPOSE_FILE=${COMPOSE_FILE:-}
HEALTHCHECK_URL=${HEALTHCHECK_URL:-}
TRADELAB_HEALTH_URL=${TRADELAB_HEALTH_URL:-}
WEB_URL=${WEB_URL:-}
test -n ${ROOT_DIR:-} || exit 1
test -n ${ENV_FILE:-} || exit 1
test -n ${COMPOSE_FILE:-} || exit 1
test -n ${HEALTHCHECK_URL:-} || exit 1
test -n ${TRADELAB_HEALTH_URL:-} || exit 1
test -n ${WEB_URL:-} || exit 1
compose=(docker compose --project-directory $ROOT_DIR --env-file $ENV_FILE -f $COMPOSE_FILE)
${compose[@]} config --quiet
${compose[@]} pull
${compose[@]} up -d --remove-orphans
curl -fsS $TRADELAB_HEALTH_URL >/dev/null
curl -fsS $HEALTHCHECK_URL >/dev/null
curl -fsS $WEB_URL >/dev/null
printf 'example deployment smoke check passed\n'
