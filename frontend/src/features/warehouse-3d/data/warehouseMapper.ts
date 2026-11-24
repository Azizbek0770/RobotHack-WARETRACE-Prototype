import type {
  DataSourceKind,
  ExpectedInventory,
  HandlingUnitNote,
  NormalizedBin,
  NormalizedInventoryLine,
  NormalizedZone,
  StorageBin,
  Warehouse,
  WarehouseSnapshot,
  WarehouseStats,
  Zone,
  ZoneKind,
  ZoneWorldTransform,
} from './contracts';
import {
  computeZoneLocalOrigin,
  computeZoneWorldBounds,
  resolveZoneTransform,
  zoneLocalGridToWorld,
} from './warehouseCoordinates';

export interface BuildSnapshotInput {
  warehouse: Warehouse;
  zones: Zone[];
  bins: StorageBin[];
  expectedInventory: ExpectedInventory[];
  handlingUnits?: HandlingUnitNote[];
  source: DataSourceKind;
  fetchedAt?: string;
  zoneTransformOverrides?: Partial<Record<ZoneKind, Partial<ZoneWorldTransform>>>;
}

/**
 * Compute unit-based capacity utilization percentage (rounded to 1 decimal place).
 * Returns null if capacity is unknown (`null`) or non-positive.
 * Strictly unit-based (NOT physical volume utilization).
 */
export function calculateCapacityUtilization(
  expectedUnits: number,
  capacityUnits: number | null,
): number | null {
  if (capacityUnits === null || !Number.isFinite(capacityUnits) || capacityUnits <= 0) {
    return null;
  }
  const safeUnits = Math.max(0, expectedUnits);
  return Math.round((safeUnits / capacityUnits) * 1000) / 10;
}

/**
 * Format capacity value for UI display, respecting unknown/null capacities.
 */
export function formatCapacityLabel(capacityUnits: number | null): string {
  if (capacityUnits === null || !Number.isFinite(capacityUnits) || capacityUnits <= 0) {
    return 'Not specified';
  }
  return `${capacityUnits} units`;
}

export function formatUtilizationLabel(utilizationPct: number | null): string {
  if (utilizationPct === null) {
    return 'Not specified';
  }
  return `${utilizationPct.toFixed(1)}%`;
}

/**
 * Normalize raw WARETRACE API entities into a single deterministic 3D snapshot.
 *
 * - Associates expected inventory strictly by bin UUID (`bin_id`), supporting 0, 1, or many SKUs per bin.
 * - Keeps non-stock handling units (RECEIVED unassigned / QUARANTINED) separate from expected stored units.
 * - Computes zone-local to world-space coordinates independently for each zone.
 */
