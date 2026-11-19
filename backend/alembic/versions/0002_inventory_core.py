"""Add SKUs, handling units and expected inventory.

Revision ID: 0002_inventory
Revises: 0001_locations
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0002_inventory"
down_revision: str | None = "0001_locations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sku",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("code", sa.String(80), nullable=False, unique=True),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("unit_weight_g", sa.Numeric(14, 3), nullable=True),
        sa.Column("length_mm", sa.Numeric(14, 3), nullable=True),
        sa.Column("width_mm", sa.Numeric(14, 3), nullable=True),
        sa.Column("height_mm", sa.Numeric(14, 3), nullable=True),
        sa.Column("is_fragile", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.CheckConstraint(
            "unit_weight_g IS NULL OR unit_weight_g > 0",
            name="ck_sku_weight_positive",
        ),
        sa.CheckConstraint(
            "length_mm IS NULL OR length_mm > 0",
            name="ck_sku_length_positive",
        ),
        sa.CheckConstraint(
            "width_mm IS NULL OR width_mm > 0",
            name="ck_sku_width_positive",
        ),
        sa.CheckConstraint(
            "height_mm IS NULL OR height_mm > 0",
            name="ck_sku_height_positive",
        ),
    )

    op.create_table(
        "handling_unit",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "external_code",
            sa.String(120),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "sku_id",
            sa.Uuid(),
            sa.ForeignKey("sku.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "bin_id",
            sa.Uuid(),
            sa.ForeignKey("storage_bin.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "RECEIVED",
                "INSPECTION_REQUIRED",
                "QUARANTINED",
                "STORED",
                "CLOSED",
                name="handling_unit_status",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.CheckConstraint(
            "quantity >= 0",
            name="ck_handling_unit_qty_nonnegative",
        ),
        sa.CheckConstraint(
            "version >= 1",
            name="ck_handling_unit_version_positive",
        ),
        sa.CheckConstraint(
            "status != 'STORED' OR bin_id IS NOT NULL",
            name="ck_handling_unit_stored_requires_bin",
        ),
    )

    op.create_index(
        "ix_handling_unit_sku_id",
        "handling_unit",
        ["sku_id"],
    )
    op.create_index(
        "ix_handling_unit_bin_id",
        "handling_unit",
        ["bin_id"],
    )

    op.create_table(
        "expected_inventory",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "bin_id",
            sa.Uuid(),
            sa.ForeignKey("storage_bin.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "sku_id",
            sa.Uuid(),
            sa.ForeignKey("sku.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("expected_qty", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(80), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "bin_id",
            "sku_id",
            name="uq_expected_inventory_bin_sku",
        ),
        sa.CheckConstraint(
            "expected_qty >= 0",
            name="ck_expected_inventory_qty_nonnegative",
        ),
        sa.CheckConstraint(
            "revision >= 1",
            name="ck_expected_inventory_revision_positive",
        ),
    )

    op.create_index(
        "ix_expected_inventory_bin_id",
        "expected_inventory",
        ["bin_id"],
    )
    op.create_index(
        "ix_expected_inventory_sku_id",
        "expected_inventory",
        ["sku_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_expected_inventory_sku_id",
        table_name="expected_inventory",
    )
    op.drop_index(
        "ix_expected_inventory_bin_id",
        table_name="expected_inventory",
    )
    op.drop_table("expected_inventory")

    op.drop_index(
        "ix_handling_unit_bin_id",
        table_name="handling_unit",
    )
    op.drop_index(
        "ix_handling_unit_sku_id",
        table_name="handling_unit",
    )
    op.drop_table("handling_unit")

    op.drop_table("sku")
