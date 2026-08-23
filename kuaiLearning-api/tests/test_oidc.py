import json
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlsplit

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from app.auth.oidc import (
    AuthenticationError,
    CasdoorOidcClient,
    OidcMetadata,
    OidcTokens,
    pkce_challenge,
    safe_return_to,
)
from app.core.config import Settings


def test_pkce_challenge_matches_rfc_7636_example() -> None:
    verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"

    assert pkce_challenge(verifier) == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"


def test_return_to_only_accepts_local_absolute_paths() -> None:
    assert safe_return_to("/workspace/123/mission?tab=goal") == ("/workspace/123/mission?tab=goal")
    assert safe_return_to("https://evil.example/path") == "/"
    assert safe_return_to("//evil.example/path") == "/"
    assert safe_return_to("/\\evil.example") == "/"


def test_authorization_url_contains_pkce_nonce_and_exact_redirect() -> None:
    settings = Settings(
        casdoor_issuer="http://casdoor.test",
        casdoor_client_id="kuailearning",
        casdoor_client_secret="secret",
        casdoor_redirect_uri="http://learning.test/api/v1/auth/callback",
    )
    metadata = OidcMetadata(
        issuer="http://casdoor.test",
        authorization_endpoint="http://casdoor.test/login/oauth/authorize",
        token_endpoint="http://casdoor.test/token",
        userinfo_endpoint="http://casdoor.test/userinfo",
        jwks_uri="http://casdoor.test/jwks",
    )
    client = CasdoorOidcClient(settings, http=None)  # type: ignore[arg-type]

    url = client.authorization_url(
        metadata,
        state="state-value",
        verifier="verifier-value",
        nonce="nonce-value",
    )
    query = parse_qs(urlsplit(url).query)

    assert query["response_type"] == ["code"]
    assert query["client_id"] == ["kuailearning"]
    assert query["redirect_uri"] == ["http://learning.test/api/v1/auth/callback"]
    assert query["state"] == ["state-value"]
    assert query["nonce"] == ["nonce-value"]
    assert query["code_challenge_method"] == ["S256"]


@pytest.mark.asyncio
async def test_id_token_is_verified_with_jwks_and_userinfo() -> None:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(private_key.public_key()))
    public_jwk["kid"] = "test-key"
    now = datetime.now(UTC)
    id_token = jwt.encode(
        {
            "iss": "http://casdoor.test",
            "aud": "kuailearning",
            "sub": "casdoor-user-1",
            "nonce": "expected-nonce",
            "iat": now,
            "exp": now + timedelta(minutes=5),
        },
        private_key,
        algorithm="RS256",
        headers={"kid": "test-key"},
    )

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/jwks":
            return httpx.Response(200, json={"keys": [public_jwk]})
        if request.url.path == "/userinfo":
            assert request.headers["Authorization"] == "Bearer access-token"
            return httpx.Response(
                200,
                json={
                    "sub": "casdoor-user-1",
                    "preferred_username": "alice",
                    "name": "Alice",
                },
            )
        return httpx.Response(404)

    settings = Settings(
        casdoor_issuer="http://casdoor.test",
        casdoor_client_id="kuailearning",
        casdoor_client_secret="secret",
        casdoor_redirect_uri="http://learning.test/api/v1/auth/callback",
    )
    metadata = OidcMetadata(
        issuer="http://casdoor.test",
        authorization_endpoint="http://casdoor.test/authorize",
        token_endpoint="http://casdoor.test/token",
        userinfo_endpoint="http://casdoor.test/userinfo",
        jwks_uri="http://casdoor.test/jwks",
    )
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        client = CasdoorOidcClient(settings, http)
        identity = await client.verify_identity(
            metadata,
            OidcTokens(access_token="access-token", id_token=id_token),
            expected_nonce="expected-nonce",
        )

    assert identity.subject == "casdoor-user-1"
    assert identity.preferred_username == "alice"
    assert identity.display_name == "Alice"


@pytest.mark.asyncio
async def test_id_token_nonce_mismatch_is_rejected() -> None:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(private_key.public_key()))
    public_jwk["kid"] = "test-key"
    now = datetime.now(UTC)
    id_token = jwt.encode(
        {
            "iss": "http://casdoor.test",
            "aud": "kuailearning",
            "sub": "casdoor-user-1",
            "nonce": "wrong-nonce",
            "exp": now + timedelta(minutes=5),
        },
        private_key,
        algorithm="RS256",
        headers={"kid": "test-key"},
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"keys": [public_jwk]})

    settings = Settings(
        casdoor_issuer="http://casdoor.test",
        casdoor_client_id="kuailearning",
        casdoor_client_secret="secret",
        casdoor_redirect_uri="http://learning.test/api/v1/auth/callback",
    )
    metadata = OidcMetadata(
        issuer="http://casdoor.test",
        authorization_endpoint="http://casdoor.test/authorize",
        token_endpoint="http://casdoor.test/token",
        userinfo_endpoint="http://casdoor.test/userinfo",
        jwks_uri="http://casdoor.test/jwks",
    )
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        client = CasdoorOidcClient(settings, http)
        with pytest.raises(AuthenticationError, match="nonce"):
            await client.verify_identity(
                metadata,
                OidcTokens(access_token="access-token", id_token=id_token),
                expected_nonce="expected-nonce",
            )
