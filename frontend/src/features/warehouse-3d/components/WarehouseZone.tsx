import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import type { HandlingUnitNote, NormalizedBin, NormalizedZone } from '../data/contracts';
import { UnassignedStagingPallet } from './ParcelMesh';
import { WarehouseBin } from './WarehouseBin';
import {
  WARETRACE_COLORS,
  ZONE_STYLE,
  createCautionStripeTexture,
  createSignTexture,
} from './warehouseMaterials';

interface WarehouseZoneProps {
  zone: NormalizedZone;
  selectedBinId: string | null;
  hoveredBinId: string | null;
  unassignedHandlingUnits: HandlingUnitNote[];
  onSelectBin: (bin: NormalizedBin) => void;
  onHoverBin: (bin: NormalizedBin | null) => void;
  enableShadows: boolean;
}

/**
 * Renders one warehouse zone:
 * - Distinct color-coded floor pad & perimeter border (`RECEIVING` cyan, `STORAGE` steel/green, `QUARANTINE` amber)
 * - Caution striping & industrial perimeter barrier fence for `QUARANTINE`
 * - Overhead procedural zone signage placard
 * - Interactive `WarehouseBin` children
 * - Unassigned handling units staged inside `RECEIVING` (e.g. `HU-0009`)
 */
export function WarehouseZone({
  zone,
  selectedBinId,
  hoveredBinId,
  unassignedHandlingUnits,
  onSelectBin,
  onHoverBin,
  enableShadows,
}: WarehouseZoneProps) {
  const { gl } = useThree();
  const maxAnisotropy = useMemo(() => Math.min(8, gl.capabilities.getMaxAnisotropy()), [gl]);

  const style = ZONE_STYLE[zone.kind];
  const { centerX, centerZ, width, depth, minX, maxX, minZ, maxZ } = zone.worldBounds;

  const signTexture = useMemo(
    () =>
      createSignTexture(
        `${zone.code} · ${zone.name.toUpperCase()}`,
        `${style.shortTag} ZONE · ${zone.totalBins} BINS`,
        style.accent,
        maxAnisotropy,
      ),
    [zone.code, zone.name, zone.totalBins, style.shortTag, style.accent, maxAnisotropy],
  );

  const cautionTexture = useMemo(() => {
    if (zone.kind !== 'QUARANTINE') return null;
    const tex = createCautionStripeTexture(maxAnisotropy);
    tex.repeat.set(8, 1);
    return tex;
  }, [zone.kind, maxAnisotropy]);

  useEffect(() => {
    return () => {
      signTexture.dispose();
      cautionTexture?.dispose();
    };
  }, [signTexture, cautionTexture]);

  const borderThickness = 0.16;

  // Quarantine perimeter barrier fence posts (leaving an open aisle entrance on the West/left side)
  const quarantineFencePosts = useMemo<[number, number][]>(() => {
    if (zone.kind !== 'QUARANTINE') return [];
    return [
      [minX, minZ],
      [centerX, minZ],
      [maxX, minZ],
      [maxX, centerZ],
      [maxX, maxZ],
      [centerX, maxZ],
      [minX, maxZ],
    ];
  }, [zone.kind, minX, maxX, minZ, maxZ, centerX, centerZ]);

  return (
    <group name={`zone-${zone.code}`}>
      {/* Zone floor pad (offset Y = 0.025m with polygonOffset to avoid Z-fighting) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[centerX, 0.025, centerZ]}
        receiveShadow={enableShadows}
      >
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial
          color={style.padFill}
          roughness={0.85}
          metalness={0.08}
          transparent
          opacity={0.78}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>

      {/* Perimeter floor border stripes */}
      <group position={[0, 0.03, 0]}>
        {/* North edge */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[centerX, 0, minZ + borderThickness / 2]}>
          <planeGeometry args={[width, borderThickness]} />
          {cautionTexture ? (
            <meshBasicMaterial map={cautionTexture} polygonOffset polygonOffsetFactor={-2} />
          ) : (
            <meshStandardMaterial
              color={style.accent}
              roughness={0.5}
              polygonOffset
              polygonOffsetFactor={-2}
            />
          )}
        </mesh>
        {/* South edge */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[centerX, 0, maxZ - borderThickness / 2]}>
          <planeGeometry args={[width, borderThickness]} />
          {cautionTexture ? (
            <meshBasicMaterial map={cautionTexture} polygonOffset polygonOffsetFactor={-2} />
          ) : (
            <meshStandardMaterial
              color={style.accent}
              roughness={0.5}
              polygonOffset
              polygonOffsetFactor={-2}
            />
          )}
        </mesh>
        {/* West edge */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[minX + borderThickness / 2, 0, centerZ]}>
          <planeGeometry args={[borderThickness, depth]} />
          <meshStandardMaterial
            color={style.accent}
            roughness={0.5}
            polygonOffset
            polygonOffsetFactor={-2}
          />
        </mesh>
        {/* East edge */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[maxX - borderThickness / 2, 0, centerZ]}>
          <planeGeometry args={[borderThickness, depth]} />
          <meshStandardMaterial
            color={style.accent}
            roughness={0.5}
            polygonOffset
            polygonOffsetFactor={-2}
          />
        </mesh>
      </group>

      {/* Quarantine safety barrier fence posts & rails */}
      {zone.kind === 'QUARANTINE' && (
        <group name="quarantine-enclosure">
          {quarantineFencePosts.map(([px, pz], idx) => (
            <mesh key={`qpost-${idx}`} position={[px, 0.55, pz]} castShadow={enableShadows}>
              <boxGeometry args={[0.1, 1.1, 0.1]} />
              <meshStandardMaterial color={style.accent} roughness={0.42} metalness={0.35} />
            </mesh>
          ))}
          {/* North rail */}
          <mesh position={[centerX, 0.92, minZ]}>
            <boxGeometry args={[width, 0.07, 0.06]} />
            <meshStandardMaterial color={style.accent} roughness={0.42} metalness={0.35} />
          </mesh>
          <mesh position={[centerX, 0.48, minZ]}>
            <boxGeometry args={[width, 0.06, 0.05]} />
            <meshStandardMaterial color={WARETRACE_COLORS.steelDark} roughness={0.5} metalness={0.6} />
          </mesh>
          {/* South rail */}
          <mesh position={[centerX, 0.92, maxZ]}>
            <boxGeometry args={[width, 0.07, 0.06]} />
            <meshStandardMaterial color={style.accent} roughness={0.42} metalness={0.35} />
          </mesh>
          <mesh position={[centerX, 0.48, maxZ]}>
            <boxGeometry args={[width, 0.06, 0.05]} />
            <meshStandardMaterial color={WARETRACE_COLORS.steelDark} roughness={0.5} metalness={0.6} />
          </mesh>
          {/* East rail */}
          <mesh position={[maxX, 0.92, centerZ]}>
            <boxGeometry args={[0.06, 0.07, depth]} />
            <meshStandardMaterial color={style.accent} roughness={0.42} metalness={0.35} />
          </mesh>
          <mesh position={[maxX, 0.48, centerZ]}>
            <boxGeometry args={[0.05, 0.06, depth]} />
            <meshStandardMaterial color={WARETRACE_COLORS.steelDark} roughness={0.5} metalness={0.6} />
          </mesh>
        </group>
      )}

      {/* Overhead Zone Signage Stand (positioned cleanly along North edge of each zone) */}
      <group position={[centerX, 0, minZ - 0.18]}>
        {/* Twin steel sign support masts */}
        <mesh position={[-1.45, 2.35, 0]}>
          <cylinderGeometry args={[0.045, 0.05, 4.7, 10]} />
          <meshStandardMaterial color={WARETRACE_COLORS.steelFrame} roughness={0.4} metalness={0.7} />
        </mesh>
        <mesh position={[1.45, 2.35, 0]}>
          <cylinderGeometry args={[0.045, 0.05, 4.7, 10]} />
          <meshStandardMaterial color={WARETRACE_COLORS.steelFrame} roughness={0.4} metalness={0.7} />
        </mesh>
        {/* Double-sided overhead zone placard */}
        <mesh position={[0, 4.65, 0]}>
          <boxGeometry args={[3.7, 1.05, 0.08]} />
          <meshStandardMaterial color="#0D1B2E" roughness={0.5} metalness={0.4} />
        </mesh>
        <mesh position={[0, 4.65, 0.045]}>
          <planeGeometry args={[3.6, 0.98]} />
          <meshBasicMaterial map={signTexture} />
        </mesh>
        <mesh position={[0, 4.65, -0.045]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[3.6, 0.98]} />
          <meshBasicMaterial map={signTexture} />
        </mesh>
      </group>

      {/* Floor zone code stencil facing the south corridor for top-down legibility */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[centerX, 0.032, maxZ + 0.62]}
      >
        <planeGeometry args={[3.1, 0.85]} />
        <meshBasicMaterial map={signTexture} />
      </mesh>

      {/* Interactive Bins */}
      {zone.bins.map((bin) => (
        <WarehouseBin
          key={bin.id}
          bin={bin}
          rotationY={zone.transform.rotationY}
          isSelected={bin.id === selectedBinId}
          isHovered={bin.id === hoveredBinId}
          onSelect={onSelectBin}
          onHover={onHoverBin}
          enableShadows={enableShadows}
        />
      ))}

      {/* Unassigned inbound handling units staged in Receiving (e.g., HU-0009, qty 2) */}
      {zone.kind === 'RECEIVING' &&
        unassignedHandlingUnits.map((hu, idx) => (
          <UnassignedStagingPallet
            key={hu.id}
            handlingUnit={hu}
            position={[centerX, 0.03, maxZ - 1.05 - idx * 1.6]}
            enableShadows={enableShadows}
          />
        ))}
    </group>
  );
}
