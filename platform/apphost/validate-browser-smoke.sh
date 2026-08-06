#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
web_port="${BLOCKS_SMOKE_WEB_PORT:-15173}"
apphost_port="${BLOCKS_SMOKE_APPHOST_PORT:-15174}"
otlp_port="${BLOCKS_SMOKE_OTLP_PORT:-15175}"
mcp_port="${BLOCKS_SMOKE_MCP_PORT:-15176}"
resource_port="${BLOCKS_SMOKE_RESOURCE_PORT:-15177}"
runtime_environment="${BLOCKS_SMOKE_ENVIRONMENT:-Development}"
postgres_host="${BLOCKS_SMOKE_POSTGRES_HOST:-127.0.0.1}"
postgres_port="${BLOCKS_SMOKE_POSTGRES_PORT:-5432}"
postgres_database="${BLOCKS_SMOKE_POSTGRES_DATABASE:-blocks_apphost_smoke}"
postgres_user="${BLOCKS_SMOKE_POSTGRES_USER:-postgres}"
postgres_password="${BLOCKS_SMOKE_POSTGRES_PASSWORD:-apphost-smoke-password}"
evidence_dir="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/blocks-apphost-smoke"
apphost_log="$evidence_dir/apphost.log"
apphost_project="$repo_root/platform/apphost/Blocks.AppHost/Blocks.AppHost.csproj"
browser_screenshot="$evidence_dir/apphost-login.png"
apphost_pid=""

