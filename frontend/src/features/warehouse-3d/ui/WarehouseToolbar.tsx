import {
  Box,
  Compass,
  Eye,
  Menu,
  PanelRight,
  Radio,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  CameraPreset,
  DataSourceKind,
  RealtimeConnectionStatus,
  RenderQuality,
  Warehouse,
} from '../data/contracts';

interface WarehouseToolbarProps {
  warehouses: Warehouse[];
  selectedWarehouseId: string | null;
  onSelectWarehouse: (warehouseId: string) => void;
  mode: DataSourceKind;
  onModeChange: (mode: DataSourceKind) => void;
  realtimeEnabled: boolean;
  realtimeConfigured: boolean;
  realtimeStatus: RealtimeConnectionStatus;
  onToggleRealtime: () => void;
  onCameraPreset: (preset: CameraPreset) => void;
  quality: RenderQuality;
  onToggleQuality: () => void;
  leftSidebarOpen: boolean;
  onToggleLeftSidebar: () => void;
  rightSidebarOpen: boolean;
  onToggleRightSidebar: () => void;
}

function getConnectionSummary(
  mode: DataSourceKind,
  realtimeEnabled: boolean,
  realtimeStatus: RealtimeConnectionStatus,
): { label: string; toneClass: string } {
  if (mode === 'demo') {
    return { label: 'Demo Mode (Local)', toneClass: 'text-[#FFB547]' };
  }
  if (!realtimeEnabled) {
    return { label: 'REST API · WS Off', toneClass: 'text-[#35D6F2]' };
  }
  switch (realtimeStatus) {
    case 'connected':
      return { label: 'Live · WS Connected', toneClass: 'text-emerald-400' };
    case 'connecting':
      return { label: 'Live · WS Connecting', toneClass: 'text-[#35D6F2]' };
    case 'reconnecting':
      return { label: 'Live · WS Reconnecting', toneClass: 'text-[#FFB547]' };
    case 'unconfigured':
      return { label: 'Live · WS Unconfigured', toneClass: 'text-[#FFB547]' };
    case 'error':
      return { label: 'Live · WS Unavailable', toneClass: 'text-red-400' };
    default:
      return { label: 'Live · REST Only', toneClass: 'text-[#35D6F2]' };
  }
}

