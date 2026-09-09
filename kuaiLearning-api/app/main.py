from fastapi import FastAPI, Request, status
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.base import RequestResponseEndpoint
from starlette.responses import Response

from app.api.router import api_router
from app.core.config import Settings, get_settings


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(
        title="KuaiLearning API",
        version="0.1.0",
        docs_url="/docs" if settings.app_env != "production" else None,
        redoc_url=None,
    )

    @app.exception_handler(RequestValidationError)
    async def safe_validation_error(request: Request, exc: RequestValidationError) -> Response:
        if request.url.path.rstrip("/") == "/api/v1/settings/ai":
            return JSONResponse(
                status_code=422,
                content={
                    "detail": [
                        {key: error[key] for key in ("type", "loc", "msg")}
                        for error in exc.errors()
                    ]
                },
            )
        return await request_validation_exception_handler(request, exc)

    @app.middleware("http")
    async def reject_cross_origin_cookie_writes(
        request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        if settings.auth_mode == "external" and request.method not in {"GET", "HEAD", "OPTIONS"}:
            if request.headers.get("origin") != settings.public_base_url.rstrip("/"):
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={"detail": "Cross-origin write request rejected"},
                )
        return await call_next(request)

    app.include_router(api_router, prefix="/api/v1")
    return app


app = create_app()
