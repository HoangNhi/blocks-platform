#!/usr/bin/env bash
set -euo pipefail

TASK_ID="${1:-}"
if [[ -z "$TASK_ID" ]]; then
  echo "Usage: $0 <task-id>" >&2
  exit 1
fi

ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/compose/preview.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.preview/$TASK_ID/.env.preview}"
PROJECT_NAME="blocks_preview_${TASK_ID}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

cd "$ROOT_DIR"
docker compose --project-directory "$ROOT_DIR" --env-file "$ENV_FILE" -p "$PROJECT_NAME" -f "$COMPOSE_FILE" down -v --remove-orphans
rm -rf "$ROOT_DIR/.preview/$TASK_ID"
echo "preview removed: $TASK_ID"
