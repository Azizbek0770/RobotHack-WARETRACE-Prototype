import type {
  StorageBin,
  WorldPosition,
  ZoneKind,
  ZoneLocalOrigin,
  ZoneWorldBounds,
  ZoneWorldTransform,
} from './contracts';

/**
 * Physical dimensions below are VISUALIZATION ASSUMPTIONS for 3D illustration,
 * not real measured architectural specifications of the physical facility.
 */
export const WAREHOUSE_VISUALIZATION_ASSUMPTIONS = {
  label: 'Illustrative 3D layout assumptions (not measured building dimensions)',
  floorWidthMeters: 36,
  floorDepthMeters: 22,
  wallHeightMeters: 7.4,
  rackBayWidthMeters: 2.5,
  rackBayDepthMeters: 1.75,
  rackHeightMeters: 3.6,
  storageAisleWidthMeters: 3.65,
  receivingBayHeightMeters: 1.55,
  quarantineBayHeightMeters: 2.4,
} as const;

/**
 * Default per-zone 3D world-space transforms.
 *
 * IMPORTANT: WARETRACE database (grid_x, grid_y) coordinates are LOCAL to their zone.
 * Each zone computes its own local origin (minGridX, minGridY) and transforms
 * local coordinates into distinct world-space regions of the warehouse floor.
 */
export const DEFAULT_ZONE_TRANSFORMS: Record<ZoneKind, ZoneWorldTransform> = {
  RECEIVING: {
    originX: -12.6,
    originZ: -1.9,
    pitchX: 3.1,
    pitchZ: 3.8,
    rotationY: Math.PI / 2, // Arrange RCV-01 and RCV-02 along the west loading dock wall (Z axis)
    bayWidth: 2.3,
    bayDepth: 2.1,
    bayHeight: WAREHOUSE_VISUALIZATION_ASSUMPTIONS.receivingBayHeightMeters,
    padMarginX: 1.6,
    padMarginZ: 2.4,
  },
  STORAGE: {
    originX: -4.8,
    originZ: -2.7,
    pitchX: 2.95,
    pitchZ: 5.4, // Leaves a realistic ~3.65m wide forklift aisle between Row 1 (A-01..04) and Row 2 (A-05..08)
    rotationY: 0,
    bayWidth: WAREHOUSE_VISUALIZATION_ASSUMPTIONS.rackBayWidthMeters,
    bayDepth: WAREHOUSE_VISUALIZATION_ASSUMPTIONS.rackBayDepthMeters,
    bayHeight: WAREHOUSE_VISUALIZATION_ASSUMPTIONS.rackHeightMeters,
    padMarginX: 1.9,
    padMarginZ: 1.85,
  },
  QUARANTINE: {
    originX: 11.4,
    originZ: -1.9,
    pitchX: 3.1,
    pitchZ: 3.8,
    rotationY: Math.PI / 2, // Arrange QA-01 and QA-02 cleanly inside the east fenced quarantine enclosure
    bayWidth: 2.35,
    bayDepth: 1.9,
    bayHeight: WAREHOUSE_VISUALIZATION_ASSUMPTIONS.quarantineBayHeightMeters,
    padMarginX: 1.85,
    padMarginZ: 2.2,
  },
};

/**
 * Resolve a world transform for a given zone kind and occurrence index.
 * If a live backend returns multiple zones of the same kind (e.g., ST-A and ST-B),
 * subsequent zones are offset cleanly so they never overlap in 3D space.
 */
export function resolveZoneTransform(
  kind: ZoneKind,
  sameKindIndex = 0,
  customOverrides?: Partial<Record<ZoneKind, Partial<ZoneWorldTransform>>>,
): ZoneWorldTransform {
  const base = DEFAULT_ZONE_TRANSFORMS[kind];
  const override = customOverrides?.[kind];
  const merged: ZoneWorldTransform = {
    ...base,
    ...override,
  };

  if (sameKindIndex === 0) {
    return merged;
  }

  // Offset additional zones of the same kind along Z so live multi-zone facilities stay legible
  return {
    ...merged,
    originZ: merged.originZ + sameKindIndex * 11.5,
  };
}

/**
 * Compute the local grid origin strictly within a single zone's bins.
 * Never mixes coordinates from other zones.
 */
