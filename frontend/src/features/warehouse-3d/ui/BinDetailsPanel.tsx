import { AlertCircle, CheckCircle2, Crosshair, Package, X } from 'lucide-react';
import type { NormalizedBin, WarehouseSnapshot } from '../data/contracts';
import {
  formatCapacityLabel,
  formatUtilizationLabel,
} from '../data/warehouseMapper';
import { ZONE_STYLE } from '../components/warehouseMaterials';

interface BinDetailsPanelProps {
  snapshot: WarehouseSnapshot | null;
  selectedBin: NormalizedBin | null;
  onFocusBin: (bin: NormalizedBin) => void;
  onClearSelection: () => void;
}

export function BinDetailsPanel({
  snapshot,
  selectedBin,
  onFocusBin,
  onClearSelection,
}: BinDetailsPanelProps) {
  if (!selectedBin) {
    const unassignedHUs = (snapshot?.handlingUnits ?? []).filter((hu) => hu.binId === null);
    const quarantinedHUs = (snapshot?.handlingUnits ?? []).filter(
      (hu) => hu.status === 'QUARANTINED',
    );

    return (
      <aside
        aria-label="Bin details inspector"
        className="wt-scroll flex h-full w-80 shrink-0 flex-col overflow-y-auto border-l border-slate-700/45 bg-[#0D1B2E] p-4"
      >
        <h2 className="text-sm font-semibold text-white">Bin Inspector</h2>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          Select any storage bin in the 3D warehouse or from the left bin directory to inspect
          expected SKU inventory, unit capacity, and accessibility status.
        </p>

        {snapshot && (
          <div className="mt-5 space-y-4 border-t border-slate-700/45 pt-4">
            <div>
              <h3 className="text-xs font-semibold text-slate-200">Active Warehouse</h3>
              <dl className="mt-2 space-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">Code</dt>
                  <dd className="font-mono text-slate-100">{snapshot.warehouse.code}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">Zones</dt>
                  <dd className="font-mono text-slate-100 tabular-nums">
                    {snapshot.stats.totalZones}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">Configured bins</dt>
                  <dd className="font-mono text-slate-100 tabular-nums">
                    {snapshot.stats.totalBins}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">Expected stored units</dt>
                  <dd className="font-mono text-[#35D6F2] tabular-nums">
                    {snapshot.stats.expectedStoredUnits}
                  </dd>
                </div>
              </dl>
            </div>

            {(unassignedHUs.length > 0 || quarantinedHUs.length > 0) && (
              <div className="border-t border-slate-700/45 pt-4">
                <h3 className="text-xs font-semibold text-slate-200">
                  Non-Stock Handling Units
                </h3>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  Tracked separately and excluded from regular expected stored stock.
                </p>
                <div className="mt-2.5 space-y-2">
                  {snapshot.handlingUnits.map((hu) => (
                    <div
                      key={hu.id}
                      className="rounded-md border border-slate-700/60 bg-[#091321] p-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-semibold text-slate-100">{hu.code}</span>
                        <span
                          className={`font-mono text-[11px] font-medium ${
                            hu.status === 'QUARANTINED' ? 'text-[#FFB547]' : 'text-[#35D6F2]'
                          }`}
                        >
                          {hu.status} · Qty {hu.quantity}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Location: {hu.binCode ? `Bin ${hu.binCode}` : `Unassigned (${hu.zoneCode})`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </aside>
    );
  }

  const zoneStyle = ZONE_STYLE[selectedBin.zoneKind];
  const utilizationBarWidth =
    selectedBin.capacityUtilizationPct !== null
      ? Math.min(100, Math.max(0, selectedBin.capacityUtilizationPct))
      : 0;

  return (
    <aside
      aria-label={`Details for bin ${selectedBin.code}`}
      data-testid="bin-details-panel"
      className="wt-scroll flex h-full w-80 shrink-0 flex-col overflow-y-auto border-l border-slate-700/45 bg-[#0D1B2E] p-4"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-mono text-base font-bold text-white">
            BIN {selectedBin.code}
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            {selectedBin.warehouseCode} · {selectedBin.zoneName}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onFocusBin(selectedBin)}
            title="Focus camera on this bin"
            aria-label={`Focus camera on bin ${selectedBin.code}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700/60 bg-[#142439] text-[#35D6F2] transition-colors hover:border-[#407BFF] hover:text-white"
          >
            <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onClearSelection}
            title="Close bin details"
            aria-label="Close bin details"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700/60 bg-[#142439] text-slate-300 transition-colors hover:text-white"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Structured Bin Identity & Properties */}
      <dl className="mt-4 space-y-2 border-t border-slate-700/45 pt-4 text-xs">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-slate-400">Warehouse</dt>
          <dd className="font-mono font-medium text-slate-100">{selectedBin.warehouseCode}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-slate-400">Zone</dt>
          <dd className="font-mono font-medium text-slate-100">{selectedBin.zoneCode}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-slate-400">Type</dt>
          <dd className="font-mono font-medium" style={{ color: zoneStyle.accent }}>
            {selectedBin.zoneKind}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-slate-400">Zone-local grid</dt>
          <dd className="font-mono text-slate-200 tabular-nums">
            ({selectedBin.gridX}, {selectedBin.gridY})
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-slate-400">Accessible</dt>
          <dd className="inline-flex items-center gap-1.5 font-medium">
            {selectedBin.isAccessible ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                <span className="text-emerald-300">Yes</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-3.5 w-3.5 text-red-400" aria-hidden="true" />
                <span className="text-red-400">No</span>
              </>
            )}
          </dd>
        </div>
      </dl>

      {/* Unit-Based Capacity Utilization */}
      <div className="mt-4 border-t border-slate-700/45 pt-4">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-200">Unit Capacity</span>
          <span className="font-mono text-slate-300 tabular-nums">
            {formatCapacityLabel(selectedBin.capacityUnits)}
          </span>
        </div>

        <div className="mt-2 flex items-baseline justify-between text-xs">
          <span className="text-slate-400">Expected quantity</span>
          <span className="font-mono text-sm font-semibold text-white tabular-nums">
            {selectedBin.totalExpectedUnits}
          </span>
        </div>

        <div className="mt-1.5 flex items-baseline justify-between text-xs">
          <span className="text-slate-400">Capacity utilization</span>
          <span className="font-mono font-medium text-[#35D6F2] tabular-nums">
            {formatUtilizationLabel(selectedBin.capacityUtilizationPct)}
          </span>
        </div>

        {selectedBin.capacityUtilizationPct !== null && (
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#091321]">
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{
                width: `${utilizationBarWidth}%`,
                backgroundColor:
                  selectedBin.capacityUtilizationPct > 100
                    ? '#EF4444'
                    : selectedBin.capacityUtilizationPct >= 80
                      ? '#FFB547'
                      : '#407BFF',
              }}
            />
          </div>
        )}
      </div>

      {/* Expected Inventory Rows (supports 0, 1, or multiple SKUs) */}
      <div className="mt-4 border-t border-slate-700/45 pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-200">Expected Inventory</h3>
          <span className="font-mono text-[11px] text-slate-400 tabular-nums">
            {selectedBin.inventoryLines.length}{' '}
            {selectedBin.inventoryLines.length === 1 ? 'SKU' : 'SKUs'}
          </span>
        </div>

        {selectedBin.inventoryLines.length === 0 ? (
          <div className="mt-2.5 rounded-md border border-slate-700/50 bg-[#091321] p-3 text-xs text-slate-400">
            <div className="flex items-center gap-2 text-slate-300">
              <Package className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
              <span>No expected stored inventory in this bin.</span>
            </div>
          </div>
        ) : (
          <div className="mt-2.5 space-y-2">
            {selectedBin.inventoryLines.map((line) => (
              <div
                key={line.id}
                className="rounded-md border border-slate-700/60 bg-[#091321] p-3 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-[#35D6F2]">
                    {line.skuCode}
                  </span>
                  <span className="font-mono font-semibold text-white tabular-nums">
                    Qty {line.expectedQty}
                  </span>
                </div>
                <p className="mt-1 font-medium text-slate-100">{line.skuName}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Source: {line.source} · Rev {line.revision}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Non-stock Handling Units assigned to this bin (e.g., HU-0010 at QA-01) */}
      {selectedBin.handlingUnits.length > 0 && (
        <div className="mt-4 border-t border-slate-700/45 pt-4">
          <h3 className="text-xs font-semibold text-[#FFB547]">
            Non-Stock Handling Units
          </h3>
          <div className="mt-2 space-y-2">
            {selectedBin.handlingUnits.map((hu) => (
              <div
                key={hu.id}
                className="rounded-md border border-[#FFB547]/40 bg-[#1B1814] p-3 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-white">{hu.code}</span>
                  <span className="font-mono text-[#FFB547] tabular-nums">
                    {hu.status} · Qty {hu.quantity}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                  {hu.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stable Backend UUID Footer */}
      <div className="mt-auto border-t border-slate-700/45 pt-3">
        <p className="truncate font-mono text-[10px] text-slate-500" title={selectedBin.id}>
          UUID: {selectedBin.id}
        </p>
      </div>
    </aside>
  );
}
