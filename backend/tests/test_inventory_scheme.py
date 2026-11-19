from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, event, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models import (
    SKU,
    ExpectedInventory,
    HandlingUnit,
    HandlingUnitStatus,
    StorageBin,
    Warehouse,
    Zone,
    ZoneKind,
)


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, record):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)

    with Session(engine) as session:
        yield session

    engine.dispose()


def sample_bin():
    return StorageBin(
        zone=Zone(
            warehouse=Warehouse(
                code="RIX-01",
                name="Riga Demo",
            ),
            code="ST-A",
            name="Storage A",
            kind=ZoneKind.STORAGE,
        ),
        code="A01",
        grid_x=0,
        grid_y=0,
    )


def test_inventory_relationships(db):
    sku = SKU(
        code="SKU-001",
        name="Demo Part",
        unit_weight_g=Decimal("125.500"),
        length_mm=Decimal("50.000"),
        width_mm=Decimal("20.000"),
        height_mm=Decimal("10.000"),
    )

    storage_bin = sample_bin()

    hu = HandlingUnit(
        external_code="HU-001",
        sku=sku,
        bin=storage_bin,
        quantity=10,
        status=HandlingUnitStatus.STORED,
    )

    expected = ExpectedInventory(
        sku=sku,
        bin=storage_bin,
        expected_qty=10,
    )

    db.add_all([hu, expected])
    db.commit()

    loaded = db.scalar(select(SKU).where(SKU.code == "SKU-001"))

    assert loaded is not None
    assert loaded.is_fragile is False

    assert loaded.handling_units[0].external_code == "HU-001"
    assert loaded.handling_units[0].version == 1
    assert loaded.handling_units[0].bin.code == "A01"

    row = loaded.expected_inventory_rows[0]
    assert row.expected_qty == 10
    assert row.source == "SYNTHETIC"
    assert row.revision == 1


def test_received_hu_does_not_require_bin(db):
    hu = HandlingUnit(
        external_code="HU-RECEIVING",
        sku=SKU(
            code="SKU-RECEIVING",
            name="Received Package",
        ),
        quantity=3,
    )

    db.add(hu)
    db.commit()

    assert hu.status == HandlingUnitStatus.RECEIVED
    assert hu.bin_id is None


@pytest.mark.parametrize("quantity", [-1, -10])
def test_negative_hu_quantity_rejected(db, quantity):
    db.add(
        HandlingUnit(
            external_code="HU-BAD",
            sku=SKU(
                code="SKU-BAD",
                name="Invalid",
            ),
            quantity=quantity,
        )
    )

    with pytest.raises(IntegrityError):
        db.commit()


def test_stored_hu_requires_bin(db):
    db.add(
        HandlingUnit(
            external_code="HU-INVALID",
            sku=SKU(
                code="SKU-VALID",
                name="Demo",
            ),
            quantity=1,
            status=HandlingUnitStatus.STORED,
        )
    )

    with pytest.raises(IntegrityError):
        db.commit()


def test_duplicate_sku_code_rejected(db):
    db.add_all(
        [
            SKU(code="SKU-X", name="First"),
            SKU(code="SKU-X", name="Second"),
        ]
    )

    with pytest.raises(IntegrityError):
        db.commit()


def test_nonpositive_dimension_rejected(db):
    db.add(
        SKU(
            code="SKU-BAD",
            name="Bad Dimensions",
            length_mm=Decimal(0),
        )
    )

    with pytest.raises(IntegrityError):
        db.commit()


def test_duplicate_expected_pair_rejected(db):
    sku = SKU(code="SKU-ONE", name="One")
    storage_bin = sample_bin()

    db.add_all(
        [
            ExpectedInventory(
                bin=storage_bin,
                sku=sku,
                expected_qty=2,
            ),
            ExpectedInventory(
                bin=storage_bin,
                sku=sku,
                expected_qty=4,
            ),
        ]
    )

    with pytest.raises(IntegrityError):
        db.commit()


def test_negative_expected_quantity_rejected(db):
    db.add(
        ExpectedInventory(
            bin=sample_bin(),
            sku=SKU(code="SKU-ONE", name="One"),
            expected_qty=-1,
        )
    )

    with pytest.raises(IntegrityError):
        db.commit()


def test_missing_sku_foreign_key_rejected(db):
    db.add(
        HandlingUnit(
            external_code="HU-UNKNOWN",
            sku_id=uuid4(),
            quantity=1,
        )
    )

    with pytest.raises(IntegrityError):
        db.commit()
