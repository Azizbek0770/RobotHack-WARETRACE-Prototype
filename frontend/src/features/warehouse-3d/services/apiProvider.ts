import type {
  ExpectedInventory,
  PaginatedResponse,
  StorageBin,
  Warehouse,
  WarehouseSnapshot,
  Zone,
} from '../data/contracts';
import { buildWarehouseSnapshot } from '../data/warehouseMapper';
import { WarehouseProviderError, type WarehouseDataProvider } from './warehouseProvider';

export interface ApiWarehouseProviderOptions {
  /** Base REST URL, defaults to VITE_API_BASE_URL or "/api/v1" */
  baseUrl?: string;
  /** Custom fetch implementation (useful for tests or injecting auth headers from host app) */
  fetchFn?: typeof fetch;
  /** Optional default headers (e.g., Authorization from existing WARETRACE shell) */
  headers?: HeadersInit;
  /** Page size for paginated endpoints (default: 50) */
  pageSize?: number;
}

const MAX_PAGINATION_PAGES = 200;

export function resolveDefaultApiBaseUrl(): string {
  const envUrl =
    typeof import.meta !== 'undefined' &&
    typeof (import.meta as { env?: Record<string, string | undefined> }).env !== 'undefined'
      ? (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL
      : undefined;

  const trimmed = (envUrl ?? '/api/v1').trim();
  return trimmed.replace(/\/+$/, '') || '/api/v1';
}

/**
 * REST API adapter targeting the existing WARETRACE FastAPI backend contracts.
 *
 * Endpoints consumed:
 * - GET /warehouses (paginated)
 * - GET /warehouses/{warehouse_id}/zones (array)
 * - GET /zones/{zone_id}/bins (array)
 * - GET /inventory/expected?warehouse_id={warehouse_id} (paginated)
 *
 * Never silently substitutes demo data when a live API request fails.
 */
export class ApiWarehouseProvider implements WarehouseDataProvider {
  readonly source = 'api' as const;
  readonly baseUrl: string;
  readonly label: string;
  private readonly fetchFn: typeof fetch;
  private readonly headers?: HeadersInit;
  private readonly pageSize: number;

  constructor(options: ApiWarehouseProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? resolveDefaultApiBaseUrl()).replace(/\/+$/, '');
    this.label = `Live REST API (${this.baseUrl})`;
    this.fetchFn = options.fetchFn ?? ((input, init) => globalThis.fetch(input, init));
    this.headers = options.headers;
    this.pageSize = Math.max(1, options.pageSize ?? 50);
  }

  async listWarehouses(signal?: AbortSignal): Promise<Warehouse[]> {
    return this.fetchAllPages<Warehouse>('/warehouses', {}, signal);
  }

  async getWarehouseSnapshot(
    warehouseId: string,
    signal?: AbortSignal,
  ): Promise<WarehouseSnapshot> {
    const warehouses = await this.listWarehouses(signal);
    const warehouse = warehouses.find((w) => w.id === warehouseId);

    if (!warehouse) {
      throw new WarehouseProviderError(
        `Warehouse "${warehouseId}" was not found at ${this.baseUrl}/warehouses.`,
        {
          code: 'NOT_FOUND',
          endpoint: `${this.baseUrl}/warehouses`,
        },
      );
    }

    const encodedWarehouseId = encodeURIComponent(warehouse.id);

    const [zones, expectedInventory] = await Promise.all([
      this.fetchJson<Zone[]>(`/warehouses/${encodedWarehouseId}/zones`, signal),
      this.fetchAllPages<ExpectedInventory>(
        '/inventory/expected',
        { warehouse_id: warehouse.id },
        signal,
      ),
    ]);

    if (!Array.isArray(zones)) {
      throw new WarehouseProviderError('Invalid zones payload: expected an array.', {
        code: 'INVALID_RESPONSE',
        endpoint: `${this.baseUrl}/warehouses/${encodedWarehouseId}/zones`,
      });
    }

    const binArrays = await Promise.all(
      zones.map(async (zone) => {
        const endpoint = `/zones/${encodeURIComponent(zone.id)}/bins`;
        const data = await this.fetchJson<StorageBin[]>(endpoint, signal);
        if (!Array.isArray(data)) {
          throw new WarehouseProviderError(
            `Invalid bins payload for zone "${zone.code}": expected an array.`,
            {
              code: 'INVALID_RESPONSE',
              endpoint: `${this.baseUrl}${endpoint}`,
            },
          );
        }
        return data;
      }),
    );

    const bins = binArrays.flat();

    return buildWarehouseSnapshot({
      warehouse,
      zones,
      bins,
      expectedInventory,
      handlingUnits: [],
      source: 'api',
      fetchedAt: new Date().toISOString(),
    });
  }

  /**
   * Iterates all pages of a WARETRACE paginated endpoint (`{ items, page, page_size, total }`)
   * so records beyond page 1 are never silently dropped.
   */
  private async fetchAllPages<T>(
    path: string,
    extraParams: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<T[]> {
    const collected: T[] = [];
    let page = 1;

    while (page <= MAX_PAGINATION_PAGES) {
      const params = new URLSearchParams({
        ...extraParams,
        page: String(page),
        page_size: String(this.pageSize),
      });
      const endpoint = `${path}?${params.toString()}`;
      const payload = await this.fetchJson<PaginatedResponse<T>>(endpoint, signal);

      if (
        !payload ||
        typeof payload !== 'object' ||
        !Array.isArray(payload.items) ||
        typeof payload.total !== 'number'
      ) {
        throw new WarehouseProviderError(
          `Invalid paginated response from ${this.baseUrl}${endpoint}. Expected { items, page, page_size, total }.`,
          {
            code: 'INVALID_RESPONSE',
            endpoint: `${this.baseUrl}${endpoint}`,
          },
        );
      }

      collected.push(...payload.items);

      const effectivePageSize =
        typeof payload.page_size === 'number' && payload.page_size > 0
          ? payload.page_size
          : this.pageSize;

      if (
        payload.items.length === 0 ||
        collected.length >= payload.total ||
        payload.items.length < effectivePageSize
      ) {
        break;
      }

      page += 1;
    }

    return collected;
  }

  private async fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let response: Response;

    try {
      response = await this.fetchFn(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(this.headers ? Object.fromEntries(new Headers(this.headers).entries()) : {}),
        },
        signal,
      });
    } catch (error) {
      if (
        signal?.aborted ||
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'AbortError')
      ) {
        throw new WarehouseProviderError(`Request aborted: ${url}`, {
          code: 'ABORTED',
          endpoint: url,
          cause: error,
        });
      }
      throw new WarehouseProviderError(
        `Unable to reach WARETRACE API at ${url}. Verify the backend is running and proxy/CORS settings are configured.`,
        {
          code: 'NETWORK_ERROR',
          endpoint: url,
          cause: error,
        },
      );
    }

    if (!response.ok) {
      const detail = await safeReadErrorDetail(response);
      throw new WarehouseProviderError(
        `WARETRACE API returned HTTP ${response.status} for ${url}${detail ? `: ${detail}` : ''}`,
        {
          code: response.status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR',
          status: response.status,
          endpoint: url,
        },
      );
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType && !contentType.toLowerCase().includes('application/json')) {
      throw new WarehouseProviderError(
        `Expected JSON from ${url}, but received "${contentType}". Confirm the /api/v1 proxy points to the WARETRACE FastAPI backend.`,
        {
          code: 'INVALID_RESPONSE',
          status: response.status,
          endpoint: url,
        },
      );
    }

    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new WarehouseProviderError(`Failed to parse JSON response from ${url}.`, {
        code: 'INVALID_RESPONSE',
        status: response.status,
        endpoint: url,
        cause: error,
      });
    }
  }
}

async function safeReadErrorDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return '';
    try {
      const parsed = JSON.parse(text) as { detail?: unknown; message?: unknown };
      if (typeof parsed.detail === 'string') return parsed.detail;
      if (typeof parsed.message === 'string') return parsed.message;
    } catch {
      // Plain text error body
    }
    return text.slice(0, 180).trim();
  } catch {
    return '';
  }
}
