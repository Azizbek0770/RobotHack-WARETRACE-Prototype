import { Crosshair, MousePointerClick } from 'lucide-react';
import type { NormalizedBin } from '../data/contracts';

interface WarehouseControlsProps {
  selectedBin: NormalizedBin | null;
  hoveredBin: NormalizedBin | null;
  onFocusSelectedBin: () => void;
}

/**
 * Unobtrusive corner navigation hints & active selection focus button inside the 3D viewport.
 * Avoids CSS backdrop-blur over WebGL canvases for smooth performance on all laptops.
 */
export function WarehouseControls({
  selectedBin,
  hoveredBin,
  onFocusSelectedBin,
}: WarehouseControlsProps) {
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex flex-wrap items-end justify-between gap-2">
      {/* Subtle interaction hint */}
      <div className="flex items-center gap-2 rounded-md border border-slate-700/60 bg-[#091321]/90 px-3 py-1.5 text-xs text-slate-300">
        <MousePointerClick className="h-3.5 w-3.5 shrink-0 text-[#35D6F2]" aria-hidden="true" />
        <span>
          Drag to orbit · Scroll to zoom · Right-drag to pan · Click bin to inspect
        </span>
      </div>

      {/* Contextual hover readout or Focus Selected action */}
      <div className="pointer-events-auto flex items-center gap-2">
        {hoveredBin && hoveredBin.id !== selectedBin?.id && (
          <div className="rounded-md border border-slate-700/60 bg-[#091321]/92 px-2.5 py-1.5 text-xs text-slate-200">
            <span className="font-mono font-semibold text-[#35D6F2]">{hoveredBin.code}</span>
            <span className="mx-1.5 text-slate-500">·</span>
            <span className="text-slate-300">{hoveredBin.zoneCode}</span>
            <span className="mx-1.5 text-slate-500">·</span>
            <span className="font-mono tabular-nums">{hoveredBin.totalExpectedUnits} units</span>
          </div>
        )}

        {selectedBin && (
          <button
            type="button"
            onClick={onFocusSelectedBin}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#407BFF]/60 bg-[#142439] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#1C3352] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#407BFF]"
          >
            <Crosshair className="h-3.5 w-3.5 text-[#35D6F2]" aria-hidden="true" />
            <span>Zoom to {selectedBin.code}</span>
          </button>
        )}
      </div>
    </div>
  );
}
