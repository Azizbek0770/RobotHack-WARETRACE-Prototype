import type { SKU, StorageBin } from '../../../api/warehouse';
import type { NormalizedBin, NormalizedZone, WarehouseSnapshot } from '../data/contracts';

export type AmrPhase =
  | 'IDLE'
  | 'TRAVELING'
  | 'STOPPING'
  | 'ELEVATING_MAST'
  | 'SCANNING'
  | 'SCANNED';

export interface AmrRoutePoint {
  x: number;
  z: number;
}

export interface AmrPose {
  x: number;
  z: number;
  headingRad: number;
  wheelRotationRad: number;
  mastExtension: number;
  scanProgress: number;
}

export interface AmrTimelineStep {
  phase: 'TRAVELING' | 'STOPPING' | 'ELEVATING_MAST' | 'SCANNING';
  duration: number;
  fromPos: AmrRoutePoint;
  toPos: AmrRoutePoint;
  fromYaw: number;
  toYaw: number;
  distance: number;
  fromMast: number;
  toMast: number;
}

export interface AmrRoutePlan {
  warehouseId: string;
  targetBinId: string;
  targetBinCode: string;
  targetBinWorldPosition: { x: number; y: number; z: number };
  targetZoneCode: string;
  waypoints: AmrRoutePoint[];
  targetHeadingRad: number;
  targetMastExtension: number;
  totalDistanceMeters: number;
  steps: AmrTimelineStep[];
  totalDurationSeconds: number;
}

export interface AmrMissionState {
  routePlan: AmrRoutePlan | null;
  phase: AmrPhase;
  isRunning: boolean;
  isPaused: boolean;
  elapsedSeconds: number;
  pose: AmrPose;
  scanEventId: string | null;
  scanCompletedAt: string | null;
}

export interface AmrVisualizationState {
  deviceId: string;
  phase: AmrPhase;
  isPaused: boolean;
  pose: AmrPose;
  waypoints: AmrRoutePoint[];
  targetBinId: string | null;
  targetBinCode: string | null;
  targetBinWorldPosition: { x: number; y: number; z: number } | null;
}

