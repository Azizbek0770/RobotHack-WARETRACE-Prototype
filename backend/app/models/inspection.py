from enum import Enum
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import JSON, CheckConstraint, ForeignKey, String, Uuid
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, IdentityTimestampMixin

if TYPE_CHECKING:
    from app.models.handling_unit import HandlingUnit


class InspectionResult(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"


class HandlingUnitInspection(IdentityTimestampMixin, Base):
    __tablename__ = "handling_unit_inspection"

    __table_args__ = (
        CheckConstraint(
            "length(operator_actor) >= 3",
            name="ck_handling_unit_inspection_operator_actor",
        ),
        CheckConstraint(
            "(evidence_checksum IS NULL) OR " "(length(evidence_checksum) = 64)",
            name="ck_handling_unit_inspection_checksum",
        ),
    )

    hu_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("handling_unit.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    result: Mapped[InspectionResult] = mapped_column(
        SAEnum(
            InspectionResult,
            name="handling_unit_inspection_result",
            native_enum=False,
            create_constraint=True,
        ),
        nullable=False,
    )

    checklist_answers: Mapped[dict[str, bool] | None] = mapped_column(
        JSON,
        nullable=True,
    )

    damage_notes: Mapped[str | None] = mapped_column(
        String(2000),
        nullable=True,
    )

    evidence_metadata: Mapped[dict[str, str] | None] = mapped_column(
        JSON,
        nullable=True,
    )

    evidence_checksum: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    operator_actor: Mapped[str] = mapped_column(
        String(120),
        nullable=False,
        default="DEVELOPMENT_ACTOR",
    )

    handling_unit: Mapped["HandlingUnit"] = relationship(
        back_populates="inspections",
    )
