"""Read and write endpoints for handling units."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.db.session import get_db
from app.models import HandlingUnit, WarehouseEvent
from app.schemas.catalog import Page
from app.schemas.handling_unit import (
    HandlingUnitCreate,
    HandlingUnitMove,
    HandlingUnitRead,
    WarehouseEventRead,
)
from app.services.handling_units import (
    create_hu,
    move_hu,
    read_hu,
)

router = APIRouter(
    prefix="/handling-units",
    tags=["Handling Units"],
)


@router.post(
    "",
    status_code=201,
    response_model=HandlingUnitRead,
)
def create_handling_unit(
    request: HandlingUnitCreate,
    db: Annotated[Session, Depends(get_db)],
) -> HandlingUnitRead:
    return create_hu(db, request)


@router.get("", response_model=Page[HandlingUnitRead])
def list_handling_units(
    db: Annotated[Session, Depends(get_db)],
    search: str | None = Query(None, max_length=120),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> Page[HandlingUnitRead]:
    stmt = select(HandlingUnit)

    if search and search.strip():
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                HandlingUnit.external_code.ilike(term),
                HandlingUnit.sku.has(code=search.strip()),
            )
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    items = db.scalars(
        stmt.options(
            selectinload(HandlingUnit.sku),
            selectinload(HandlingUnit.bin),
        )
        .order_by(HandlingUnit.external_code)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return Page[HandlingUnitRead](
        items=[HandlingUnitRead.model_validate(hu) for hu in items],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.get(
    "/by-code/{external_code}",
    response_model=HandlingUnitRead,
)
def get_handling_unit_by_code(
    external_code: str,
    db: Annotated[Session, Depends(get_db)],
) -> HandlingUnitRead:
    hu_id = db.scalar(
        select(HandlingUnit.id).where(HandlingUnit.external_code == external_code)
    )

    if hu_id is None:
        raise HTTPException(
            status_code=404,
            detail="Handling unit not found",
        )

    return read_hu(db, hu_id)


@router.get(
    "/{hu_id}",
    response_model=HandlingUnitRead,
)
def get_handling_unit(
    hu_id: UUID,
    db: Annotated[Session, Depends(get_db)],
) -> HandlingUnitRead:
    return read_hu(db, hu_id)


@router.post(
    "/{hu_id}/move",
    response_model=HandlingUnitRead,
)
def move_handling_unit(
    hu_id: UUID,
    request: HandlingUnitMove,
    db: Annotated[Session, Depends(get_db)],
) -> HandlingUnitRead:
    return move_hu(db, hu_id, request)


@router.get(
    "/{hu_id}/events",
    response_model=Page[WarehouseEventRead],
)
def get_handling_unit_events(
    hu_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> Page[WarehouseEventRead]:
    if db.get(HandlingUnit, hu_id) is None:
        raise HTTPException(
            status_code=404,
            detail="Handling unit not found",
        )

    stmt = select(WarehouseEvent).where(WarehouseEvent.hu_id == hu_id)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    items = db.scalars(
        stmt.order_by(
            WarehouseEvent.created_at,
            WarehouseEvent.id,
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return Page[WarehouseEventRead](
        items=[WarehouseEventRead.model_validate(event) for event in items],
        page=page,
        page_size=page_size,
        total=total,
    )
