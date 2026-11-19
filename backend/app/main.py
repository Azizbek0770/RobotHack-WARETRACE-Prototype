from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.errors import register_error_handlers


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="WARETRACE API",
        description="Warehouse Intelligence Platform",
        version="0.1.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=[
            "GET",
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
        ],
        allow_headers=[
            "Content-Type",
            "Authorization",
        ],
    )

    register_error_handlers(app)

    app.include_router(
        api_router,
        prefix=settings.api_prefix,
    )

    return app


app = create_app()
