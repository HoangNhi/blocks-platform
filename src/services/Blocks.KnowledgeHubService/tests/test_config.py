import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pydantic import ValidationError

from knowledgehub.config import Settings


class TestConfig(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.ca_file = Path(self.temp_dir.name) / "ca.pem"
        fixture_ca = Path(__file__).resolve().parent / "fixtures" / "test_ca.pem"
        self.valid_ca_pem = fixture_ca.read_text(encoding="utf-8")
        self.ca_file.write_text(self.valid_ca_pem, encoding="utf-8")

        self.valid_env = {
            "KNOWLEDGEHUB_JWT_KEY": "12345678901234567890123456789012",
            "KNOWLEDGEHUB_JWT_ISSUER": "BlocksStudio",
            "KNOWLEDGEHUB_JWT_AUDIENCE": "BlocksWeb",
            "KNOWLEDGEHUB_SYSTEM_GRPC_URL": "https://localhost:7073",
            "KNOWLEDGEHUB_SYSTEM_GRPC_CA_FILE": str(self.ca_file),
        }

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_valid_configuration(self):
        with patch.dict(os.environ, self.valid_env, clear=True):
            settings = Settings(_env_file=None)
            self.assertEqual(
                settings.jwt_key.get_secret_value(),
                "12345678901234567890123456789012",
            )
            self.assertEqual(settings.jwt_issuer, "BlocksStudio")
            self.assertEqual(settings.jwt_audience, "BlocksWeb")
            self.assertEqual(settings.system_grpc_url, "https://localhost:7073")
            self.assertEqual(settings.system_grpc_ca_file, self.ca_file)
            self.assertEqual(settings.permission_timeout_seconds, 3.0)

        env_with_timeout = {**self.valid_env, "KNOWLEDGEHUB_PERMISSION_TIMEOUT_SECONDS": "5.0"}
        with patch.dict(os.environ, env_with_timeout, clear=True):
            settings = Settings(_env_file=None)
            self.assertEqual(settings.permission_timeout_seconds, 5.0)

    def test_invalid_configuration_rejected(self):
        cases = {
            "missing_key": {k: v for k, v in self.valid_env.items() if k != "KNOWLEDGEHUB_JWT_KEY"},
            "short_key": {**self.valid_env, "KNOWLEDGEHUB_JWT_KEY": "too_short"},
            "whitespace_key": {**self.valid_env, "KNOWLEDGEHUB_JWT_KEY": " " * 35},
            "empty_issuer": {**self.valid_env, "KNOWLEDGEHUB_JWT_ISSUER": "  "},
            "empty_audience": {**self.valid_env, "KNOWLEDGEHUB_JWT_AUDIENCE": ""},
            "http_url": {**self.valid_env, "KNOWLEDGEHUB_SYSTEM_GRPC_URL": "http://localhost:7073"},
            "missing_port": {**self.valid_env, "KNOWLEDGEHUB_SYSTEM_GRPC_URL": "https://localhost"},
            "port_zero": {**self.valid_env, "KNOWLEDGEHUB_SYSTEM_GRPC_URL": "https://localhost:0"},
            "port_too_large": {**self.valid_env, "KNOWLEDGEHUB_SYSTEM_GRPC_URL": "https://localhost:70000"},
            "url_credentials": {**self.valid_env, "KNOWLEDGEHUB_SYSTEM_GRPC_URL": "https://user:pass@localhost:7073"},
            "url_query": {**self.valid_env, "KNOWLEDGEHUB_SYSTEM_GRPC_URL": "https://localhost:7073?q=1"},
            "url_fragment": {**self.valid_env, "KNOWLEDGEHUB_SYSTEM_GRPC_URL": "https://localhost:7073#frag"},
            "url_non_root_path": {**self.valid_env, "KNOWLEDGEHUB_SYSTEM_GRPC_URL": "https://localhost:7073/api"},
            "missing_ca": {k: v for k, v in self.valid_env.items() if k != "KNOWLEDGEHUB_SYSTEM_GRPC_CA_FILE"},
            "relative_ca": {**self.valid_env, "KNOWLEDGEHUB_SYSTEM_GRPC_CA_FILE": "relative/ca.pem"},
            "nonexistent_ca": {**self.valid_env, "KNOWLEDGEHUB_SYSTEM_GRPC_CA_FILE": str(Path(self.temp_dir.name) / "missing.pem")},
            "timeout_zero": {**self.valid_env, "KNOWLEDGEHUB_PERMISSION_TIMEOUT_SECONDS": "0"},
            "timeout_negative": {**self.valid_env, "KNOWLEDGEHUB_PERMISSION_TIMEOUT_SECONDS": "-1"},
            "timeout_too_large": {**self.valid_env, "KNOWLEDGEHUB_PERMISSION_TIMEOUT_SECONDS": "30.1"},
            "timeout_nan": {**self.valid_env, "KNOWLEDGEHUB_PERMISSION_TIMEOUT_SECONDS": "nan"},
            "timeout_inf": {**self.valid_env, "KNOWLEDGEHUB_PERMISSION_TIMEOUT_SECONDS": "inf"},
        }
        for name, env in cases.items():
            with self.subTest(case=name):
                with patch.dict(os.environ, env, clear=True):
                    with self.assertRaises(ValidationError):
                        Settings(_env_file=None)

    def test_ca_file_with_private_key_rejected(self):
        bad_ca = Path(self.temp_dir.name) / "with_key.pem"
        bad_ca.write_text(
            self.valid_ca_pem + "\n-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASC...\n-----END PRIVATE KEY-----\n",
            encoding="utf-8",
        )
        env = {**self.valid_env, "KNOWLEDGEHUB_SYSTEM_GRPC_CA_FILE": str(bad_ca)}
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaises(ValidationError) as ctx:
                Settings(_env_file=None)
            self.assertIn("private keys", str(ctx.exception))

    def test_ca_file_with_fake_cert_rejected(self):
        fake_ca = Path(self.temp_dir.name) / "fake_cert.pem"
        fake_ca.write_text(
            "-----BEGIN CERTIFICATE-----\nThisIsNotAValidBase64Certificate\n-----END CERTIFICATE-----\n",
            encoding="utf-8",
        )
        env = {**self.valid_env, "KNOWLEDGEHUB_SYSTEM_GRPC_CA_FILE": str(fake_ca)}
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaises(ValidationError):
                Settings(_env_file=None)

    def test_key_length_uses_utf8_bytes(self):
        # 16 2-byte UTF-8 chars = 32 bytes -> pass
        key_32_bytes = "é" * 16
        self.assertEqual(len(key_32_bytes.encode("utf-8")), 32)
        env = {**self.valid_env, "KNOWLEDGEHUB_JWT_KEY": key_32_bytes}
        with patch.dict(os.environ, env, clear=True):
            settings = Settings(_env_file=None)
            self.assertEqual(settings.jwt_key.get_secret_value(), key_32_bytes)

        # 31 1-byte chars = 31 bytes -> fail
        key_31_bytes = "a" * 31
        env_fail = {**self.valid_env, "KNOWLEDGEHUB_JWT_KEY": key_31_bytes}
        with patch.dict(os.environ, env_fail, clear=True):
            with self.assertRaises(ValidationError):
                Settings(_env_file=None)

    def test_invalid_key_diagnostics_hide_input(self):
        synthetic_marker = "SYNTHETIC_WEAK_KEY"
        env = {**self.valid_env, "KNOWLEDGEHUB_JWT_KEY": synthetic_marker}
        with patch.dict(os.environ, env, clear=True):
            try:
                Settings(_env_file=None)
                self.fail("Expected ValidationError")
            except ValidationError as e:
                err_str = str(e)
                self.assertNotIn(synthetic_marker, err_str)
                self.assertIn("jwt_key", err_str)

    def test_dotenv_loads_local_key(self):
        fake_env_file = Path(self.temp_dir.name) / "fake.env"
        fake_env_file.write_text(
            f"KNOWLEDGEHUB_JWT_KEY=dotenv_secret_key_1234567890123456\n"
            f"KNOWLEDGEHUB_JWT_ISSUER=DotenvIssuer\n"
            f"KNOWLEDGEHUB_JWT_AUDIENCE=DotenvAudience\n"
            f"KNOWLEDGEHUB_SYSTEM_GRPC_URL=https://localhost:7073\n"
            f"KNOWLEDGEHUB_SYSTEM_GRPC_CA_FILE={self.ca_file.as_posix()}\n",
            encoding="utf-8",
        )
        with patch.dict(os.environ, {}, clear=True):
            settings = Settings(_env_file=fake_env_file)
            self.assertEqual(
                settings.jwt_key.get_secret_value(),
                "dotenv_secret_key_1234567890123456",
            )
            self.assertEqual(settings.jwt_issuer, "DotenvIssuer")

    def test_environment_overrides_dotenv(self):
        fake_env_file = Path(self.temp_dir.name) / "fake.env"
        fake_env_file.write_text(
            f"KNOWLEDGEHUB_JWT_KEY=dotenv_secret_key_1234567890123456\n"
            f"KNOWLEDGEHUB_JWT_ISSUER=DotenvIssuer\n"
            f"KNOWLEDGEHUB_JWT_AUDIENCE=DotenvAudience\n"
            f"KNOWLEDGEHUB_SYSTEM_GRPC_URL=https://localhost:7073\n"
            f"KNOWLEDGEHUB_SYSTEM_GRPC_CA_FILE={self.ca_file.as_posix()}\n",
            encoding="utf-8",
        )
        override_env = {"KNOWLEDGEHUB_JWT_KEY": "env_override_secret_1234567890123456"}
        with patch.dict(os.environ, override_env, clear=True):
            settings = Settings(_env_file=fake_env_file)
            self.assertEqual(
                settings.jwt_key.get_secret_value(),
                "env_override_secret_1234567890123456",
            )

        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(ValidationError):
                Settings(_env_file=None)


if __name__ == "__main__":
    unittest.main()