export const AMR_DEFAULT_DEVICE_ID = 'sim-amr-01';
export const AMR_DEFAULT_ACTOR_LABEL = 'sim-amr-01';
export const AMR_HOME_POSITION: AmrRoutePoint = { x: -8.8, z: 0 };
export const AMR_HOME_HEADING_RAD = Math.PI / 2;
export const AMR_WHEEL_RADIUS_M = 0.11;
export const AMR_MAST_BASE_HEIGHT_M = 0.86;
export const AMR_MAST_MAX_STROKE_M = 1.24;
export const AMR_DRIVE_SPEED_MPS = 3.2;
export const AMR_TURN_RATE_RAD_PER_SEC = 3.6;
export const AMR_STOP_DURATION_S = 0.45;
export const AMR_MAST_DURATION_S = 1.15;
export const AMR_SCAN_DURATION_S = 1.35;

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function easeInOutCubic(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

export function shortestAngleDiff(fromRad: number, toRad: number): number {
  let diff = (toRad - fromRad) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function lerpAngle(fromRad: number, toRad: number, t: number): number {
  return fromRad + shortestAngleDiff(fromRad, toRad) * Math.max(0, Math.min(1, t));
}

function deduplicatePoints(points: AmrRoutePoint[]): AmrRoutePoint[] {
  const result: AmrRoutePoint[] = [];
  for (const point of points) {
    const rounded = { x: round3(point.x), z: round3(point.z) };
    const previous = result[result.length - 1];
    if (
      !previous ||
      Math.hypot(rounded.x - previous.x, rounded.z - previous.z) >= 0.02
    ) {
      result.push(rounded);
    }
  }
  return result;
}

function resolveStorageAisleZ(zone: NormalizedZone, targetBin: NormalizedBin): number {
  const distinctZs = Array.from(
    new Set(zone.bins.map((bin) => Math.round(bin.worldPosition.z * 100) / 100)),
  ).sort((a, b) => a - b);

  if (distinctZs.length >= 2) {
    const mid = Math.floor(distinctZs.length / 2);
    return round3((distinctZs[mid - 1] + distinctZs[mid]) / 2);
  }
  return round3(targetBin.worldPosition.z + targetBin.bayDimensions.depth / 2 + 0.72);
}

function resolveWaypointsForBin(
  snapshot: WarehouseSnapshot,
  zone: NormalizedZone,
  bin: NormalizedBin,
): { waypoints: AmrRoutePoint[]; targetMastExtension: number } {
  const home = AMR_HOME_POSITION;

  if (zone.kind === 'STORAGE') {
    const aisleZ = resolveStorageAisleZ(zone, bin);
    const approachSign = bin.worldPosition.z <= aisleZ ? 1 : -1;
    const stopZ = round3(
      bin.worldPosition.z + approachSign * (bin.bayDimensions.depth / 2 + 0.72),
    );
    return {
      waypoints: deduplicatePoints([
        home,
        { x: home.x, z: aisleZ },
        { x: bin.worldPosition.x, z: aisleZ },
        { x: bin.worldPosition.x, z: stopZ },
      ]),
      targetMastExtension: 1.0,
    };
  }

  if (zone.kind === 'RECEIVING') {
    const stopX = round3(
      bin.worldPosition.x + bin.bayDimensions.depth / 2 + 0.85,
    );
    return {
      waypoints: deduplicatePoints([
        home,
        { x: home.x, z: bin.worldPosition.z },
        { x: stopX, z: bin.worldPosition.z },
      ]),
      targetMastExtension: 0.45,
    };
  }

  // QUARANTINE: travel down the clear primary storage aisle and enter via the open west enclosure gap
  const storageZone = snapshot.zones.find((item) => item.kind === 'STORAGE');
  const corridorZ =
    storageZone && storageZone.bins.length > 0
      ? resolveStorageAisleZ(storageZone, storageZone.bins[0])
      : home.z;
  const entryX = round3(Math.min(zone.worldBounds.minX - 0.7, 7.9));
  const stopX = round3(bin.worldPosition.x - (bin.bayDimensions.depth / 2 + 0.8));

  return {
    waypoints: deduplicatePoints([
      home,
      { x: home.x, z: corridorZ },
      { x: entryX, z: corridorZ },
      { x: entryX, z: bin.worldPosition.z },
      { x: stopX, z: bin.worldPosition.z },
    ]),
    targetMastExtension: 0.78,
  };
}

/**
 * Build a deterministic, explicitly preplanned aisle route toward the given persisted bin.
 * Does not perform SLAM, live localization, or dynamic obstacle avoidance.
 */
export function planAmrRoute(
  snapshot: WarehouseSnapshot | null,
  binId: string,
): AmrRoutePlan | null {
  if (!snapshot || !binId) return null;
  const bin = snapshot.binById[binId];
  if (!bin) return null;
  const zone = snapshot.zones.find((item) => item.id === bin.zoneId);
  if (!zone) return null;

  const { waypoints, targetMastExtension } = resolveWaypointsForBin(
    snapshot,
    zone,
    bin,
  );
  if (waypoints.length === 0) return null;

  const lastPoint = waypoints[waypoints.length - 1];
  const targetHeadingRad = Math.atan2(
    bin.worldPosition.x - lastPoint.x,
    bin.worldPosition.z - lastPoint.z,
  );

  const steps: AmrTimelineStep[] = [];
  let currentYaw = AMR_HOME_HEADING_RAD;
  let totalDistanceMeters = 0;

  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const fromPos = waypoints[i];
    const toPos = waypoints[i + 1];
    const dx = toPos.x - fromPos.x;
    const dz = toPos.z - fromPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.01) continue;

    const segYaw = Math.atan2(dx, dz);
    const turnDiff = Math.abs(shortestAngleDiff(currentYaw, segYaw));
    if (turnDiff > 0.015) {
      steps.push({
        phase: 'TRAVELING',
        duration: Math.max(0.18, turnDiff / AMR_TURN_RATE_RAD_PER_SEC),
        fromPos,
        toPos: fromPos,
        fromYaw: currentYaw,
        toYaw: segYaw,
        distance: 0,
        fromMast: 0,
        toMast: 0,
      });
    }

    steps.push({
      phase: 'TRAVELING',
      duration: dist / AMR_DRIVE_SPEED_MPS,
      fromPos,
      toPos,
      fromYaw: segYaw,
      toYaw: segYaw,
      distance: dist,
      fromMast: 0,
      toMast: 0,
    });
    totalDistanceMeters += dist;
    currentYaw = segYaw;
  }

  const finalTurnDiff = Math.abs(shortestAngleDiff(currentYaw, targetHeadingRad));
  steps.push({
    phase: 'STOPPING',
    duration: Math.max(
      AMR_STOP_DURATION_S,
      finalTurnDiff / AMR_TURN_RATE_RAD_PER_SEC,
    ),
    fromPos: lastPoint,
    toPos: lastPoint,
    fromYaw: currentYaw,
    toYaw: targetHeadingRad,
    distance: 0,
    fromMast: 0,
    toMast: 0,
  });

  steps.push({
    phase: 'ELEVATING_MAST',
    duration: AMR_MAST_DURATION_S,
    fromPos: lastPoint,
    toPos: lastPoint,
    fromYaw: targetHeadingRad,
    toYaw: targetHeadingRad,
    distance: 0,
    fromMast: 0,
    toMast: targetMastExtension,
  });

  steps.push({
    phase: 'SCANNING',
    duration: AMR_SCAN_DURATION_S,
    fromPos: lastPoint,
    toPos: lastPoint,
    fromYaw: targetHeadingRad,
    toYaw: targetHeadingRad,
    distance: 0,
    fromMast: targetMastExtension,
    toMast: targetMastExtension,
  });

  const totalDurationSeconds = steps.reduce((sum, step) => sum + step.duration, 0);

  return {
    warehouseId: snapshot.warehouse.id,
    targetBinId: bin.id,
    targetBinCode: bin.code,
    targetBinWorldPosition: { ...bin.worldPosition },
    targetZoneCode: zone.code,
    waypoints,
    targetHeadingRad,
    targetMastExtension,
    totalDistanceMeters: round3(totalDistanceMeters),
    steps,
    totalDurationSeconds,
  };
}

