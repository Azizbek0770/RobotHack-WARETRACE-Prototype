from fastapi import APIRouter

from app.api.v1 import (
    catalog,
    handling_units,
    health,
    inspections,
    intake,
)

api_router = APIRouter()

api_router.include_router(health.router)
api_router.include_router(catalog.router)
api_router.include_router(handling_units.router)
api_router.include_router(intake.router)
api_router.include_router(inspections.router)
