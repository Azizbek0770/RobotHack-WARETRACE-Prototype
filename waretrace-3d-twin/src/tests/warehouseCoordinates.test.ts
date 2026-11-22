import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ZONE_TRANSFORMS,
  computeZoneLocalOrigin,
  computeZoneWorldBounds,
  resolveZoneTransform,
  zoneLocalGridToWorld,
} from '../data/warehouseCoordinates';

describe('warehouseCoordinates — zone-local grid to 3D world transforms', () => {
  it('computes zone-local origin independently of global coordinates', () => {
    const storageBins = [
      { grid_x: 0, grid_y: 1 },
      { grid_x: 3, grid_y: 2 },
    ];
    const quarantineBins = [
      { grid_x: 0, grid_y: 3 },
      { grid_x: 1, grid_y: 3 },
    ];

    expect(computeZoneLocalOrigin(storageBins)).toEqual({
      minGridX: 0,
      minGridY: 1,
      maxGridX: 3,
      maxGridY: 2,
    });
    expect(computeZoneLocalOrigin(quarantineBins)).toEqual({
      minGridX: 0,
      minGridY: 3,
      maxGridX: 1,
      maxGridY: 3,
    });
  });

  it('transforms identical zone-local coordinates (0, 0) in different zones into distinct world regions', () => {
    const localZero = { minGridX: 0, minGridY: 0, maxGridX: 1, maxGridY: 0 };

    const recvPos = zoneLocalGridToWorld(0, 0, localZero, DEFAULT_ZONE_TRANSFORMS.RECEIVING);
    const storagePos = zoneLocalGridToWorld(0, 0, localZero, DEFAULT_ZONE_TRANSFORMS.STORAGE);
    const quarPos = zoneLocalGridToWorld(0, 0, localZero, DEFAULT_ZONE_TRANSFORMS.QUARANTINE);

    // Receiving sits west (negative X), Storage in center, Quarantine east (positive X)
    expect(recvPos.worldPosition.x).toBeLessThan(storagePos.worldPosition.x);
    expect(storagePos.worldPosition.x).toBeLessThan(quarPos.worldPosition.x);
    expect(recvPos.worldPosition.y).toBe(0);
    expect(storagePos.worldPosition.y).toBe(0);
    expect(quarPos.worldPosition.y).toBe(0);
  });

  it('normalizes non-zero zone-local offsets (e.g. ST-A grid_y=1,2 and QUAR grid_y=3)', () => {
    const storageOrigin = { minGridX: 0, minGridY: 1, maxGridX: 3, maxGridY: 2 };
    const a01 = zoneLocalGridToWorld(0, 1, storageOrigin, DEFAULT_ZONE_TRANSFORMS.STORAGE);
    const a04 = zoneLocalGridToWorld(3, 1, storageOrigin, DEFAULT_ZONE_TRANSFORMS.STORAGE);
    const a05 = zoneLocalGridToWorld(0, 2, storageOrigin, DEFAULT_ZONE_TRANSFORMS.STORAGE);

    expect(a01.localX).toBe(0);
    expect(a01.localY).toBe(0);
    expect(a04.localX).toBe(3);
    expect(a05.localY).toBe(1);

    // Adjacent rows in storage are separated by pitchZ along Z axis
    expect(a05.worldPosition.z - a01.worldPosition.z).toBeCloseTo(
      DEFAULT_ZONE_TRANSFORMS.STORAGE.pitchZ,
      3,
    );
    // Columns advance along X axis by pitchX
    expect(a04.worldPosition.x - a01.worldPosition.x).toBeCloseTo(
      3 * DEFAULT_ZONE_TRANSFORMS.STORAGE.pitchX,
      3,
    );
  });

  it('applies zone Y-rotation for Receiving and Quarantine bays without overlapping', () => {
    const recvOrigin = { minGridX: 0, minGridY: 0, maxGridX: 1, maxGridY: 0 };
    const rcv01 = zoneLocalGridToWorld(0, 0, recvOrigin, DEFAULT_ZONE_TRANSFORMS.RECEIVING);
    const rcv02 = zoneLocalGridToWorld(1, 0, recvOrigin, DEFAULT_ZONE_TRANSFORMS.RECEIVING);

    // Rotated by +90 deg: localX advances along +Z
    expect(rcv01.worldPosition.x).toBeCloseTo(rcv02.worldPosition.x, 3);
    expect(rcv02.worldPosition.z - rcv01.worldPosition.z).toBeCloseTo(
      DEFAULT_ZONE_TRANSFORMS.RECEIVING.pitchX,
      3,
    );
  });

  it('offsets multiple zones of the same kind and computes positive world bounds', () => {
    const first = resolveZoneTransform('STORAGE', 0);
    const second = resolveZoneTransform('STORAGE', 1);

    expect(second.originZ).toBeGreaterThan(first.originZ);

    const bounds = computeZoneWorldBounds(
      [
        { x: -4.8, y: 0, z: -2.7 },
        { x: 4.05, y: 0, z: 2.7 },
      ],
      first,
    );
    expect(bounds.width).toBeGreaterThan(8);
    expect(bounds.depth).toBeGreaterThan(5);
    expect(bounds.minX).toBeLessThan(bounds.maxX);
    expect(bounds.minZ).toBeLessThan(bounds.maxZ);
  });
});
