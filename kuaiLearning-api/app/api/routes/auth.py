from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.oidc import AuthenticationError
from app.auth.service import begin_login, complete_login, revoke_session
from app.core.config import Settings, get_settings
from app.db.session import get_db_session

router = APIRouter(prefix="/auth", tags=["authentication"])
DbSession = Annotated[AsyncSession, Depends(get_db_session)]
SettingsDependency = Annotated[Settings, Depends(get_settings)]


def _require_casdoor(settings: Settings) -> None:
    if not settings.casdoor_is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Casdoor authentication is not configured",
        )


@router.get("/login")
async def login(
    session: DbSession,
    settings: SettingsDependency,
    return_to: Annotated[str | None, Query(max_length=1000)] = None,
) -> RedirectResponse:
    _require_casdoor(settings)
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=False) as http:
            target = await begin_login(settings, session, http, return_to)
    except AuthenticationError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    response = RedirectResponse(target, status_code=status.HTTP_302_FOUND)
    response.headers["Cache-Control"] = "no-store"
    return response


@router.get("/callback")
async def callback(
    session: DbSession,
    settings: SettingsDependency,
    code: str | None = None,
    state_value: Annotated[str | None, Query(alias="state")] = None,
    error: str | None = None,
) -> RedirectResponse:
    _require_casdoor(settings)
    if error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Casdoor login failed")
    if not code or not state_value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Authorization callback is missing code or state",
        )
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=False) as http:
            completed = await complete_login(
                settings,
                session,
                http,
                code=code,
                state=state_value,
            )
    except AuthenticationError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    target = f"{settings.public_base_url.rstrip('/')}{completed.return_to}"
    response = RedirectResponse(target, status_code=status.HTTP_302_FOUND)
    response.set_cookie(
        key=settings.session_cookie_name,
        value=completed.session_token,
        max_age=settings.session_ttl_seconds,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    response.headers["Cache-Control"] = "no-store"
    return response


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    session: DbSession,
    settings: SettingsDependency,
) -> Response:
    raw_session_token = request.cookies.get(settings.session_cookie_name)
    if raw_session_token:
        await revoke_session(session, raw_session_token)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(
        settings.session_cookie_name,
        path="/",
        secure=settings.cookie_secure,
        httponly=True,
        samesite="lax",
    )
    return response
