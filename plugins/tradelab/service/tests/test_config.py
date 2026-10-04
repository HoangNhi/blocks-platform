from tradelab_api.core.config import Settings


def test_settings_load_default_env_local_file(tmp_path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    (tmp_path / ".env.local").write_text(
        "DATABASE_URL=postgresql+psycopg://local-file/database" + chr(10),
        encoding="utf-8",
    )

    assert Settings().database_url == "postgresql+psycopg://local-file/database"


def test_settings_environment_overrides_env_local_file(tmp_path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    (tmp_path / ".env.local").write_text(
        "DATABASE_URL=postgresql+psycopg://local-file/database\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://environment/database")

    assert Settings().database_url == "postgresql+psycopg://environment/database"

def test_settings_loads_system_service_authorization_key_from_environment(monkeypatch) -> None:
    monkeypatch.setenv("SYSTEM_SERVICE_AUTHORIZATION_KEY", "local-secret")

    assert Settings().system_service_authorization_key.get_secret_value() == "local-secret"
