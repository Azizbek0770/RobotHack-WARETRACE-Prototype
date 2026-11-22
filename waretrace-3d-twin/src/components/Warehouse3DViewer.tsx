import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import * as THREE from 'three';
import type {
  NormalizedBin,
  RealtimeConnectionStatus,
  RenderQuality,
  WarehouseRealtimeClient,
  WarehouseSnapshot,
  ZoneKind,
} from '../data/contracts';
import { findBinById } from '../data/warehouseMapper';
import { WarehouseProviderError, type WarehouseDataProvider } from '../services/warehouseProvider';
import type { CameraDirective } from './SceneCamera';
import { WarehouseControls } from './WarehouseControls';
import { WarehouseScene } from './WarehouseScene';
import { isSoftwareWebGL } from './warehouseMaterials';

export interface Warehouse3DViewerProps {
  /** Active warehouse UUID to visualize */
  warehouseId: string | null;
  /** Normalized data provider (DemoWarehouseProvider, ApiWarehouseProvider, or custom host adapter) */
  dataProvider: WarehouseDataProvider;
  /** Optional native WebSocket realtime client (disabled by default) */
  realtimeClient?: WarehouseRealtimeClient | null;
  /** Controlled selected bin UUID (optional — component manages internal selection if omitted) */
  selectedBinId?: string | null;
  /** Callback fired whenever a bin is selected or deselected in the 3D scene */
  onBinSelect?: (bin: NormalizedBin | null) => void;
  /** Zone kind visibility filters */
  visibleZoneKinds?: Record<ZoneKind, boolean>;
  /** Programmatic camera directive (Isometric, Top-Down, Reset, Focus Bin) */
  cameraDirective?: CameraDirective | null;
  /** Render quality preset ('high' | 'lite') */
  quality?: RenderQuality;
  /** Increment to trigger an imperative authoritative refresh */
  refreshNonce?: number;
  /** Optional external snapshot error (e.g., warehouse listing failure in host app) */
  externalError?: string | null;
  /** Callback to retry when externalError is shown */
  onRetryExternal?: () => void;
  /** Lifecycle callbacks so host applications can synchronize toolbars and sidebars */
  onSnapshotChange?: (snapshot: WarehouseSnapshot | null) => void;
  onLoadingChange?: (loading: boolean) => void;
  onErrorChange?: (error: string | null) => void;
  onRealtimeStatusChange?: (status: RealtimeConnectionStatus, detail?: string) => void;
  className?: string;
}

const DEFAULT_VISIBLE_ZONES: Record<ZoneKind, boolean> = {
  RECEIVING: true,
  STORAGE: true,
  QUARANTINE: true,
};

/**
 * Reusable, integration-first 3D Warehouse Digital Twin Viewer.
 *
 * Embed directly inside the existing WARETRACE frontend without duplicating API clients
 * or replacing application navigation.
 */
