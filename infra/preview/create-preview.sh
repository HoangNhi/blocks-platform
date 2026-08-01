#!/usr/bin/env bash
set -euo pipefail

TASK_ID="${1:-}"
if [[ -z "$TASK_ID" ]]; then
  echo "Usage: $0 <task-id>" >&2
  exit 1
fi

if [[ ! "$TASK_ID" =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]]; then
  echo "task-id must match ^[a-z0-9][a-z0-9-]{0,62}$" >&2
  exit 1
fi

ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
TEMPLATE_ENV="${TEMPLATE_ENV:-$ROOT_DIR/.env.preview.example}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/compose/preview.yml}"
PREVIEW_DIR="${PREVIEW_DIR:-$ROOT_DIR/.preview/$TASK_ID}"
ENV_FILE="$PREVIEW_DIR/.env.preview"

mkdir -p "$PREVIEW_DIR"
cp "$TEMPLATE_ENV" "$ENV_FILE"

OFFSET=$(python3 - <<'PY'
import os,sys,zlib
s=os.environ['TASK_ID'].encode()
print(zlib.crc32(s)%2000)
PY
)

API_PORT=$((15000 + OFFSET))
SYSTEM_PORT=$((16000 + OFFSET))
FILE_PORT=$((17000 + OFFSET))
WEB_PORT=$((18000 + OFFSET))
POSTGRES_PORT=$((19000 + OFFSET))

sed -i \
  -e "s/^COMPOSE_PROJECT_NAME=.*/COMPOSE_PROJECT_NAME=blocks_preview_${TASK_ID}/" \
  -e "s/^PREVIEW_TASK_ID=.*/PREVIEW_TASK_ID=${TASK_ID}/" \
  -e "s/^POSTGRES_DB=.*/POSTGRES_DB=blocks_preview_${TASK_ID}/" \
  -e "s/^POSTGRES_VOLUME_NAME=.*/POSTGRES_VOLUME_NAME=blocks_preview_${TASK_ID}_data/" \
  -e "s/^API_GATEWAY_PORT=.*/API_GATEWAY_PORT=${API_PORT}/" \
  -e "s/^SYSTEM_SERVICE_PORT=.*/SYSTEM_SERVICE_PORT=${SYSTEM_PORT}/" \
  -e "s/^FILE_SERVICE_PORT=.*/FILE_SERVICE_PORT=${FILE_PORT}/" \
  -e "s/^WEB_PORT=.*/WEB_PORT=${WEB_PORT}/" \
  -e "s/^POSTGRES_PORT=.*/POSTGRES_PORT=${POSTGRES_PORT}/" \
  "$ENV_FILE"

if ! grep -q '^POSTGRES_PASSWORD=' "$ENV_FILE"; then
  echo 'POSTGRES_PASSWORD=change-me' >> "$ENV_FILE"
fi

if grep -q '^POSTGRES_PASSWORD=change-me$' "$ENV_FILE"; then
  echo "Set POSTGRES_PASSWORD in $ENV_FILE before start" >&2
  exit 1
fi

if ! grep -q '^SYSTEM_JWT_KEY=' "$ENV_FILE" || grep -q '^SYSTEM_JWT_KEY=change-me$' "$ENV_FILE"; then
  echo "Set SYSTEM_JWT_KEY in $ENV_FILE before start" >&2
  exit 1
fi

cd "$ROOT_DIR"
docker compose --project-directory "$ROOT_DIR" --env-file "$ENV_FILE" -p "blocks_preview_${TASK_ID}" -f "$COMPOSE_FILE" up -d --build

echo "preview task=$TASK_ID"
echo "env=$ENV_FILE"
echo "web=http://127.0.0.1:${WEB_PORT}"
echo "api=http://127.0.0.1:${API_PORT}/health"
