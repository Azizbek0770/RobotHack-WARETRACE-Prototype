from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import (
    SKU,
    ExpectedInventory,
    StorageBin,
    Warehouse,
    Zone,
    ZoneKind,
)


@pytest.fixture
def ctx():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, record):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)

    with Session(engine) as db, db.begin():
        warehouse = Warehouse(
            code="RIX",
            name="Riga",
        )

        storage_zone = Zone(
            warehouse=warehouse,
            code="S",
            name="Storage",
            kind=ZoneKind.STORAGE,
        )

        quarantine_zone = Zone(
            warehouse=warehouse,
            code="Q",
            name="Quarantine",
            kind=ZoneKind.QUARANTINE,
        )

        bin_a = StorageBin(
            zone=storage_zone,
            code="A",
            grid_x=0,
            grid_y=0,
            capacity_units=20,
        )

        bin_b = StorageBin(
            zone=storage_zone,
            code="B",
            grid_x=1,
            grid_y=0,
            capacity_units=20,
        )

        quarantine_bin = StorageBin(
            zone=quarantine_zone,
            code="Q",
            grid_x=0,
            grid_y=1,
            capacity_units=20,
        )

        sku = SKU(
            code="SKU1",
            name="One",
        )

        db.add_all(
            [
                bin_a,
                bin_b,
                quarantine_bin,
                sku,
            ]
        )
        db.flush()

        ids = {
            "sku": str(sku.id),
            "a": str(bin_a.id),
            "b": str(bin_b.id),
            "q": str(quarantine_bin.id),
        }

    def override_get_db():
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db

    try:
        with TestClient(app) as client:
            yield client, engine, ids
    finally:
        app.dependency_overrides.pop(get_db, None)
        engine.dispose()


def create(client, ids, code="HU-001", qty=5):
    return client.post(
        "/api/v1/handling-units",
        json={
            "external_code": code,
            "sku_id": ids["sku"],
            "quantity": qty,
        },
    )


def move(client, hu_id, target, version=1):
    detail = client.get(f"/api/v1/handling-units/{hu_id}")
    if detail.status_code == 200 and detail.json()["status"] == "RECEIVED":
        inspection = client.post(
            f"/api/v1/handling-units/{hu_id}/inspection",
            json={
                "result": "PASS",
                "checklist_answers": {"damage": False, "seal": True},
                "operator_actor": "TEST_OPERATOR",
            },
        )
        assert inspection.status_code == 200
        version = 2
    elif detail.status_code == 200 and detail.json()["status"] == "INSPECTION_REQUIRED":
        version = 2

    return client.post(
        f"/api/v1/handling-units/{hu_id}/move",
        json={
            "target_bin_id": target,
            "expected_version": version,
        },
    )


def test_create_lookup_and_event(ctx):
    client, _, ids = ctx

    response = create(client, ids)
    assert response.status_code == 201

    data = response.json()

    assert data["status"] == "RECEIVED"
    assert data["bin_id"] is None
    assert data["version"] == 1

    lookup = client.get(f"/api/v1/handling-units/by-code/{data['external_code']}")
    assert lookup.json()["id"] == data["id"]

    detail = client.get(f"/api/v1/handling-units/{data['id']}")
    assert detail.json()["sku"]["code"] == "SKU1"

    history = client.get(f"/api/v1/handling-units/{data['id']}/events").json()

    assert history["total"] == 1
    assert history["items"][0]["event_type"] == "HU_CREATED"


def test_move_updates_ledger_and_event(ctx):
    client, engine, ids = ctx
    hu_id = create(client, ids).json()["id"]

    response = move(client, hu_id, ids["a"])
    assert response.status_code == 200

    updated = response.json()
    assert updated["status"] == "STORED"
    assert updated["version"] == 3

    with Session(engine) as db:
        rows = db.scalars(select(ExpectedInventory)).all()

        assert len(rows) == 1
        assert rows[0].expected_qty == 5
        assert str(rows[0].bin_id) == ids["a"]

    response = move(client, hu_id, ids["b"], version=3)
    assert response.status_code == 200

    with Session(engine) as db:
        rows = db.scalars(select(ExpectedInventory)).all()

        actual = sorted((str(row.bin_id), row.expected_qty) for row in rows)
        expected = sorted(
            [
                (ids["a"], 0),
                (ids["b"], 5),
            ]
        )
        assert actual == expected

    history = client.get(f"/api/v1/handling-units/{hu_id}/events").json()
    assert history["total"] == 4


