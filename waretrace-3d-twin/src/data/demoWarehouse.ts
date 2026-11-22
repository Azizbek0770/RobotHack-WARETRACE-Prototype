import type {
  ExpectedInventory,
  HandlingUnitNote,
  StorageBin,
  Warehouse,
  Zone,
} from './contracts';

/**
 * Deterministic synthetic dataset for WARETRACE demo mode (`RIX-DEMO`).
 *
 * Strictly contains:
 * - 1 warehouse (`RIX-DEMO`)
 * - 3 zones (`RECV`, `ST-A`, `QUAR`)
 * - 12 configured bins (`RCV-01..02`, `A-01..08`, `QA-01..02`), each capacity 30 units
 * - 8 expected inventory records totaling 55 expected stored units
 * - 2 non-stock handling units (`HU-0009` RECEIVED unassigned qty 2, `HU-0010` QUARANTINED at QA-01 qty 1)
 */

export const DEMO_WAREHOUSE_ID = '11111111-1000-4000-8000-000000000001';

export const DEMO_ZONE_IDS = {
  RECV: '22222222-1000-4000-8000-000000000001',
  ST_A: '22222222-1000-4000-8000-000000000002',
  QUAR: '22222222-1000-4000-8000-000000000003',
} as const;

export const DEMO_BIN_IDS = {
  'RCV-01': '33333333-1000-4000-8000-000000000001',
  'RCV-02': '33333333-1000-4000-8000-000000000002',
  'A-01': '33333333-1000-4000-8000-000000000003',
  'A-02': '33333333-1000-4000-8000-000000000004',
  'A-03': '33333333-1000-4000-8000-000000000005',
  'A-04': '33333333-1000-4000-8000-000000000006',
  'A-05': '33333333-1000-4000-8000-000000000007',
  'A-06': '33333333-1000-4000-8000-000000000008',
  'A-07': '33333333-1000-4000-8000-000000000009',
  'A-08': '33333333-1000-4000-8000-000000000010',
  'QA-01': '33333333-1000-4000-8000-000000000011',
  'QA-02': '33333333-1000-4000-8000-000000000012',
} as const;

export const DEMO_WAREHOUSES: Warehouse[] = [
  {
    id: DEMO_WAREHOUSE_ID,
    code: 'RIX-DEMO',
    name: 'WARETRACE Demo Warehouse',
    is_active: true,
  },
];

export const DEMO_ZONES: Zone[] = [
  {
    id: DEMO_ZONE_IDS.RECV,
    warehouse_id: DEMO_WAREHOUSE_ID,
    code: 'RECV',
    name: 'Receiving',
    kind: 'RECEIVING',
  },
  {
    id: DEMO_ZONE_IDS.ST_A,
    warehouse_id: DEMO_WAREHOUSE_ID,
    code: 'ST-A',
    name: 'Storage Area A',
    kind: 'STORAGE',
  },
  {
    id: DEMO_ZONE_IDS.QUAR,
    warehouse_id: DEMO_WAREHOUSE_ID,
    code: 'QUAR',
    name: 'Quarantine',
    kind: 'QUARANTINE',
  },
];