export function computeZoneLocalOrigin(bins: Pick<StorageBin, 'grid_x' | 'grid_y'>[]): ZoneLocalOrigin {
  if (bins.length === 0) {
    return { minGridX: 0, minGridY: 0, maxGridX: 0, maxGridY: 0 };
  }

  let minGridX = Infinity;
  let minGridY = Infinity;
  let maxGridX = -Infinity;
  let maxGridY = -Infinity;

  for (const bin of bins) {
    if (bin.grid_x < minGridX) minGridX = bin.grid_x;
    if (bin.grid_y < minGridY) minGridY = bin.grid_y;
    if (bin.grid_x > maxGridX) maxGridX = bin.grid_x;
    if (bin.grid_y > maxGridY) maxGridY = bin.grid_y;
  }

  return { minGridX, minGridY, maxGridX, maxGridY };
}

/**
 * Convert a bin's zone-local (grid_x, grid_y) into 3D warehouse world coordinates.
 *
 * Step 1: Normalize against the zone's local origin (`localX = gridX - minGridX`).
 * Step 2: Scale by the zone's pitch (`dx = localX * pitchX`, `dz = localY * pitchZ`).
 * Step 3: Rotate around Y by `transform.rotationY` and translate by `(originX, originZ)`.
 */
export function zoneLocalGridToWorld(
  gridX: number,
  gridY: number,
  localOrigin: ZoneLocalOrigin,
  transform: ZoneWorldTransform,
): { localX: number; localY: number; worldPosition: WorldPosition } {
  const localX = gridX - localOrigin.minGridX;
  const localY = gridY - localOrigin.minGridY;

  const dx = localX * transform.pitchX;
  const dz = localY * transform.pitchZ;

  const cos = Math.cos(transform.rotationY);
  const sin = Math.sin(transform.rotationY);

  // Standard Y-axis rotation: x' = dx*cos - dz*sin, z' = dx*sin + dz*cos
  const rotatedX = dx * cos - dz * sin;
  const rotatedZ = dx * sin + dz * cos;

  const x = roundCoord(transform.originX + rotatedX);
  const z = roundCoord(transform.originZ + rotatedZ);

  return {
    localX,
    localY,
    worldPosition: { x, y: 0, z },
  };
}

/**
 * Compute world-space floor bounding box for a zone from its transformed bin positions.
 */
export function computeZoneWorldBounds(
  binPositions: WorldPosition[],
  transform: ZoneWorldTransform,
): ZoneWorldBounds {
  const halfW = transform.bayWidth / 2;
  const halfD = transform.bayDepth / 2;
  // When rotated by 90 deg, width/depth footprints swap along world X/Z
  const absCos = Math.abs(Math.cos(transform.rotationY));
  const absSin = Math.abs(Math.sin(transform.rotationY));
  const extX = halfW * absCos + halfD * absSin;
  const extZ = halfW * absSin + halfD * absCos;

  if (binPositions.length === 0) {
    const minX = roundCoord(transform.originX - extX - transform.padMarginX);
    const maxX = roundCoord(transform.originX + extX + transform.padMarginX);
    const minZ = roundCoord(transform.originZ - extZ - transform.padMarginZ);
    const maxZ = roundCoord(transform.originZ + extZ + transform.padMarginZ);
    return {
      minX,
      maxX,
      minZ,
      maxZ,
      centerX: roundCoord((minX + maxX) / 2),
      centerZ: roundCoord((minZ + maxZ) / 2),
      width: roundCoord(maxX - minX),
      depth: roundCoord(maxZ - minZ),
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const pos of binPositions) {
    if (pos.x - extX < minX) minX = pos.x - extX;
    if (pos.x + extX > maxX) maxX = pos.x + extX;
    if (pos.z - extZ < minZ) minZ = pos.z - extZ;
    if (pos.z + extZ > maxZ) maxZ = pos.z + extZ;
  }

  minX = roundCoord(minX - transform.padMarginX);
  maxX = roundCoord(maxX + transform.padMarginX);
  minZ = roundCoord(minZ - transform.padMarginZ);
  maxZ = roundCoord(maxZ + transform.padMarginZ);

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    centerX: roundCoord((minX + maxX) / 2),
    centerZ: roundCoord((minZ + maxZ) / 2),
    width: roundCoord(maxX - minX),
    depth: roundCoord(maxZ - minZ),
  };
}

function roundCoord(value: number): number {
  return Math.round(value * 1000) / 1000;
}
