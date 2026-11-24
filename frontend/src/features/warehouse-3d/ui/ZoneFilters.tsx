import { useMemo } from 'react';
import { Search, X } from 'lucide-react';
import type { NormalizedBin, WarehouseSnapshot, ZoneKind } from '../data/contracts';
import { WAREHOUSE_VISUALIZATION_ASSUMPTIONS } from '../data/warehouseCoordinates';
import { searchBins } from '../data/warehouseMapper';
import { WARETRACE_COLORS, ZONE_STYLE } from '../components/warehouseMaterials';

interface ZoneFiltersProps {
  snapshot: WarehouseSnapshot | null;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  visibleZoneKinds: Record<ZoneKind, boolean>;
  onToggleZoneKind: (kind: ZoneKind) => void;
  selectedBinId: string | null;
  onSelectBinFromList: (bin: NormalizedBin) => void;
}

const ZONE_ORDER: ZoneKind[] = ['RECEIVING', 'STORAGE', 'QUARANTINE'];

export function ZoneFilters({
  snapshot,
  searchQuery,
  onSearchQueryChange,
  visibleZoneKinds,
  onToggleZoneKind,
  selectedBinId,
  onSelectBinFromList,
}: ZoneFiltersProps) {
  const matchingBins = useMemo(
    () => searchBins(snapshot, searchQuery, visibleZoneKinds),
    [snapshot, searchQuery, visibleZoneKinds],
  );

  const binCountByKind = useMemo(() => {
    const counts: Record<ZoneKind, number> = { RECEIVING: 0, STORAGE: 0, QUARANTINE: 0 };
    if (!snapshot) return counts;
    for (const zone of snapshot.zones) {
      counts[zone.kind] += zone.totalBins;
    }
    return counts;
  }, [snapshot]);

  return (
    <aside
      aria-label="Zone filters and bin search"
      className="wt-scroll flex h-full w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-700/45 bg-[#0D1B2E] p-4"
    >
      {/* Search by bin code or SKU */}
      <div>
        <label
          htmlFor="bin-search-input"
          className="block text-xs font-semibold text-slate-200"
        >
          Find Bin
        </label>
        <div className="relative mt-2">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            id="bin-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="Code (e.g. A-01, QA-01)…"
            className="h-9 w-full rounded-md border border-slate-700/70 bg-[#091321] pr-8 pl-8 text-xs text-slate-100 placeholder:text-slate-500 focus:border-[#407BFF] focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchQueryChange('')}
              aria-label="Clear bin search"
              className="absolute top-1/2 right-2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Matching Bins Quick List */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Configured Bins</span>
          <span className="font-mono tabular-nums">{matchingBins.length}</span>
        </div>

        <div
          className="wt-scroll mt-2 max-h-52 space-y-1 overflow-y-auto pr-1"
          role="list"
          aria-label="Storage bins"
        >
          {!snapshot ? (
            <p className="py-2 text-xs text-slate-500">No active warehouse snapshot.</p>
          ) : matchingBins.length === 0 ? (
            <p className="py-2 text-xs text-slate-500">No bins match your filter.</p>
          ) : (
            matchingBins.map((bin) => {
              const isSelected = bin.id === selectedBinId;
              const style = ZONE_STYLE[bin.zoneKind];
              return (
                <button
                  key={bin.id}
                  type="button"
                  onClick={() => onSelectBinFromList(bin)}
                  className={`flex w-full items-center justify-between rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors ${
                    isSelected
                      ? 'border-[#407BFF] bg-[#162D4D] text-white'
                      : 'border-transparent bg-[#112238]/60 text-slate-200 hover:border-slate-700 hover:bg-[#142439]'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-xs"
                      style={{
                        backgroundColor: bin.isAccessible
                          ? style.accent
                          : WARETRACE_COLORS.inaccessible,
                      }}
                      aria-hidden="true"
                    />
                    <span className="font-mono font-medium">{bin.code}</span>
                    <span className="truncate text-slate-400">{bin.zoneCode}</span>
                  </span>
                  <span className="ml-2 shrink-0 font-mono text-slate-300 tabular-nums">
                    {bin.totalExpectedUnits}u
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Zone Visibility Controls */}
      <div className="mt-5 border-t border-slate-700/45 pt-4">
        <h2 className="text-xs font-semibold text-slate-200">Zone Visibility</h2>
        <div className="mt-2.5 space-y-2">
          {ZONE_ORDER.map((kind) => {
            const style = ZONE_STYLE[kind];
            const checked = visibleZoneKinds[kind];
            return (
              <label
                key={kind}
                className="flex cursor-pointer items-center justify-between rounded-md px-1 py-1 text-xs text-slate-200 hover:bg-[#142439]/60"
              >
                <span className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleZoneKind(kind)}
                    className="h-3.5 w-3.5 rounded border-slate-600 bg-[#091321] accent-[#407BFF]"
                  />
                  <span
                    className="h-2.5 w-2.5 rounded-xs"
                    style={{ backgroundColor: style.accent }}
                    aria-hidden="true"
                  />
                  <span>{style.label}</span>
                </span>
                <span className="font-mono text-slate-400 tabular-nums">
                  {binCountByKind[kind]}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Zone & State Legend */}
      <div className="mt-5 border-t border-slate-700/45 pt-4">
        <h2 className="text-xs font-semibold text-slate-200">Legend</h2>
        <dl className="mt-2.5 space-y-2 text-xs text-slate-300">
          <div className="flex items-center gap-2.5">
            <dt
              className="h-2.5 w-2.5 shrink-0 rounded-xs"
              style={{ backgroundColor: WARETRACE_COLORS.receiving }}
            />
            <dd>Receiving zone (RECV)</dd>
          </div>
          <div className="flex items-center gap-2.5">
            <dt
              className="h-2.5 w-2.5 shrink-0 rounded-xs"
              style={{ backgroundColor: WARETRACE_COLORS.storage }}
            />
            <dd>Storage racks (ST-A)</dd>
          </div>
          <div className="flex items-center gap-2.5">
            <dt
              className="h-2.5 w-2.5 shrink-0 rounded-xs"
              style={{ backgroundColor: WARETRACE_COLORS.quarantine }}
            />
            <dd>Quarantine enclosure (QUAR)</dd>
          </div>
          <div className="flex items-center gap-2.5">
            <dt
              className="h-2.5 w-2.5 shrink-0 rounded-xs"
              style={{ backgroundColor: WARETRACE_COLORS.selected }}
            />
            <dd>Selected bin highlight</dd>
          </div>
          <div className="flex items-center gap-2.5">
            <dt
              className="h-2.5 w-2.5 shrink-0 rounded-xs"
              style={{ backgroundColor: WARETRACE_COLORS.inaccessible }}
            />
            <dd>Inaccessible bin</dd>
          </div>
        </dl>
      </div>

      {/* Visualization Assumptions Disclosure */}
      <div className="mt-auto border-t border-slate-700/45 pt-4">
        <p className="text-[11px] leading-relaxed text-slate-400">
          {WAREHOUSE_VISUALIZATION_ASSUMPTIONS.label}. Floor{' '}
          {WAREHOUSE_VISUALIZATION_ASSUMPTIONS.floorWidthMeters}m ×{' '}
          {WAREHOUSE_VISUALIZATION_ASSUMPTIONS.floorDepthMeters}m, rack height{' '}
          {WAREHOUSE_VISUALIZATION_ASSUMPTIONS.rackHeightMeters}m.
        </p>
      </div>
    </aside>
  );
}
