from enum import Enum
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Integer,
    String,
    Uuid,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, IdentityTimestampMixin

if TYPE_CHECKING:
    from app.models.event import WarehouseEvent
    from app.models.inspection import HandlingUnitInspection
    from app.models.inventory import SKU
    from app.models.warehouse import StorageBin


class HandlingUnitStatus(str, Enum):
    RECEIVED = "RECEIVED"
    INSPECTION_REQUIRED = "INSPECTION_REQUIRED"
    QUARANTINED = "QUARANTINED"
    STORED = "STORED"
    CLOSED = "CLOSED"


class HandlingUnit(IdentityTimestampMixin, Base):
    __tablename__ = "handling_unit"

    __table_args__ = (
        CheckConstraint(
            "quantity >= 0",
            name="ck_handling_unit_qty_nonnegative",
        ),
        CheckConstraint(
            "version >= 1",
            name="ck_handling_unit_version_positive",
        ),
        CheckConstraint(
            "status != 'STORED' OR bin_id IS NOT NULL",
            name="ck_handling_unit_stored_requires_bin",
        ),
    )

    external_code: Mapped[str] = mapped_column(
        String(120),
        unique=True,
        nullable=False,
    )

    sku_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sku.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    bin_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("storage_bin.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    quantity: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    status: Mapped[HandlingUnitStatus] = mapped_column(
        SAEnum(
            HandlingUnitStatus,
            name="handling_unit_status",
            native_enum=False,
            create_constraint=True,
        ),
        nullable=False,
        default=HandlingUnitStatus.RECEIVED,
    )

    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
    )

    sku: Mapped["SKU"] = relationship(back_populates="handling_units")

    bin: Mapped["StorageBin | None"] = relationship(back_populates="handling_units")

    events: Mapped[list["WarehouseEvent"]] = relationship(
        back_populates="handling_unit",
        passive_deletes=True,
    )

    inspections: Mapped[list["HandlingUnitInspection"]] = relationship(
        back_populates="handling_unit",
        passive_deletes=True,
        order_by="HandlingUnitInspection.created_at",
    )
