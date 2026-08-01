from fastapi.testclient import TestClient

import tradelab_api.main as main_module
from tradelab_api.main import app


def test_health_endpoint() -> None:
    main_module.verify_database_connection = lambda: None
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "tradelab"}
