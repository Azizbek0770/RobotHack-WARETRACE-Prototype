"""Read-only warehouse catalog endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.db.session import get_db
from app.models import SKU, ExpectedInventory, StorageBin, Warehouse, Zone
from app.schemas.catalog import (
    BinSummary,
    ExpectedInventoryRow,
    Page,
    SKUSummary,
    WarehouseSummary,
    ZoneSummary,
)

router = APIRouter(tags=["Warehouse Catalog"])


def offset(page: int, page_size: int) -> int:
    return (page - 1) * page_size


@router.get("/warehouses", response_model=Page[WarehouseSummary])
def list_warehouses(
    db: Annotated[Session, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> Page[WarehouseSummary]:
    total = db.scalar(select(func.count()).select_from(Warehouse)) or 0

    items = db.scalars(
        select(Warehouse)
        .order_by(Warehouse.code)
        .offset(offset(page, page_size))
        .limit(page_size)
    ).all()

    return Page[WarehouseSummary](
        items=items,
        page=page,
        page_size=page_size,
        total=total,
    )


@router.get(
    "/warehouses/{warehouse_id}/zones",
    response_model=list[ZoneSummary],
)
def list_zones(
    warehouse_id: UUID,
    db: Annotated[Session, Depends(get_db)],
) -> list[ZoneSummary]:
    if db.get(Warehouse, warehouse_id) is None:
        raise HTTPException(
            status_code=404,
            detail="Warehouse not found",
        )

    return db.scalars(
        select(Zone).where(Zone.warehouse_id == warehouse_id).order_by(Zone.code)
    ).all()


@router.get(
    "/zones/{zone_id}/bins",
    response_model=list[BinSummary],
)
def list_bins(
    zone_id: UUID,
    db: Annotated[Session, Depends(get_db)],
) -> list[BinSummary]:
    if db.get(Zone, zone_id) is None:
        raise HTTPException(
            status_code=404,
            detail="Zone not found",
        )

    return db.scalars(
        select(StorageBin)
        .where(StorageBin.zone_id == zone_id)
        .order_by(StorageBin.code)
    ).all()


@router.get("/skus", response_model=Page[SKUSummary])
def list_skus(
    db: Annotated[Session, Depends(get_db)],
    search: str | None = Query(None, max_length=80),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> Page[SKUSummary]:
    stmt = select(SKU)

    if search and search.strip():
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                SKU.code.ilike(term),
                SKU.name.ilike(term),
            )
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    items = db.scalars(
        stmt.order_by(SKU.code).offset(offset(page, page_size)).limit(page_size)
    ).all()

    return Page[SKUSummary](
        items=items,
        page=page,
        page_size=page_size,
        total=total,
    )


@router.get(
    "/inventory/expected",
    response_model=Page[ExpectedInventoryRow],
)
def list_expected_inventory(
    warehouse_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> Page[ExpectedInventoryRow]:
    if db.get(Warehouse, warehouse_id) is None:
        raise HTTPException(
            status_code=404,
            detail="Warehouse not found",
        )

    stmt = (
        select(ExpectedInventory)
        .join(
            StorageBin,
            ExpectedInventory.bin_id == StorageBin.id,
        )
        .join(Zone, StorageBin.zone_id == Zone.id)
        .where(Zone.warehouse_id == warehouse_id)
    )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    items = db.scalars(
        stmt.options(
            selectinload(ExpectedInventory.sku),
            selectinload(ExpectedInventory.bin),
        )
        .order_by(
            StorageBin.code,
            ExpectedInventory.sku_id,
        )
        .offset(offset(page, page_size))
        .limit(page_size)
    ).all()

    return Page[ExpectedInventoryRow](
        items=items,
        page=page,
        page_size=page_size,
        total=total,
    )
