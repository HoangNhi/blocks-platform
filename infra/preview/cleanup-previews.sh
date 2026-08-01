#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
PREVIEW_ROOT="${PREVIEW_ROOT:-$ROOT_DIR/.preview}"
MAX_AGE_DAYS="${MAX_AGE_DAYS:-3}"

if [[ ! -d "$PREVIEW_ROOT" ]]; then
  exit 0
fi

find "$PREVIEW_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime "+$MAX_AGE_DAYS" | while read -r dir; do
  task_id="$(basename "$dir")"
  "$ROOT_DIR/infra/preview/destroy-preview.sh" "$task_id" || true
done
