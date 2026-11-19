from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, IdentityTimestampMixin

if TYPE_CHECKING:
    from app.models.handling_unit import HandlingUnit
    from app.models.warehouse import StorageBin


class SKU(IdentityTimestampMixin, Base):
    __tablename__ = "sku"

    __table_args__ = (
        CheckConstraint(
            "unit_weight_g IS NULL OR unit_weight_g > 0",
            name="ck_sku_weight_positive",
        ),
        CheckConstraint(
            "length_mm IS NULL OR length_mm > 0",
            name="ck_sku_length_positive",
        ),
        CheckConstraint(
            "width_mm IS NULL OR width_mm > 0",
            name="ck_sku_width_positive",
        ),
        CheckConstraint(
            "height_mm IS NULL OR height_mm > 0",
            name="ck_sku_height_positive",
        ),
    )

    code: Mapped[str] = mapped_column(
        String(80),
        unique=True,
        nullable=False,
    )

    name: Mapped[str] = mapped_column(
        String(160),
        nullable=False,
    )

    unit_weight_g: Mapped[Decimal | None] = mapped_column(
        Numeric(14, 3),
        nullable=True,
    )

    length_mm: Mapped[Decimal | None] = mapped_column(
        Numeric(14, 3),
        nullable=True,
    )

    width_mm: Mapped[Decimal | None] = mapped_column(
        Numeric(14, 3),
        nullable=True,
    )

    height_mm: Mapped[Decimal | None] = mapped_column(
        Numeric(14, 3),
        nullable=True,
    )

    is_fragile: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )

    handling_units: Mapped[list["HandlingUnit"]] = relationship(
        back_populates="sku",
        passive_deletes=True,
    )

    expected_inventory_rows: Mapped[list["ExpectedInventory"]] = relationship(
        back_populates="sku",
        passive_deletes=True,
    )


class ExpectedInventory(IdentityTimestampMixin, Base):
    __tablename__ = "expected_inventory"

    __table_args__ = (
        UniqueConstraint(
            "bin_id",
            "sku_id",
            name="uq_expected_inventory_bin_sku",
        ),
        CheckConstraint(
            "expected_qty >= 0",
            name="ck_expected_inventory_qty_nonnegative",
        ),
        CheckConstraint(
            "revision >= 1",
            name="ck_expected_inventory_revision_positive",
        ),
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

    expected_qty: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    source: Mapped[str] = mapped_column(
        String(80),
        nullable=False,
        default="SYNTHETIC",
    )

    revision: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
    )

    bin: Mapped["StorageBin"] = relationship(back_populates="expected_inventory_rows")

    sku: Mapped[SKU] = relationship(back_populates="expected_inventory_rows")
