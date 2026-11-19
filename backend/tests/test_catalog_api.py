from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.seed_demo import seed_demo
from app.db.session import get_db
from app.main import app
from app.models import (
    SKU,
    ExpectedInventory,
    HandlingUnit,
    StorageBin,
    Warehouse,
    Zone,
)


@pytest.fixture
def client_and_engine():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, record):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)

    with Session(engine) as db:
        assert seed_demo(db) is True
        db.commit()

    def override_get_db():
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db

    try:
        with TestClient(app) as client:
            yield client, engine
    finally:
        app.dependency_overrides.pop(get_db, None)
        engine.dispose()


def test_demo_seed_is_idempotent(client_and_engine):
    _client, engine = client_and_engine

    with Session(engine) as db:
        assert seed_demo(db) is False

        counts = [
            db.scalar(select(func.count()).select_from(model))
            for model in (
                Warehouse,
                Zone,
                StorageBin,
                SKU,
                HandlingUnit,
                ExpectedInventory,
            )
        ]

        assert counts == [1, 3, 12, 8, 10, 8]


def test_warehouse_zone_bin_endpoints(client_and_engine):
    client, _ = client_and_engine

    warehouses = client.get("/api/v1/warehouses")
    assert warehouses.status_code == 200
    assert warehouses.json()["total"] == 1

    warehouse = warehouses.json()["items"][0]
    assert warehouse["code"] == "RIX-DEMO"
    UUID(warehouse["id"])

    zones = client.get(f"/api/v1/warehouses/{warehouse['id']}/zones")
    assert zones.status_code == 200

    assert {zone["kind"] for zone in zones.json()} == {
        "STORAGE",
        "RECEIVING",
        "QUARANTINE",
    }

    total_bins = sum(
        len(client.get(f"/api/v1/zones/{zone['id']}/bins").json())
        for zone in zones.json()
    )

    assert total_bins == 12


def test_sku_search_and_pagination(client_and_engine):
    client, _ = client_and_engine

    page = client.get("/api/v1/skus?page=2&page_size=3")
    assert page.status_code == 200
    assert page.json()["total"] == 8
    assert len(page.json()["items"]) == 3
    assert page.json()["page"] == 2

    filtered = client.get("/api/v1/skus?search=Sensor")
    assert filtered.json()["total"] == 1
    assert filtered.json()["items"][0]["code"] == "SKU-002"


def test_expected_inventory_uses_real_db_records(
    client_and_engine,
):
    client, _ = client_and_engine

    warehouse_id = client.get("/api/v1/warehouses").json()["items"][0]["id"]

    response = client.get(
        "/api/v1/inventory/expected",
        params={"warehouse_id": warehouse_id},
    )

    assert response.status_code == 200

    body = response.json()
    assert body["total"] == 8
    assert sum(row["expected_qty"] for row in body["items"]) == 55

    assert all(row["source"] == "SYNTHETIC" for row in body["items"])

    assert all(row["sku"]["code"] and row["bin"]["code"] for row in body["items"])


def test_unknown_warehouse_error(client_and_engine):
    client, _ = client_and_engine
    missing = "00000000-0000-0000-0000-000000000000"

    response = client.get(f"/api/v1/warehouses/{missing}/zones")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"
    assert response.json()["error"]["request_id"]


def test_invalid_pagination_error(client_and_engine):
    client, _ = client_and_engine

    response = client.get("/api/v1/skus?page_size=101")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
