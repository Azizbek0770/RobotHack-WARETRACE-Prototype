"""Add immutable inventory audits and supervisor review history.

Revision ID: 0005_inventory_audits
Revises: 0004_handling_unit_inspections
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0005_inventory_audits"
down_revision: str | None = "0004_handling_unit_inspections"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "inventory_audit",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("warehouse_id", sa.Uuid(), nullable=False),
        sa.Column("request_key", sa.String(length=120), nullable=False),
        sa.Column("started_by", sa.String(length=120), nullable=False),
        sa.Column(
            "classification",
            sa.Enum(
                "OPERATIONAL",
                "SIMULATED",
                name="audit_data_classification",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "OPEN",
                "COMPARED",
                name="inventory_audit_status",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("snapshot_taken_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["warehouse_id"],
            ["warehouse.id"],
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint("request_key"),
        sa.CheckConstraint(
            "length(started_by) >= 3",
            name="ck_inventory_audit_started_by",
        ),
    )
    op.create_index(
        "ix_inventory_audit_warehouse_id",
        "inventory_audit",
        ["warehouse_id"],
    )

    op.create_table(
        "inventory_audit_snapshot",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("audit_id", sa.Uuid(), nullable=False),
        sa.Column("expected_inventory_id", sa.Uuid(), nullable=False),
        sa.Column("bin_id", sa.Uuid(), nullable=False),
        sa.Column("sku_id", sa.Uuid(), nullable=False),
        sa.Column("expected_qty", sa.Integer(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["audit_id"],
            ["inventory_audit.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["bin_id"],
            ["storage_bin.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(["sku_id"], ["sku.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint(
            "audit_id",
            "bin_id",
            "sku_id",
            name="uq_inventory_audit_snapshot_pair",
        ),
        sa.CheckConstraint(
            "expected_qty >= 0",
            name="ck_inventory_audit_snapshot_qty_nonnegative",
        ),
        sa.CheckConstraint(
            "revision >= 1",
            name="ck_inventory_audit_snapshot_revision_positive",
        ),
    )
    op.create_index(
        "ix_inventory_audit_snapshot_audit_id",
        "inventory_audit_snapshot",
        ["audit_id"],
    )

    op.create_table(
        "stock_observation",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("audit_id", sa.Uuid(), nullable=False),
        sa.Column("bin_id", sa.Uuid(), nullable=False),
        sa.Column("sku_id", sa.Uuid(), nullable=False),
        sa.Column("observed_qty", sa.Integer(), nullable=False),
        sa.Column(
            "source",
            sa.Enum(
                "MANUAL",
                "CSV",
                name="stock_observation_source",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("observed_by", sa.String(length=120), nullable=False),
        sa.Column("handling_unit_codes", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["audit_id"],
            ["inventory_audit.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["bin_id"],
            ["storage_bin.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(["sku_id"], ["sku.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint(
            "audit_id",
            "bin_id",
            "sku_id",
            name="uq_stock_observation_audit_bin_sku",
        ),
        sa.CheckConstraint(
            "observed_qty >= 0",
            name="ck_stock_observation_qty_nonnegative",
        ),
        sa.CheckConstraint(
            "length(observed_by) >= 3",
            name="ck_stock_observation_observed_by",
        ),
    )
    op.create_index("ix_stock_observation_audit_id", "stock_observation", ["audit_id"])
    op.create_index("ix_stock_observation_bin_id", "stock_observation", ["bin_id"])
    op.create_index("ix_stock_observation_sku_id", "stock_observation", ["sku_id"])

    op.create_table(
        "audit_finding",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("audit_id", sa.Uuid(), nullable=False),
        sa.Column("observation_id", sa.Uuid(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=255), nullable=False),
        sa.Column(
            "finding_type",
            sa.Enum(
                "MISSING",
                "EXCESS",
                "MATCH",
                "UNREGISTERED_HU",
                "MISPLACED_HU",
                name="audit_finding_type",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("expected_qty", sa.Integer(), nullable=True),
        sa.Column("observed_qty", sa.Integer(), nullable=True),
        sa.Column("discrepancy_qty", sa.Integer(), nullable=True),
        sa.Column("handling_unit_code", sa.String(length=120), nullable=True),
        sa.Column("registered_bin_id", sa.Uuid(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "OPEN",
                "REVIEWED",
                "RESOLVED",
                name="audit_finding_status",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["audit_id"],
            ["inventory_audit.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["observation_id"],
            ["stock_observation.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["registered_bin_id"],
            ["storage_bin.id"],
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint(
            "audit_id",
            "idempotency_key",
            name="uq_audit_finding_idempotency_key",
        ),
        sa.CheckConstraint(
            "length(idempotency_key) >= 1",
            name="ck_audit_finding_idempotency_key",
        ),
    )
    op.create_index("ix_audit_finding_audit_id", "audit_finding", ["audit_id"])
    op.create_index(
        "ix_audit_finding_observation_id",
        "audit_finding",
        ["observation_id"],
    )

    op.create_table(
        "audit_finding_action",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("finding_id", sa.Uuid(), nullable=False),
        sa.Column(
            "action",
            sa.Enum(
                "REVIEW",
                "RESOLVE",
                name="audit_finding_action_type",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column(
            "from_status",
            sa.Enum(
                "OPEN",
                "REVIEWED",
                "RESOLVED",
                name="audit_finding_action_from_status",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column(
            "to_status",
            sa.Enum(
                "OPEN",
                "REVIEWED",
                "RESOLVED",
                name="audit_finding_action_to_status",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("actor", sa.String(length=120), nullable=False),
        sa.Column("note", sa.String(length=1000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["finding_id"],
            ["audit_finding.id"],
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "length(actor) >= 3",
            name="ck_audit_finding_action_actor",
        ),
        sa.CheckConstraint(
            "(action = 'REVIEW' AND from_status = 'OPEN' "
            "AND to_status = 'REVIEWED') OR "
            "(action = 'RESOLVE' AND from_status = 'REVIEWED' "
            "AND to_status = 'RESOLVED')",
            name="ck_audit_finding_action_transition",
        ),
    )
    op.create_index(
        "ix_audit_finding_action_finding_id",
        "audit_finding_action",
        ["finding_id"],
    )


def downgrade() -> None:
    raise RuntimeError(
        "This migration is forward-only; audit records must not be dropped by downgrade."
    )
