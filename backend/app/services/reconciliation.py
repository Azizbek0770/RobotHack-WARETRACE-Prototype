"""Snapshot-based inventory audit lifecycle and deterministic reconciliation."""

import csv
import io
from collections import Counter
from uuid import UUID

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.security import require_local_operational_writes
from app.db.base import utc_now
from app.models import (
    SKU,
    AuditFinding,
    AuditFindingAction,
    AuditFindingActionType,
    AuditFindingStatus,
    AuditFindingType,
    AuditStatus,
    ExpectedInventory,
    HandlingUnit,
    InventoryAudit,
    InventoryAuditSnapshot,
    StockObservation,
    StockObservationSource,
    StorageBin,
    Warehouse,
    Zone,
)
from app.schemas.audit import (
    AuditComparisonRead,
    AuditFindingActionCreate,
    AuditFindingActionRead,
    AuditFindingRead,
    AuditRead,
    AuditSnapshotItem,
    AuditSnapshotRead,
    AuditStart,
    ParsedObservation,
    StockObservationCreate,
    StockObservationRead,
)

MAX_CSV_BYTES = 2 * 1024 * 1024
MAX_CSV_ROWS = 5000
CSV_REQUIRED_COLUMNS = {"bin_id", "sku_id", "observed_qty"}
CSV_OPTIONAL_COLUMNS = {"handling_unit_codes"}


def create_audit(db: Session, request: AuditStart) -> AuditRead:
    require_local_operational_writes()
    try:
        with db.begin():
            if db.get(Warehouse, request.warehouse_id) is None:
                raise HTTPException(status_code=404, detail="Warehouse not found")
            if (
                db.scalar(
                    select(InventoryAudit.id).where(
                        InventoryAudit.request_key == request.request_key
                    )
                )
                is not None
            ):
                raise HTTPException(
                    status_code=409,
                    detail="Audit request key has already been used",
                )

            audit = InventoryAudit(
                warehouse_id=request.warehouse_id,
                request_key=request.request_key,
                started_by=request.started_by,
                classification=request.classification,
                status=AuditStatus.OPEN,
                snapshot_taken_at=utc_now(),
            )
            db.add(audit)
            db.flush()

            expected_rows = db.scalars(
                select(ExpectedInventory)
                .join(StorageBin, StorageBin.id == ExpectedInventory.bin_id)
                .join(Zone, Zone.id == StorageBin.zone_id)
                .where(Zone.warehouse_id == request.warehouse_id)
                .order_by(ExpectedInventory.bin_id, ExpectedInventory.sku_id)
            ).all()
            db.add_all(
                [
                    InventoryAuditSnapshot(
                        audit_id=audit.id,
                        expected_inventory_id=row.id,
                        bin_id=row.bin_id,
                        sku_id=row.sku_id,
                        expected_qty=row.expected_qty,
                        revision=row.revision,
                    )
                    for row in expected_rows
                ]
            )
            db.flush()
            return AuditRead.model_validate(audit)
    except IntegrityError as exc:
        raise HTTPException(
            status_code=409,
            detail="Audit request key has already been used",
        ) from exc


def read_audit(db: Session, audit_id: UUID) -> AuditRead:
    audit = db.get(InventoryAudit, audit_id)
    if audit is None:
        raise HTTPException(status_code=404, detail="Audit not found")
    return AuditRead.model_validate(audit)


def read_audit_snapshot(db: Session, audit_id: UUID) -> AuditSnapshotRead:
    audit = db.get(InventoryAudit, audit_id)
    if audit is None:
        raise HTTPException(status_code=404, detail="Audit not found")
    rows = db.scalars(
        select(InventoryAuditSnapshot)
        .where(InventoryAuditSnapshot.audit_id == audit_id)
        .order_by(InventoryAuditSnapshot.bin_id, InventoryAuditSnapshot.sku_id)
    ).all()
    return AuditSnapshotRead(
        audit_id=audit.id,
        snapshot_taken_at=audit.snapshot_taken_at,
        items=[AuditSnapshotItem.model_validate(row) for row in rows],
    )


def list_audits(db: Session, warehouse_id: UUID | None) -> list[AuditRead]:
    statement = select(InventoryAudit).order_by(
        InventoryAudit.created_at.desc(),
        InventoryAudit.id,
    )
    if warehouse_id is not None:
        statement = statement.where(InventoryAudit.warehouse_id == warehouse_id)
    return [
        AuditRead.model_validate(audit)
        for audit in db.scalars(statement.limit(100)).all()
    ]


