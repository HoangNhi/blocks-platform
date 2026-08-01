#!/usr/bin/env bash
set -euo pipefail

# Example only. Keep real deployment control planes and credentials private.
ROOT_DIR=${ROOT_DIR:-}
ENV_FILE=${ENV_FILE:-}
COMPOSE_FILE=${COMPOSE_FILE:-}
FILE_STORAGE_PATH=${FILE_STORAGE_PATH:-}
HEALTHCHECK_URL=${HEALTHCHECK_URL:-}
test -n ${ROOT_DIR:-} || exit 1
test -n ${ENV_FILE:-} || exit 1
test -n ${COMPOSE_FILE:-} || exit 1
test -n ${FILE_STORAGE_PATH:-} || exit 1
test -n ${HEALTHCHECK_URL:-} || exit 1

compose=(docker compose --project-directory $ROOT_DIR --env-file $ENV_FILE -f $COMPOSE_FILE)
${compose[@]} config --quiet
${compose[@]} pull file-service
${compose[@]} up -d --no-deps file-service
curl -fsS $HEALTHCHECK_URL >/dev/null
printf 'file-service example smoke check passed\n'
