from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.event import WarehouseEventType
from app.models.handling_unit import HandlingUnitStatus
from app.schemas.catalog import BinBrief, SKUBrief


class HandlingUnitCreate(BaseModel):
    external_code: str = Field(
        min_length=3,
        max_length=120,
        pattern=r"^[A-Z0-9][A-Z0-9._-]*$",
    )
    sku_id: UUID
    quantity: int = Field(gt=0)


class HandlingUnitMove(BaseModel):
    target_bin_id: UUID
    expected_version: int = Field(ge=1)


class HandlingUnitRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    external_code: str
    sku_id: UUID
    bin_id: UUID | None
    quantity: int
    status: HandlingUnitStatus
    version: int
    sku: SKUBrief
    bin: BinBrief | None


class WarehouseEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    hu_id: UUID
    event_type: WarehouseEventType
    from_bin_id: UUID | None
    to_bin_id: UUID | None
    before_status: str | None
    after_status: str
    quantity: int
    before_version: int | None
    after_version: int
    source_label: str
    created_at: datetime