export function buildWarehouseSnapshot(input: BuildSnapshotInput): WarehouseSnapshot {
  const {
    warehouse,
    zones,
    bins,
    expectedInventory,
    handlingUnits = [],
    source,
    fetchedAt = new Date().toISOString(),
    zoneTransformOverrides,
  } = input;

  // Group expected inventory lines by bin UUID
  const inventoryByBinId = new Map<string, NormalizedInventoryLine[]>();
  for (const row of expectedInventory) {
    const line: NormalizedInventoryLine = {
      id: row.id,
      skuId: row.sku_id,
      skuCode: row.sku.code,
      skuName: row.sku.name,
      expectedQty: row.expected_qty,
      source: row.source,
      revision: row.revision,
    };
    const existing = inventoryByBinId.get(row.bin_id);
    if (existing) {
      existing.push(line);
    } else {
      inventoryByBinId.set(row.bin_id, [line]);
    }
  }

  // Group non-stock handling units by bin UUID (when assigned to a bin such as QA-01)
  const huByBinId = new Map<string, HandlingUnitNote[]>();
  for (const hu of handlingUnits) {
    if (hu.binId) {
      const existing = huByBinId.get(hu.binId);
      if (existing) {
        existing.push(hu);
      } else {
        huByBinId.set(hu.binId, [hu]);
      }
    }
  }

  // Group bins by zone UUID
  const binsByZoneId = new Map<string, StorageBin[]>();
  for (const bin of bins) {
    const list = binsByZoneId.get(bin.zone_id);
    if (list) {
      list.push(bin);
    } else {
      binsByZoneId.set(bin.zone_id, [bin]);
    }
  }

  // Deterministic zone ordering: RECEIVING -> STORAGE -> QUARANTINE, then by code
  const zoneKindOrder: Record<ZoneKind, number> = {
    RECEIVING: 0,
    STORAGE: 1,
    QUARANTINE: 2,
  };
  const sortedZones = [...zones].sort((a, b) => {
    const kindDiff = zoneKindOrder[a.kind] - zoneKindOrder[b.kind];
    if (kindDiff !== 0) return kindDiff;
    return a.code.localeCompare(b.code);
  });

  const kindCounters: Record<ZoneKind, number> = {
    RECEIVING: 0,
    STORAGE: 0,
    QUARANTINE: 0,
  };

  const normalizedZones: NormalizedZone[] = [];
  const allNormalizedBins: NormalizedBin[] = [];
  const binById: Record<string, NormalizedBin> = {};

  for (const zone of sortedZones) {
    const zoneBinsRaw = [...(binsByZoneId.get(zone.id) ?? [])].sort((a, b) => {
      if (a.grid_y !== b.grid_y) return a.grid_y - b.grid_y;
      if (a.grid_x !== b.grid_x) return a.grid_x - b.grid_x;
      return a.code.localeCompare(b.code);
    });

    const sameKindIdx = kindCounters[zone.kind];
    kindCounters[zone.kind] += 1;

    const transform = resolveZoneTransform(zone.kind, sameKindIdx, zoneTransformOverrides);
    const localOrigin = computeZoneLocalOrigin(zoneBinsRaw);

    const normalizedZoneBins: NormalizedBin[] = [];
    let zoneExpectedUnits = 0;

    for (const rawBin of zoneBinsRaw) {
      const { localX, localY, worldPosition } = zoneLocalGridToWorld(
        rawBin.grid_x,
        rawBin.grid_y,
        localOrigin,
        transform,
      );

      const lines = (inventoryByBinId.get(rawBin.id) ?? []).sort((a, b) =>
        a.skuCode.localeCompare(b.skuCode),
      );
      const totalExpectedUnits = lines.reduce((sum, item) => sum + item.expectedQty, 0);
      const capacityUtilizationPct = calculateCapacityUtilization(
        totalExpectedUnits,
        rawBin.capacity_units,
      );

      const binHandlingUnits = huByBinId.get(rawBin.id) ?? [];

      const normalizedBin: NormalizedBin = {
        id: rawBin.id,
        code: rawBin.code,
        warehouseId: warehouse.id,
        warehouseCode: warehouse.code,
        zoneId: zone.id,
        zoneCode: zone.code,
        zoneName: zone.name,
        zoneKind: zone.kind,
        gridX: rawBin.grid_x,
        gridY: rawBin.grid_y,
        localX,
        localY,
        worldPosition,
        bayDimensions: {
          width: transform.bayWidth,
          depth: transform.bayDepth,
          height: transform.bayHeight,
        },
        isAccessible: rawBin.is_accessible,
        capacityUnits: rawBin.capacity_units,
        totalExpectedUnits,
        capacityUtilizationPct,
        inventoryLines: lines,
        handlingUnits: binHandlingUnits,
      };

      zoneExpectedUnits += totalExpectedUnits;
      normalizedZoneBins.push(normalizedBin);
      allNormalizedBins.push(normalizedBin);
      binById[normalizedBin.id] = normalizedBin;
    }

    const worldBounds = computeZoneWorldBounds(
      normalizedZoneBins.map((b) => b.worldPosition),
      transform,
    );

    normalizedZones.push({
      id: zone.id,
      warehouseId: warehouse.id,
      code: zone.code,
      name: zone.name,
      kind: zone.kind,
      localOrigin,
      transform,
      worldBounds,
      bins: normalizedZoneBins,
      totalBins: normalizedZoneBins.length,
      expectedStoredUnits: zoneExpectedUnits,
    });
  }

  let accessibleBins = 0;
  let inaccessibleBins = 0;
  let occupiedBins = 0;
  let emptyBins = 0;
  let expectedStoredUnits = 0;
  let knownCapacityUnits = 0;

  for (const bin of allNormalizedBins) {
    if (bin.isAccessible) {
      accessibleBins += 1;
    } else {
      inaccessibleBins += 1;
    }
    if (bin.totalExpectedUnits > 0) {
      occupiedBins += 1;
    } else {
      emptyBins += 1;
    }
    expectedStoredUnits += bin.totalExpectedUnits;
    if (bin.capacityUnits !== null && bin.capacityUnits > 0) {
      knownCapacityUnits += bin.capacityUnits;
    }
  }

  const nonStockHandlingUnitUnits = handlingUnits.reduce((sum, hu) => sum + hu.quantity, 0);

  const stats: WarehouseStats = {
    totalZones: normalizedZones.length,
    totalBins: allNormalizedBins.length,
    accessibleBins,
    inaccessibleBins,
    occupiedBins,
    emptyBins,
    expectedStoredUnits,
    knownCapacityUnits,
    nonStockHandlingUnitCount: handlingUnits.length,
    nonStockHandlingUnitUnits,
  };

  return {
    warehouse,
    zones: normalizedZones,
    bins: allNormalizedBins,
    binById,
    handlingUnits,
    stats,
    source,
    fetchedAt,
  };
}

export function findBinById(
  snapshot: WarehouseSnapshot | null,
  binId: string | null,
): NormalizedBin | null {
  if (!snapshot || !binId) return null;
  return snapshot.binById[binId] ?? null;
}

export function findBinByCode(
  snapshot: WarehouseSnapshot | null,
  code: string,
): NormalizedBin | null {
  if (!snapshot || !code.trim()) return null;
  const needle = code.trim().toLowerCase();
  return snapshot.bins.find((b) => b.code.toLowerCase() === needle) ?? null;
}

export function searchBins(
  snapshot: WarehouseSnapshot | null,
  query: string,
  visibleZoneKinds?: Partial<Record<ZoneKind, boolean>>,
): NormalizedBin[] {
  if (!snapshot) return [];
  const needle = query.trim().toLowerCase();

  return snapshot.bins.filter((bin) => {
    if (visibleZoneKinds && visibleZoneKinds[bin.zoneKind] === false) {
      return false;
    }
    if (!needle) return true;
    if (bin.code.toLowerCase().includes(needle)) return true;
    if (bin.zoneCode.toLowerCase().includes(needle)) return true;
    return bin.inventoryLines.some(
      (line) =>
        line.skuCode.toLowerCase().includes(needle) ||
        line.skuName.toLowerCase().includes(needle),
    );
  });
}
