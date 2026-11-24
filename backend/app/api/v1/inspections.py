"""Handling-unit inspection endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.inspection import InspectionCreate, InspectionRead
from app.services.inspection import list_inspections, record_inspection

router = APIRouter(
    prefix="/handling-units",
    tags=["Inspections"],
)


@router.post(
    "/{hu_id}/inspection",
    response_model=InspectionRead,
)
def create_inspection(
    hu_id: UUID,
    request: InspectionCreate,
    db: Annotated[Session, Depends(get_db)],
) -> InspectionRead:
    return record_inspection(db, hu_id, request)


@router.get(
    "/{hu_id}/inspections",
    response_model=list[InspectionRead],
)
def get_inspections(
    hu_id: UUID,
    db: Annotated[Session, Depends(get_db)],
) -> list[InspectionRead]:
    return list_inspections(db, hu_id)