export function WarehouseToolbar({
  warehouses,
  selectedWarehouseId,
  onSelectWarehouse,
  mode,
  onModeChange,
  realtimeEnabled,
  realtimeConfigured,
  realtimeStatus,
  onToggleRealtime,
  onCameraPreset,
  quality,
  onToggleQuality,
  leftSidebarOpen,
  onToggleLeftSidebar,
  rightSidebarOpen,
  onToggleRightSidebar,
}: WarehouseToolbarProps) {
  const connection = getConnectionSummary(mode, realtimeEnabled, realtimeStatus);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-700/45 bg-[#0C192B] px-3 sm:px-4">
      {/* Left: Sidebar toggle + WARETRACE wordmark + Warehouse selector */}
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onToggleLeftSidebar}
          aria-label={leftSidebarOpen ? 'Hide zone filters' : 'Show zone filters'}
          aria-expanded={leftSidebarOpen}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-700/60 bg-[#142439] text-slate-300 transition-colors hover:bg-[#1A304A] hover:text-white focus-visible:outline-2 focus-visible:outline-[#407BFF]"
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="flex shrink-0 items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-[#142439] border border-[#35D6F2]/40">
            <Box className="h-4 w-4 text-[#35D6F2]" aria-hidden="true" />
          </div>
          <span className="text-sm font-bold tracking-wide text-white whitespace-nowrap">
            WARETRACE
          </span>
        </div>

        <span className="hidden h-4 w-px bg-slate-700/60 sm:inline-block" aria-hidden="true" />

        <label htmlFor="warehouse-selector" className="sr-only">
          Select Warehouse
        </label>
        <select
          id="warehouse-selector"
          value={selectedWarehouseId ?? ''}
          onChange={(e) => onSelectWarehouse(e.target.value)}
          disabled={warehouses.length === 0}
          className="hidden h-8 max-w-[175px] truncate rounded-md border border-slate-700/70 bg-[#142439] px-2.5 text-xs font-medium text-slate-100 focus-visible:outline-2 focus-visible:outline-[#407BFF] disabled:opacity-50 sm:block sm:max-w-[230px]"
        >
          {warehouses.length === 0 ? (
            <option value="">No warehouses loaded</option>
          ) : (
            warehouses.map((wh) => (
              <option key={wh.id} value={wh.id}>
                {wh.code} — {wh.name}
              </option>
            ))
          )}
        </select>
      </div>

      {/* Center: Demo / Live API segmented switcher + Connection readout */}
      <div className="flex shrink-0 items-center gap-3">
        <div
          role="group"
          aria-label="Data Source Mode"
          className="flex items-center rounded-md border border-slate-700/70 bg-[#091321] p-0.5"
        >
          <button
            type="button"
            onClick={() => onModeChange('demo')}
            aria-pressed={mode === 'demo'}
            className={`rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
              mode === 'demo'
                ? 'bg-[#FFB547] text-[#091321]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Demo
          </button>
          <button
            type="button"
            onClick={() => onModeChange('api')}
            aria-pressed={mode === 'api'}
            className={`rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
              mode === 'api'
                ? 'bg-[#407BFF] text-white'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Live API
          </button>
        </div>

        {/* Optional WebSocket toggle when Live API is active */}
        {mode === 'api' && (
          <button
            type="button"
            onClick={onToggleRealtime}
            aria-pressed={realtimeEnabled}
            title={
              realtimeConfigured
                ? 'Toggle optional native WebSocket sync'
                : 'VITE_WAREHOUSE_WS_URL is not configured (optional future endpoint)'
            }
            className={`hidden items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors md:inline-flex ${
              realtimeEnabled
                ? 'border-[#35D6F2]/60 bg-[#142439] text-[#35D6F2]'
                : 'border-slate-700/60 bg-[#091321] text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="h-3.5 w-3.5" aria-hidden="true" />
            <span>WS Sync: {realtimeEnabled ? 'On' : 'Off'}</span>
          </button>
        )}

        <span
          data-testid="connection-status"
          className={`hidden text-xs font-medium whitespace-nowrap lg:inline ${connection.toneClass}`}
        >
          {connection.label}
        </span>
      </div>

      {/* Right: Camera views + Quality + Right inspector toggle */}
      <div className="flex shrink-0 items-center gap-1.5">
        <div role="group" aria-label="Camera Views" className="hidden items-center gap-1 sm:flex">
          <button
            type="button"
            onClick={() => onCameraPreset('isometric')}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-700/60 bg-[#142439] px-2.5 text-xs font-medium text-slate-200 whitespace-nowrap transition-colors hover:border-[#35D6F2]/50 hover:text-white focus-visible:outline-2 focus-visible:outline-[#407BFF]"
          >
            <Compass className="h-3.5 w-3.5 text-[#35D6F2]" aria-hidden="true" />
            <span>Isometric</span>
          </button>
          <button
            type="button"
            onClick={() => onCameraPreset('top-down')}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-700/60 bg-[#142439] px-2.5 text-xs font-medium text-slate-200 whitespace-nowrap transition-colors hover:border-[#35D6F2]/50 hover:text-white focus-visible:outline-2 focus-visible:outline-[#407BFF]"
          >
            <Eye className="h-3.5 w-3.5 text-[#35D6F2]" aria-hidden="true" />
            <span>Top-Down</span>
          </button>
          <button
            type="button"
            onClick={() => onCameraPreset('reset')}
            aria-label="Reset camera"
            title="Reset camera"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-700/60 bg-[#142439] px-2.5 text-xs font-medium text-slate-200 whitespace-nowrap transition-colors hover:border-[#35D6F2]/50 hover:text-white focus-visible:outline-2 focus-visible:outline-[#407BFF]"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden xl:inline">Reset</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onToggleQuality}
          title={quality === 'high' ? 'Switch to Lite rendering mode' : 'Switch to High rendering mode'}
          aria-label={`Rendering quality: ${quality === 'high' ? 'High' : 'Lite'}`}
          className="hidden h-8 items-center gap-1.5 rounded-md border border-slate-700/60 bg-[#142439] px-2.5 text-xs font-medium text-slate-300 whitespace-nowrap transition-colors hover:text-white xl:inline-flex"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          <span>{quality === 'high' ? 'High' : 'Lite'}</span>
        </button>

        <button
          type="button"
          onClick={onToggleRightSidebar}
          aria-label={rightSidebarOpen ? 'Hide bin details panel' : 'Show bin details panel'}
          aria-expanded={rightSidebarOpen}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-700/60 bg-[#142439] text-slate-300 transition-colors hover:bg-[#1A304A] hover:text-white focus-visible:outline-2 focus-visible:outline-[#407BFF]"
        >
          <PanelRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
