import { describe, expect, it } from 'vitest';
import {
  DEMO_BINS,
  DEMO_WAREHOUSES,
} from '../data/demoWarehouse';
import {
  AMR_HOME_POSITION,
  createInitialAmrMission,
  deriveSimulatedObservedQty,
  pauseAmrMission,
  planAmrRoute,
  resetAmrMission,
  resumeAmrMission,
  selectDefaultAmrTarget,
  startAmrMission,
  stepAmrMission,
  type AmrPhase,
} from '../services/amrMission';
import { DemoWarehouseProvider } from '../services/demoProvider';

describe('amrMission', () => {
  it('plans a deterministic clear-aisle route to A-01 outside the rack footprint', async () => {
    const provider = new DemoWarehouseProvider();
    const snapshot = await provider.getWarehouseSnapshot(DEMO_WAREHOUSES[0].id);
    const binA01 = snapshot.bins.find((bin) => bin.code === 'A-01');
    expect(binA01).toBeDefined();

    const plan = planAmrRoute(snapshot, binA01!.id);
    expect(plan).not.toBeNull();
    expect(plan!.targetBinCode).toBe('A-01');
    expect(plan!.waypoints[0]).toEqual(AMR_HOME_POSITION);
    expect(plan!.waypoints[1]).toEqual({ x: -4.8, z: 0 });
    expect(plan!.waypoints[2].x).toBeCloseTo(-4.8, 3);
    // Stops on the aisle side (between rack front edge -1.825 and centerline 0)
    expect(plan!.waypoints[2].z).toBeCloseTo(-1.105, 3);
    expect(Math.abs(plan!.targetHeadingRad)).toBeCloseTo(Math.PI, 3);
    expect(plan!.targetMastExtension).toBe(1);
  });

  it('routes cleanly to Row 2 (A-05), Quarantine (QA-01), and Receiving (RCV-01)', async () => {
    const provider = new DemoWarehouseProvider();
    const snapshot = await provider.getWarehouseSnapshot(DEMO_WAREHOUSES[0].id);

    const binA05 = snapshot.bins.find((bin) => bin.code === 'A-05')!;
    const planA05 = planAmrRoute(snapshot, binA05.id)!;
    expect(planA05.waypoints[planA05.waypoints.length - 1].z).toBeCloseTo(1.105, 3);
    expect(planA05.targetHeadingRad).toBeCloseTo(0, 3);

    const binQa01 = snapshot.bins.find((bin) => bin.code === 'QA-01')!;
    const planQa01 = planAmrRoute(snapshot, binQa01.id)!;
    // Approaches Quarantine from its open West side (x < bin world x)
    expect(planQa01.waypoints[planQa01.waypoints.length - 1].x).toBeLessThan(
      binQa01.worldPosition.x - binQa01.bayDimensions.depth / 2,
    );

    const binRcv01 = snapshot.bins.find((bin) => bin.code === 'RCV-01')!;
    const planRcv01 = planAmrRoute(snapshot, binRcv01.id)!;
    expect(planRcv01.waypoints[planRcv01.waypoints.length - 1].x).toBeGreaterThan(
      binRcv01.worldPosition.x + binRcv01.bayDimensions.depth / 2,
    );
    expect(planRcv01.targetMastExtension).toBe(0.45);
  });

  it('progresses through travel, stopping, mast elevation, scan, and supports Pause/Resume/Reset', async () => {
    const provider = new DemoWarehouseProvider();
    const snapshot = await provider.getWarehouseSnapshot(DEMO_WAREHOUSES[0].id);
    const binA01 = snapshot.bins.find((bin) => bin.code === 'A-01')!;
    const plan = planAmrRoute(snapshot, binA01.id)!;

    let state = createInitialAmrMission(plan);
    expect(state.phase).toBe('IDLE');
    expect(state.pose.mastExtension).toBe(0);

    state = startAmrMission(state);
    expect(state.isRunning).toBe(true);
    expect(state.phase).toBe('TRAVELING');

    const observedPhases = new Set<AmrPhase>([state.phase]);
    // Step partway through traveling then pause
    for (let i = 0; i < 25; i += 1) {
      state = stepAmrMission(state, 0.04);
      observedPhases.add(state.phase);
    }
    expect(state.pose.wheelRotationRad).toBeGreaterThan(0);

    state = pauseAmrMission(state);
    expect(state.isPaused).toBe(true);
    const frozenPose = { ...state.pose };
    const frozenElapsed = state.elapsedSeconds;

    state = stepAmrMission(state, 0.05);
    expect(state.elapsedSeconds).toBe(frozenElapsed);
    expect(state.pose).toEqual(frozenPose);

    state = resumeAmrMission(state);
    expect(state.isPaused).toBe(false);

    let guard = 0;
    while (state.phase !== 'SCANNED' && guard < 400) {
      state = stepAmrMission(state, 0.04, {
        eventId: 'sim-amr-a-01-fixed',
        completedAt: '2026-11-27T12:00:00.000Z',
      });
      observedPhases.add(state.phase);
      guard += 1;
    }

    expect(observedPhases).toEqual(
      new Set(['TRAVELING', 'STOPPING', 'ELEVATING_MAST', 'SCANNING', 'SCANNED']),
    );
    expect(state.phase).toBe('SCANNED');
    expect(state.isRunning).toBe(false);
    expect(state.pose.mastExtension).toBe(1);
    expect(state.pose.scanProgress).toBe(1);
    expect(state.scanEventId).toBe('sim-amr-a-01-fixed');
    expect(state.scanCompletedAt).toBe('2026-11-27T12:00:00.000Z');

    const reset = resetAmrMission(plan);
    expect(reset.phase).toBe('IDLE');
    expect(reset.pose.x).toBe(AMR_HOME_POSITION.x);
    expect(reset.pose.z).toBe(AMR_HOME_POSITION.z);
    expect(reset.pose.mastExtension).toBe(0);
    expect(reset.scanEventId).toBeNull();
  });

  it('derives adaptive simulated counts and selects persisted A-01 / SKU-001 defaults', () => {
    expect(deriveSimulatedObservedQty(8)).toBe(6);
    expect(deriveSimulatedObservedQty(4)).toBe(2);
    expect(deriveSimulatedObservedQty(2)).toBe(1);
    expect(deriveSimulatedObservedQty(1)).toBe(0);
    expect(deriveSimulatedObservedQty(0)).toBe(1);

    const skus = [
      {
        id: 'sku-uuid-2',
        code: 'SKU-002',
        name: 'Sensor',
        unit_weight_g: '100',
        length_mm: '50',
        width_mm: '50',
        height_mm: '50',
        is_fragile: false,
      },
      {
        id: 'sku-uuid-1',
        code: 'SKU-001',
        name: 'Kit',
        unit_weight_g: '200',
        length_mm: '80',
        width_mm: '80',
        height_mm: '80',
        is_fragile: true,
      },
    ];
    const target = selectDefaultAmrTarget(DEMO_BINS, skus, []);
    const a01 = DEMO_BINS.find((bin) => bin.code === 'A-01')!;
    expect(target).toEqual({ binId: a01.id, skuId: 'sku-uuid-1' });

    // Adapts to a warehouse without A-01 / SKU-001 using actual snapshot records
    const customBins = [
      {
        id: 'bin-uuid-custom',
        zone_id: 'zone-custom',
        code: 'B-09',
        grid_x: 0,
        grid_y: 0,
        is_accessible: true,
        capacity_units: 20,
      },
    ];
    const customTarget = selectDefaultAmrTarget(
      customBins,
      [skus[0]],
      [{ bin_id: 'bin-uuid-custom', sku_id: 'sku-uuid-2' }],
    );
    expect(customTarget).toEqual({
      binId: 'bin-uuid-custom',
      skuId: 'sku-uuid-2',
    });
  });
});
