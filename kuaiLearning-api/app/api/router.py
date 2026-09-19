from fastapi import APIRouter

from app.api.routes import (
    ai_completion,
    ai_settings,
    auth,
    health,
    identity,
    knowledge,
    learning_content,
    workspaces,
)

api_router = APIRouter()
api_router.include_router(ai_completion.router)
api_router.include_router(ai_settings.router)
api_router.include_router(auth.router)
api_router.include_router(health.router)
api_router.include_router(identity.router)
api_router.include_router(workspaces.router)
api_router.include_router(learning_content.router)
api_router.include_router(knowledge.router)
