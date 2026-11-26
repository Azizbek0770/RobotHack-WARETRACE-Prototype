from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core import security
from app.db.base import Base
from app.db.seed_demo import seed_demo
from app.db.session import get_db
from app.main import app
from app.models import (
    SKU,
    AuditFinding,
    AuditFindingStatus,
    AuditStatus,
    ExpectedInventory,
    InventoryAudit,
    InventoryAuditSnapshot,
    StockObservation,
    StockObservationSource,
    StorageBin,
    Warehouse,
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
        seed_demo(db)
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


def warehouse_ids(engine) -> dict[str, UUID]:
    with Session(engine) as db:
        warehouse = db.scalar(select(Warehouse))
        assert warehouse is not None
        bins = {
            code: bin_id
            for code, bin_id in db.execute(select(StorageBin.code, StorageBin.id)).all()
        }
        skus = {
            code: sku_id for code, sku_id in db.execute(select(SKU.code, SKU.id)).all()
        }
        return {
            "warehouse": warehouse.id,
            **{f"bin:{code}": bin_id for code, bin_id in bins.items()},
            **{f"sku:{code}": sku_id for code, sku_id in skus.items()},
        }


def start_audit(client: TestClient, warehouse_id: UUID, request_key: str = "run-001"):
    response = client.post(
        "/api/v1/audits",
        json={
            "warehouse_id": str(warehouse_id),
            "request_key": request_key,
            "started_by": "inventory-operator",
            "classification": "SIMULATED",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def add_manual_observation(
    client: TestClient,
    audit_id: str,
    bin_id: UUID,
    sku_id: UUID,
    observed_qty: int,
    handling_unit_codes: list[str] | None = None,
):
    return client.post(
        f"/api/v1/audits/{audit_id}/observations",
        json={
            "bin_id": str(bin_id),
            "sku_id": str(sku_id),
            "observed_qty": observed_qty,
            "observed_by": "inventory-operator",
            "handling_unit_codes": handling_unit_codes or [],
        },
    )


def test_snapshot_comparison_is_deterministic_and_review_is_recorded(
    client_and_engine,
):
    client, engine = client_and_engine
    ids = warehouse_ids(engine)
    with Session(engine) as db:
        before = db.execute(
            select(ExpectedInventory.expected_qty, ExpectedInventory.revision)
        ).all()

    audit = start_audit(client, ids["warehouse"])
    with Session(engine) as db:
        snapshots = db.scalars(
            select(InventoryAuditSnapshot).where(
                InventoryAuditSnapshot.audit_id == UUID(audit["id"])
            )
        ).all()
    assert len(snapshots) == 8
    assert audit["classification"] == "SIMULATED"
    snapshot_response = client.get(f"/api/v1/audits/{audit['id']}/snapshot")
    assert snapshot_response.status_code == 200
    captured = next(
        row
        for row in snapshot_response.json()["items"]
        if row["bin_id"] == str(ids["bin:A-01"])
        and row["sku_id"] == str(ids["sku:SKU-001"])
    )
    assert captured["expected_qty"] == 8
    assert captured["revision"] == 1

    assert (
        add_manual_observation(
            client,
            audit["id"],
            ids["bin:A-01"],
            ids["sku:SKU-001"],
            8,
        ).status_code
        == 201
    )
    assert (
        add_manual_observation(
            client,
            audit["id"],
            ids["bin:A-02"],
            ids["sku:SKU-002"],
            0,
        ).status_code
        == 201
    )
    assert (
        add_manual_observation(
            client,
            audit["id"],
            ids["bin:A-03"],
            ids["sku:SKU-003"],
            15,
        ).status_code
        == 201
    )

    comparison = client.post(f"/api/v1/audits/{audit['id']}/compare")
    assert comparison.status_code == 200, comparison.text
    assert comparison.json()["counts_by_type"] == {
        "MISSING": 1,
        "EXCESS": 1,
        "MATCH": 1,
        "UNREGISTERED_HU": 0,
        "MISPLACED_HU": 0,
    }

    findings = client.get(f"/api/v1/audits/{audit['id']}/findings").json()
    by_type = {row["finding_type"]: row for row in findings}
    assert by_type["MISSING"]["discrepancy_qty"] == -4
    assert by_type["EXCESS"]["discrepancy_qty"] == 3
    assert by_type["MATCH"]["discrepancy_qty"] == 0

    missing_id = by_type["MISSING"]["id"]
    resolve_first = client.post(
        f"/api/v1/audits/{audit['id']}/findings/{missing_id}/actions",
        json={"action": "RESOLVE", "actor": "supervisor-1", "note": "confirmed"},
    )
    assert resolve_first.status_code == 409
    reviewed = client.post(
        f"/api/v1/audits/{audit['id']}/findings/{missing_id}/actions",
        json={"action": "REVIEW", "actor": "supervisor-1", "note": "count checked"},
    )
    assert reviewed.status_code == 201
    assert reviewed.json()["to_status"] == "REVIEWED"
    resolved = client.post(
        f"/api/v1/audits/{audit['id']}/findings/{missing_id}/actions",
        json={"action": "RESOLVE", "actor": "supervisor-2", "note": "case closed"},
    )
    assert resolved.status_code == 201
    assert resolved.json()["to_status"] == "RESOLVED"
    actions = client.get(
        f"/api/v1/audits/{audit['id']}/findings/{missing_id}/actions"
    ).json()
    assert [action["action"] for action in actions] == ["REVIEW", "RESOLVE"]
    assert [action["actor"] for action in actions] == ["supervisor-1", "supervisor-2"]
    assert all(action["created_at"] for action in actions)
    assert by_type["MISSING"]["status"] == AuditFindingStatus.OPEN.value

    repeated = client.post(f"/api/v1/audits/{audit['id']}/compare")
    assert repeated.status_code == 200
    assert repeated.json()["finding_count"] == 3
    after_obs = add_manual_observation(
        client,
        audit["id"],
        ids["bin:A-04"],
        ids["sku:SKU-004"],
        1,
    )
    assert after_obs.status_code == 409

    with Session(engine) as db:
        after = db.execute(
            select(ExpectedInventory.expected_qty, ExpectedInventory.revision)
        ).all()
        assert after == before
        audit_row = db.get(InventoryAudit, UUID(audit["id"]))
        assert audit_row is not None
        assert audit_row.status == AuditStatus.COMPARED


def test_manual_duplicate_and_unknown_references_are_rejected(client_and_engine):
    client, engine = client_and_engine
    ids = warehouse_ids(engine)
    audit = start_audit(client, ids["warehouse"])

    first = add_manual_observation(
        client,
        audit["id"],
        ids["bin:A-01"],
        ids["sku:SKU-001"],
        8,
    )
    assert first.status_code == 201
    duplicate = add_manual_observation(
        client,
        audit["id"],
        ids["bin:A-01"],
        ids["sku:SKU-001"],
        9,
    )
    assert duplicate.status_code == 409

    unknown_bin = add_manual_observation(
        client,
        audit["id"],
        uuid4(),
        ids["sku:SKU-001"],
        1,
    )
    assert unknown_bin.status_code == 404
    unknown_sku = add_manual_observation(
        client,
        audit["id"],
        ids["bin:A-02"],
        uuid4(),
        1,
    )
    assert unknown_sku.status_code == 404
    invalid_qty = add_manual_observation(
        client,
        audit["id"],
        ids["bin:A-02"],
        ids["sku:SKU-002"],
        -1,
    )
    assert invalid_qty.status_code == 422

    duplicate_key = client.post(
        "/api/v1/audits",
        json={
            "warehouse_id": str(ids["warehouse"]),
            "request_key": "run-001",
            "started_by": "another-operator",
            "classification": "OPERATIONAL",
        },
    )
    assert duplicate_key.status_code == 409
    assert client.get(f"/api/v1/audits/{audit['id']}/observations").json()


def test_csv_import_is_validated_atomic_and_marked_as_csv(client_and_engine):
    client, engine = client_and_engine
    ids = warehouse_ids(engine)
    audit = start_audit(client, ids["warehouse"], "csv-run")
    good_csv = (
        "bin_id,sku_id,observed_qty,handling_unit_codes\n"
        f"{ids['bin:A-01']},{ids['sku:SKU-001']},8,\n"
        f"{ids['bin:A-02']},{ids['sku:SKU-002']},4,\n"
    )
    imported = client.post(
        f"/api/v1/audits/{audit['id']}/observations/import",
        data={"observed_by": "csv-operator"},
        files={"file": ("observations.csv", good_csv, "text/csv")},
    )
    assert imported.status_code == 201, imported.text
    assert imported.json()["imported_count"] == 2
    assert {row["source"] for row in imported.json()["observations"]} == {"CSV"}
    assert {row["classification"] for row in imported.json()["observations"]} == {
        "SIMULATED"
    }
    assert {row["observed_by"] for row in imported.json()["observations"]} == {
        "csv-operator"
    }

    duplicate_upload = client.post(
        f"/api/v1/audits/{audit['id']}/observations/import",
        data={"observed_by": "csv-operator"},
        files={"file": ("observations.csv", good_csv, "text/csv")},
    )
    assert duplicate_upload.status_code == 409
    duplicate_rows = (
        "bin_id,sku_id,observed_qty\n"
        f"{ids['bin:A-03']},{ids['sku:SKU-003']},12\n"
        f"{ids['bin:A-03']},{ids['sku:SKU-003']},12\n"
    )
    duplicate_pair = client.post(
        f"/api/v1/audits/{audit['id']}/observations/import",
        data={"observed_by": "csv-operator"},
        files={"file": ("duplicates.csv", duplicate_rows, "text/csv")},
    )
    assert duplicate_pair.status_code == 409

    unknown_ref_csv = (
        "bin_id,sku_id,observed_qty\n"
        f"{ids['bin:A-03']},{ids['sku:SKU-003']},12\n"
        f"{ids['bin:A-04']},{uuid4()},1\n"
    )
    unknown_reference = client.post(
        f"/api/v1/audits/{audit['id']}/observations/import",
        data={"observed_by": "csv-operator"},
        files={"file": ("unknown.csv", unknown_ref_csv, "text/csv")},
    )
    assert unknown_reference.status_code == 404
    assert len(client.get(f"/api/v1/audits/{audit['id']}/observations").json()) == 2

    invalid_csv = client.post(
        f"/api/v1/audits/{audit['id']}/observations/import",
        data={"observed_by": "csv-operator"},
        files={
            "file": (
                "invalid.csv",
                "bin_id,sku_id,observed_qty\nnot-a-uuid,also-not-a-uuid,-4\n",
                "text/csv",
            )
        },
    )
    assert invalid_csv.status_code == 422

    with Session(engine) as db:
        assert (
            db.scalar(
                select(StockObservation.source).where(
                    StockObservation.audit_id == UUID(audit["id"])
                )
            )
            == StockObservationSource.CSV
        )


def test_stale_snapshot_rejects_comparison_without_partial_findings(
    client_and_engine,
):
    client, engine = client_and_engine
    ids = warehouse_ids(engine)
    audit = start_audit(client, ids["warehouse"], "stale-run")
    with Session(engine) as db:
        expected = db.scalar(
            select(ExpectedInventory).where(
                ExpectedInventory.bin_id == ids["bin:A-01"],
                ExpectedInventory.sku_id == ids["sku:SKU-001"],
            )
        )
        assert expected is not None
        expected.expected_qty += 1
        expected.revision += 1
        db.commit()

    response = add_manual_observation(
        client,
        audit["id"],
        ids["bin:A-01"],
        ids["sku:SKU-001"],
        8,
    )
    assert response.status_code == 201
    stale = client.post(f"/api/v1/audits/{audit['id']}/compare")
    assert stale.status_code == 409
    assert "changed after the audit snapshot" in stale.json()["error"]["message"]

    with Session(engine) as db:
        audit_row = db.get(InventoryAudit, UUID(audit["id"]))
        assert audit_row is not None
        assert audit_row.status == AuditStatus.OPEN
        assert (
            db.scalar(
                select(AuditFinding.id).where(AuditFinding.audit_id == audit_row.id)
            )
            is None
        )


def test_hu_anomalies_require_matching_registered_identity(client_and_engine):
    client, engine = client_and_engine
    ids = warehouse_ids(engine)
    audit = start_audit(client, ids["warehouse"], "hu-run")
    response = add_manual_observation(
        client,
        audit["id"],
        ids["bin:A-02"],
        ids["sku:SKU-001"],
        2,
        ["HU-0001", "HU-NOT-REGISTERED", "HU-0002"],
    )
    assert response.status_code == 201

    comparison = client.post(f"/api/v1/audits/{audit['id']}/compare")
    assert comparison.status_code == 200
    findings = client.get(f"/api/v1/audits/{audit['id']}/findings").json()
    hu_findings = [
        row
        for row in findings
        if row["finding_type"] in {"UNREGISTERED_HU", "MISPLACED_HU"}
    ]
    assert {
        (row["finding_type"], row["handling_unit_code"]) for row in hu_findings
    } == {
        ("MISPLACED_HU", "HU-0001"),
        ("UNREGISTERED_HU", "HU-NOT-REGISTERED"),
    }
    misplaced = next(
        row for row in hu_findings if row["finding_type"] == "MISPLACED_HU"
    )
    assert misplaced["registered_bin_id"] == str(ids["bin:A-01"])


def test_unknown_warehouse_and_non_simulated_audit_classification(client_and_engine):
    client, engine = client_and_engine
    ids = warehouse_ids(engine)
    unknown_warehouse = client.post(
        "/api/v1/audits",
        json={
            "warehouse_id": str(uuid4()),
            "request_key": "unknown-wh",
            "started_by": "operator-one",
            "classification": "SIMULATED",
        },
    )
    assert unknown_warehouse.status_code == 404

    started = client.post(
        "/api/v1/audits",
        json={
            "warehouse_id": str(ids["warehouse"]),
            "request_key": "operational-run",
            "started_by": "operator-one",
            "classification": "OPERATIONAL",
        },
    )
    assert started.status_code == 201
    assert started.json()["classification"] == "OPERATIONAL"

    missing_classification = client.post(
        "/api/v1/audits",
        json={
            "warehouse_id": str(ids["warehouse"]),
            "request_key": "no-classification",
            "started_by": "operator-one",
        },
    )
    assert missing_classification.status_code == 422


def test_audit_writes_are_blocked_in_production(client_and_engine, monkeypatch):
    client, engine = client_and_engine
    ids = warehouse_ids(engine)
    monkeypatch.setattr(
        security,
        "get_settings",
        lambda: SimpleNamespace(environment="production"),
    )

    response = client.post(
        "/api/v1/audits",
        json={
            "warehouse_id": str(ids["warehouse"]),
            "request_key": "production-attempt",
            "started_by": "operator-one",
            "classification": "SIMULATED",
        },
    )
    assert response.status_code == 403
    with Session(engine) as db:
        assert db.scalar(select(InventoryAudit.id)) is None