function makeHomePose(): AmrPose {
  return {
    x: AMR_HOME_POSITION.x,
    z: AMR_HOME_POSITION.z,
    headingRad: AMR_HOME_HEADING_RAD,
    wheelRotationRad: 0,
    mastExtension: 0,
    scanProgress: 0,
  };
}

function evaluateRouteAtTime(
  plan: AmrRoutePlan,
  elapsedSeconds: number,
): { phase: AmrPhase; pose: AmrPose } {
  const clamped = Math.max(0, elapsedSeconds);
  if (clamped >= plan.totalDurationSeconds) {
    const last = plan.waypoints[plan.waypoints.length - 1] ?? AMR_HOME_POSITION;
    return {
      phase: 'SCANNED',
      pose: {
        x: last.x,
        z: last.z,
        headingRad: plan.targetHeadingRad,
        wheelRotationRad: plan.totalDistanceMeters / AMR_WHEEL_RADIUS_M,
        mastExtension: plan.targetMastExtension,
        scanProgress: 1,
      },
    };
  }

  let cursor = 0;
  let traveledDistance = 0;

  for (const step of plan.steps) {
    const stepEnd = cursor + step.duration;
    if (clamped <= stepEnd || step === plan.steps[plan.steps.length - 1]) {
      const rawT = step.duration > 0 ? (clamped - cursor) / step.duration : 1;
      const t = Math.max(0, Math.min(1, rawT));
      const moveT = step.phase === 'STOPPING' ? easeInOutCubic(t) : t;
      const mastT = easeInOutCubic(t);
      const stepDist = step.distance * moveT;

      return {
        phase: step.phase,
        pose: {
          x: step.fromPos.x + (step.toPos.x - step.fromPos.x) * moveT,
          z: step.fromPos.z + (step.toPos.z - step.fromPos.z) * moveT,
          headingRad: lerpAngle(step.fromYaw, step.toYaw, moveT),
          wheelRotationRad:
            (traveledDistance + stepDist) / AMR_WHEEL_RADIUS_M,
          mastExtension:
            step.fromMast + (step.toMast - step.fromMast) * mastT,
          scanProgress: step.phase === 'SCANNING' ? t : 0,
        },
      };
    }

    traveledDistance += step.distance;
    cursor = stepEnd;
  }

  return { phase: 'IDLE', pose: makeHomePose() };
}