export const DEMO_BINS: StorageBin[] = [
  // Zone A — Receiving (local coordinates)
  {
    id: DEMO_BIN_IDS['RCV-01'],
    zone_id: DEMO_ZONE_IDS.RECV,
    code: 'RCV-01',
    grid_x: 0,
    grid_y: 0,
    is_accessible: true,
    capacity_units: 30,
  },
  {
    id: DEMO_BIN_IDS['RCV-02'],
    zone_id: DEMO_ZONE_IDS.RECV,
    code: 'RCV-02',
    grid_x: 1,
    grid_y: 0,
    is_accessible: true,
    capacity_units: 30,
  },

  // Zone B — Storage Area A (local coordinates)
  {
    id: DEMO_BIN_IDS['A-01'],
    zone_id: DEMO_ZONE_IDS.ST_A,
    code: 'A-01',
    grid_x: 0,
    grid_y: 1,
    is_accessible: true,
    capacity_units: 30,
  },
  {
    id: DEMO_BIN_IDS['A-02'],
    zone_id: DEMO_ZONE_IDS.ST_A,
    code: 'A-02',
    grid_x: 1,
    grid_y: 1,
    is_accessible: true,
    capacity_units: 30,
  },
  {
    id: DEMO_BIN_IDS['A-03'],
    zone_id: DEMO_ZONE_IDS.ST_A,
    code: 'A-03',
    grid_x: 2,
    grid_y: 1,
    is_accessible: true,
    capacity_units: 30,
  },
  {
    id: DEMO_BIN_IDS['A-04'],
    zone_id: DEMO_ZONE_IDS.ST_A,
    code: 'A-04',
    grid_x: 3,
    grid_y: 1,
    is_accessible: true,
    capacity_units: 30,
  },
  {
    id: DEMO_BIN_IDS['A-05'],
    zone_id: DEMO_ZONE_IDS.ST_A,
    code: 'A-05',
    grid_x: 0,
    grid_y: 2,
    is_accessible: true,
    capacity_units: 30,
  },
  {
    id: DEMO_BIN_IDS['A-06'],
    zone_id: DEMO_ZONE_IDS.ST_A,
    code: 'A-06',
    grid_x: 1,
    grid_y: 2,
    is_accessible: true,
    capacity_units: 30,
  },
  {
    id: DEMO_BIN_IDS['A-07'],
    zone_id: DEMO_ZONE_IDS.ST_A,
    code: 'A-07',
    grid_x: 2,
    grid_y: 2,
    is_accessible: true,
    capacity_units: 30,
  },
  {
    id: DEMO_BIN_IDS['A-08'],
    zone_id: DEMO_ZONE_IDS.ST_A,
    code: 'A-08',
    grid_x: 3,
    grid_y: 2,
    is_accessible: true,
    capacity_units: 30,
  },

  // Zone C — Quarantine (local coordinates)
  {
    id: DEMO_BIN_IDS['QA-01'],
    zone_id: DEMO_ZONE_IDS.QUAR,
    code: 'QA-01',
    grid_x: 0,
    grid_y: 3,
    is_accessible: true,
    capacity_units: 30,
  },
  {
    id: DEMO_BIN_IDS['QA-02'],
    zone_id: DEMO_ZONE_IDS.QUAR,
    code: 'QA-02',
    grid_x: 1,
    grid_y: 3,
    is_accessible: true,
    capacity_units: 30,
  },
];

