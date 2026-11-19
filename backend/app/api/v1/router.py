from fastapi import APIRouter

from app.api.v1 import catalog, handling_units, health

api_router = APIRouter()

api_router.include_router(health.router)
api_router.include_router(catalog.router)
api_router.include_router(handling_units.router)
