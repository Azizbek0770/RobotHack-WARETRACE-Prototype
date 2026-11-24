import { describe, expect, it, vi } from 'vitest';
import { ApiWarehouseProvider } from '../services/apiProvider';
import { WarehouseProviderError } from '../services/warehouseProvider';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ApiWarehouseProvider — pagination, API errors, missing warehouses, and abort handling', () => {
  it('fetches all pages for paginated warehouses and expected inventory without losing records after page 1', async () => {
    const wh1 = { id: 'wh-1', code: 'RIX-01', name: 'Riga North', is_active: true };
    const wh2 = { id: 'wh-2', code: 'RIX-02', name: 'Riga South', is_active: true };
    const zone1 = { id: 'z-1', warehouse_id: 'wh-2', code: 'ST-A', name: 'Storage A', kind: 'STORAGE' };
    const bin1 = {
      id: 'b-1',
      zone_id: 'z-1',
      code: 'A-01',
      grid_x: 0,
      grid_y: 0,
      is_accessible: true,
      capacity_units: 20,
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/v1/warehouses?')) {
        if (url.includes('page=1')) {
          return jsonResponse({ items: [wh1], page: 1, page_size: 1, total: 2 });
        }
        return jsonResponse({ items: [wh2], page: 2, page_size: 1, total: 2 });
      }
      if (url === '/api/v1/warehouses/wh-2/zones') {
        return jsonResponse([zone1]);
      }
      if (url === '/api/v1/zones/z-1/bins') {
        return jsonResponse([bin1]);
      }
      if (url.startsWith('/api/v1/inventory/expected?')) {
        if (url.includes('page=1')) {
          return jsonResponse({
            items: [
              {
                id: 'inv-1',
                bin_id: 'b-1',
                sku_id: 'sku-1',
                expected_qty: 4,
                source: 'ERP',
                revision: 1,
                sku: { id: 'sku-1', code: 'SKU-1', name: 'Widget A' },
                bin: { id: 'b-1', code: 'A-01' },
              },
            ],
            page: 1,
            page_size: 1,
            total: 2,
          });
        }
        return jsonResponse({
          items: [
            {
              id: 'inv-2',
              bin_id: 'b-1',
              sku_id: 'sku-2',
              expected_qty: 6,
              source: 'ERP',
              revision: 2,
              sku: { id: 'sku-2', code: 'SKU-2', name: 'Widget B' },
              bin: { id: 'b-1', code: 'A-01' },
            },
          ],
          page: 2,
          page_size: 1,
          total: 2,
        });
      }
      return jsonResponse({ detail: 'Not found' }, 404);
    });

    const provider = new ApiWarehouseProvider({
      baseUrl: '/api/v1',
      fetchFn: fetchMock as unknown as typeof fetch,
      pageSize: 1,
    });

    const snapshot = await provider.getWarehouseSnapshot('wh-2');

    expect(snapshot.source).toBe('api');
    expect(snapshot.warehouse.code).toBe('RIX-02');
    expect(snapshot.bins).toHaveLength(1);
    // Both page 1 (qty 4) and page 2 (qty 6) expected inventory records must be present
    expect(snapshot.bins[0].inventoryLines).toHaveLength(2);
    expect(snapshot.bins[0].totalExpectedUnits).toBe(10);
    expect(snapshot.bins[0].capacityUtilizationPct).toBe(50);
    expect(snapshot.stats.expectedStoredUnits).toBe(10);
  });

  it('surfaces HTTP errors explicitly and never substitutes demo data', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ detail: 'Database connection unavailable' }, 503),
    );
    const provider = new ApiWarehouseProvider({
      baseUrl: '/api/v1',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    await expect(provider.listWarehouses()).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof WarehouseProviderError &&
        err.code === 'HTTP_ERROR' &&
        err.status === 503 &&
        err.message.includes('Database connection unavailable')
      );
    });
  });

  it('throws NOT_FOUND when requested warehouse ID is missing from backend', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ items: [], page: 1, page_size: 50, total: 0 }),
    );
    const provider = new ApiWarehouseProvider({
      baseUrl: '/api/v1',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    await expect(provider.getWarehouseSnapshot('missing-uuid')).rejects.toSatisfy((err: unknown) => {
      return err instanceof WarehouseProviderError && err.code === 'NOT_FOUND';
    });
  });

  it('propagates AbortController cancellation cleanly as ABORTED', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const provider = new ApiWarehouseProvider({
      baseUrl: '/api/v1',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const promise = provider.listWarehouses(controller.signal);
    controller.abort();

    await expect(promise).rejects.toSatisfy((err: unknown) => {
      return err instanceof WarehouseProviderError && err.code === 'ABORTED';
    });
  });
});