export function createInitialAmrMission(plan: AmrRoutePlan | null): AmrMissionState {
  return {
    routePlan: plan,
    phase: 'IDLE',
    isRunning: false,
    isPaused: false,
    elapsedSeconds: 0,
    pose: makeHomePose(),
    scanEventId: null,
    scanCompletedAt: null,
  };
}

export function startAmrMission(state: AmrMissionState): AmrMissionState {
  if (!state.routePlan) return state;
  const firstStep = state.routePlan.steps[0];
  return {
    ...state,
    phase: firstStep?.phase ?? 'TRAVELING',
    isRunning: true,
    isPaused: false,
    elapsedSeconds: 0,
    pose: makeHomePose(),
    scanEventId: null,
    scanCompletedAt: null,
  };
}

export function pauseAmrMission(state: AmrMissionState): AmrMissionState {
  if (!state.isRunning || state.isPaused || state.phase === 'SCANNED') {
    return state;
  }
  return {
    ...state,
    isPaused: true,
  };
}

export function resumeAmrMission(state: AmrMissionState): AmrMissionState {
  if (!state.isRunning || !state.isPaused || state.phase === 'SCANNED') {
    return state;
  }
  return {
    ...state,
    isPaused: false,
  };
}

export function resetAmrMission(plan: AmrRoutePlan | null): AmrMissionState {
  return createInitialAmrMission(plan);
}

export function stepAmrMission(
  state: AmrMissionState,
  deltaSeconds: number,
  options?: { eventId?: string; completedAt?: string },
): AmrMissionState {
  if (
    !state.routePlan ||
    !state.isRunning ||
    state.isPaused ||
    state.phase === 'SCANNED'
  ) {
    return state;
  }

  const dt = Math.max(0, Math.min(0.05, deltaSeconds));
  const nextElapsed = state.elapsedSeconds + dt;
  const { phase, pose } = evaluateRouteAtTime(state.routePlan, nextElapsed);

  if (phase === 'SCANNED') {
    const suffix =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().slice(0, 8)
        : Math.round(Date.now()).toString(36);
    const binSlug = state.routePlan.targetBinCode
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return {
      ...state,
      phase: 'SCANNED',
      isRunning: false,
      isPaused: false,
      elapsedSeconds: state.routePlan.totalDurationSeconds,
      pose,
      scanEventId: options?.eventId ?? `sim-amr-${binSlug || 'bin'}-${suffix}`,
      scanCompletedAt: options?.completedAt ?? new Date().toISOString(),
    };
  }

  return {
    ...state,
    phase,
    elapsedSeconds: nextElapsed,
    pose,
  };
}

/**
 * Deterministic simulated count adapting to the audit snapshot.
 * For the seeded A-01 / SKU-001 example (expected 8), simulates observing 6.
 */
export function deriveSimulatedObservedQty(expectedQty: number): number {
  if (expectedQty >= 3) return expectedQty - 2;
  if (expectedQty >= 1) return expectedQty - 1;
  return 1;
}

/**
 * Choose a default persisted bin and SKU for the AMR demo without inventing UUIDs.
 * Prefers A-01 / SKU-001 when present, otherwise adapts to the snapshot and catalog.
 */
export function selectDefaultAmrTarget(
  bins: StorageBin[],
  skus: SKU[],
  snapshotItems: ReadonlyArray<{ bin_id: string; sku_id: string }>,
): { binId: string; skuId: string } {
  const preferredBin =
    bins.find((bin) => bin.code === 'A-01') ??
    bins.find((bin) =>
      snapshotItems.some((item) => item.bin_id === bin.id),
    ) ??
    bins.find((bin) => bin.is_accessible) ??
    bins[0];

  if (!preferredBin) {
    return { binId: '', skuId: '' };
  }

  const binSnapshotItems = snapshotItems.filter(
    (item) => item.bin_id === preferredBin.id,
  );
  const preferredSku =
    skus.find(
      (sku) =>
        sku.code === 'SKU-001' &&
        (binSnapshotItems.length === 0 ||
          binSnapshotItems.some((item) => item.sku_id === sku.id)),
    ) ??
    skus.find((sku) =>
      binSnapshotItems.some((item) => item.sku_id === sku.id),
    ) ??
    skus.find((sku) => sku.code === 'SKU-001') ??
    skus[0];

  return {
    binId: preferredBin.id,
    skuId: preferredSku?.id ?? '',
  };
}
