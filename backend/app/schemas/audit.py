"""Request and response contracts for inventory audits."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.audit import (
    AuditDataClassification,
    AuditFindingActionType,
    AuditFindingStatus,
    AuditFindingType,
    AuditStatus,
    StockObservationSource,
)


class AuditStart(BaseModel):
    warehouse_id: UUID
    request_key: str = Field(min_length=3, max_length=120)
    started_by: str = Field(min_length=3, max_length=120)
    classification: AuditDataClassification


class AuditRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    warehouse_id: UUID
    request_key: str
    started_by: str
    classification: AuditDataClassification
    status: AuditStatus
    snapshot_taken_at: datetime
    created_at: datetime


class AuditSnapshotItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    expected_inventory_id: UUID
    bin_id: UUID
    sku_id: UUID
    expected_qty: int
    revision: int


class AuditSnapshotRead(BaseModel):
    audit_id: UUID
    snapshot_taken_at: datetime
    items: list[AuditSnapshotItem]


class StockObservationCreate(BaseModel):
    bin_id: UUID
    sku_id: UUID
    observed_qty: int = Field(ge=0)
    observed_by: str = Field(min_length=3, max_length=120)
    handling_unit_codes: list[str] = Field(default_factory=list, max_length=200)

    @field_validator("handling_unit_codes")
    @classmethod
    def validate_handling_unit_codes(cls, codes: list[str]) -> list[str]:
        normalized = [code.strip() for code in codes]
        if any(not code or len(code) > 120 for code in normalized):
            raise ValueError("Handling-unit codes must contain 1 to 120 characters")
        if len(normalized) != len(set(normalized)):
            raise ValueError("Handling-unit codes must be unique per observation")
        return normalized


class StockObservationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    audit_id: UUID
    bin_id: UUID
    sku_id: UUID
    observed_qty: int
    source: StockObservationSource
    observed_by: str
    classification: AuditDataClassification
    handling_unit_codes: list[str]
    created_at: datetime


class ObservationImportResult(BaseModel):
    imported_count: int
    observations: list[StockObservationRead]


class AuditComparisonRead(BaseModel):
    audit_id: UUID
    status: AuditStatus
    finding_count: int
    counts_by_type: dict[AuditFindingType, int]


class AuditFindingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    audit_id: UUID
    observation_id: UUID
    idempotency_key: str
    finding_type: AuditFindingType
    expected_qty: int | None
    observed_qty: int | None
    discrepancy_qty: int | None
    handling_unit_code: str | None
    registered_bin_id: UUID | None
    status: AuditFindingStatus
    created_at: datetime


class AuditFindingActionCreate(BaseModel):
    action: AuditFindingActionType
    actor: str = Field(min_length=3, max_length=120)
    note: str | None = Field(default=None, max_length=1000)


class AuditFindingActionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    finding_id: UUID
    action: AuditFindingActionType
    from_status: AuditFindingStatus
    to_status: AuditFindingStatus
    actor: str
    note: str | None
    created_at: datetime


class ParsedObservation(BaseModel):
    """Validated row shared by CSV and JSON observation ingestion."""

    bin_id: UUID
    sku_id: UUID
    observed_qty: int = Field(ge=0)
    handling_unit_codes: list[str] = Field(default_factory=list, max_length=200)

    @field_validator("handling_unit_codes")
    @classmethod
    def validate_handling_unit_codes(cls, codes: list[str]) -> list[str]:
        return StockObservationCreate.validate_handling_unit_codes(codes)
