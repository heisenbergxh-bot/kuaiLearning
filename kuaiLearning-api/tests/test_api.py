from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import create_app


@pytest.fixture
def client() -> Iterator[TestClient]:
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client


def test_liveness_is_public(client: TestClient) -> None:
    response = client.get("/api/v1/health/live")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_development_identity_has_safe_default(client: TestClient) -> None:
    response = client.get("/api/v1/me")

    assert response.status_code == 200
    assert response.json() == {
        "subject": "local-demo",
        "employee_id": None,
        "auth_source": "placeholder",
    }


def test_development_identity_accepts_debug_headers(client: TestClient) -> None:
    response = client.get(
        "/api/v1/me",
        headers={"X-Debug-User": "alice", "X-Debug-Employee-Id": "E001"},
    )

    assert response.status_code == 200
    assert response.json()["subject"] == "alice"
    assert response.json()["employee_id"] == "E001"


def test_external_auth_fails_closed_until_adapter_is_configured() -> None:
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings(app_env="test", auth_mode="external")

    with TestClient(app) as client:
        response = client.get("/api/v1/me")

    assert response.status_code == 503
    assert response.json()["detail"] == "Unified authentication adapter is not configured"


def test_production_cannot_enable_debug_identity_headers() -> None:
    with pytest.raises(ValueError, match="AUTH_MODE=development"):
        Settings(app_env="production", auth_mode="development")
