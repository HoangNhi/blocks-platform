from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SMOKE_SCRIPT = ROOT / "platform" / "apphost" / "validate-browser-smoke.sh"
APPHOST_SOURCE = ROOT / "platform" / "apphost" / "Blocks.AppHost" / "AppHost.cs"


def test_apphost_readiness_probe_is_time_bounded() -> None:
    script = SMOKE_SCRIPT.read_text(encoding="utf-8")
    readiness_requests = [
        line.strip()
        for line in script.splitlines()
        if "curl --fail" in line and '"$web_url"' in line
    ]

    assert readiness_requests
    for request in readiness_requests:
        assert "--connect-timeout 2" in request
        assert "--max-time 5" in request

    assert 'readiness_timeout_seconds="${BLOCKS_SMOKE_READINESS_TIMEOUT_SECONDS:-480}"' in script
    assert "readiness_deadline=$((SECONDS + readiness_timeout_seconds))" in script
    assert "while (( SECONDS < readiness_deadline )); do" in script
    assert "for _ in {1..240}" not in script


def test_apphost_build_finishes_before_readiness_timer_starts() -> None:
    script = SMOKE_SCRIPT.read_text(encoding="utf-8")
    build_command = 'dotnet build "$apphost_project" --configuration Release'

    assert build_command in script
    assert script.index(build_command) < script.index("setsid env")
    assert '--project "$apphost_project"' in script
    assert "--configuration Release" in script
    assert "--no-build" in script


def test_apphost_smoke_configures_jwt_for_all_authenticated_dotnet_services() -> None:
    source = APPHOST_SOURCE.read_text(encoding="utf-8")

    assert source.count('.WithEnvironment("Jwt__Key", smokeJwtKey)') == 3
    assert source.count('.WithEnvironment("Jwt__Issuer", "BlocksSmoke")') == 3
    assert source.count('.WithEnvironment("Jwt__Audience", "BlocksSmoke")') == 3


def test_apphost_timeout_dumps_resource_diagnostics() -> None:
    script = SMOKE_SCRIPT.read_text(encoding="utf-8")

    assert 'ps -eo pid,ppid,stat,etime,args --forest' in script
    assert 'APPHOST_DASHBOARD_URL="$dashboard_url"' in script
    assert 'page.getByRole("heading", { name: "Resources" })' in script
    assert 'new URL("/consolelogs", process.env.APPHOST_DASHBOARD_URL)' in script


def test_apphost_smoke_disables_python_https_certificates() -> None:
    source = APPHOST_SOURCE.read_text(encoding="utf-8")

    assert source.count(".WithoutHttpsCertificate();") == 2
    assert "#pragma warning disable ASPIRECERTIFICATES001" in source
    assert "#pragma warning restore ASPIRECERTIFICATES001" in source


def test_apphost_gateway_health_check_uses_http_endpoint() -> None:
    source = APPHOST_SOURCE.read_text(encoding="utf-8")

    assert source.count('.WithHttpHealthCheck("/health", endpointName: "http");') == 1
