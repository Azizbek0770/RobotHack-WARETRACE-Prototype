from enum import Enum
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
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

from app.db.base import Base, IdentityTimestampMixin

if TYPE_CHECKING:
    from app.models.handling_unit import HandlingUnit
    from app.models.inventory import ExpectedInventory


class ZoneKind(str, Enum):
    RECEIVING = "RECEIVING"
    STORAGE = "STORAGE"
    QUARANTINE = "QUARANTINE"


class Warehouse(IdentityTimestampMixin, Base):
    __tablename__ = "warehouse"

    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    zones: Mapped[list["Zone"]] = relationship(
        back_populates="warehouse",
        passive_deletes=True,
    )


class Zone(IdentityTimestampMixin, Base):
    __tablename__ = "zone"

    __table_args__ = (
        UniqueConstraint(
            "warehouse_id",
            "code",
            name="uq_zone_warehouse_code",
        ),
    )

    warehouse_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("warehouse.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)

    kind: Mapped[ZoneKind] = mapped_column(
        SAEnum(
            ZoneKind,
            name="zone_kind",
            native_enum=False,
            create_constraint=True,
        ),
        nullable=False,
    )

    warehouse: Mapped[Warehouse] = relationship(back_populates="zones")

    bins: Mapped[list["StorageBin"]] = relationship(
        back_populates="zone",
        passive_deletes=True,
    )


class StorageBin(IdentityTimestampMixin, Base):
    __tablename__ = "storage_bin"

    __table_args__ = (
        UniqueConstraint(
            "zone_id",
            "code",
            name="uq_storage_bin_zone_code",
        ),
        UniqueConstraint(
            "zone_id",
            "grid_x",
            "grid_y",
            name="uq_storage_bin_zone_xy",
        ),
        CheckConstraint(
            "grid_x >= 0",
            name="ck_storage_bin_x_nonnegative",
        ),
        CheckConstraint(
            "grid_y >= 0",
            name="ck_storage_bin_y_nonnegative",
        ),
        CheckConstraint(
            "capacity_units IS NULL OR capacity_units >= 0",
            name="ck_storage_bin_capacity_nonnegative",
        ),
    )

    zone_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("zone.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    code: Mapped[str] = mapped_column(String(60), nullable=False)
    grid_x: Mapped[int] = mapped_column(Integer, nullable=False)
    grid_y: Mapped[int] = mapped_column(Integer, nullable=False)
    is_accessible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    capacity_units: Mapped[int | None] = mapped_column(Integer, nullable=True)

    zone: Mapped[Zone] = relationship(back_populates="bins")
    handling_units: Mapped[list["HandlingUnit"]] = relationship(
        back_populates="bin",
        passive_deletes=True,
    )
    expected_inventory_rows: Mapped[list["ExpectedInventory"]] = relationship(
        back_populates="bin",
        passive_deletes=True,
    )
