"""Explicit, idempotent synthetic warehouse fixture (never auto-run)."""

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import SessionLocal
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

WAREHOUSE_CODE = "RIX-DEMO"


def seed_demo(db: Session) -> bool:
    """Stage a demo fixture; caller owns commit or rollback."""
    existing = db.scalar(select(Warehouse.id).where(Warehouse.code == WAREHOUSE_CODE))
    if existing is not None:
        return False

    warehouse = Warehouse(
        code=WAREHOUSE_CODE,
        name="WARETRACE Demo Warehouse",
    )
    db.add(warehouse)
    db.flush()

    zone_specs = (
        ("RECV", "Receiving", ZoneKind.RECEIVING),
        ("ST-A", "Storage Area A", ZoneKind.STORAGE),
        ("QUAR", "Quarantine", ZoneKind.QUARANTINE),
    )

    zones = {}
    for code, name, kind in zone_specs:
        zone = Zone(
            warehouse_id=warehouse.id,
            code=code,
            name=name,
            kind=kind,
        )
        db.add(zone)
        zones[code] = zone
    db.flush()

    bin_specs = [
        ("RECV", "RCV-01", 0, 0),
        ("RECV", "RCV-02", 1, 0),
        *[
            (
                "ST-A",
                f"A-{i:02}",
                (i - 1) % 4,
                1 + (i - 1) // 4,
            )
            for i in range(1, 9)
        ],
        ("QUAR", "QA-01", 0, 3),
        ("QUAR", "QA-02", 1, 3),
    ]

    bins = {}
    for zone_code, code, x, y in bin_specs:
        storage_bin = StorageBin(
            zone_id=zones[zone_code].id,
            code=code,
            grid_x=x,
            grid_y=y,
            capacity_units=30,
        )
        db.add(storage_bin)
        bins[code] = storage_bin
    db.flush()

    # Code, name, weight (g), dimensions (mm), fragile.
    sku_specs = (
        ("SKU-001", "Calibration Kit", 850, 240, 160, 90, True),
        ("SKU-002", "Sensor Module", 250, 110, 75, 45, True),
        ("SKU-003", "Cable Pack", 120, 180, 100, 40, False),
        ("SKU-004", "Control Board", 400, 210, 140, 35, True),
        ("SKU-005", "Mounting Bracket", 300, 120, 90, 50, False),
        ("SKU-006", "Safety Gloves", 150, 200, 120, 70, False),
        ("SKU-007", "Optical Reader", 600, 160, 105, 80, True),
        ("SKU-008", "RFID Tag Pack", 80, 95, 65, 20, False),
    )

    skus = {}
    for code, name, weight, length, width, height, fragile in sku_specs:
        sku = SKU(
            code=code,
            name=name,
            unit_weight_g=weight,
            length_mm=length,
            width_mm=width,
            height_mm=height,
            is_fragile=fragile,
        )
        db.add(sku)
        skus[code] = sku
    db.flush()

    # Code, SKU, quantity, bin, status.
    hu_specs = (
        ("HU-0001", "SKU-001", 8, "A-01", HandlingUnitStatus.STORED),
        ("HU-0002", "SKU-002", 4, "A-02", HandlingUnitStatus.STORED),
        ("HU-0003", "SKU-003", 12, "A-03", HandlingUnitStatus.STORED),
        ("HU-0004", "SKU-004", 1, "A-04", HandlingUnitStatus.STORED),
        ("HU-0005", "SKU-005", 15, "A-05", HandlingUnitStatus.STORED),
        ("HU-0006", "SKU-006", 5, "A-06", HandlingUnitStatus.STORED),
        ("HU-0007", "SKU-007", 7, "A-07", HandlingUnitStatus.STORED),
        ("HU-0008", "SKU-008", 3, "A-08", HandlingUnitStatus.STORED),
        ("HU-0009", "SKU-001", 2, None, HandlingUnitStatus.RECEIVED),
        ("HU-0010", "SKU-003", 1, "QA-01", HandlingUnitStatus.QUARANTINED),
    )

    expected = defaultdict(int)

    for code, sku_code, quantity, bin_code, status in hu_specs:
        db.add(
            HandlingUnit(
                external_code=code,
                sku_id=skus[sku_code].id,
                bin_id=bins[bin_code].id if bin_code else None,
                quantity=quantity,
                status=status,
            )
        )

        if status == HandlingUnitStatus.STORED:
            expected[bin_code, sku_code] += quantity

    for (bin_code, sku_code), quantity in expected.items():
        db.add(
            ExpectedInventory(
                bin_id=bins[bin_code].id,
                sku_id=skus[sku_code].id,
                expected_qty=quantity,
                source="SYNTHETIC",
            )
        )

    db.flush()
    return True


def main() -> None:
    if get_settings().environment != "development":
        raise SystemExit("Demo seeding is allowed only in development mode.")

    with SessionLocal.begin() as session:
        created = seed_demo(session)

    if created:
        print("Demo warehouse created.")
    else:
        print("Demo warehouse already exists; unchanged.")


if __name__ == "__main__":
    main()
