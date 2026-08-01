#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/compose/preview.yml}"
TASK_ID="${TASK_ID:-ci-$$}"
PROJECT_NAME="blocks_compose_smoke_${TASK_ID}"
TEMP_DIR="$(mktemp -d)"
ENV_FILE="$TEMP_DIR/.env.preview"
OFFSET=$(( $$ % 1000 ))
API_PORT=$((23000 + OFFSET))
SYSTEM_PORT=$((24000 + OFFSET))
FILE_PORT=$((25000 + OFFSET))
WEB_PORT=$((26000 + OFFSET))
POSTGRES_PORT=$((27000 + OFFSET))

cleanup() {
  docker compose --project-directory "$ROOT_DIR" --env-file "$ENV_FILE" -p "$PROJECT_NAME" -f "$COMPOSE_FILE" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

cat > "$ENV_FILE" <<EOF
COMPOSE_PROJECT_NAME=$PROJECT_NAME
PREVIEW_TASK_ID=$TASK_ID
PREVIEW_TAG=local
PREVIEW_IMAGE_PREFIX=blocks-compose-validation
ASPNETCORE_ENVIRONMENT=Development
POSTGRES_DB=${PROJECT_NAME}
POSTGRES_USER=blocks
POSTGRES_PASSWORD=compose-runtime-password
SYSTEM_JWT_KEY=compose-runtime-validation-key-at-least-32-bytes
POSTGRES_PORT=$POSTGRES_PORT
POSTGRES_VOLUME_NAME=${PROJECT_NAME}_data
API_GATEWAY_PORT=$API_PORT
SYSTEM_SERVICE_PORT=$SYSTEM_PORT
FILE_SERVICE_PORT=$FILE_PORT
WEB_PORT=$WEB_PORT
EOF

wait_url() {
  local name="$1"
  local url="$2"
  for _ in $(seq 1 60); do
    if curl --fail --silent --show-error "$url" >/dev/null; then
      printf '%s ok: %s\n' "$name" "$url"
      return 0
    fi
    sleep 2
  done
  docker compose --project-directory "$ROOT_DIR" --env-file "$ENV_FILE" -p "$PROJECT_NAME" -f "$COMPOSE_FILE" ps >&2 || true
  docker compose --project-directory "$ROOT_DIR" --env-file "$ENV_FILE" -p "$PROJECT_NAME" -f "$COMPOSE_FILE" logs --no-color >&2 || true
  return 1
}

docker compose --project-directory "$ROOT_DIR" --env-file "$ENV_FILE" -p "$PROJECT_NAME" -f "$COMPOSE_FILE" config --quiet
docker compose --project-directory "$ROOT_DIR" --env-file "$ENV_FILE" -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up -d --build

wait_url system-service "http://127.0.0.1:$SYSTEM_PORT/health"
wait_url file-service "http://127.0.0.1:$FILE_PORT/health"
wait_url api-gateway "http://127.0.0.1:$API_PORT/health"
wait_url web "http://127.0.0.1:$WEB_PORT/"

running_services="$(docker compose --project-directory "$ROOT_DIR" --env-file "$ENV_FILE" -p "$PROJECT_NAME" -f "$COMPOSE_FILE" ps --status running --services)"
for service in postgres system-service file-service api-gateway web; do
  grep -qx "$service" <<< "$running_services"
done

printf 'compose runtime ok\n'
