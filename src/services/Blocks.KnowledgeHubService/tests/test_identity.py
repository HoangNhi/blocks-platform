import math
import tempfile
import time
import unittest
from pathlib import Path
from uuid import UUID, uuid4

import jwt
from fastapi import HTTPException
from pydantic import SecretStr

from knowledgehub.config import Settings
from knowledgehub.identity import AuthenticatedUser, verify_jwt_token


class TestIdentity(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.ca_file = Path(self.temp_dir.name) / "ca.pem"
        fixture_ca = Path(__file__).resolve().parent / "fixtures" / "test_ca.pem"
        self.ca_file.write_text(fixture_ca.read_text(encoding="utf-8"), encoding="utf-8")
        self.secret = "12345678901234567890123456789012"
        self.settings = Settings(
            _env_file=None,
            jwt_key=SecretStr(self.secret),
            jwt_issuer="BlocksStudio",
            jwt_audience="BlocksWeb",
            system_grpc_url="https://localhost:7073",
            system_grpc_ca_file=self.ca_file,
        )
        self.actor_id = uuid4()

    def tearDown(self):
        self.temp_dir.cleanup()

    def _make_token(self, payload_overrides=None, key=None, algorithm="HS256"):
        payload = {
            "name": str(self.actor_id),
            "unique_name": "testuser",
            "iss": "BlocksStudio",
            "aud": "BlocksWeb",
            "exp": int(time.time()) + 3600,
            "nbf": int(time.time()) - 10,
        }
        if payload_overrides:
            payload.update(payload_overrides)
        return jwt.encode(payload, key or self.secret, algorithm=algorithm)

    def test_valid_token_success(self):
        token = self._make_token()
        user = verify_jwt_token(token, self.settings)
        self.assertIsInstance(user, AuthenticatedUser)
        self.assertEqual(user.actor_id, self.actor_id)
        self.assertEqual(user.username, "testuser")
        self.assertEqual(user.token, token)

    def test_expired_token_fails(self):
        token = self._make_token({"exp": int(time.time()) - 1})
        with self.assertRaises(HTTPException) as ctx:
            verify_jwt_token(token, self.settings)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Xác thực không thành công")

    def test_invalid_signature_fails(self):
        token = self._make_token(key="wrong_secret_key_1234567890123456")
        with self.assertRaises(HTTPException) as ctx:
            verify_jwt_token(token, self.settings)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Xác thực không thành công")

    def test_algorithm_none_rejected(self):
        token = jwt.encode(
            {"name": str(self.actor_id), "exp": int(time.time()) + 3600},
            key="",
            algorithm="none",
        )
        with self.assertRaises(HTTPException) as ctx:
            verify_jwt_token(token, self.settings)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Xác thực không thành công")

    def test_wrong_issuer_fails(self):
        token = self._make_token({"iss": "WrongIssuer"})
        with self.assertRaises(HTTPException) as ctx:
            verify_jwt_token(token, self.settings)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Xác thực không thành công")

    def test_wrong_audience_fails(self):
        token = self._make_token({"aud": "WrongAudience"})
        with self.assertRaises(HTTPException) as ctx:
            verify_jwt_token(token, self.settings)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Xác thực không thành công")

    def test_missing_or_invalid_actor_guid_fails(self):
        for bad_name in [None, "", "   ", "not-a-guid", str(UUID(int=0))]:
            with self.subTest(bad_name=bad_name):
                token = self._make_token({"name": bad_name})
                with self.assertRaises(HTTPException) as ctx:
                    verify_jwt_token(token, self.settings)
                self.assertEqual(ctx.exception.status_code, 401)
                self.assertEqual(ctx.exception.detail, "Xác thực không thành công")

    def test_future_nbf_fails(self):
        token = self._make_token({"nbf": int(time.time()) + 3600})
        with self.assertRaises(HTTPException) as ctx:
            verify_jwt_token(token, self.settings)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Xác thực không thành công")

    def test_invalid_expiry_types_fail(self):
        bad_exps = [
            str(int(time.time()) + 3600),  # numeric string
            True,                          # boolean
            False,
            "not-a-number",
            {"exp": 123},
            10**400,                       # huge integer that would cause OverflowError
        ]
        for bad_exp in bad_exps:
            with self.subTest(bad_exp=bad_exp):
                token = jwt.encode(
                    {
                        "name": str(self.actor_id),
                        "iss": "BlocksStudio",
                        "aud": "BlocksWeb",
                        "exp": bad_exp,
                    },
                    self.secret,
                    algorithm="HS256",
                )
                with self.assertRaises(HTTPException) as ctx:
                    verify_jwt_token(token, self.settings)
                self.assertEqual(ctx.exception.status_code, 401)
                self.assertEqual(ctx.exception.detail, "Xác thực không thành công")

        # Missing exp claim
        token_no_exp = jwt.encode(
            {
                "name": str(self.actor_id),
                "iss": "BlocksStudio",
                "aud": "BlocksWeb",
            },
            self.secret,
            algorithm="HS256",
        )
        with self.assertRaises(HTTPException) as ctx:
            verify_jwt_token(token_no_exp, self.settings)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Xác thực không thành công")


if __name__ == "__main__":
    unittest.main()
