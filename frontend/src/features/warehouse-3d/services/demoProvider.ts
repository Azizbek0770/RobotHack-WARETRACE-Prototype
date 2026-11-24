import type { Warehouse, WarehouseSnapshot } from '../data/contracts';
import {
  DEMO_BINS,
  DEMO_EXPECTED_INVENTORY,
  DEMO_HANDLING_UNITS,
  DEMO_WAREHOUSES,
  DEMO_ZONES,
} from '../data/demoWarehouse';
import { buildWarehouseSnapshot } from '../data/warehouseMapper';
import { WarehouseProviderError, type WarehouseDataProvider } from './warehouseProvider';

/**
 * Local deterministic provider supplying the RIX-DEMO synthetic warehouse dataset.
 * Works completely offline without any backend server.
 */
export class DemoWarehouseProvider implements WarehouseDataProvider {
  readonly source = 'demo' as const;
  readonly label = 'Synthetic Demo Data';

  async listWarehouses(signal?: AbortSignal): Promise<Warehouse[]> {
    if (signal?.aborted) {
      throw new WarehouseProviderError('Demo warehouse request aborted.', { code: 'ABORTED' });
    }
    return DEMO_WAREHOUSES.map((w) => ({ ...w }));
  }

  async getWarehouseSnapshot(
    warehouseId: string,
    signal?: AbortSignal,
  ): Promise<WarehouseSnapshot> {
    if (signal?.aborted) {
      throw new WarehouseProviderError('Demo snapshot request aborted.', { code: 'ABORTED' });
    }

    const warehouse = DEMO_WAREHOUSES.find((w) => w.id === warehouseId);
    if (!warehouse) {
      throw new WarehouseProviderError(
        `Demo warehouse "${warehouseId}" was not found in synthetic fixtures.`,
        { code: 'NOT_FOUND' },
      );
    }

    const zones = DEMO_ZONES.filter((z) => z.warehouse_id === warehouse.id);
    const zoneIds = new Set(zones.map((z) => z.id));
    const bins = DEMO_BINS.filter((b) => zoneIds.has(b.zone_id));
    const binIds = new Set(bins.map((b) => b.id));
    const expectedInventory = DEMO_EXPECTED_INVENTORY.filter((inv) => binIds.has(inv.bin_id));

    return buildWarehouseSnapshot({
      warehouse,
      zones,
      bins,
      expectedInventory,
      handlingUnits: DEMO_HANDLING_UNITS,
      source: 'demo',
      fetchedAt: new Date().toISOString(),
    });
  }
}
