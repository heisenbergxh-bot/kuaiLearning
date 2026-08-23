from fastapi import APIRouter

from app.api.routes import auth, health, identity, learning_content, workspaces

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(health.router)
api_router.include_router(identity.router)
api_router.include_router(workspaces.router)
api_router.include_router(learning_content.router)
