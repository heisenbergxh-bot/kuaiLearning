from fastapi import APIRouter
from pydantic import BaseModel

from app.core.current_user import CurrentUserDependency

router = APIRouter(prefix="/me", tags=["identity"])


class CurrentUserResponse(BaseModel):
    subject: str
    employee_id: str | None
    auth_source: str = "placeholder"


@router.get("", response_model=CurrentUserResponse)
async def get_current_user(user: CurrentUserDependency) -> CurrentUserResponse:
    return CurrentUserResponse(subject=user.subject, employee_id=user.employee_id)
