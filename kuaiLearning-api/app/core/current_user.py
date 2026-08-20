from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

from app.core.config import Settings, get_settings


@dataclass(frozen=True, slots=True)
class CurrentUser:
    subject: str
    employee_id: str | None = None


async def require_current_user(
    settings: Annotated[Settings, Depends(get_settings)],
    debug_user: Annotated[str | None, Header(alias="X-Debug-User")] = None,
    debug_employee_id: Annotated[str | None, Header(alias="X-Debug-Employee-Id")] = None,
) -> CurrentUser:
    if settings.auth_mode == "development":
        return CurrentUser(subject=debug_user or "local-demo", employee_id=debug_employee_id)
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Unified authentication adapter is not configured",
    )


CurrentUserDependency = Annotated[CurrentUser, Depends(require_current_user)]