def parse_observation_csv(data: bytes) -> list[ParsedObservation]:
    if len(data) > MAX_CSV_BYTES:
        raise HTTPException(status_code=413, detail="CSV upload exceeds 2 MiB")
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=400,
            detail="CSV must be UTF-8 encoded",
        ) from exc

    reader = csv.DictReader(io.StringIO(text, newline=""))
    headers = reader.fieldnames
    if headers is None or len(headers) != len(set(headers)):
        raise HTTPException(status_code=400, detail="CSV header is missing or repeated")
    header_set = set(headers)
    if not CSV_REQUIRED_COLUMNS.issubset(header_set) or not header_set.issubset(
        CSV_REQUIRED_COLUMNS | CSV_OPTIONAL_COLUMNS
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "CSV columns must be bin_id, sku_id, observed_qty, "
                "and optional handling_unit_codes"
            ),
        )

    observations: list[ParsedObservation] = []
    try:
        for row_number, row in enumerate(reader, start=2):
            if row_number > MAX_CSV_ROWS + 1:
                raise HTTPException(
                    status_code=413,
                    detail=f"CSV cannot exceed {MAX_CSV_ROWS} data rows",
                )
            if None in row or any(
                row.get(column) is None for column in CSV_REQUIRED_COLUMNS
            ):
                raise HTTPException(
                    status_code=400,
                    detail=f"CSV row {row_number} has missing or extra columns",
                )
            codes_value = row.get("handling_unit_codes", "") or ""
            codes = [item.strip() for item in codes_value.split("|") if item.strip()]
            observations.append(
                ParsedObservation.model_validate(
                    {
                        "bin_id": row["bin_id"],
                        "sku_id": row["sku_id"],
                        "observed_qty": row["observed_qty"],
                        "handling_unit_codes": codes,
                    }
                )
            )
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid CSV row {row_number}: values failed validation",
        ) from exc
    except csv.Error as exc:
        raise HTTPException(status_code=400, detail="Malformed CSV data") from exc

    if not observations:
        raise HTTPException(status_code=400, detail="CSV contains no observations")
    return observations


def _validate_observation_references(
    db: Session,
    audit: InventoryAudit,
    observations: list[ParsedObservation],
) -> None:
    bin_ids = {observation.bin_id for observation in observations}
    sku_ids = {observation.sku_id for observation in observations}

    bins = db.execute(
        select(StorageBin.id, Zone.warehouse_id)
        .join(Zone, Zone.id == StorageBin.zone_id)
        .where(StorageBin.id.in_(bin_ids))
    ).all()
    bin_warehouses = {bin_id: warehouse_id for bin_id, warehouse_id in bins}
    missing_bins = bin_ids - bin_warehouses.keys()
    if missing_bins:
        raise HTTPException(status_code=404, detail="One or more bins were not found")
    if any(
        warehouse_id != audit.warehouse_id for warehouse_id in bin_warehouses.values()
    ):
        raise HTTPException(
            status_code=422,
            detail="Every observed bin must belong to the audit warehouse",
        )

    found_skus = set(db.scalars(select(SKU.id).where(SKU.id.in_(sku_ids))).all())
    if sku_ids - found_skus:
        raise HTTPException(status_code=404, detail="One or more SKUs were not found")


def _ensure_open_audit(db: Session, audit_id: UUID) -> InventoryAudit:
    audit = db.scalar(
        select(InventoryAudit).where(InventoryAudit.id == audit_id).with_for_update()
    )
    if audit is None:
        raise HTTPException(status_code=404, detail="Audit not found")
    if audit.status != AuditStatus.OPEN:
        raise HTTPException(
            status_code=409,
            detail="Observations cannot be changed after comparison",
        )
    return audit


def record_manual_observation(
    db: Session,
    audit_id: UUID,
    request: StockObservationCreate,
) -> StockObservationRead:
    require_local_operational_writes()
    parsed = ParsedObservation.model_validate(request.model_dump())
    records = _record_observations(
        db,
        audit_id,
        [parsed],
        request.observed_by,
        StockObservationSource.MANUAL,
    )
    return StockObservationRead.model_validate(records[0])


