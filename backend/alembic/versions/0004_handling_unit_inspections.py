"""Add handling-unit inspection decisions.

Revision ID: 0004_handling_unit_inspections
Revises: 0003_hu_events
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0004_handling_unit_inspections"
down_revision: str | None = "0003_hu_events"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "handling_unit_inspection",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("hu_id", sa.Uuid(), nullable=False),
        sa.Column(
            "result",
            sa.Enum(
                "PASS",
                "FAIL",
                name="handling_unit_inspection_result",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("checklist_answers", sa.JSON(), nullable=True),
        sa.Column("damage_notes", sa.String(length=2000), nullable=True),
        sa.Column("evidence_metadata", sa.JSON(), nullable=True),
        sa.Column("evidence_checksum", sa.String(length=64), nullable=True),
        sa.Column("operator_actor", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["hu_id"],
            ["handling_unit.id"],
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "length(operator_actor) >= 3",
            name="ck_handling_unit_inspection_operator_actor",
        ),
        sa.CheckConstraint(
            "(evidence_checksum IS NULL) OR (length(evidence_checksum) = 64)",
            name="ck_handling_unit_inspection_checksum",
        ),
    )
    op.create_index(
        "ix_handling_unit_inspection_hu_id",
        "handling_unit_inspection",
        ["hu_id"],
    )

    old_event_type = sa.Enum(
        "HU_CREATED",
        "HU_MOVED",
        name="warehouse_event_type",
        native_enum=False,
        create_constraint=True,
    )
    new_event_type = sa.Enum(
        "HU_CREATED",
        "HU_MOVED",
        "HU_INSPECTION_PASSED",
        "HU_INSPECTION_FAILED",
        name="warehouse_event_type",
        native_enum=False,
        create_constraint=True,
    )
    with op.batch_alter_table("warehouse_event") as batch_op:
        batch_op.alter_column(
            "event_type",
            existing_type=old_event_type,
            type_=new_event_type,
            existing_nullable=False,
        )


def downgrade() -> None:
    old_event_type = sa.Enum(
        "HU_CREATED",
        "HU_MOVED",
        name="warehouse_event_type",
        native_enum=False,
        create_constraint=True,
    )
    with op.batch_alter_table("warehouse_event") as batch_op:
        batch_op.alter_column(
            "event_type",
            existing_type=sa.Enum(
                "HU_CREATED",
                "HU_MOVED",
                "HU_INSPECTION_PASSED",
                "HU_INSPECTION_FAILED",
                name="warehouse_event_type",
                native_enum=False,
                create_constraint=True,
            ),
            type_=old_event_type,
            existing_nullable=False,
        )
    op.drop_index(
        "ix_handling_unit_inspection_hu_id",
        table_name="handling_unit_inspection",
    )
    op.drop_table("handling_unit_inspection")
