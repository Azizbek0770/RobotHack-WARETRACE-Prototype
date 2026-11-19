"""Initial warehouse location tables.

Revision ID: 0001_locations
Revises:
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0001_locations"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "warehouse",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("code", sa.String(40), nullable=False, unique=True),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
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
    )

    op.create_table(
        "zone",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "warehouse_id",
            sa.Uuid(),
            sa.ForeignKey("warehouse.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column(
            "kind",
            sa.Enum(
                "RECEIVING",
                "STORAGE",
                "QUARANTINE",
                name="zone_kind",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
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
            "warehouse_id",
            "code",
            name="uq_zone_warehouse_code",
        ),
    )

    op.create_index(
        "ix_zone_warehouse_id",
        "zone",
        ["warehouse_id"],
    )

    op.create_table(
        "storage_bin",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "zone_id",
            sa.Uuid(),
            sa.ForeignKey("zone.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("code", sa.String(60), nullable=False),
        sa.Column("grid_x", sa.Integer(), nullable=False),
        sa.Column("grid_y", sa.Integer(), nullable=False),
        sa.Column("is_accessible", sa.Boolean(), nullable=False),
        sa.Column(
            "capacity_units",
            sa.Integer(),
            nullable=True,
        ),
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
            "zone_id",
            "code",
            name="uq_storage_bin_zone_code",
        ),
        sa.UniqueConstraint(
            "zone_id",
            "grid_x",
            "grid_y",
            name="uq_storage_bin_zone_xy",
        ),
        sa.CheckConstraint(
            "grid_x >= 0",
            name="ck_storage_bin_x_nonnegative",
        ),
        sa.CheckConstraint(
            "grid_y >= 0",
            name="ck_storage_bin_y_nonnegative",
        ),
        sa.CheckConstraint(
            "capacity_units IS NULL OR capacity_units >= 0",
            name="ck_storage_bin_capacity_nonnegative",
        ),
    )

    op.create_index(
        "ix_storage_bin_zone_id",
        "storage_bin",
        ["zone_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_storage_bin_zone_id",
        table_name="storage_bin",
    )
    op.drop_table("storage_bin")

    op.drop_index(
        "ix_zone_warehouse_id",
        table_name="zone",
    )
    op.drop_table("zone")

    op.drop_table("warehouse")
