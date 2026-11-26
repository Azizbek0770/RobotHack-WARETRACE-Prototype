"""Read and write endpoints for inventory audits."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.audit import (
    AuditComparisonRead,
    AuditFindingActionCreate,
    AuditFindingActionRead,
    AuditFindingRead,
    AuditRead,
    AuditSnapshotRead,
    AuditStart,
    ObservationImportResult,
    StockObservationCreate,
    StockObservationRead,
)
from app.services.reconciliation import (
    MAX_CSV_BYTES,
    compare_audit,
    create_audit,
    import_csv_observations,
    list_audits,
    list_finding_actions,
    list_findings,
    list_observations,
    read_audit,
    read_audit_snapshot,
    record_finding_action,
    record_manual_observation,
)

router = APIRouter(prefix="/audits", tags=["Inventory Audits"])


@router.post("", status_code=201, response_model=AuditRead)
def start_audit(
    request: AuditStart,
    db: Annotated[Session, Depends(get_db)],
) -> AuditRead:
    return create_audit(db, request)


@router.get("", response_model=list[AuditRead])
def get_audits(
    db: Annotated[Session, Depends(get_db)],
    warehouse_id: UUID | None = None,
) -> list[AuditRead]:
    return list_audits(db, warehouse_id)


@router.get("/{audit_id}", response_model=AuditRead)
def get_audit(
    audit_id: UUID,
    db: Annotated[Session, Depends(get_db)],
) -> AuditRead:
    return read_audit(db, audit_id)


@router.get("/{audit_id}/snapshot", response_model=AuditSnapshotRead)
def get_audit_snapshot(
    audit_id: UUID,
    db: Annotated[Session, Depends(get_db)],
) -> AuditSnapshotRead:
    return read_audit_snapshot(db, audit_id)


@router.post(
    "/{audit_id}/observations",
    status_code=201,
    response_model=StockObservationRead,
)
def add_observation(
    audit_id: UUID,
    request: StockObservationCreate,
    db: Annotated[Session, Depends(get_db)],
) -> StockObservationRead:
    return record_manual_observation(db, audit_id, request)


@router.post(
    "/{audit_id}/observations/import",
    status_code=201,
    response_model=ObservationImportResult,
)
async def import_observations(
    audit_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    observed_by: Annotated[str, Form(min_length=3, max_length=120)],
    file: Annotated[UploadFile, File()],
) -> ObservationImportResult:
    try:
        data = await file.read(MAX_CSV_BYTES + 1)
    finally:
        await file.close()
    if len(data) > MAX_CSV_BYTES:
        raise HTTPException(status_code=413, detail="CSV upload exceeds 2 MiB")
    observations = import_csv_observations(db, audit_id, data, observed_by)
    return ObservationImportResult(
        imported_count=len(observations),
        observations=observations,
    )


@router.get(
    "/{audit_id}/observations",
    response_model=list[StockObservationRead],
)
def get_observations(
    audit_id: UUID,
    db: Annotated[Session, Depends(get_db)],
) -> list[StockObservationRead]:
    return list_observations(db, audit_id)


@router.post("/{audit_id}/compare", response_model=AuditComparisonRead)
def run_comparison(
    audit_id: UUID,
    db: Annotated[Session, Depends(get_db)],
) -> AuditComparisonRead:
    return compare_audit(db, audit_id)


@router.get("/{audit_id}/findings", response_model=list[AuditFindingRead])
def get_findings(
    audit_id: UUID,
    db: Annotated[Session, Depends(get_db)],
) -> list[AuditFindingRead]:
    return list_findings(db, audit_id)


@router.post(
    "/{audit_id}/findings/{finding_id}/actions",
    status_code=201,
    response_model=AuditFindingActionRead,
)
def add_finding_action(
    audit_id: UUID,
    finding_id: UUID,
    request: AuditFindingActionCreate,
    db: Annotated[Session, Depends(get_db)],
) -> AuditFindingActionRead:
    return record_finding_action(db, audit_id, finding_id, request)


@router.get(
    "/{audit_id}/findings/{finding_id}/actions",
    response_model=list[AuditFindingActionRead],
)
def get_finding_actions(
    audit_id: UUID,
    finding_id: UUID,
    db: Annotated[Session, Depends(get_db)],
) -> list[AuditFindingActionRead]:
    return list_finding_actions(db, audit_id, finding_id)
