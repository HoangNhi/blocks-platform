import asyncio
import os
import queue
import re
import socket
import subprocess
import sys
import threading
import time
import unittest
from pathlib import Path
from uuid import uuid4

import grpc
import httpx
import jwt

from knowledgehub.rpc import system_pb2, system_pb2_grpc


class MockSystemProtoServicer(system_pb2_grpc.SystemProtoServicer):
    def __init__(self, allowed_actor_id: str):
        self.allowed_actor_id = allowed_actor_id
        self.recorded_calls = []

    async def CheckPermission(self, request, context):
        metadata = dict(context.invocation_metadata())
        self.recorded_calls.append(
            {
                "user_id": request.user_id,
                "controller": request.controller,
                "action": request.action,
                "metadata": metadata,
            }
        )
        is_allowed = (
            request.user_id == self.allowed_actor_id
            and request.controller == "knowledgehub"
            and request.action == 1
        )
        return system_pb2.CheckActionResponse(success=is_allowed)


def get_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class TestGatewayForwarding(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        gateway_dll_env = os.getenv("KNOWLEDGEHUB_TEST_GATEWAY_DLL")
        if not gateway_dll_env or not Path(gateway_dll_env).is_file():
            raise unittest.SkipTest(
                "KNOWLEDGEHUB_TEST_GATEWAY_DLL is not set or file does not exist; skipping real Gateway integration test."
            )
        cls.gateway_dll = Path(gateway_dll_env).resolve()

        cls.fixtures_dir = Path(__file__).resolve().parent / "fixtures"
        cls.ca_pem = cls.fixtures_dir / "test_ca.pem"
        cls.ca_key = cls.fixtures_dir / "test_ca.key"
        if not cls.ca_pem.is_file() or not cls.ca_key.is_file():
            raise unittest.SkipTest("Test CA fixtures not found; run fixture generation.")

        cls.test_secret = "test_gateway_forwarding_secret_32_bytes!!"
        cls.allowed_actor_id = str(uuid4())
        cls.denied_actor_id = str(uuid4())

        # 1. Start gRPC mock server in background thread with clean shutdown registered
        cls.servicer = MockSystemProtoServicer(cls.allowed_actor_id)
        cls.grpc_port = get_free_port()
        cls.grpc_loop = asyncio.new_event_loop()
        cls.grpc_ready_event = threading.Event()

        def cleanup_grpc():
            if hasattr(cls, "grpc_server") and cls.grpc_server:
                cls.grpc_loop.call_soon_threadsafe(
                    lambda: asyncio.create_task(cls.grpc_server.stop(0))
                )
                time.sleep(0.2)

        cls.addClassCleanup(cleanup_grpc)

        def run_grpc_server():
            asyncio.set_event_loop(cls.grpc_loop)

            async def _start():
                server = grpc.aio.server()
                system_pb2_grpc.add_SystemProtoServicer_to_server(cls.servicer, server)
                creds = grpc.ssl_server_credentials(
                    ((cls.ca_key.read_bytes(), cls.ca_pem.read_bytes()),)
                )
                server.add_secure_port(f"127.0.0.1:{cls.grpc_port}", creds)
                await server.start()
                cls.grpc_server = server
                cls.grpc_ready_event.set()
                await server.wait_for_termination()

            cls.grpc_loop.run_until_complete(_start())

        cls.grpc_thread = threading.Thread(target=run_grpc_server, daemon=True)
        cls.grpc_thread.start()
        if not cls.grpc_ready_event.wait(timeout=10):
            raise RuntimeError("gRPC mock server failed to start within 10s")

        # 2. Start Uvicorn process running real FastAPI knowledgehub.main:app
        cls.backend_port = get_free_port()
        backend_env = os.environ.copy()
        backend_env.update(
            {
                "KNOWLEDGEHUB_JWT_KEY": cls.test_secret,
                "KNOWLEDGEHUB_JWT_ISSUER": "GatewayTestIssuer",
                "KNOWLEDGEHUB_JWT_AUDIENCE": "GatewayTestAudience",
                "KNOWLEDGEHUB_SYSTEM_GRPC_URL": f"https://localhost:{cls.grpc_port}",
                "KNOWLEDGEHUB_SYSTEM_GRPC_CA_FILE": str(cls.ca_pem),
                "KNOWLEDGEHUB_PERMISSION_TIMEOUT_SECONDS": "3.0",
                "KNOWLEDGEHUB_ENV_FILE": "none",  # Explicitly disable reading physical .env
                "PYTHONPATH": str(Path(__file__).resolve().parents[1] / "src"),
            }
        )

        cls.uvicorn_proc = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "knowledgehub.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(cls.backend_port),
            ],
            env=backend_env,
            cwd=str(Path(__file__).resolve().parents[1]),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )

        def cleanup_uvicorn():
            if hasattr(cls, "uvicorn_proc") and cls.uvicorn_proc and cls.uvicorn_proc.poll() is None:
                cls.uvicorn_proc.terminate()
                try:
                    cls.uvicorn_proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    cls.uvicorn_proc.kill()

        cls.addClassCleanup(cleanup_uvicorn)

        # Wait for Uvicorn to be responsive on /alive
        start_time = time.time()
        uvicorn_ready = False
        while time.time() - start_time < 15:
            try:
                resp = httpx.get(f"http://127.0.0.1:{cls.backend_port}/alive", timeout=1.0)
                if resp.status_code == 200:
                    uvicorn_ready = True
                    break
            except Exception:
                time.sleep(0.2)

        if not uvicorn_ready:
            raise RuntimeError("Uvicorn backend failed to become responsive on /alive within 15s")

        # 3. Start real Gateway in Production
        gateway_args = [
            "dotnet",
            str(cls.gateway_dll),
            "--urls",
            "http://127.0.0.1:0",
            "--environment",
            "Production",
            "--contentRoot",
            str(cls.gateway_dll.parent),
            "--FileProxy:ClusterId",
            "test-file-cluster",
            f"--ReverseProxy:Clusters:knowledgehub-cluster:Destinations:destination1:Address=http://127.0.0.1:{cls.backend_port}",
        ]
        cls.gateway_proc = subprocess.Popen(
            gateway_args,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            cwd=str(cls.gateway_dll.parent),
        )

        def cleanup_gateway():
            if hasattr(cls, "gateway_proc") and cls.gateway_proc and cls.gateway_proc.poll() is None:
                cls.gateway_proc.terminate()
                try:
                    cls.gateway_proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    cls.gateway_proc.kill()

        cls.addClassCleanup(cleanup_gateway)

        # Non-blocking reader thread with timeout
        output_queue = queue.Queue()

        def reader():
            for line in iter(cls.gateway_proc.stdout.readline, ""):
                output_queue.put(line)
            cls.gateway_proc.stdout.close()

        threading.Thread(target=reader, daemon=True).start()

        cls.gateway_url = None
        start_time = time.time()
        while time.time() - start_time < 15:
            try:
                line = output_queue.get(timeout=0.5)
            except queue.Empty:
                if cls.gateway_proc.poll() is not None:
                    break
                continue
            match = re.search(r"Now listening on:\s*(http://127\.0\.0\.1:\d+)", line)
            if match:
                cls.gateway_url = match.group(1)
                break

        if not cls.gateway_url:
            raise RuntimeError("Gateway failed to start or output listening URL within 15s")

    def setUp(self):
        self.servicer.recorded_calls.clear()

    def _make_token(self, actor_id: str, expired: bool = False) -> str:
        exp = int(time.time()) - 10 if expired else int(time.time()) + 3600
        payload = {
            "name": actor_id,
            "unique_name": "testuser",
            "iss": "GatewayTestIssuer",
            "aud": "GatewayTestAudience",
            "exp": exp,
            "nbf": int(time.time()) - 10,
        }
        return jwt.encode(payload, self.test_secret, algorithm="HS256")

    def test_gateway_allows_verified_actor(self):
        token = self._make_token(self.allowed_actor_id)
        with httpx.Client(timeout=5.0) as client:
            resp = client.get(
                f"{self.gateway_url}/api/knowledgehub/identity",
                headers={"Authorization": f"Bearer {token}"},
            )
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertTrue(data["Success"])
            self.assertEqual(data["StatusCode"], 200)
            self.assertEqual(data["Data"]["ActorId"], self.allowed_actor_id)
            self.assertIsNone(data["Message"])

        self.assertEqual(len(self.servicer.recorded_calls), 1)
        rpc_call = self.servicer.recorded_calls[0]
        self.assertEqual(rpc_call["user_id"], self.allowed_actor_id)
        self.assertEqual(rpc_call["controller"], "knowledgehub")
        self.assertEqual(rpc_call["action"], 1)
        self.assertEqual(
            rpc_call["metadata"].get("x-service-authorization"),
            f"Bearer {token}",
        )

    def test_gateway_rejects_invalid_token(self):
        token = self._make_token(self.allowed_actor_id, expired=True)
        with httpx.Client(timeout=5.0) as client:
            resp = client.get(
                f"{self.gateway_url}/api/knowledgehub/identity",
                headers={"Authorization": f"Bearer {token}"},
            )
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertFalse(data["Success"])
            self.assertEqual(data["StatusCode"], 401)
            self.assertEqual(data["Message"], "Xác thực không thành công")

        self.assertEqual(len(self.servicer.recorded_calls), 0)

    def test_gateway_denies_missing_view(self):
        token = self._make_token(self.denied_actor_id)
        with httpx.Client(timeout=5.0) as client:
            resp = client.get(
                f"{self.gateway_url}/api/knowledgehub/identity",
                headers={"Authorization": f"Bearer {token}"},
            )
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertFalse(data["Success"])
            self.assertEqual(data["StatusCode"], 403)
            self.assertIsNone(data["Data"])
            self.assertEqual(data["Message"], "Bạn không có quyền truy cập")

        self.assertEqual(len(self.servicer.recorded_calls), 1)

    def test_z_gateway_backend_down_is_transport_failure(self):
        if self.uvicorn_proc and self.uvicorn_proc.poll() is None:
            self.uvicorn_proc.terminate()
            try:
                self.uvicorn_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.uvicorn_proc.kill()

        token = self._make_token(self.allowed_actor_id)
        with httpx.Client(timeout=5.0) as client:
            resp = client.get(
                f"{self.gateway_url}/api/knowledgehub/identity",
                headers={"Authorization": f"Bearer {token}"},
            )
            self.assertIn(resp.status_code, (502, 503, 504))


if __name__ == "__main__":
    unittest.main()