cleanup() {
  if [[ -n "$apphost_pid" ]] && kill -0 "$apphost_pid" 2>/dev/null; then
    kill -TERM -- "-$apphost_pid" 2>/dev/null || true
    for _ in {1..20}; do
      kill -0 "$apphost_pid" 2>/dev/null || break
      sleep 1
    done
    kill -KILL -- "-$apphost_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

mkdir -p "$evidence_dir"

python_database_url="postgresql+psycopg://${postgres_user}:${postgres_password}@${postgres_host}:${postgres_port}/${postgres_database}"
dotnet_connection="Host=${postgres_host};Port=${postgres_port};Database=${postgres_database};Username=${postgres_user};Password=${postgres_password}"

(
  cd "$repo_root/plugins/tradelab/service"
  DATABASE_URL="$python_database_url" \
  SEED_BASELINE_ON_STARTUP=false \
    uv sync --locked --python 3.12
  DATABASE_URL="$python_database_url" \
  SEED_BASELINE_ON_STARTUP=false \
    uv run python -c "from tradelab_api.db.models import Base; from tradelab_api.db.session import apply_schema_compatibility, get_engine; Base.metadata.create_all(bind=get_engine()); apply_schema_compatibility()"
)

dotnet ef database update \
  --project "$repo_root/plugins/ai-video-production/service/Blocks.AiVideoService/Blocks.AiVideoService.csproj" \
  --startup-project "$repo_root/plugins/ai-video-production/service/Blocks.AiVideoService/Blocks.AiVideoService.csproj" \
  --connection "$dotnet_connection" \
  -- --Jwt:Key="apphost-smoke-jwt-key-at-least-32-bytes"

dotnet build "$apphost_project" --configuration Release

setsid env \
  BLOCKS_APPHOST_SMOKE=true \
  BLOCKS_SMOKE_DATABASE_URL="$python_database_url" \
  BLOCKS_SMOKE_DOTNET_CONNECTION_STRING="$dotnet_connection" \
  BLOCKS_SMOKE_SYSTEM_JWT_KEY=apphost-smoke-jwt-key-at-least-32-bytes \
  BLOCKS_SMOKE_WEB_PORT="$web_port" \
  ASPNETCORE_ENVIRONMENT="$runtime_environment" \
  DOTNET_ENVIRONMENT="$runtime_environment" \
  ASPNETCORE_URLS="http://127.0.0.1:${apphost_port}" \
  ASPIRE_DASHBOARD_UNSECURED_ALLOW_ANONYMOUS=true \
  ASPIRE_ALLOW_UNSECURED_TRANSPORT=true \
  ASPIRE_DASHBOARD_OTLP_ENDPOINT_URL="http://127.0.0.1:${otlp_port}" \
  ASPIRE_DASHBOARD_MCP_ENDPOINT_URL="http://127.0.0.1:${mcp_port}" \
  ASPIRE_RESOURCE_SERVICE_ENDPOINT_URL="http://127.0.0.1:${resource_port}" \
  dotnet run \
    --project "$apphost_project" \
    --configuration Release \
    --no-build \
    --no-launch-profile \
    >"$apphost_log" 2>&1 &
apphost_pid=$!

web_url="http://127.0.0.1:${web_port}/"
dashboard_url="http://127.0.0.1:${apphost_port}/"
readiness_timeout_seconds="${BLOCKS_SMOKE_READINESS_TIMEOUT_SECONDS:-480}"
readiness_deadline=$((SECONDS + readiness_timeout_seconds))
web_ready=false
while (( SECONDS < readiness_deadline )); do
  if ! kill -0 "$apphost_pid" 2>/dev/null; then
    cat "$apphost_log"
    exit 1
  fi
  if curl --fail --silent --show-error --connect-timeout 2 --max-time 5 "$web_url" >/dev/null 2>&1; then
    web_ready=true
    break
  fi
  sleep 2
done

if [[ "$web_ready" != true ]]; then
  cat "$apphost_log"
  echo "=== AppHost process diagnostics ===" >&2
  ps -eo pid,ppid,stat,etime,args --forest | grep -E "PID|Blocks|uvicorn|uv |vite|node|dotnet|dcp" >&2 || true
  (
    cd "$repo_root/apps/web/Blocks.Web"
    APPHOST_DASHBOARD_URL="$dashboard_url" node --input-type=module <<'NODE'
import { chromium } from "playwright"

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.goto(process.env.APPHOST_DASHBOARD_URL, { waitUntil: "domcontentloaded", timeout: 15000 })
  await page.getByRole("heading", { name: "Resources" }).waitFor({ timeout: 15000 })
  await page.waitForTimeout(3000)
  console.error("=== Aspire resource states ===")
  console.error((await page.locator("main").innerText()).slice(-30000))

  await page.goto(new URL("/consolelogs", process.env.APPHOST_DASHBOARD_URL).href, {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  })
  await page.getByRole("heading", { name: "Console logs" }).waitFor({ timeout: 15000 })
  await page.waitForTimeout(3000)
  console.error("=== Aspire console logs ===")
  console.error((await page.locator("main").innerText()).slice(-60000))
} finally {
  await browser.close()
}
NODE
  ) || true
  echo "AppHost web endpoint did not become ready within ${readiness_timeout_seconds}s: $web_url" >&2
  exit 1
fi

(
  cd "$repo_root/apps/web/Blocks.Web"
  WEB_BASE_URL="$web_url" APPHOST_SMOKE_SCREENSHOT="$browser_screenshot" node --input-type=module <<'NODE'
import { chromium } from "playwright"

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.goto(process.env.WEB_BASE_URL, { waitUntil: "domcontentloaded" })
  await page.waitForURL("**/login")

  const username = page.locator('input[autocomplete="username"]')
  const password = page.locator('input[autocomplete="current-password"]')
  const submit = page.locator('button[type="submit"]')

  await username.fill("smoke-user")
  await password.fill("not-submitted")

  if (new URL(page.url()).pathname !== "/login") {
    throw new Error("Expected /login, received " + page.url())
  }
  if (await username.inputValue() !== "smoke-user") throw new Error("Username input mismatch")
  if ((await password.inputValue()).length !== 13) throw new Error("Password input mismatch")
  if (!(await submit.isVisible())) throw new Error("Submit button is not visible")

  await page.screenshot({ path: process.env.APPHOST_SMOKE_SCREENSHOT, fullPage: true })
} finally {
  await browser.close()
}
NODE
)

echo "PASS AppHost browser smoke: $web_url"
echo "Evidence: $apphost_log"
echo "Screenshot: $browser_screenshot"
