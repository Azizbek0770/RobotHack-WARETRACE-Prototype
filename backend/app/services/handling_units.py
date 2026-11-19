"""Transaction-safe demonstration handling-unit operations."""

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.db.base import utc_now
from app.models import (
    SKU,
    ExpectedInventory,
    HandlingUnit,
    HandlingUnitStatus,
    StorageBin,
    Warehouse,
    WarehouseEvent,
    WarehouseEventType,
    Zone,
    ZoneKind,
)
from app.schemas.handling_unit import (
    HandlingUnitCreate,
    HandlingUnitMove,
    HandlingUnitRead,
)

SOURCE = "WARETRACE_DEMO_API"


def read_hu(db: Session, hu_id: UUID) -> HandlingUnitRead:
    hu = db.scalar(
        select(HandlingUnit)
        .where(HandlingUnit.id == hu_id)
        .options(
            selectinload(HandlingUnit.sku),
            selectinload(HandlingUnit.bin),
        )
        .execution_options(populate_existing=True)
    )

    if hu is None:
        raise HTTPException(
            status_code=404,
            detail="Handling unit not found",
        )

    return HandlingUnitRead.model_validate(hu)


def create_hu(
    db: Session,
    request: HandlingUnitCreate,
) -> HandlingUnitRead:
    try:
        with db.begin():
            if db.get(SKU, request.sku_id) is None:
                raise HTTPException(
                    status_code=404,
                    detail="SKU not found",
                )

            hu = HandlingUnit(
                external_code=request.external_code,
                sku_id=request.sku_id,
                quantity=request.quantity,
                status=HandlingUnitStatus.RECEIVED,
                version=1,
            )
            db.add(hu)
            db.flush()

            db.add(
                WarehouseEvent(
                    hu_id=hu.id,
                    event_type=WarehouseEventType.HU_CREATED,
                    from_bin_id=None,
                    to_bin_id=None,
                    before_status=None,
                    after_status=HandlingUnitStatus.RECEIVED.value,
                    quantity=hu.quantity,
                    before_version=None,
                    after_version=1,
                )
            )
            db.flush()

            result = read_hu(db, hu.id)

        return result

    except IntegrityError as exc:
        raise HTTPException(
            status_code=409,
            detail="Handling unit code conflicts with an existing record",
        ) from exc


