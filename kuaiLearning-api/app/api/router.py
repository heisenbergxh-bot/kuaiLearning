from fastapi import APIRouter

from app.api.routes import health, identity, workspaces

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(identity.router)
api_router.include_router(workspaces.router)
