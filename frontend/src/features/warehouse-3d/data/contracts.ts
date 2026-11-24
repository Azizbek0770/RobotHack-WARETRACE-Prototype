/**
 * WARETRACE 3D Warehouse Digital Twin — Public Data & Integration Contracts
 *
 * Raw API shapes mirror the existing WARETRACE FastAPI / SQLAlchemy endpoints.
 * Normalized snapshot types decouple the 3D scene and UI from HTTP response details.
 */

export type ZoneKind = 'RECEIVING' | 'STORAGE' | 'QUARANTINE';

export type DataSourceKind = 'demo' | 'api';

export type CameraPreset = 'isometric' | 'top-down' | 'reset';

export type RenderQuality = 'high' | 'lite';

// ---------------------------------------------------------------------------
// Raw WARETRACE REST API Contracts
// ---------------------------------------------------------------------------

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

export interface Zone {
  id: string;
  warehouse_id: string;
  code: string;
  name: string;
  kind: ZoneKind;
}

export interface StorageBin {
  id: string;
  zone_id: string;
  code: string;
  grid_x: number;
  grid_y: number;
  is_accessible: boolean;
  capacity_units: number | null;
}

export interface SkuSummary {
  id: string;
  code: string;
  name: string;
}

export interface BinRef {
  id: string;
  code: string;
}

export interface ExpectedInventory {
  id: string;
  bin_id: string;
  sku_id: string;
  expected_qty: number;
  source: string;
  revision: number;
  sku: SkuSummary;
  bin: BinRef;
}

/**
 * Non-stock handling units (e.g., unassigned RECEIVED or QUARANTINED HUs).
 * Tracked distinctly so they are never miscounted as regular expected stored stock.
 */
export interface HandlingUnitNote {
  id: string;
  code: string;
  status: 'RECEIVED' | 'QUARANTINED';
  quantity: number;
  binId: string | null;
  binCode: string | null;
  zoneCode: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Spatial & Coordinate Transformation Types
// ---------------------------------------------------------------------------

export interface WorldPosition {
  x: number;
  y: number;
  z: number;
}

export interface ZoneLocalOrigin {
  minGridX: number;
  minGridY: number;
  maxGridX: number;
  maxGridY: number;
}

export interface ZoneWorldTransform {
  /** World-space anchor for local (0, 0) within this zone (meters, visualization assumption) */
  originX: number;
  originZ: number;
  /** Spacing between adjacent local grid_x columns (meters) */
  pitchX: number;
  /** Spacing between adjacent local grid_y rows (meters) */
  pitchZ: number;
  /** Rotation around Y axis in radians */
  rotationY: number;
  /** Physical footprint of a single bin bay (meters) */
  bayWidth: number;
  bayDepth: number;
  bayHeight: number;
  /** Padding around bin bays when drawing the floor zone pad (meters) */
  padMarginX: number;
  padMarginZ: number;
}

export interface ZoneWorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
}

// ---------------------------------------------------------------------------
// Normalized 3D Visualization Snapshot Types
// ---------------------------------------------------------------------------

export interface NormalizedInventoryLine {
  id: string;
  skuId: string;
  skuCode: string;
  skuName: string;
  expectedQty: number;
  source: string;
  revision: number;
}

export interface NormalizedBin {
  /** Stable backend UUID */
  id: string;
  code: string;
  warehouseId: string;
  warehouseCode: string;
  zoneId: string;
  zoneCode: string;
  zoneName: string;
  zoneKind: ZoneKind;
  /** Raw zone-local grid coordinates from WARETRACE database */
  gridX: number;
  gridY: number;
  /** Normalized 0-based grid coordinates relative to the zone's local origin */
  localX: number;
  localY: number;
  /** World-space position in meters (visualization assumption) */
  worldPosition: WorldPosition;
  bayDimensions: {
    width: number;
    depth: number;
    height: number;
  };
  isAccessible: boolean;
  capacityUnits: number | null;
  /** Sum of expected_qty across all expected inventory rows assigned to this bin */
  totalExpectedUnits: number;
  /** Unit-based utilization percentage (0–100+), or null when capacityUnits is null/0 */
  capacityUtilizationPct: number | null;
  /** All expected inventory rows assigned to this bin (supports 0, 1, or multiple SKUs) */
  inventoryLines: NormalizedInventoryLine[];
  /** Non-stock handling units explicitly located at this bin (e.g. QUARANTINED HU) */
  handlingUnits: HandlingUnitNote[];
}

export interface NormalizedZone {
  id: string;
  warehouseId: string;
  code: string;
  name: string;
  kind: ZoneKind;
  localOrigin: ZoneLocalOrigin;
  transform: ZoneWorldTransform;
  worldBounds: ZoneWorldBounds;
  bins: NormalizedBin[];
  totalBins: number;
  expectedStoredUnits: number;
}

export interface WarehouseStats {
  totalZones: number;
  totalBins: number;
  accessibleBins: number;
  inaccessibleBins: number;
  occupiedBins: number;
  emptyBins: number;
  /** Sum of expected_qty for regular expected stored stock only */
  expectedStoredUnits: number;
  /** Sum of known capacity_units across bins with non-null capacity */
  knownCapacityUnits: number;
  /** Number of non-stock handling units (e.g. unassigned RECEIVED or QUARANTINED) */
  nonStockHandlingUnitCount: number;
  nonStockHandlingUnitUnits: number;
}

export interface WarehouseSnapshot {
  warehouse: Warehouse;
  zones: NormalizedZone[];
  bins: NormalizedBin[];
  binById: Record<string, NormalizedBin>;
  /** Handling units not counted in regular expected stored stock */
  handlingUnits: HandlingUnitNote[];
  stats: WarehouseStats;
  source: DataSourceKind;
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// Optional Native WebSocket Realtime Contract (Proposed Future Protocol)
// ---------------------------------------------------------------------------

export type WarehouseRealtimeEventType =
  | 'warehouse.inventory.changed'
  | 'warehouse.bin.updated'
  | 'warehouse.layout.changed';

export interface WarehouseRealtimeEvent {
  event_id: string;
  type: WarehouseRealtimeEventType;
  warehouse_id: string;
  entity_id: string;
  version: number;
  timestamp: string;
  payload: {
    bin_id?: string;
    zone_id?: string;
    [key: string]: unknown;
  };
}

export type RealtimeConnectionStatus =
  | 'disabled'
  | 'unconfigured'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export interface WarehouseRealtimeClient {
  connect(warehouseId: string): void;
  disconnect(): void;
  subscribe(callback: (event: WarehouseRealtimeEvent) => void): () => void;
  onStatusChange?(callback: (status: RealtimeConnectionStatus, detail?: string) => void): () => void;
  onReconcileNeeded?(callback: (warehouseId: string) => void): () => void;
  getStatus(): RealtimeConnectionStatus;
}
