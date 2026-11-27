"""Add scanner and simulated AMR observation provenance.

Revision ID: 0006_audit_observation_sources
Revises: 0005_inventory_audits
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0006_audit_observation_sources"
down_revision: str | None = "0005_inventory_audits"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    observation_source_type = sa.Enum(
        "MANUAL",
        "CSV",
        "SCANNER",
        "SIMULATED_AMR",
        name="stock_observation_source",
        native_enum=False,
        create_constraint=True,
    )
    with op.batch_alter_table("stock_observation", recreate="always") as batch_op:
        batch_op.drop_constraint("stock_observation_source", type_="check")
        batch_op.alter_column(
            "source",
            existing_type=sa.Enum(
                "MANUAL",
                "CSV",
                name="stock_observation_source",
                native_enum=False,
                create_constraint=True,
            ),
            type_=observation_source_type,
            existing_nullable=False,
        )
        batch_op.add_column(sa.Column("source_device_id", sa.String(120)))
        batch_op.add_column(sa.Column("source_event_id", sa.String(120)))
        batch_op.add_column(sa.Column("source_observed_at", sa.DateTime(timezone=True)))
        batch_op.create_unique_constraint(
            "uq_stock_observation_source_event",
            ["audit_id", "source_event_id"],
        )
        batch_op.create_check_constraint(
            "ck_stock_observation_source_metadata",
            "(source IN ('SCANNER', 'SIMULATED_AMR') "
            "AND source_device_id IS NOT NULL "
            "AND source_event_id IS NOT NULL "
            "AND source_observed_at IS NOT NULL) OR "
            "(source IN ('MANUAL', 'CSV') "
            "AND source_device_id IS NULL "
            "AND source_event_id IS NULL "
            "AND source_observed_at IS NULL)",
        )


def downgrade() -> None:
    raise RuntimeError(
        "This migration is forward-only; audit records must not be discarded."
    )
