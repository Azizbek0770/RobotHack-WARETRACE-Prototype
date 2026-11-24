import type { DataSourceKind, Warehouse, WarehouseSnapshot } from '../data/contracts';

export type WarehouseProviderErrorCode =
  | 'NETWORK_ERROR'
  | 'HTTP_ERROR'
  | 'NOT_FOUND'
  | 'INVALID_RESPONSE'
  | 'ABORTED';

export class WarehouseProviderError extends Error {
  readonly code: WarehouseProviderErrorCode;
  readonly status?: number;
  readonly endpoint?: string;

  constructor(
    message: string,
    options: {
      code: WarehouseProviderErrorCode;
      status?: number;
      endpoint?: string;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = 'WarehouseProviderError';
    this.code = options.code;
    this.status = options.status;
    this.endpoint = options.endpoint;
  }
}

export interface WarehouseDataProvider {
  readonly source: DataSourceKind;
  readonly label: string;
  listWarehouses(signal?: AbortSignal): Promise<Warehouse[]>;
  getWarehouseSnapshot(warehouseId: string, signal?: AbortSignal): Promise<WarehouseSnapshot>;
}
