import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import type { CameraDirective } from './components/SceneCamera';
import { Warehouse3DViewer } from './components/Warehouse3DViewer';
import type {
  CameraPreset,
  DataSourceKind,
  NormalizedBin,
  RealtimeConnectionStatus,
  RenderQuality,
  Warehouse,
  WarehouseSnapshot,
  ZoneKind,
} from './data/contracts';
import { findBinById } from './data/warehouseMapper';
import { ApiWarehouseProvider } from './services/apiProvider';
import { DemoWarehouseProvider } from './services/demoProvider';
import {
  WebSocketWarehouseRealtimeClient,
  resolveDefaultWarehouseWsUrl,
} from './services/realtimeClient';
import { WarehouseProviderError } from './services/warehouseProvider';
import { BinDetailsPanel } from './ui/BinDetailsPanel';
import { WarehouseToolbar } from './ui/WarehouseToolbar';
import { ZoneFilters } from './ui/ZoneFilters';

const INITIAL_VISIBLE_ZONES: Record<ZoneKind, boolean> = {
  RECEIVING: true,
  STORAGE: true,
  QUARANTINE: true,
};

function formatRefreshTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function App() {
  const [mode, setMode] = useState<DataSourceKind>('demo');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<WarehouseSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedBinId, setSelectedBinId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [visibleZoneKinds, setVisibleZoneKinds] =
    useState<Record<ZoneKind, boolean>>(INITIAL_VISIBLE_ZONES);
  const [cameraDirective, setCameraDirective] = useState<CameraDirective | null>(null);
  const [quality, setQuality] = useState<RenderQuality>('high');
  const [refreshNonce, setRefreshNonce] = useState<number>(0);

  // Optional native WebSocket sync (disabled by default; never fakes connectivity)
  const [realtimeEnabled, setRealtimeEnabled] = useState<boolean>(false);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeConnectionStatus>('disabled');
  const wsUrl = useMemo(() => resolveDefaultWarehouseWsUrl(), []);

  // Responsive sidebar visibility (both open on desktop >= 1024px, closed on compact screens)
  const [leftSidebarOpen, setLeftSidebarOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  );
  const [rightSidebarOpen, setRightSidebarOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : false,
  );

  const directiveIdRef = useRef(1);

  const demoProvider = useMemo(() => new DemoWarehouseProvider(), []);
  const apiProvider = useMemo(() => new ApiWarehouseProvider(), []);
  const activeProvider = mode === 'demo' ? demoProvider : apiProvider;

  // Instantiate optional WebSocket client only when Live API + WS Sync is explicitly enabled
  const realtimeClient = useMemo(() => {
    if (mode !== 'api' || !realtimeEnabled) {
      return null;
    }
    return new WebSocketWarehouseRealtimeClient({
      url: wsUrl,
      enabled: true,
    });
  }, [mode, realtimeEnabled, wsUrl]);

  // Load warehouse directory when provider changes or refresh is triggered
  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setListError(null);
    setSelectedBinId(null);

    activeProvider
      .listWarehouses(controller.signal)
      .then((items) => {
        if (!active || controller.signal.aborted) return;
        setWarehouses(items);
        setListError(null);
        setSelectedWarehouseId((prev) => {
          if (prev && items.some((w) => w.id === prev)) return prev;
          return items[0]?.id ?? null;
        });
      })
      .catch((err: unknown) => {
        if (!active || controller.signal.aborted) return;
        if (err instanceof WarehouseProviderError && err.code === 'ABORTED') return;
        const message =
          err instanceof Error
            ? err.message
            : 'Unable to load warehouse list from the configured WARETRACE API.';
        // Never substitute demo warehouses when live API fails
        setWarehouses([]);
        setSelectedWarehouseId(null);
        setSnapshot(null);
        setListError(message);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [activeProvider, refreshNonce]);

  const selectedBin = useMemo(
    () => findBinById(snapshot, selectedBinId),
    [snapshot, selectedBinId],
  );

  const issueCameraDirective = useCallback(
    (payload: Omit<CameraDirective, 'id'>) => {
      directiveIdRef.current += 1;
      setCameraDirective({
        id: Date.now() + directiveIdRef.current,
        ...payload,
      });
    },
    [],
  );

  const handleCameraPreset = useCallback(
    (preset: CameraPreset) => {
      issueCameraDirective({ preset });
    },
    [issueCameraDirective],
  );

  const handleSelectBin = useCallback((bin: NormalizedBin | null) => {
    setSelectedBinId(bin?.id ?? null);
    if (bin) {
      setRightSidebarOpen(true);
    }
  }, []);

  const handleSelectBinFromList = useCallback(
    (bin: NormalizedBin) => {
      setSelectedBinId(bin.id);
      setRightSidebarOpen(true);
      issueCameraDirective({ focusPosition: bin.worldPosition });
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setLeftSidebarOpen(false);
      }
    },
    [issueCameraDirective],
  );

  const handleFocusBin = useCallback(
    (bin: NormalizedBin) => {
      issueCameraDirective({ focusPosition: bin.worldPosition });
    },
    [issueCameraDirective],
  );

  const handleToggleZoneKind = useCallback((kind: ZoneKind) => {
    setVisibleZoneKinds((prev) => ({
      ...prev,
      [kind]: !prev[kind],
    }));
  }, []);

  const handleModeChange = useCallback((nextMode: DataSourceKind) => {
    setMode(nextMode);
    setSelectedBinId(null);
    setListError(null);
    if (nextMode === 'demo') {
      setRealtimeEnabled(false);
      setRealtimeStatus('disabled');
    }
  }, []);

  const handleManualRefresh = useCallback(() => {
    setRefreshNonce((n) => n + 1);
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#091321] text-slate-100">
      {/* Top Toolbar */}
      <WarehouseToolbar
        warehouses={warehouses}
        selectedWarehouseId={selectedWarehouseId}
        onSelectWarehouse={(id) => {
          setSelectedWarehouseId(id);
          setSelectedBinId(null);
        }}
        mode={mode}
        onModeChange={handleModeChange}
        realtimeEnabled={realtimeEnabled}
        realtimeConfigured={Boolean(wsUrl)}
        realtimeStatus={realtimeStatus}
        onToggleRealtime={() => setRealtimeEnabled((prev) => !prev)}
        onCameraPreset={handleCameraPreset}
        quality={quality}
        onToggleQuality={() => setQuality((q) => (q === 'high' ? 'lite' : 'high'))}
        leftSidebarOpen={leftSidebarOpen}
        onToggleLeftSidebar={() => setLeftSidebarOpen((open) => !open)}
        rightSidebarOpen={rightSidebarOpen}
        onToggleRightSidebar={() => setRightSidebarOpen((open) => !open)}
      />

      {/* Main 3-column visualization workspace */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Left Sidebar: Zone Filters & Bin Search */}
        {leftSidebarOpen && (
          <div className="absolute inset-y-0 left-0 z-30 shadow-2xl lg:static lg:z-auto lg:shadow-none">
            <ZoneFilters
              snapshot={snapshot}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              visibleZoneKinds={visibleZoneKinds}
              onToggleZoneKind={handleToggleZoneKind}
              selectedBinId={selectedBinId}
              onSelectBinFromList={handleSelectBinFromList}
            />
          </div>
        )}

        {/* Center: Reusable Interactive 3D Warehouse Viewer */}
        <main className="relative min-w-0 flex-1">
          <Warehouse3DViewer
            warehouseId={selectedWarehouseId}
            dataProvider={activeProvider}
            realtimeClient={realtimeClient}
            selectedBinId={selectedBinId}
            onBinSelect={handleSelectBin}
            visibleZoneKinds={visibleZoneKinds}
            cameraDirective={cameraDirective}
            quality={quality}
            refreshNonce={refreshNonce}
            externalError={listError}
            onRetryExternal={handleManualRefresh}
            onSnapshotChange={setSnapshot}
            onLoadingChange={setLoading}
            onRealtimeStatusChange={(status) => setRealtimeStatus(status)}
          />
        </main>

        {/* Right Sidebar: Selected Bin Details */}
        {rightSidebarOpen && (
          <div className="absolute inset-y-0 right-0 z-30 shadow-2xl lg:static lg:z-auto lg:shadow-none">
            <BinDetailsPanel
              snapshot={snapshot}
              selectedBin={selectedBin}
              onFocusBin={handleFocusBin}
              onClearSelection={() => setSelectedBinId(null)}
            />
          </div>
        )}
      </div>

      {/* Compact Bottom Status Area */}
      <footer
        aria-label="Warehouse statistics and data source status"
        className="flex h-9 shrink-0 items-center justify-between gap-4 border-t border-slate-700/45 bg-[#0A1525] px-3 text-xs text-slate-300 sm:px-4"
      >
        <div className="flex min-w-0 items-center gap-3 overflow-x-auto whitespace-nowrap sm:gap-5">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Bins:</span>
            <span data-testid="stat-total-bins" className="font-mono font-semibold text-white tabular-nums">
              {snapshot ? snapshot.stats.totalBins : '—'}
            </span>
          </div>

          <span className="text-slate-700" aria-hidden="true">·</span>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Expected stored units:</span>
            <span
              data-testid="stat-expected-units"
              className="font-mono font-semibold text-[#35D6F2] tabular-nums"
            >
              {snapshot ? snapshot.stats.expectedStoredUnits : '—'}
            </span>
          </div>

          <span className="hidden text-slate-700 md:inline" aria-hidden="true">·</span>

          <div className="hidden items-center gap-1.5 md:flex">
            <span className="text-slate-400">Source:</span>
            <span
              data-testid="stat-data-source"
              className={`font-medium ${
                mode === 'demo' ? 'text-[#FFB547]' : 'text-[#35D6F2]'
              }`}
            >
              {activeProvider.label}
            </span>
          </div>

          <span className="hidden text-slate-700 lg:inline" aria-hidden="true">·</span>

          <div className="hidden items-center gap-1.5 lg:flex">
            <span className="text-slate-400">Last refresh:</span>
            <span className="font-mono text-slate-200 tabular-nums">
              {formatRefreshTime(snapshot?.fetchedAt ?? null)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-[#142439] hover:text-white disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3 w-3 ${loading ? 'animate-spin text-[#35D6F2]' : ''}`}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <a
            href="/WARETRACE-Warehouse-3D-Module.zip"
            download="WARETRACE-Warehouse-3D-Module.zip"
            className="inline-flex items-center gap-1.5 rounded border border-slate-700/70 bg-[#142439] px-2.5 py-1 text-xs font-medium text-slate-200 transition-colors hover:border-[#35D6F2]/60 hover:text-white"
          >
            <Download className="h-3 w-3 text-[#35D6F2]" aria-hidden="true" />
            <span className="hidden sm:inline">Export ZIP</span>
          </a>
        </div>
      </footer>
    </div>
  );
}