def import_csv_observations(
    db: Session,
    audit_id: UUID,
    data: bytes,
    observed_by: str,
) -> list[StockObservationRead]:
    require_local_operational_writes()
    if len(observed_by.strip()) < 3 or len(observed_by) > 120:
        raise HTTPException(
            status_code=422,
            detail="observed_by must contain 3 to 120 characters",
        )
    parsed = parse_observation_csv(data)
    keys = [(row.bin_id, row.sku_id) for row in parsed]
    if len(keys) != len(set(keys)):
        raise HTTPException(
            status_code=409,
            detail="CSV contains more than one observation for the same bin and SKU",
        )
    records = _record_observations(
        db,
        audit_id,
        parsed,
        observed_by.strip(),
        StockObservationSource.CSV,
    )
    return [StockObservationRead.model_validate(row) for row in records]


def _record_observations(
    db: Session,
    audit_id: UUID,
    observations: list[ParsedObservation],
    observed_by: str,
    source: StockObservationSource,
) -> list[StockObservation]:
    try:
        with db.begin():
            audit = _ensure_open_audit(db, audit_id)
            _validate_observation_references(db, audit, observations)
            pairs = {(row.bin_id, row.sku_id) for row in observations}
            existing = db.scalars(
                select(StockObservation).where(
                    StockObservation.audit_id == audit_id,
                )
            ).all()
            if any((row.bin_id, row.sku_id) in pairs for row in existing):
                raise HTTPException(
                    status_code=409,
                    detail="An observation already exists for a bin and SKU in this audit",
                )

            rows = [
                StockObservation(
                    audit_id=audit_id,
                    bin_id=observation.bin_id,
                    sku_id=observation.sku_id,
                    observed_qty=observation.observed_qty,
                    source=source,
                    observed_by=observed_by,
                    handling_unit_codes=observation.handling_unit_codes,
                    audit=audit,
                )
                for observation in observations
            ]
            db.add_all(rows)
            db.flush()
            return rows
    except IntegrityError as exc:
        raise HTTPException(
            status_code=409,
            detail="Observation conflicts with an existing audit/bin/SKU record",
        ) from exc


def list_observations(db: Session, audit_id: UUID) -> list[StockObservationRead]:
    if db.get(InventoryAudit, audit_id) is None:
        raise HTTPException(status_code=404, detail="Audit not found")
    rows = db.scalars(
        select(StockObservation)
        .options(selectinload(StockObservation.audit))
        .where(StockObservation.audit_id == audit_id)
        .order_by(StockObservation.created_at, StockObservation.id)
    ).all()
    return [StockObservationRead.model_validate(row) for row in rows]


def _stale_observation(
    db: Session,
    observation: StockObservation,
    snapshot_by_pair: dict[tuple[UUID, UUID], InventoryAuditSnapshot],
) -> bool:
    snapshot = snapshot_by_pair.get((observation.bin_id, observation.sku_id))
    current = db.scalar(
        select(ExpectedInventory).where(
            ExpectedInventory.bin_id == observation.bin_id,
            ExpectedInventory.sku_id == observation.sku_id,
        )
    )
    if snapshot is None:
        return current is not None
    return (
        current is None
        or current.id != snapshot.expected_inventory_id
        or current.revision != snapshot.revision
        or current.expected_qty != snapshot.expected_qty
    )


def _comparison_result(
    db: Session,
    audit: InventoryAudit,
) -> AuditComparisonRead:
    findings = db.scalars(
        select(AuditFinding).where(AuditFinding.audit_id == audit.id)
    ).all()
    counts = Counter(finding.finding_type for finding in findings)
    return AuditComparisonRead(
        audit_id=audit.id,
        status=audit.status,
        finding_count=len(findings),
        counts_by_type={
            finding_type: counts[finding_type] for finding_type in AuditFindingType
        },
    )


