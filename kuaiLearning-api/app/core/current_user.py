from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.service import resolve_session
from app.core.config import Settings, get_settings
from app.db.session import get_db_session


@dataclass(frozen=True, slots=True)
class CurrentUser:
    subject: str
    employee_id: str | None = None
    external_subject: str | None = None
    preferred_username: str | None = None
    display_name: str | None = None
    email: str | None = None
    auth_source: str = "development"


async def require_current_user(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    debug_user: Annotated[str | None, Header(alias="X-Debug-User")] = None,
    debug_employee_id: Annotated[str | None, Header(alias="X-Debug-Employee-Id")] = None,
) -> CurrentUser:
    if settings.auth_mode == "development":
        return CurrentUser(subject=debug_user or "local-demo", employee_id=debug_employee_id)
    if not settings.casdoor_is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Casdoor authentication is not configured",
        )
    raw_session_token = request.cookies.get(settings.session_cookie_name)
    if not raw_session_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    identity = await resolve_session(session, raw_session_token)
    if identity is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session is invalid")
    return CurrentUser(
        subject=identity.id,
        employee_id=identity.employee_id,
        external_subject=identity.external_subject,
        preferred_username=identity.preferred_username,
        display_name=identity.display_name,
        email=identity.email,
        auth_source="casdoor",
    )


CurrentUserDependency = Annotated[CurrentUser, Depends(require_current_user)]
