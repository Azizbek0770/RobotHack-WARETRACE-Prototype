"""Controlled handling-unit inspection operations."""

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import utc_now
from app.models import (
    HandlingUnit,
    HandlingUnitInspection,
    HandlingUnitStatus,
    InspectionResult,
    WarehouseEvent,
    WarehouseEventType,
)
from app.schemas.inspection import InspectionCreate, InspectionRead


def list_inspections(db: Session, hu_id: UUID) -> list[InspectionRead]:
    if db.get(HandlingUnit, hu_id) is None:
        raise HTTPException(status_code=404, detail="Handling unit not found")

    rows = db.scalars(
        select(HandlingUnitInspection)
        .where(HandlingUnitInspection.hu_id == hu_id)
        .order_by(
            HandlingUnitInspection.created_at.desc(),
            HandlingUnitInspection.id.desc(),
        )
    ).all()
    return [InspectionRead.model_validate(row) for row in rows]


def has_passed_inspection(db: Session, hu_id: UUID) -> bool:
    result = db.scalar(
        select(HandlingUnitInspection.result)
        .where(
            HandlingUnitInspection.hu_id == hu_id,
            HandlingUnitInspection.result == InspectionResult.PASS,
        )
        .order_by(
            HandlingUnitInspection.created_at.desc(),
            HandlingUnitInspection.id.desc(),
        )
        .limit(1)
    )
    return result == InspectionResult.PASS


def record_inspection(
    db: Session,
    hu_id: UUID,
    request: InspectionCreate,
) -> InspectionRead:
    with db.begin():
        hu = db.scalar(
            select(HandlingUnit).where(HandlingUnit.id == hu_id).with_for_update()
        )
        if hu is None:
            raise HTTPException(
                status_code=404,
                detail="Handling unit not found",
            )

        if hu.status not in (
            HandlingUnitStatus.RECEIVED,
            HandlingUnitStatus.INSPECTION_REQUIRED,
        ):
            raise HTTPException(
                status_code=409,
                detail="Handling unit is not eligible for inspection",
            )

        existing = db.scalar(
            select(HandlingUnitInspection.id)
            .where(HandlingUnitInspection.hu_id == hu_id)
            .limit(1)
        )
        if existing is not None:
            raise HTTPException(
                status_code=409,
                detail="A final inspection already exists for this handling unit",
            )

        before_status = hu.status.value
        before_version = hu.version
        result = InspectionResult(request.result)

        if result == InspectionResult.PASS:
            after_status = HandlingUnitStatus.INSPECTION_REQUIRED
            event_type = WarehouseEventType.HU_INSPECTION_PASSED
        else:
            after_status = HandlingUnitStatus.QUARANTINED
            event_type = WarehouseEventType.HU_INSPECTION_FAILED

        hu.status = after_status
        hu.version = before_version + 1
        hu.updated_at = utc_now()

        inspection = HandlingUnitInspection(
            hu_id=hu.id,
            result=result,
            checklist_answers=request.checklist_answers,
            damage_notes=request.damage_notes,
            evidence_metadata=request.evidence_metadata,
            evidence_checksum=request.evidence_checksum,
            operator_actor=request.operator_actor,
        )
        db.add(inspection)
        db.flush()

        db.add(
            WarehouseEvent(
                hu_id=hu.id,
                event_type=event_type,
                from_bin_id=hu.bin_id,
                to_bin_id=hu.bin_id,
                before_status=before_status,
                after_status=after_status.value,
                quantity=hu.quantity,
                before_version=before_version,
                after_version=before_version + 1,
                source_label="INSPECTION_SERVICE",
            )
        )
        db.flush()

        result_row = db.get(HandlingUnitInspection, inspection.id)
        if result_row is None:
            raise RuntimeError("Inspection write did not persist")
        return InspectionRead.model_validate(result_row)