export function Warehouse3DViewer({
  warehouseId,
  dataProvider,
  realtimeClient = null,
  selectedBinId: controlledSelectedBinId,
  onBinSelect,
  visibleZoneKinds = DEFAULT_VISIBLE_ZONES,
  cameraDirective = null,
  quality = 'high',
  refreshNonce = 0,
  externalError = null,
  onRetryExternal,
  onSnapshotChange,
  onLoadingChange,
  onErrorChange,
  onRealtimeStatusChange,
  className = '',
}: Warehouse3DViewerProps) {
  const softwareGl = isSoftwareWebGL();

  const [snapshot, setSnapshot] = useState<WarehouseSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [internalSelectedBinId, setInternalSelectedBinId] = useState<string | null>(null);
  const [hoveredBin, setHoveredBin] = useState<NormalizedBin | null>(null);
  const [localCameraDirective, setLocalCameraDirective] = useState<CameraDirective | null>(null);
  const [localRefreshNonce, setLocalRefreshNonce] = useState(0);
  const [webglLost, setWebglLost] = useState(false);

  const directiveCounterRef = useRef(1);
  const activeCameraDirective =
    localCameraDirective && (!cameraDirective || localCameraDirective.id > cameraDirective.id)
      ? localCameraDirective
      : cameraDirective;

  const selectedBinId =
    controlledSelectedBinId !== undefined ? controlledSelectedBinId : internalSelectedBinId;

  const selectedBin = useMemo(
    () => findBinById(snapshot, selectedBinId),
    [snapshot, selectedBinId],
  );

  // Store latest callbacks in refs so data fetching & realtime effects never tear down needlessly
  const callbacksRef = useRef({
    onBinSelect,
    onSnapshotChange,
    onLoadingChange,
    onErrorChange,
    onRealtimeStatusChange,
  });
  callbacksRef.current = {
    onBinSelect,
    onSnapshotChange,
    onLoadingChange,
    onErrorChange,
    onRealtimeStatusChange,
  };

  // Authoritative snapshot loading with AbortController cleanup
  useEffect(() => {
    if (!warehouseId) {
      setSnapshot(null);
      setLoading(false);
      setErrorMessage(null);
      callbacksRef.current.onSnapshotChange?.(null);
      callbacksRef.current.onLoadingChange?.(false);
      callbacksRef.current.onErrorChange?.(null);
      return;
    }

    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setErrorMessage(null);
    callbacksRef.current.onLoadingChange?.(true);
    callbacksRef.current.onErrorChange?.(null);

    dataProvider
      .getWarehouseSnapshot(warehouseId, controller.signal)
      .then((nextSnapshot) => {
        if (!active || controller.signal.aborted) return;
        setSnapshot(nextSnapshot);
        setErrorMessage(null);
        setLoading(false);
        callbacksRef.current.onSnapshotChange?.(nextSnapshot);
        callbacksRef.current.onErrorChange?.(null);
        callbacksRef.current.onLoadingChange?.(false);
      })
      .catch((err: unknown) => {
        if (!active || controller.signal.aborted) return;
        if (err instanceof WarehouseProviderError && err.code === 'ABORTED') {
          return;
        }
        const message =
          err instanceof Error
            ? err.message
            : 'Failed to load warehouse data from the configured provider.';
        // CRITICAL: Never silently substitute demo data when live API fails!
        setSnapshot(null);
        setErrorMessage(message);
        setLoading(false);
        callbacksRef.current.onSnapshotChange?.(null);
        callbacksRef.current.onErrorChange?.(message);
        callbacksRef.current.onLoadingChange?.(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [warehouseId, dataProvider, refreshNonce, localRefreshNonce]);

  // Optional native WebSocket lifecycle: invalidate & reconcile through REST API
  useEffect(() => {
    if (!realtimeClient || !warehouseId) {
      callbacksRef.current.onRealtimeStatusChange?.('disabled');
      return;
    }

    const unsubStatus = realtimeClient.onStatusChange?.((status, detail) => {
      callbacksRef.current.onRealtimeStatusChange?.(status, detail);
    });

    const unsubEvents = realtimeClient.subscribe((event) => {
      // Validated event matches active warehouse -> trigger authoritative REST re-fetch
      if (event.warehouse_id === warehouseId) {
        setLocalRefreshNonce((n) => n + 1);
      }
    });

    const unsubReconcile = realtimeClient.onReconcileNeeded?.((reconcileWarehouseId) => {
      if (reconcileWarehouseId === warehouseId) {
        setLocalRefreshNonce((n) => n + 1);
      }
    });

    realtimeClient.connect(warehouseId);
    callbacksRef.current.onRealtimeStatusChange?.(realtimeClient.getStatus());

    return () => {
      unsubEvents();
      unsubStatus?.();
      unsubReconcile?.();
      realtimeClient.disconnect();
    };
  }, [realtimeClient, warehouseId]);

  const handleSelectBin = useCallback(
    (bin: NormalizedBin) => {
      if (controlledSelectedBinId === undefined) {
        setInternalSelectedBinId(bin.id);
      }
      callbacksRef.current.onBinSelect?.(bin);
    },
    [controlledSelectedBinId],
  );

  const handleFocusSelectedBin = useCallback(() => {
    if (!selectedBin) return;
    directiveCounterRef.current += 1;
    setLocalCameraDirective({
      id: Date.now() + directiveCounterRef.current,
      focusPosition: selectedBin.worldPosition,
    });
  }, [selectedBin]);

  const handleManualRetry = useCallback(() => {
    if (externalError && onRetryExternal) {
      onRetryExternal();
      return;
    }
    setLocalRefreshNonce((n) => n + 1);
  }, [externalError, onRetryExternal]);

  const activeError = externalError || errorMessage;
  const dpr: number | [number, number] =
    softwareGl || quality === 'lite' ? 1 : [1, 2];

  return (
    <div
      data-testid="warehouse-3d-viewport"
      data-source={dataProvider.source}
      data-bin-count={snapshot?.stats.totalBins ?? 0}
      data-selected-bin={selectedBin?.code ?? ''}
      className={`relative h-full w-full overflow-hidden bg-[#091321] ${className}`}
    >
      {/* 3D WebGL Canvas (frameloop="demand" keeps CPU/GPU cool on ordinary laptops & software GL) */}
      {!webglLost ? (
        <Canvas
          frameloop="demand"
          shadows={!softwareGl && quality === 'high'}
          dpr={dpr}
          camera={{ fov: 42, near: 0.25, far: 160, position: [17.5, 16.5, 21.5] }}
          gl={{
            antialias: !softwareGl && quality === 'high',
            powerPreference: 'high-performance',
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.12,
          }}
          onCreated={({ gl }) => {
            gl.outputColorSpace = THREE.SRGBColorSpace;
            const canvas = gl.domElement;
            const onLost = (e: Event) => {
              e.preventDefault();
              setWebglLost(true);
            };
            const onRestored = () => {
              setWebglLost(false);
            };
            canvas.addEventListener('webglcontextlost', onLost, false);
            canvas.addEventListener('webglcontextrestored', onRestored, false);
          }}
          onPointerMissed={() => {
            // Clicking open floor/sky deselects current bin
            if (controlledSelectedBinId === undefined) {
              setInternalSelectedBinId(null);
            }
            callbacksRef.current.onBinSelect?.(null);
          }}
        >
          <WarehouseScene
            snapshot={snapshot}
            selectedBinId={selectedBinId}
            hoveredBinId={hoveredBin?.id ?? null}
            visibleZoneKinds={visibleZoneKinds}
            cameraDirective={activeCameraDirective}
            quality={quality}
            onSelectBin={handleSelectBin}
            onHoverBin={setHoveredBin}
          />
        </Canvas>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#091321] p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-[#FFB547]" aria-hidden="true" />
          <p className="text-sm font-medium text-slate-100">
            WebGL rendering context was interrupted.
          </p>
          <button
            type="button"
            onClick={() => setWebglLost(false)}
            className="rounded-md bg-[#407BFF] px-4 py-2 text-xs font-medium text-white hover:bg-[#3268E6]"
          >
            Restore 3D Viewport
          </button>
        </div>
      )}

      {/* Subtle loading indicator */}
      {loading && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute top-3 left-3 z-20 flex items-center gap-2 rounded-md border border-slate-700/70 bg-[#091321]/95 px-3 py-1.5 text-xs text-slate-200"
        >
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#35D6F2]" aria-hidden="true" />
          <span>Loading warehouse snapshot…</span>
        </div>
      )}

      {/* Explicit Live API Error State (never disguised by synthetic fallback data) */}
      {activeError && !loading && (
        <div
          role="alert"
          data-testid="warehouse-error-overlay"
          className="absolute inset-0 z-20 flex items-center justify-center bg-[#091321]/82 p-6"
        >
          <div className="w-full max-w-md rounded-lg border border-red-500/40 bg-[#0D1B2E] p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-white">
                  Live Warehouse Data Unavailable
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{activeError}</p>
                <p className="mt-2 text-xs text-slate-400">
                  Demo fixtures are not substituted automatically while Live API mode is selected.
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleManualRetry}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#407BFF] px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#3268E6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#407BFF]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    Retry API Request
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Viewport navigation hints & quick zoom to selected bin */}
      {!activeError && !webglLost && (
        <WarehouseControls
          selectedBin={selectedBin}
          hoveredBin={hoveredBin}
          onFocusSelectedBin={handleFocusSelectedBin}
        />
      )}
    </div>
  );
}