def move_hu(
    db: Session,
    hu_id: UUID,
    request: HandlingUnitMove,
) -> HandlingUnitRead:
    try:
        with db.begin():
            hu = db.scalar(
                select(HandlingUnit).where(HandlingUnit.id == hu_id).with_for_update()
            )

            if hu is None:
                raise HTTPException(
                    status_code=404,
                    detail="Handling unit not found",
                )

            if hu.version != request.expected_version:
                raise HTTPException(
                    status_code=409,
                    detail="Stale handling unit version",
                )

            if hu.status not in (
                HandlingUnitStatus.RECEIVED,
                HandlingUnitStatus.STORED,
            ):
                raise HTTPException(
                    status_code=409,
                    detail="Handling unit status cannot be moved in this stage",
                )

            if (
                hu.status == HandlingUnitStatus.STORED
                and hu.bin_id == request.target_bin_id
            ):
                raise HTTPException(
                    status_code=409,
                    detail="Handling unit is already in this bin",
                )

            # Lock all affected bins in deterministic order.
            bin_ids = {request.target_bin_id}

            if hu.bin_id is not None:
                bin_ids.add(hu.bin_id)

            locked_bins = db.scalars(
                select(StorageBin)
                .where(StorageBin.id.in_(bin_ids))
                .order_by(StorageBin.id)
                .with_for_update()
            ).all()

            bins_by_id = {storage_bin.id: storage_bin for storage_bin in locked_bins}

            target = bins_by_id.get(request.target_bin_id)

            if target is None:
                raise HTTPException(
                    status_code=404,
                    detail="Target bin not found",
                )

            target_zone = db.get(Zone, target.zone_id)

            if target_zone is None or target_zone.kind != ZoneKind.STORAGE:
                raise HTTPException(
                    status_code=409,
                    detail="Destination must be a storage zone",
                )

            warehouse = db.get(
                Warehouse,
                target_zone.warehouse_id,
            )

            if warehouse is None or not warehouse.is_active:
                raise HTTPException(
                    status_code=409,
                    detail="Target warehouse is inactive",
                )

            if not target.is_accessible:
                raise HTTPException(
                    status_code=409,
                    detail="Target bin is inaccessible",
                )

            if hu.bin_id is not None:
                source = bins_by_id.get(hu.bin_id)

                if source is None:
                    raise HTTPException(
                        status_code=409,
                        detail="Source bin unavailable",
                    )

                source_zone = db.get(Zone, source.zone_id)

                if (
                    source_zone is None
                    or source_zone.warehouse_id != target_zone.warehouse_id
                ):
                    raise HTTPException(
                        status_code=409,
                        detail="Cross-warehouse moves are not supported",
                    )

            # Capacity currently means aggregate expected units,
            # not geometric volume or weight.
            current_expected = db.scalar(
                select(
                    func.coalesce(
                        func.sum(ExpectedInventory.expected_qty),
                        0,
                    )
                ).where(ExpectedInventory.bin_id == request.target_bin_id)
            )

            if (
                target.capacity_units is not None
                and current_expected + hu.quantity > target.capacity_units
            ):
                raise HTTPException(
                    status_code=409,
                    detail="Destination capacity exceeded",
                )

            before_status = hu.status.value
            before_bin_id = hu.bin_id
            before_version = hu.version

            # Atomic version comparison prevents stale writes.
            changed = db.execute(
                update(HandlingUnit)
                .where(
                    HandlingUnit.id == hu_id,
                    HandlingUnit.version == request.expected_version,
                )
                .values(
                    bin_id=request.target_bin_id,
                    status=HandlingUnitStatus.STORED,
                    version=HandlingUnit.version + 1,
                    updated_at=utc_now(),
                )
                .execution_options(
                    synchronize_session=False,
                )
            )

            if changed.rowcount != 1:
                raise HTTPException(
                    status_code=409,
                    detail="Stale handling unit version",
                )

            # Remove the booked quantity from the source bin.
            if before_status == HandlingUnitStatus.STORED.value:
                removed = db.execute(
                    update(ExpectedInventory)
                    .where(
                        ExpectedInventory.bin_id == before_bin_id,
                        ExpectedInventory.sku_id == hu.sku_id,
                        ExpectedInventory.expected_qty >= hu.quantity,
                    )
                    .values(
                        expected_qty=(ExpectedInventory.expected_qty - hu.quantity),
                        revision=(ExpectedInventory.revision + 1),
                        source=SOURCE,
                    )
                )

                if removed.rowcount != 1:
                    raise HTTPException(
                        status_code=409,
                        detail="Source expected-stock ledger mismatch",
                    )

            # Book the quantity into the destination bin.
            added = db.execute(
                update(ExpectedInventory)
                .where(
                    ExpectedInventory.bin_id == request.target_bin_id,
                    ExpectedInventory.sku_id == hu.sku_id,
                )
                .values(
                    expected_qty=(ExpectedInventory.expected_qty + hu.quantity),
                    revision=ExpectedInventory.revision + 1,
                    source=SOURCE,
                )
            )

            if added.rowcount == 0:
                db.add(
                    ExpectedInventory(
                        bin_id=request.target_bin_id,
                        sku_id=hu.sku_id,
                        expected_qty=hu.quantity,
                        revision=1,
                        source=SOURCE,
                    )
                )

            db.add(
                WarehouseEvent(
                    hu_id=hu_id,
                    event_type=WarehouseEventType.HU_MOVED,
                    from_bin_id=before_bin_id,
                    to_bin_id=request.target_bin_id,
                    before_status=before_status,
                    after_status=HandlingUnitStatus.STORED.value,
                    quantity=hu.quantity,
                    before_version=before_version,
                    after_version=before_version + 1,
                )
            )

            db.flush()
            result = read_hu(db, hu_id)

        return result

    except IntegrityError as exc:
        raise HTTPException(
            status_code=409,
            detail="Inventory write conflict; retry after refreshing",
        ) from exc
