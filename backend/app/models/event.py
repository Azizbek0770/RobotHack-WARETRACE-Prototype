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
    from app.models.handling_unit import HandlingUnit


class WarehouseEventType(str, Enum):
    HU_CREATED = "HU_CREATED"
    HU_MOVED = "HU_MOVED"
    HU_INSPECTION_PASSED = "HU_INSPECTION_PASSED"
    HU_INSPECTION_FAILED = "HU_INSPECTION_FAILED"


class WarehouseEvent(IdentityTimestampMixin, Base):
    __tablename__ = "warehouse_event"

    __table_args__ = (
        CheckConstraint(
            "quantity > 0",
            name="ck_warehouse_event_qty_positive",
        ),
        CheckConstraint(
            "after_version >= 1",
            name="ck_warehouse_event_version_positive",
        ),
    )

    hu_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("handling_unit.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    event_type: Mapped[WarehouseEventType] = mapped_column(
        SAEnum(
            WarehouseEventType,
            name="warehouse_event_type",
            native_enum=False,
            create_constraint=True,
        ),
        nullable=False,
    )

    from_bin_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("storage_bin.id", ondelete="RESTRICT"),
        nullable=True,
    )

    to_bin_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("storage_bin.id", ondelete="RESTRICT"),
        nullable=True,
    )

    before_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    after_status: Mapped[str] = mapped_column(String(32), nullable=False)

    quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    before_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    after_version: Mapped[int] = mapped_column(Integer, nullable=False)

    source_label: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        default="DEMO_UNAUTHENTICATED",
    )

    handling_unit: Mapped["HandlingUnit"] = relationship(back_populates="events")
