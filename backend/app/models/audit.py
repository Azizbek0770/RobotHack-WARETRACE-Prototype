"""Persistent inventory audit snapshots, observations, findings and actions."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, IdentityTimestampMixin, utc_now

if TYPE_CHECKING:
    from app.models.inventory import SKU
    from app.models.warehouse import StorageBin, Warehouse


class AuditDataClassification(str, Enum):
    OPERATIONAL = "OPERATIONAL"
    SIMULATED = "SIMULATED"


class AuditStatus(str, Enum):
    OPEN = "OPEN"
    COMPARED = "COMPARED"


class StockObservationSource(str, Enum):
    MANUAL = "MANUAL"
    CSV = "CSV"
    SCANNER = "SCANNER"
    SIMULATED_AMR = "SIMULATED_AMR"


class AuditFindingType(str, Enum):
    MISSING = "MISSING"
    EXCESS = "EXCESS"
    MATCH = "MATCH"
    UNREGISTERED_HU = "UNREGISTERED_HU"
    MISPLACED_HU = "MISPLACED_HU"


class AuditFindingStatus(str, Enum):
    OPEN = "OPEN"
    REVIEWED = "REVIEWED"
    RESOLVED = "RESOLVED"


class AuditFindingActionType(str, Enum):
    REVIEW = "REVIEW"
    RESOLVE = "RESOLVE"


class InventoryAudit(IdentityTimestampMixin, Base):
    __tablename__ = "inventory_audit"
    __table_args__ = (
        CheckConstraint(
            "length(started_by) >= 3",
            name="ck_inventory_audit_started_by",
        ),
    )

    warehouse_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("warehouse.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    request_key: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    started_by: Mapped[str] = mapped_column(String(120), nullable=False)
    classification: Mapped[AuditDataClassification] = mapped_column(
        SAEnum(
            AuditDataClassification,
            name="audit_data_classification",
            native_enum=False,
            create_constraint=True,
        ),
        nullable=False,
    )
    status: Mapped[AuditStatus] = mapped_column(
        SAEnum(
            AuditStatus,
            name="inventory_audit_status",
            native_enum=False,
            create_constraint=True,
        ),
        nullable=False,
        default=AuditStatus.OPEN,
    )
    snapshot_taken_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    warehouse: Mapped["Warehouse"] = relationship()
    snapshots: Mapped[list["InventoryAuditSnapshot"]] = relationship(
        back_populates="audit",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    observations: Mapped[list["StockObservation"]] = relationship(
        back_populates="audit",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    findings: Mapped[list["AuditFinding"]] = relationship(
        back_populates="audit",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class InventoryAuditSnapshot(IdentityTimestampMixin, Base):
    __tablename__ = "inventory_audit_snapshot"
    __table_args__ = (
        UniqueConstraint(
            "audit_id",
            "bin_id",
            "sku_id",
            name="uq_inventory_audit_snapshot_pair",
        ),
        CheckConstraint(
            "expected_qty >= 0",
            name="ck_inventory_audit_snapshot_qty_nonnegative",
        ),
        CheckConstraint(
            "revision >= 1",
            name="ck_inventory_audit_snapshot_revision_positive",
        ),
    )

    audit_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("inventory_audit.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    expected_inventory_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
    )
    bin_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("storage_bin.id", ondelete="RESTRICT"),
        nullable=False,
    )
    sku_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sku.id", ondelete="RESTRICT"),
        nullable=False,
    )
    expected_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)

    audit: Mapped[InventoryAudit] = relationship(back_populates="snapshots")
    bin: Mapped["StorageBin"] = relationship()


class StockObservation(IdentityTimestampMixin, Base):
    __tablename__ = "stock_observation"
    __table_args__ = (
        UniqueConstraint(
            "audit_id",
            "bin_id",
            "sku_id",
            name="uq_stock_observation_audit_bin_sku",
        ),
        UniqueConstraint(
            "audit_id",
            "source_event_id",
            name="uq_stock_observation_source_event",
        ),
        CheckConstraint(
            "observed_qty >= 0",
            name="ck_stock_observation_qty_nonnegative",
        ),
        CheckConstraint(
            "length(observed_by) >= 3",
            name="ck_stock_observation_observed_by",
        ),
        CheckConstraint(
            "(source IN ('SCANNER', 'SIMULATED_AMR') "
            "AND source_device_id IS NOT NULL "
            "AND source_event_id IS NOT NULL "
            "AND source_observed_at IS NOT NULL) OR "
            "(source IN ('MANUAL', 'CSV') "
            "AND source_device_id IS NULL "
            "AND source_event_id IS NULL "
            "AND source_observed_at IS NULL)",
            name="ck_stock_observation_source_metadata",
        ),
    )

    audit_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("inventory_audit.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    bin_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("storage_bin.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    sku_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sku.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    observed_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[StockObservationSource] = mapped_column(
        SAEnum(
            StockObservationSource,
            name="stock_observation_source",
            native_enum=False,
            create_constraint=True,
        ),
        nullable=False,
    )
    observed_by: Mapped[str] = mapped_column(String(120), nullable=False)
    source_device_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    source_event_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    source_observed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    handling_unit_codes: Mapped[list[str]] = mapped_column(
        JSON,
        nullable=False,
        default=list,
    )

    audit: Mapped[InventoryAudit] = relationship(back_populates="observations")
    bin: Mapped["StorageBin"] = relationship()
    sku: Mapped["SKU"] = relationship()
    findings: Mapped[list["AuditFinding"]] = relationship(
        back_populates="observation",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    @property
    def classification(self) -> AuditDataClassification:
        return self.audit.classification


class AuditFinding(IdentityTimestampMixin, Base):
    __tablename__ = "audit_finding"
    __table_args__ = (
        UniqueConstraint(
            "audit_id",
            "idempotency_key",
            name="uq_audit_finding_idempotency_key",
        ),
        CheckConstraint(
            "length(idempotency_key) >= 1",
            name="ck_audit_finding_idempotency_key",
        ),
    )

    audit_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("inventory_audit.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    observation_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("stock_observation.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False)
    finding_type: Mapped[AuditFindingType] = mapped_column(
        SAEnum(
            AuditFindingType,
            name="audit_finding_type",
            native_enum=False,
            create_constraint=True,
        ),
        nullable=False,
    )
    expected_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    observed_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    discrepancy_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    handling_unit_code: Mapped[str | None] = mapped_column(String(120), nullable=True)
    registered_bin_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("storage_bin.id", ondelete="RESTRICT"),
        nullable=True,
    )
    status: Mapped[AuditFindingStatus] = mapped_column(
        SAEnum(
            AuditFindingStatus,
            name="audit_finding_status",
            native_enum=False,
            create_constraint=True,
        ),
        nullable=False,
        default=AuditFindingStatus.OPEN,
    )

    audit: Mapped[InventoryAudit] = relationship(back_populates="findings")
    observation: Mapped[StockObservation] = relationship(back_populates="findings")
    registered_bin: Mapped["StorageBin | None"] = relationship()
    actions: Mapped[list["AuditFindingAction"]] = relationship(
        back_populates="finding",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="AuditFindingAction.created_at",
    )


class AuditFindingAction(IdentityTimestampMixin, Base):
    __tablename__ = "audit_finding_action"
    __table_args__ = (
        CheckConstraint(
            "length(actor) >= 3",
            name="ck_audit_finding_action_actor",
        ),
        CheckConstraint(
            "(action = 'REVIEW' AND from_status = 'OPEN' "
            "AND to_status = 'REVIEWED') OR "
            "(action = 'RESOLVE' AND from_status = 'REVIEWED' "
            "AND to_status = 'RESOLVED')",
            name="ck_audit_finding_action_transition",
        ),
    )

    finding_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("audit_finding.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    action: Mapped[AuditFindingActionType] = mapped_column(
        SAEnum(
            AuditFindingActionType,
            name="audit_finding_action_type",
            native_enum=False,
            create_constraint=True,
        ),
        nullable=False,
    )
    from_status: Mapped[AuditFindingStatus] = mapped_column(
        SAEnum(
            AuditFindingStatus,
            name="audit_finding_action_from_status",
            native_enum=False,
            create_constraint=True,
        ),
        nullable=False,
    )
    to_status: Mapped[AuditFindingStatus] = mapped_column(
        SAEnum(
            AuditFindingStatus,
            name="audit_finding_action_to_status",
            native_enum=False,
            create_constraint=True,
        ),
        nullable=False,
    )
    actor: Mapped[str] = mapped_column(String(120), nullable=False)
    note: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    finding: Mapped[AuditFinding] = relationship(back_populates="actions")