def compare_audit(db: Session, audit_id: UUID) -> AuditComparisonRead:
    require_local_operational_writes()
    with db.begin():
        audit = db.scalar(
            select(InventoryAudit)
            .where(InventoryAudit.id == audit_id)
            .with_for_update()
        )
        if audit is None:
            raise HTTPException(status_code=404, detail="Audit not found")
        if audit.status == AuditStatus.COMPARED:
            return _comparison_result(db, audit)

        observations = db.scalars(
            select(StockObservation)
            .where(StockObservation.audit_id == audit.id)
            .order_by(StockObservation.bin_id, StockObservation.sku_id)
        ).all()
        snapshots = db.scalars(
            select(InventoryAuditSnapshot).where(
                InventoryAuditSnapshot.audit_id == audit.id
            )
        ).all()
        snapshot_by_pair = {(row.bin_id, row.sku_id): row for row in snapshots}
        if any(_stale_observation(db, row, snapshot_by_pair) for row in observations):
            raise HTTPException(
                status_code=409,
                detail=(
                    "Expected inventory changed after the audit snapshot; "
                    "start a new audit before comparing"
                ),
            )

        findings: list[AuditFinding] = []
        for observation in observations:
            snapshot = snapshot_by_pair.get((observation.bin_id, observation.sku_id))
            expected_qty = snapshot.expected_qty if snapshot is not None else 0
            delta = observation.observed_qty - expected_qty
            stock_type = (
                AuditFindingType.MISSING
                if delta < 0
                else AuditFindingType.EXCESS if delta > 0 else AuditFindingType.MATCH
            )
            findings.append(
                AuditFinding(
                    audit_id=audit.id,
                    observation_id=observation.id,
                    idempotency_key=f"stock:{observation.id}",
                    finding_type=stock_type,
                    expected_qty=expected_qty,
                    observed_qty=observation.observed_qty,
                    discrepancy_qty=delta,
                )
            )

            for code in observation.handling_unit_codes:
                handling_unit = db.scalar(
                    select(HandlingUnit).where(HandlingUnit.external_code == code)
                )
                if handling_unit is None:
                    findings.append(
                        AuditFinding(
                            audit_id=audit.id,
                            observation_id=observation.id,
                            idempotency_key=(
                                f"hu:unregistered:{observation.id}:{code}"
                            ),
                            finding_type=AuditFindingType.UNREGISTERED_HU,
                            handling_unit_code=code,
                        )
                    )
                elif (
                    handling_unit.sku_id == observation.sku_id
                    and handling_unit.bin_id != observation.bin_id
                ):
                    findings.append(
                        AuditFinding(
                            audit_id=audit.id,
                            observation_id=observation.id,
                            idempotency_key=f"hu:misplaced:{observation.id}:{code}",
                            finding_type=AuditFindingType.MISPLACED_HU,
                            handling_unit_code=code,
                            registered_bin_id=handling_unit.bin_id,
                        )
                    )
        db.add_all(findings)
        audit.status = AuditStatus.COMPARED
        audit.updated_at = utc_now()
        db.flush()
        return _comparison_result(db, audit)


def list_findings(db: Session, audit_id: UUID) -> list[AuditFindingRead]:
    if db.get(InventoryAudit, audit_id) is None:
        raise HTTPException(status_code=404, detail="Audit not found")
    rows = db.scalars(
        select(AuditFinding)
        .where(AuditFinding.audit_id == audit_id)
        .order_by(AuditFinding.created_at, AuditFinding.id)
    ).all()
    return [AuditFindingRead.model_validate(row) for row in rows]


def record_finding_action(
    db: Session,
    audit_id: UUID,
    finding_id: UUID,
    request: AuditFindingActionCreate,
) -> AuditFindingActionRead:
    require_local_operational_writes()
    with db.begin():
        finding = db.scalar(
            select(AuditFinding)
            .where(
                AuditFinding.id == finding_id,
                AuditFinding.audit_id == audit_id,
            )
            .with_for_update()
        )
        if finding is None:
            raise HTTPException(status_code=404, detail="Audit finding not found")

        if request.action == AuditFindingActionType.REVIEW:
            expected_status = AuditFindingStatus.OPEN
            target_status = AuditFindingStatus.REVIEWED
        else:
            expected_status = AuditFindingStatus.REVIEWED
            target_status = AuditFindingStatus.RESOLVED
        if finding.status != expected_status:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Cannot {request.action.value.lower()} a finding "
                    f"in {finding.status.value} status"
                ),
            )

        action = AuditFindingAction(
            finding_id=finding.id,
            action=request.action,
            from_status=finding.status,
            to_status=target_status,
            actor=request.actor,
            note=request.note,
        )
        finding.status = target_status
        finding.updated_at = utc_now()
        db.add(action)
        db.flush()
        return AuditFindingActionRead.model_validate(action)


def list_finding_actions(
    db: Session,
    audit_id: UUID,
    finding_id: UUID,
) -> list[AuditFindingActionRead]:
    finding = db.scalar(
        select(AuditFinding).where(
            AuditFinding.id == finding_id,
            AuditFinding.audit_id == audit_id,
        )
    )
    if finding is None:
        raise HTTPException(status_code=404, detail="Audit finding not found")
    actions = db.scalars(
        select(AuditFindingAction)
        .where(AuditFindingAction.finding_id == finding_id)
        .order_by(AuditFindingAction.created_at, AuditFindingAction.id)
    ).all()
    return [AuditFindingActionRead.model_validate(action) for action in actions]
