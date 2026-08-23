import base64
import hashlib
import secrets
from typing import Any
from urllib.parse import urlencode, urlsplit

import httpx
import jwt
from pydantic import BaseModel

from app.core.config import Settings


class AuthenticationError(Exception):
    pass


class OidcMetadata(BaseModel):
    issuer: str
    authorization_endpoint: str
    token_endpoint: str
    userinfo_endpoint: str
    jwks_uri: str


class OidcTokens(BaseModel):
    access_token: str
    id_token: str


class OidcIdentity(BaseModel):
    issuer: str
    subject: str
    preferred_username: str | None = None
    display_name: str | None = None
    email: str | None = None


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def new_secret(length: int = 32) -> str:
    return secrets.token_urlsafe(length)


def safe_return_to(value: str | None) -> str:
    candidate = value or "/"
    parsed = urlsplit(candidate)
    if not candidate.startswith("/") or candidate.startswith("//"):
        return "/"
    if parsed.scheme or parsed.netloc or "\\" in candidate:
        return "/"
    return candidate


class CasdoorOidcClient:
    def __init__(self, settings: Settings, http: httpx.AsyncClient) -> None:
        self._settings = settings
        self._http = http

    async def discover(self) -> OidcMetadata:
        url = f"{self._settings.casdoor_issuer.rstrip('/')}/.well-known/openid-configuration"
        try:
            response = await self._http.get(url)
            response.raise_for_status()
            metadata = OidcMetadata.model_validate(response.json())
        except (httpx.HTTPError, ValueError) as exc:
            raise AuthenticationError("Unable to load Casdoor discovery metadata") from exc
        if metadata.issuer.rstrip("/") != self._settings.casdoor_issuer.rstrip("/"):
            raise AuthenticationError("Casdoor discovery issuer does not match configuration")
        return metadata

    def authorization_url(
        self,
        metadata: OidcMetadata,
        *,
        state: str,
        verifier: str,
        nonce: str,
    ) -> str:
        query = urlencode(
            {
                "response_type": "code",
                "client_id": self._settings.casdoor_client_id,
                "redirect_uri": self._settings.casdoor_redirect_uri,
                "scope": "openid profile email",
                "state": state,
                "nonce": nonce,
                "code_challenge": pkce_challenge(verifier),
                "code_challenge_method": "S256",
            }
        )
        return f"{metadata.authorization_endpoint}?{query}"

    async def exchange_code(
        self, metadata: OidcMetadata, *, code: str, verifier: str
    ) -> OidcTokens:
        try:
            response = await self._http.post(
                metadata.token_endpoint,
                data={
                    "grant_type": "authorization_code",
                    "client_id": self._settings.casdoor_client_id,
                    "client_secret": self._settings.casdoor_client_secret.get_secret_value(),
                    "code": code,
                    "redirect_uri": self._settings.casdoor_redirect_uri,
                    "code_verifier": verifier,
                },
            )
            response.raise_for_status()
            return OidcTokens.model_validate(response.json())
        except (httpx.HTTPError, ValueError) as exc:
            raise AuthenticationError("Casdoor rejected the authorization code") from exc

    async def verify_identity(
        self, metadata: OidcMetadata, tokens: OidcTokens, *, expected_nonce: str
    ) -> OidcIdentity:
        try:
            header = jwt.get_unverified_header(tokens.id_token)
            if header.get("alg") != "RS256" or not isinstance(header.get("kid"), str):
                raise AuthenticationError("ID token uses an unsupported signing key")
            jwks_response = await self._http.get(metadata.jwks_uri)
            jwks_response.raise_for_status()
            jwks_payload = jwks_response.json()
            if not isinstance(jwks_payload, dict) or not isinstance(jwks_payload.get("keys"), list):
                raise AuthenticationError("Casdoor returned an invalid JWKS document")
            keys = jwks_payload["keys"]
            jwk_data = next(
                (
                    item
                    for item in keys
                    if isinstance(item, dict) and item.get("kid") == header["kid"]
                ),
                None,
            )
            if jwk_data is None:
                raise AuthenticationError("ID token signing key was not found")
            signing_key = jwt.PyJWK.from_dict(jwk_data, algorithm="RS256").key
            claims: dict[str, Any] = jwt.decode(
                tokens.id_token,
                key=signing_key,
                algorithms=["RS256"],
                audience=self._settings.casdoor_client_id,
                issuer=self._settings.casdoor_issuer,
                options={"require": ["exp", "iss", "aud", "sub", "nonce"]},
            )
            if not secrets.compare_digest(str(claims["nonce"]), expected_nonce):
                raise AuthenticationError("ID token nonce does not match")
            userinfo_response = await self._http.get(
                metadata.userinfo_endpoint,
                headers={"Authorization": f"Bearer {tokens.access_token}"},
            )
            userinfo_response.raise_for_status()
            userinfo = userinfo_response.json()
            if not isinstance(userinfo, dict) or userinfo.get("sub") != claims["sub"]:
                raise AuthenticationError("UserInfo subject does not match ID token")
        except AuthenticationError:
            raise
        except (httpx.HTTPError, jwt.PyJWTError, KeyError, TypeError, ValueError) as exc:
            raise AuthenticationError("Casdoor identity verification failed") from exc

        return OidcIdentity(
            issuer=str(claims["iss"]),
            subject=str(claims["sub"]),
            preferred_username=userinfo.get("preferred_username")
            or claims.get("preferred_username"),
            display_name=userinfo.get("name") or claims.get("name"),
            email=userinfo.get("email") or claims.get("email"),
        )
