"""Development write-surface guards."""

from fastapi import HTTPException

from app.core.config import get_settings


def require_local_operational_writes() -> None:
    """Prevent unauthenticated mutation endpoints in production mode."""

    environment = get_settings().environment
    if environment == "production":
        raise HTTPException(
            status_code=403,
            detail="Operational writes require an authorized production service",
        )
