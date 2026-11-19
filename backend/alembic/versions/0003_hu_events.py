"""Add append-only warehouse operation events.

Revision ID: 0003_hu_events
Revises: 0002_inventory
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003_hu_events"
down_revision: str | None = "0002_inventory"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "warehouse_event",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("hu_id", sa.Uuid(), nullable=False),
        sa.Column(
            "event_type",
            sa.Enum(
                "HU_CREATED",
                "HU_MOVED",
                name="warehouse_event_type",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("from_bin_id", sa.Uuid(), nullable=True),
        sa.Column("to_bin_id", sa.Uuid(), nullable=True),
        sa.Column("before_status", sa.String(32), nullable=True),
        sa.Column("after_status", sa.String(32), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("before_version", sa.Integer(), nullable=True),
        sa.Column("after_version", sa.Integer(), nullable=False),
        sa.Column("source_label", sa.String(40), nullable=False),
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
        sa.ForeignKeyConstraint(
            ["hu_id"],
            ["handling_unit.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["from_bin_id"],
            ["storage_bin.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["to_bin_id"],
            ["storage_bin.id"],
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "quantity > 0",
            name="ck_warehouse_event_qty_positive",
        ),
        sa.CheckConstraint(
            "after_version >= 1",
            name="ck_warehouse_event_version_positive",
        ),
    )

    op.create_index(
        "ix_warehouse_event_hu_id",
        "warehouse_event",
        ["hu_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_warehouse_event_hu_id",
        table_name="warehouse_event",
    )
    op.drop_table("warehouse_event")
