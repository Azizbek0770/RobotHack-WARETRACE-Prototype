from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class InspectionCreate(BaseModel):
    result: Literal["PASS", "FAIL"]
    checklist_answers: dict[str, bool] | None = None
    damage_notes: str | None = Field(default=None, max_length=2000)
    evidence_metadata: dict[str, str] | None = None
    evidence_checksum: str | None = Field(
        default=None,
        pattern=r"^[A-Fa-f0-9]{64}$",
    )
    operator_actor: str = Field(
        default="DEVELOPMENT_ACTOR",
        min_length=3,
        max_length=120,
    )


class InspectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    hu_id: UUID
    result: Literal["PASS", "FAIL"]
    checklist_answers: dict[str, bool] | None
    damage_notes: str | None
    evidence_metadata: dict[str, str] | None
    evidence_checksum: str | None
    operator_actor: str
    created_at: datetime
