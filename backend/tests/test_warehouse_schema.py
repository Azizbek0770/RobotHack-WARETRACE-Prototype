from uuid import uuid4

import pytest
from sqlalchemy import create_engine, event, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models import StorageBin, Warehouse, Zone, ZoneKind


@pytest.fixture
def database():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def foreign_keys(connection, record):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)

    with Session(engine) as session:
        yield session

    engine.dispose()


def test_warehouse_zone_and_bin_relationship(database):
    warehouse = Warehouse(
        code="RIX-01",
        name="Demo Warehouse",
    )

    zone = Zone(
        warehouse=warehouse,
        code="ST-A",
        name="Storage A",
        kind=ZoneKind.STORAGE,
    )

    storage_bin = StorageBin(
        zone=zone,
        code="A01",
        grid_x=0,
        grid_y=0,
        capacity_units=12,
    )

    database.add(storage_bin)
    database.commit()

    result = database.scalars(select(Warehouse).where(Warehouse.code == "RIX-01")).one()

    assert len(result.zones) == 1
    assert result.zones[0].bins[0].code == "A01"
    assert result.created_at is not None


def test_duplicate_zone_code_is_rejected(database):
    warehouse = Warehouse(code="RIX-01", name="Demo")

    database.add_all(
        [
            Zone(
                warehouse=warehouse,
                code="A",
                name="One",
                kind=ZoneKind.STORAGE,
            ),
            Zone(
                warehouse=warehouse,
                code="A",
                name="Two",
                kind=ZoneKind.RECEIVING,
            ),
        ]
    )

    with pytest.raises(IntegrityError):
        database.commit()


def test_invalid_bin_capacity_is_rejected(database):
    zone = Zone(
        warehouse=Warehouse(code="RIX-01", name="Demo"),
        code="A",
        name="Zone",
        kind=ZoneKind.STORAGE,
    )

    database.add(
        StorageBin(
            zone=zone,
            code="A01",
            grid_x=0,
            grid_y=0,
            capacity_units=-1,
        )
    )

    with pytest.raises(IntegrityError):
        database.commit()


def test_foreign_key_is_enforced(database):
    database.add(
        Zone(
            warehouse_id=uuid4(),
            code="A",
            name="Orphan",
            kind=ZoneKind.STORAGE,
        )
    )

    with pytest.raises(IntegrityError):
        database.commit()