def test_stale_version_preserves_data(ctx):
    client, _, ids = ctx
    hu_id = create(client, ids).json()["id"]

    assert move(client, hu_id, ids["a"]).status_code == 200

    response = move(
        client,
        hu_id,
        ids["b"],
        version=1,
    )
    assert response.status_code == 409

    detail = client.get(f"/api/v1/handling-units/{hu_id}").json()

    assert detail["bin_id"] == ids["a"]


def test_rejects_bad_target_and_capacity(ctx):
    client, _, ids = ctx
    hu_id = create(
        client,
        ids,
        qty=21,
    ).json()["id"]

    assert (
        move(
            client,
            hu_id,
            ids["a"],
        ).status_code
        == 409
    )

    assert (
        move(
            client,
            hu_id,
            ids["q"],
        ).status_code
        == 409
    )

    history = client.get(f"/api/v1/handling-units/{hu_id}/events").json()

    assert history["total"] == 2


def test_duplicate_and_unknown_sku(ctx):
    client, _, ids = ctx

    assert create(client, ids).status_code == 201
    assert create(client, ids).status_code == 409

    response = client.post(
        "/api/v1/handling-units",
        json={
            "external_code": "HU-002",
            "sku_id": ("00000000-0000-0000-0000-000000000000"),
            "quantity": 1,
        },
    )
    assert response.status_code == 404


def test_search_and_invalid(ctx):
    client, _, ids = ctx

    assert create(client, ids).status_code == 201

    response = client.get("/api/v1/handling-units?search=HU-001")
    assert response.json()["total"] == 1

    invalid = client.post(
        "/api/v1/handling-units",
        json={
            "external_code": "bad space",
            "sku_id": ids["sku"],
            "quantity": 0,
        },
    )
    assert invalid.status_code == 422


def test_same_bin_rejected(ctx):
    client, _, ids = ctx
    hu_id = create(client, ids).json()["id"]

    assert move(client, hu_id, ids["a"]).status_code == 200

    assert move(client, hu_id, ids["a"], version=3).status_code == 409

    history = client.get(f"/api/v1/handling-units/{hu_id}/events").json()
    assert history["total"] == 3


def test_ledger_mismatch_rolls_back(ctx):
    client, engine, ids = ctx
    hu_id = create(client, ids).json()["id"]

    assert move(client, hu_id, ids["a"]).status_code == 200

    # Deliberately corrupt only this isolated test database.
    with Session(engine) as db, db.begin():
        row = db.scalar(
            select(ExpectedInventory).where(ExpectedInventory.bin_id == UUID(ids["a"]))
        )
        assert row is not None
        row.expected_qty = 0

    response = move(client, hu_id, ids["b"], version=3)
    assert response.status_code == 409

    detail = client.get(f"/api/v1/handling-units/{hu_id}").json()
    assert detail["bin_id"] == ids["a"]
    assert detail["version"] == 3

    history = client.get(f"/api/v1/handling-units/{hu_id}/events").json()
    assert history["total"] == 3


def test_event_pagination(ctx):
    client, _, ids = ctx
    hu_id = create(client, ids).json()["id"]

    assert move(client, hu_id, ids["a"]).status_code == 200

    response = client.get(
        f"/api/v1/handling-units/{hu_id}/events" "?page_size=1&page=2"
    )

    assert response.status_code == 200
    assert response.json()["total"] == 3
    assert response.json()["items"][0]["event_type"] in (
        "HU_INSPECTION_PASSED",
        "HU_MOVED",
    )


