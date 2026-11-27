/**
 * WARETRACE — Interactive 3D Warehouse Digital Twin Module
 * Public entry point for embedding into an existing React/TypeScript WARETRACE frontend.
 */

export { Warehouse3DViewer, type Warehouse3DViewerProps } from './components/Warehouse3DViewer';
export { WarehouseScene } from './components/WarehouseScene';
export { type CameraDirective } from './components/SceneCamera';

export { WarehouseToolbar } from './ui/WarehouseToolbar';
export { ZoneFilters } from './ui/ZoneFilters';
export { BinDetailsPanel } from './ui/BinDetailsPanel';

export type {
  BinRef,
  CameraPreset,
  DataSourceKind,
  ExpectedInventory,
  HandlingUnitNote,
  NormalizedBin,
  NormalizedInventoryLine,
  NormalizedZone,
  PaginatedResponse,
  RealtimeConnectionStatus,
  RenderQuality,
  SkuSummary,
  StorageBin,
  Warehouse,
  WarehouseRealtimeClient,
  WarehouseRealtimeEvent,
  WarehouseRealtimeEventType,
  WarehouseSnapshot,
  WarehouseStats,
  WorldPosition,
  Zone,
  ZoneKind,
  ZoneLocalOrigin,
  ZoneWorldBounds,
  ZoneWorldTransform,
} from './data/contracts';

export {
  DEFAULT_ZONE_TRANSFORMS,
  WAREHOUSE_VISUALIZATION_ASSUMPTIONS,
  computeZoneLocalOrigin,
  computeZoneWorldBounds,
  resolveZoneTransform,
  zoneLocalGridToWorld,
} from './data/warehouseCoordinates';

export {
  buildWarehouseSnapshot,
  calculateCapacityUtilization,
  findBinByCode,
  findBinById,
  formatCapacityLabel,
  formatUtilizationLabel,
  searchBins,
} from './data/warehouseMapper';

export {
  WarehouseProviderError,
  type WarehouseDataProvider,
  type WarehouseProviderErrorCode,
} from './services/warehouseProvider';
export { DemoWarehouseProvider } from './services/demoProvider';
export {
  ApiWarehouseProvider,
  resolveDefaultApiBaseUrl,
  type ApiWarehouseProviderOptions,
} from './services/apiProvider';
export {
  WebSocketWarehouseRealtimeClient,
  computeReconnectDelayMs,
  resolveDefaultWarehouseWsUrl,
  validateWarehouseRealtimeEvent,
  type WebSocketLike,
  type WebSocketRealtimeClientOptions,
} from './services/realtimeClient';
export {
  AMR_DEFAULT_ACTOR_LABEL,
  AMR_DEFAULT_DEVICE_ID,
  AMR_HOME_HEADING_RAD,
  AMR_HOME_POSITION,
  AMR_MAST_BASE_HEIGHT_M,
  AMR_MAST_MAX_STROKE_M,
  AMR_WHEEL_RADIUS_M,
  createInitialAmrMission,
  deriveSimulatedObservedQty,
  pauseAmrMission,
  planAmrRoute,
  resetAmrMission,
  resumeAmrMission,
  selectDefaultAmrTarget,
  startAmrMission,
  stepAmrMission,
  type AmrMissionState,
  type AmrPhase,
  type AmrPose,
  type AmrRoutePlan,
  type AmrRoutePoint,
  type AmrVisualizationState,
} from './services/amrMission';
