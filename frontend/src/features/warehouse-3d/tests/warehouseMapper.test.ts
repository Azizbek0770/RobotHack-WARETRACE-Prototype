import { describe, expect, it } from 'vitest';
import {
  DEMO_BIN_IDS,
  DEMO_BINS,
  DEMO_EXPECTED_INVENTORY,
  DEMO_HANDLING_UNITS,
  DEMO_WAREHOUSE_ID,
  DEMO_WAREHOUSES,
  DEMO_ZONES,
} from '../data/demoWarehouse';
import {
  buildWarehouseSnapshot,
  calculateCapacityUtilization,
  findBinByCode,
  findBinById,
  formatCapacityLabel,
  formatUtilizationLabel,
  searchBins,
} from '../data/warehouseMapper';
import { DemoWarehouseProvider } from '../services/demoProvider';

describe('warehouseMapper — normalization, inventory, capacity, and lookup', () => {
  it('loads RIX-DEMO with exactly 3 zones, 12 unique bins, and 55 expected stored units', async () => {
    const provider = new DemoWarehouseProvider();
    const warehouses = await provider.listWarehouses();
    expect(warehouses).toHaveLength(1);
    expect(warehouses[0].code).toBe('RIX-DEMO');

    const snapshot = await provider.getWarehouseSnapshot(DEMO_WAREHOUSE_ID);

    expect(snapshot.zones).toHaveLength(3);
    expect(snapshot.zones.map((z) => z.code)).toEqual(['RECV', 'ST-A', 'QUAR']);

    expect(snapshot.bins).toHaveLength(12);
    expect(snapshot.stats.totalBins).toBe(12);

    // Verify all 12 bins have unique UUIDs and unique codes
    const uniqueIds = new Set(snapshot.bins.map((b) => b.id));
    const uniqueCodes = new Set(snapshot.bins.map((b) => b.code));
    expect(uniqueIds.size).toBe(12);
    expect(uniqueCodes.size).toBe(12);

    // Expected stored units must equal 55 (HU-0009 qty 2 and HU-0010 qty 1 MUST NOT be added)
    expect(snapshot.stats.expectedStoredUnits).toBe(55);
    expect(snapshot.stats.nonStockHandlingUnitCount).toBe(2);
    expect(snapshot.stats.nonStockHandlingUnitUnits).toBe(3);

    // Verify QA-01 has 0 regular expected stored units and holds quarantined HU-0010 separately
    const qa01 = findBinByCode(snapshot, 'QA-01');
    expect(qa01).not.toBeNull();
    expect(qa01!.totalExpectedUnits).toBe(0);
    expect(qa01!.inventoryLines).toHaveLength(0);
    expect(qa01!.handlingUnits).toHaveLength(1);
    expect(qa01!.handlingUnits[0].code).toBe('HU-0010');
    expect(qa01!.handlingUnits[0].status).toBe('QUARANTINED');
  });

  it('associates expected inventory accurately for A-01 and calculates unit capacity utilization', () => {
    const snapshot = buildWarehouseSnapshot({
      warehouse: DEMO_WAREHOUSES[0],
      zones: DEMO_ZONES,
      bins: DEMO_BINS,
      expectedInventory: DEMO_EXPECTED_INVENTORY,
      handlingUnits: DEMO_HANDLING_UNITS,
      source: 'demo',
    });

    const a01ById = findBinById(snapshot, DEMO_BIN_IDS['A-01']);
    const a01ByCode = findBinByCode(snapshot, 'a-01');

    expect(a01ById).not.toBeNull();
    expect(a01ByCode?.id).toBe(a01ById?.id);
    expect(a01ById!.warehouseCode).toBe('RIX-DEMO');
    expect(a01ById!.zoneCode).toBe('ST-A');
    expect(a01ById!.zoneKind).toBe('STORAGE');
    expect(a01ById!.totalExpectedUnits).toBe(8);
    expect(a01ById!.capacityUnits).toBe(30);
    expect(a01ById!.capacityUtilizationPct).toBe(26.7);
    expect(a01ById!.isAccessible).toBe(true);
    expect(a01ById!.inventoryLines).toHaveLength(1);
    expect(a01ById!.inventoryLines[0].skuCode).toBe('SKU-001');
    expect(a01ById!.inventoryLines[0].skuName).toBe('Calibration Kit');
  });

  it('handles unknown/null capacity cleanly as "Not specified"', () => {
    expect(calculateCapacityUtilization(10, null)).toBeNull();
    expect(calculateCapacityUtilization(10, 0)).toBeNull();
    expect(formatCapacityLabel(null)).toBe('Not specified');
    expect(formatUtilizationLabel(null)).toBe('Not specified');
    expect(formatCapacityLabel(30)).toBe('30 units');
    expect(formatUtilizationLabel(26.7)).toBe('26.7%');
  });

  it('supports multiple SKUs inside a single bin and aggregates unit totals accurately', () => {
    const multiSkuInventory = [
      ...DEMO_EXPECTED_INVENTORY,
      {
        id: '44444444-1000-4000-8000-000000000099',
        bin_id: DEMO_BIN_IDS['A-01'],
        sku_id: '55555555-1000-4000-8000-000000000099',
        expected_qty: 7,
        source: 'API_SYNC',
        revision: 3,
        sku: {
          id: '55555555-1000-4000-8000-000000000099',
          code: 'SKU-099',
          name: 'Torque Adapter',
        },
        bin: {
          id: DEMO_BIN_IDS['A-01'],
          code: 'A-01',
        },
      },
    ];

    const snapshot = buildWarehouseSnapshot({
      warehouse: DEMO_WAREHOUSES[0],
      zones: DEMO_ZONES,
      bins: DEMO_BINS,
      expectedInventory: multiSkuInventory,
      source: 'api',
    });

    const a01 = findBinById(snapshot, DEMO_BIN_IDS['A-01'])!;
    expect(a01.inventoryLines).toHaveLength(2);
    expect(a01.inventoryLines.map((l) => l.skuCode)).toEqual(['SKU-001', 'SKU-099']);
    expect(a01.totalExpectedUnits).toBe(15); // 8 + 7
    expect(a01.capacityUtilizationPct).toBe(50);
    expect(snapshot.stats.expectedStoredUnits).toBe(62); // 55 + 7
  });

  it('tracks inaccessible bins and supports searching by bin code, zone, or SKU', () => {
    const binsWithInaccessible = DEMO_BINS.map((b) =>
      b.code === 'A-04' ? { ...b, is_accessible: false, capacity_units: null } : b,
    );

    const snapshot = buildWarehouseSnapshot({
      warehouse: DEMO_WAREHOUSES[0],
      zones: DEMO_ZONES,
      bins: binsWithInaccessible,
      expectedInventory: DEMO_EXPECTED_INVENTORY,
      source: 'api',
    });

    expect(snapshot.stats.inaccessibleBins).toBe(1);
    expect(snapshot.stats.accessibleBins).toBe(11);

    const a04 = findBinByCode(snapshot, 'A-04')!;
    expect(a04.isAccessible).toBe(false);
    expect(a04.capacityUtilizationPct).toBeNull();

    expect(searchBins(snapshot, 'Optical Reader').map((b) => b.code)).toEqual(['A-07']);
    expect(searchBins(snapshot, 'QA', { QUARANTINE: false })).toEqual([]);
  });
});