def test_unknown_handling_unit_paths(ctx):
    client, _, _ = ctx
    unknown_id = "00000000-0000-0000-0000-000000000000"

    assert (
        client.get(
            f"/api/v1/handling-units/{unknown_id}",
        ).status_code
        == 404
    )

    assert (
        client.get(
            f"/api/v1/handling-units/{unknown_id}/events",
        ).status_code
        == 404
    )

    response = client.post(
        f"/api/v1/handling-units/{unknown_id}/move",
        json={
            "target_bin_id": "00000000-0000-0000-0000-000000000001",
            "expected_version": 1,
        },
    )
    assert response.status_code == 404

    assert (
        client.get(
            "/api/v1/handling-units/by-code/NOT-FOUND",
        ).status_code
        == 404
    )


def test_received_hu_cannot_move_without_passing_inspection(ctx):
    client, _, ids = ctx
    hu_id = create(client, ids).json()["id"]

    response = client.post(
        f"/api/v1/handling-units/{hu_id}/move",
        json={
            "target_bin_id": ids["a"],
            "expected_version": 1,
        },
    )
    assert response.status_code == 409
    assert "passing inspection" in response.json()["error"]["message"]

    detail = client.get(f"/api/v1/handling-units/{hu_id}").json()
    assert detail["status"] == "RECEIVED"
    assert detail["bin_id"] is None


def test_passing_inspection_allows_storage_and_is_audited(ctx):
    client, _, ids = ctx
    hu_id = create(client, ids).json()["id"]

    inspection = client.post(
        f"/api/v1/handling-units/{hu_id}/inspection",
        json={
            "result": "PASS",
            "checklist_answers": {"seal": True, "package": True},
            "damage_notes": "",
            "evidence_checksum": "A" * 64,
            "operator_actor": "TEST_OPERATOR",
        },
    )
    assert inspection.status_code == 200
    assert inspection.json()["result"] == "PASS"

    detail = client.get(f"/api/v1/handling-units/{hu_id}").json()
    assert detail["status"] == "INSPECTION_REQUIRED"
    assert detail["version"] == 2

    move_response = client.post(
        f"/api/v1/handling-units/{hu_id}/move",
        json={
            "target_bin_id": ids["a"],
            "expected_version": 2,
        },
    )
    assert move_response.status_code == 200
    assert move_response.json()["status"] == "STORED"

    history = client.get(f"/api/v1/handling-units/{hu_id}/events").json()
    assert history["total"] == 3
    assert [item["event_type"] for item in history["items"]].count(
        "HU_INSPECTION_PASSED"
    ) == 1


def test_failed_inspection_quarantines_and_blocks_storage(ctx):
    client, _, ids = ctx
    hu_id = create(client, ids).json()["id"]

    inspection = client.post(
        f"/api/v1/handling-units/{hu_id}/inspection",
        json={
            "result": "FAIL",
            "checklist_answers": {"seal": False, "package": False},
            "damage_notes": "Packaging seam is damaged",
            "operator_actor": "TEST_OPERATOR",
        },
    )
    assert inspection.status_code == 200
    assert inspection.json()["result"] == "FAIL"

    detail = client.get(f"/api/v1/handling-units/{hu_id}").json()
    assert detail["status"] == "QUARANTINED"

    move_response = client.post(
        f"/api/v1/handling-units/{hu_id}/move",
        json={
            "target_bin_id": ids["q"],
            "expected_version": 2,
        },
    )
    assert move_response.status_code == 409

    history = client.get(f"/api/v1/handling-units/{hu_id}/events").json()
    assert history["total"] == 2
    assert [item["event_type"] for item in history["items"]].count(
        "HU_INSPECTION_FAILED"
    ) == 1


def test_duplicate_final_inspection_is_rejected(ctx):
    client, _, ids = ctx
    hu_id = create(client, ids).json()["id"]

    first = client.post(
        f"/api/v1/handling-units/{hu_id}/inspection",
        json={"result": "PASS", "operator_actor": "TEST_OPERATOR"},
    )
    assert first.status_code == 200

    second = client.post(
        f"/api/v1/handling-units/{hu_id}/inspection",
        json={"result": "FAIL", "operator_actor": "TEST_OPERATOR"},
    )
    assert second.status_code == 409
