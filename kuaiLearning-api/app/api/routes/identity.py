from fastapi import APIRouter
from pydantic import BaseModel

from app.core.current_user import CurrentUserDependency

router = APIRouter(prefix="/me", tags=["identity"])


class CurrentUserResponse(BaseModel):
    subject: str
    employee_id: str | None
    external_subject: str | None
    preferred_username: str | None
    display_name: str | None
    email: str | None
    auth_source: str


@router.get("", response_model=CurrentUserResponse)
async def get_current_user(user: CurrentUserDependency) -> CurrentUserResponse:
    return CurrentUserResponse(
        subject=user.subject,
        employee_id=user.employee_id,
        external_subject=user.external_subject,
        preferred_username=user.preferred_username,
        display_name=user.display_name,
        email=user.email,
        auth_source=user.auth_source,
    )