export const DEMO_EXPECTED_INVENTORY: ExpectedInventory[] = [
  {
    id: '44444444-1000-4000-8000-000000000001',
    bin_id: DEMO_BIN_IDS['A-01'],
    sku_id: '55555555-1000-4000-8000-000000000001',
    expected_qty: 8,
    source: 'SYNTHETIC_SEED',
    revision: 1,
    sku: {
      id: '55555555-1000-4000-8000-000000000001',
      code: 'SKU-001',
      name: 'Calibration Kit',
    },
    bin: {
      id: DEMO_BIN_IDS['A-01'],
      code: 'A-01',
    },
  },
  {
    id: '44444444-1000-4000-8000-000000000002',
    bin_id: DEMO_BIN_IDS['A-02'],
    sku_id: '55555555-1000-4000-8000-000000000002',
    expected_qty: 4,
    source: 'SYNTHETIC_SEED',
    revision: 1,
    sku: {
      id: '55555555-1000-4000-8000-000000000002',
      code: 'SKU-002',
      name: 'Sensor Module',
    },
    bin: {
      id: DEMO_BIN_IDS['A-02'],
      code: 'A-02',
    },
  },
  {
    id: '44444444-1000-4000-8000-000000000003',
    bin_id: DEMO_BIN_IDS['A-03'],
    sku_id: '55555555-1000-4000-8000-000000000003',
    expected_qty: 12,
    source: 'SYNTHETIC_SEED',
    revision: 1,
    sku: {
      id: '55555555-1000-4000-8000-000000000003',
      code: 'SKU-003',
      name: 'Cable Pack',
    },
    bin: {
      id: DEMO_BIN_IDS['A-03'],
      code: 'A-03',
    },
  },
  {
    id: '44444444-1000-4000-8000-000000000004',
    bin_id: DEMO_BIN_IDS['A-04'],
    sku_id: '55555555-1000-4000-8000-000000000004',
    expected_qty: 1,
    source: 'SYNTHETIC_SEED',
    revision: 1,
    sku: {
      id: '55555555-1000-4000-8000-000000000004',
      code: 'SKU-004',
      name: 'Control Board',
    },
    bin: {
      id: DEMO_BIN_IDS['A-04'],
      code: 'A-04',
    },
  },
  {
    id: '44444444-1000-4000-8000-000000000005',
    bin_id: DEMO_BIN_IDS['A-05'],
    sku_id: '55555555-1000-4000-8000-000000000005',
    expected_qty: 15,
    source: 'SYNTHETIC_SEED',
    revision: 1,
    sku: {
      id: '55555555-1000-4000-8000-000000000005',
      code: 'SKU-005',
      name: 'Mounting Bracket',
    },
    bin: {
      id: DEMO_BIN_IDS['A-05'],
      code: 'A-05',
    },
  },
  {
    id: '44444444-1000-4000-8000-000000000006',
    bin_id: DEMO_BIN_IDS['A-06'],
    sku_id: '55555555-1000-4000-8000-000000000006',
    expected_qty: 5,
    source: 'SYNTHETIC_SEED',
    revision: 1,
    sku: {
      id: '55555555-1000-4000-8000-000000000006',
      code: 'SKU-006',
      name: 'Safety Gloves',
    },
    bin: {
      id: DEMO_BIN_IDS['A-06'],
      code: 'A-06',
    },
  },
  {
    id: '44444444-1000-4000-8000-000000000007',
    bin_id: DEMO_BIN_IDS['A-07'],
    sku_id: '55555555-1000-4000-8000-000000000007',
    expected_qty: 7,
    source: 'SYNTHETIC_SEED',
    revision: 1,
    sku: {
      id: '55555555-1000-4000-8000-000000000007',
      code: 'SKU-007',
      name: 'Optical Reader',
    },
    bin: {
      id: DEMO_BIN_IDS['A-07'],
      code: 'A-07',
    },
  },
  {
    id: '44444444-1000-4000-8000-000000000008',
    bin_id: DEMO_BIN_IDS['A-08'],
    sku_id: '55555555-1000-4000-8000-000000000008',
    expected_qty: 3,
    source: 'SYNTHETIC_SEED',
    revision: 1,
    sku: {
      id: '55555555-1000-4000-8000-000000000008',
      code: 'SKU-008',
      name: 'RFID Tag Pack',
    },
    bin: {
      id: DEMO_BIN_IDS['A-08'],
      code: 'A-08',
    },
  },
];

/**
 * Non-stock handling units tracked separately from regular expected stored inventory.
 * - HU-0009: RECEIVED, qty 2, no storage bin assigned
 * - HU-0010: QUARANTINED, qty 1, located at QA-01
 */
export const DEMO_HANDLING_UNITS: HandlingUnitNote[] = [
  {
    id: '66666666-1000-4000-8000-000000000009',
    code: 'HU-0009',
    status: 'RECEIVED',
    quantity: 2,
    binId: null,
    binCode: null,
    zoneCode: 'RECV',
    description: 'Inbound received handling unit awaiting putaway (unassigned bin; excluded from expected stored stock).',
  },
  {
    id: '66666666-1000-4000-8000-000000000010',
    code: 'HU-0010',
    status: 'QUARANTINED',
    quantity: 1,
    binId: DEMO_BIN_IDS['QA-01'],
    binCode: 'QA-01',
    zoneCode: 'QUAR',
    description: 'Quarantined handling unit held for inspection at QA-01 (excluded from expected stored stock).',
  },
];
