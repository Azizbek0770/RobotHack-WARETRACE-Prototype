import { useEffect, useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { type ThreeEvent, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { NormalizedBin } from '../data/contracts';
import { ParcelMesh } from './ParcelMesh';
import { WarehouseRack, getShelfLevelsForZoneKind } from './WarehouseRack';
import { WARETRACE_COLORS } from './warehouseMaterials';

interface WarehouseBinProps {
  bin: NormalizedBin;
  rotationY: number;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: (bin: NormalizedBin) => void;
  onHover: (bin: NormalizedBin | null) => void;
  enableShadows: boolean;
}

/**
 * Interactive 3D storage bin unit combining:
 * - Multi-part industrial rack (`WarehouseRack`)
 * - Quantity-driven pallets & cardboard parcels (`ParcelMesh`)
 * - Selection luminous electric-blue edge frame & floor highlight
 * - Clear red warning indicator when `bin.isAccessible === false`
 * - Drag-safe pointer raycasting so orbiting never triggers accidental selection
 */
export function WarehouseBin({
  bin,
  rotationY,
  isSelected,
  isHovered,
  onSelect,
  onHover,
  enableShadows,
}: WarehouseBinProps) {
  const { invalidate } = useThree();
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  const { width, depth, height } = bin.bayDimensions;
  const shelfLevels = useMemo(() => getShelfLevelsForZoneKind(bin.zoneKind), [bin.zoneKind]);

  // Crisp 3D wireframe bounding frame for selection / hover / inaccessible visual signaling
  const outlineGeometry = useMemo(() => {
    const box = new THREE.BoxGeometry(width + 0.14, height + 0.14, depth + 0.14);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    return edges;
  }, [width, height, depth]);

  useEffect(() => {
    return () => {
      outlineGeometry.dispose();
    };
  }, [outlineGeometry]);

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    document.body.style.cursor = 'pointer';
    onHover(bin);
    invalidate();
  };

  const handlePointerOut = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    document.body.style.cursor = 'auto';
    onHover(null);
    invalidate();
  };

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    pointerDownPos.current = { x: event.clientX, y: event.clientY };
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    // Ignore drags that belong to OrbitControls rotation/panning
    if (pointerDownPos.current) {
      const dx = event.clientX - pointerDownPos.current.x;
      const dy = event.clientY - pointerDownPos.current.y;
      if (Math.hypot(dx, dy) > 6) {
        return;
      }
    }
    onSelect(bin);
    invalidate();
  };

  const showOutline = isSelected || isHovered || !bin.isAccessible;
  const outlineColor = isSelected
    ? WARETRACE_COLORS.selected
    : !bin.isAccessible
      ? WARETRACE_COLORS.inaccessible
      : WARETRACE_COLORS.hover;

  return (
    <group
      name={`bin-${bin.code}`}
      position={[bin.worldPosition.x, bin.worldPosition.y, bin.worldPosition.z]}
      rotation={[0, rotationY, 0]}
    >
      {/* Rack structure */}
      <WarehouseRack
        code={bin.code}
        zoneKind={bin.zoneKind}
        width={width}
        depth={depth}
        height={height}
        isAccessible={bin.isAccessible}
        isSelected={isSelected}
        isHovered={isHovered}
        enableShadows={enableShadows}
      />

      {/* Pallets & parcels driven by expected_qty (or quarantined HU) */}
      <ParcelMesh bin={bin} shelfLevelsY={shelfLevels} enableShadows={enableShadows} />

      {/* Floor highlight pad when selected, hovered, or inaccessible */}
      {showOutline && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.036, 0]}>
          <planeGeometry args={[width + 0.24, depth + 0.24]} />
          <meshBasicMaterial
            color={outlineColor}
            transparent
            opacity={isSelected ? 0.28 : !bin.isAccessible ? 0.22 : 0.14}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>
      )}

      {/* Luminous 3D wireframe edge frame for selected / hovered / inaccessible bin */}
      {showOutline && (
        <lineSegments geometry={outlineGeometry} position={[0, height / 2 + 0.04, 0]}>
          <lineBasicMaterial color={outlineColor} />
        </lineSegments>
      )}

      {/* Explicit red physical barrier bar & beacon for inaccessible bins */}
      {!bin.isAccessible && (
        <group name={`inaccessible-indicator-${bin.code}`}>
          <mesh position={[0, height + 0.14, 0]}>
            <boxGeometry args={[width * 0.72, 0.1, 0.1]} />
            <meshStandardMaterial
              color={WARETRACE_COLORS.inaccessible}
              emissive={WARETRACE_COLORS.inaccessible}
              emissiveIntensity={0.65}
              roughness={0.35}
            />
          </mesh>
          <mesh position={[0, 0.95, depth / 2 + 0.04]} rotation={[0, 0, 0.22]}>
            <boxGeometry args={[width - 0.18, 0.08, 0.04]} />
            <meshStandardMaterial color={WARETRACE_COLORS.inaccessible} roughness={0.4} />
          </mesh>
        </group>
      )}

      {/* Simplified invisible hit-proxy mesh for crisp, fast pointer raycasting */}
      <mesh
        position={[0, height / 2 + 0.04, 0]}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
      >
        <boxGeometry args={[width + 0.12, height + 0.12, depth + 0.12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Lightweight hover tooltip (shown strictly on hover to keep scene uncluttered) */}
      {isHovered && (
        <Html
          position={[0, height + 0.55, 0]}
          center
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          <div className="bg-[#091321]/95 border border-[#35D6F2]/70 rounded px-2.5 py-1 shadow-lg whitespace-nowrap">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono font-semibold text-white">{bin.code}</span>
              <span className="text-slate-400">·</span>
              <span className="text-[#35D6F2] font-mono tabular-nums">
                {bin.totalExpectedUnits} units
              </span>
              {!bin.isAccessible && (
                <>
                  <span className="text-slate-400">·</span>
                  <span className="text-red-400 font-medium">Inaccessible</span>
                </>
              )}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}
