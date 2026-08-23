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
        "external_subject": None,
        "preferred_username": None,
        "display_name": None,
        "email": None,
        "auth_source": "development",
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
    assert response.json()["detail"] == "Casdoor authentication is not configured"


def test_external_auth_without_session_returns_401() -> None:
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings(
        app_env="test",
        auth_mode="external",
        public_base_url="http://learning.test",
        casdoor_issuer="http://casdoor.test",
        casdoor_client_id="kuailearning",
        casdoor_client_secret="secret",
        casdoor_redirect_uri="http://learning.test/api/v1/auth/callback",
    )

    with TestClient(app) as client:
        response = client.get("/api/v1/me")

    assert response.status_code == 401
    assert response.json()["detail"] == "Not authenticated"


def test_external_cookie_writes_require_same_origin() -> None:
    settings = Settings(
        app_env="test",
        auth_mode="external",
        public_base_url="http://learning.test",
        casdoor_issuer="http://casdoor.test",
        casdoor_client_id="kuailearning",
        casdoor_client_secret="secret",
        casdoor_redirect_uri="http://learning.test/api/v1/auth/callback",
    )
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings

    with TestClient(app) as client:
        rejected = client.post("/api/v1/auth/logout")
        accepted = client.post("/api/v1/auth/logout", headers={"Origin": "http://learning.test"})

    assert rejected.status_code == 403
    assert accepted.status_code == 204


def test_production_cannot_enable_debug_identity_headers() -> None:
    with pytest.raises(ValueError, match="AUTH_MODE=development"):
        Settings(app_env="production", auth_mode="development")


def test_production_external_auth_requires_casdoor_settings() -> None:
    with pytest.raises(ValueError, match="CASDOOR_ISSUER"):
        Settings(app_env="production", auth_mode="external")
