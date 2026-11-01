import json
import unittest

import httpx
from fastapi import FastAPI
from pydantic import BaseModel

from knowledgehub.responses import (
    error_response,
    setup_exception_handlers,
    success_response,
)


class SampleModel(BaseModel):
    name: str
    age: int


class TestResponses(unittest.IsolatedAsyncioTestCase):
    def test_success_envelope_serialization(self):
        resp = success_response(data={"ActorId": "test-guid"})
        self.assertEqual(resp.status_code, 200)
        body = json.loads(resp.body.decode())
        self.assertTrue(body["Success"])
        self.assertEqual(body["StatusCode"], 200)
        self.assertEqual(body["Data"]["ActorId"], "test-guid")
        self.assertIsNone(body["Message"])

    def test_error_envelope_serialization_http200_contract(self):
        resp = error_response(status_code=401, message="Xác thực không thành công")
        self.assertEqual(resp.status_code, 200)
        body = json.loads(resp.body.decode())
        self.assertFalse(body["Success"])
        self.assertEqual(body["StatusCode"], 401)
        self.assertIsNone(body["Data"])
        self.assertEqual(body["Message"], "Xác thực không thành công")

    async def test_validation_envelope(self):
        test_app = FastAPI()
        setup_exception_handlers(test_app)

        @test_app.post("/test-validation")
        async def post_item(item: SampleModel):
            return item

        transport = httpx.ASGITransport(app=test_app, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/test-validation", json={"name": "test", "age": "invalid_age"})
            self.assertEqual(resp.status_code, 200)
            body = resp.json()
            self.assertFalse(body["Success"])
            self.assertEqual(body["StatusCode"], 400)
            self.assertIsNone(body["Data"])
            self.assertEqual(body["Message"], "Dữ liệu yêu cầu không hợp lệ")

    async def test_not_found_and_method_envelopes(self):
        test_app = FastAPI()
        setup_exception_handlers(test_app)

        @test_app.get("/valid-path")
        async def get_valid():
            return {"ok": True}

        transport = httpx.ASGITransport(app=test_app, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            # 404 test
            resp_404 = await client.get("/nonexistent-path")
            self.assertEqual(resp_404.status_code, 200)
            body_404 = resp_404.json()
            self.assertFalse(body_404["Success"])
            self.assertEqual(body_404["StatusCode"], 404)
            self.assertIsNone(body_404["Data"])
            self.assertEqual(body_404["Message"], "Không tìm thấy tài nguyên")

            # 405 test
            resp_405 = await client.post("/valid-path")
            self.assertEqual(resp_405.status_code, 200)
            body_405 = resp_405.json()
            self.assertFalse(body_405["Success"])
            self.assertEqual(body_405["StatusCode"], 405)
            self.assertIsNone(body_405["Data"])
            self.assertEqual(body_405["Message"], "Phương thức không được hỗ trợ")

    async def test_unexpected_error_uses_http500(self):
        test_app = FastAPI()
        setup_exception_handlers(test_app)
        internal_marker = "INTERNAL_SECRET_DATABASE_EXCEPTION_MARKER"

        @test_app.get("/crash")
        async def crash():
            raise RuntimeError(internal_marker)

        transport = httpx.ASGITransport(app=test_app, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/crash")
            self.assertEqual(resp.status_code, 500)
            body = resp.json()
            self.assertFalse(body["Success"])
            self.assertEqual(body["StatusCode"], 500)
            self.assertIsNone(body["Data"])
            self.assertEqual(body["Message"], "Đã xảy ra lỗi hệ thống")
            self.assertNotIn(internal_marker, resp.text)


if __name__ == "__main__":
    unittest.main()
