from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
from sqlalchemy import delete, select, update
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.oidc import (
    AuthenticationError,
    CasdoorOidcClient,
    OidcIdentity,
    new_secret,
    safe_return_to,
    token_hash,
)
from app.core.config import Settings
from app.models import AuthIdentity, AuthLoginState, AuthSession


@dataclass(frozen=True, slots=True)
class CompletedLogin:
    session_token: str
    return_to: str


async def begin_login(
    settings: Settings,
    session: AsyncSession,
    http: httpx.AsyncClient,
    return_to: str | None,
) -> str:
    now = datetime.now(UTC)
    await session.execute(delete(AuthLoginState).where(AuthLoginState.expires_at <= now))
    state = new_secret()
    verifier = new_secret(64)
    nonce = new_secret()
    session.add(
        AuthLoginState(
            state_hash=token_hash(state),
            code_verifier=verifier,
            nonce=nonce,
            return_to=safe_return_to(return_to),
            expires_at=now + timedelta(seconds=settings.oidc_state_ttl_seconds),
        )
    )
    await session.commit()

    client = CasdoorOidcClient(settings, http)
    metadata = await client.discover()
    return client.authorization_url(
        metadata,
        state=state,
        verifier=verifier,
        nonce=nonce,
    )


async def complete_login(
    settings: Settings,
    session: AsyncSession,
    http: httpx.AsyncClient,
    *,
    code: str,
    state: str,
) -> CompletedLogin:
    login_state = await session.scalar(
        select(AuthLoginState)
        .where(
            AuthLoginState.state_hash == token_hash(state),
            AuthLoginState.expires_at > datetime.now(UTC),
        )
        .with_for_update()
    )
    if login_state is None:
        raise AuthenticationError("Login state is invalid, expired, or already used")

    verifier = login_state.code_verifier
    nonce = login_state.nonce
    return_to = login_state.return_to
    await session.delete(login_state)
    await session.commit()

    client = CasdoorOidcClient(settings, http)
    metadata = await client.discover()
    tokens = await client.exchange_code(metadata, code=code, verifier=verifier)
    external_identity = await client.verify_identity(metadata, tokens, expected_nonce=nonce)
    identity = await _upsert_identity(session, external_identity)

    raw_session_token = new_secret(48)
    now = datetime.now(UTC)
    session.add(
        AuthSession(
            token_hash=token_hash(raw_session_token),
            identity_id=identity.id,
            expires_at=now + timedelta(seconds=settings.session_ttl_seconds),
            last_seen_at=now,
        )
    )
    await session.commit()
    return CompletedLogin(session_token=raw_session_token, return_to=return_to)


async def _upsert_identity(session: AsyncSession, external_identity: OidcIdentity) -> AuthIdentity:
    now = datetime.now(UTC)
    candidate_id = str(uuid4())
    statement = mysql_insert(AuthIdentity).values(
        id=candidate_id,
        issuer=external_identity.issuer,
        external_subject=external_identity.subject,
        preferred_username=external_identity.preferred_username,
        display_name=external_identity.display_name,
        email=external_identity.email,
        last_login_at=now,
        created_at=now,
        updated_at=now,
    )
    statement = statement.on_duplicate_key_update(
        preferred_username=external_identity.preferred_username,
        display_name=external_identity.display_name,
        email=external_identity.email,
        last_login_at=now,
        updated_at=now,
    )
    await session.execute(statement)
    await session.commit()
    identity = await session.scalar(
        select(AuthIdentity).where(
            AuthIdentity.issuer == external_identity.issuer,
            AuthIdentity.external_subject == external_identity.subject,
        )
    )
    if identity is None:
        raise RuntimeError("Identity upsert did not return a record")
    return identity


async def resolve_session(session: AsyncSession, raw_session_token: str) -> AuthIdentity | None:
    result = await session.execute(
        select(AuthIdentity)
        .join(AuthSession, AuthSession.identity_id == AuthIdentity.id)
        .where(
            AuthSession.token_hash == token_hash(raw_session_token),
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > datetime.now(UTC),
        )
    )
    return result.scalar_one_or_none()


async def revoke_session(session: AsyncSession, raw_session_token: str) -> None:
    await session.execute(
        update(AuthSession)
        .where(AuthSession.token_hash == token_hash(raw_session_token))
        .values(revoked_at=datetime.now(UTC))
    )
    await session.commit()
