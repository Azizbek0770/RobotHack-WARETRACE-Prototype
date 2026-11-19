"""S01 read-only catalog response contracts."""

from decimal import Decimal
from typing import Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.warehouse import ZoneKind

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    total: int = Field(ge=0)


class FromORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class WarehouseSummary(FromORM):
    id: UUID
    code: str
    name: str
    is_active: bool


class ZoneSummary(FromORM):
    id: UUID
    warehouse_id: UUID
    code: str
    name: str
    kind: ZoneKind


class BinSummary(FromORM):
    id: UUID
    zone_id: UUID
    code: str
    grid_x: int
    grid_y: int
    is_accessible: bool
    capacity_units: int | None


class SKUSummary(FromORM):
    id: UUID
    code: str
    name: str
    unit_weight_g: Decimal | None
    length_mm: Decimal | None
    width_mm: Decimal | None
    height_mm: Decimal | None
    is_fragile: bool


class SKUBrief(FromORM):
    id: UUID
    code: str
    name: str


class BinBrief(FromORM):
    id: UUID
    code: str


class ExpectedInventoryRow(FromORM):
    id: UUID
    bin_id: UUID
    sku_id: UUID
    expected_qty: int
    source: str
    revision: int
    sku: SKUBrief
    bin: BinBrief
