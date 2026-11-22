import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import type { ZoneKind } from '../data/contracts';
import {
  WARETRACE_COLORS,
  ZONE_STYLE,
  createBinPlateTexture,
} from './warehouseMaterials';

interface WarehouseRackProps {
  code: string;
  zoneKind: ZoneKind;
  width: number;
  depth: number;
  height: number;
  isAccessible: boolean;
  isSelected: boolean;
  isHovered: boolean;
  enableShadows: boolean;
}

/**
 * Returns the Y heights (meters) of load-bearing decks for a given rack type.
 */
export function getShelfLevelsForZoneKind(zoneKind: ZoneKind): number[] {
  if (zoneKind === 'STORAGE') {
    return [0.16, 1.56, 2.94];
  }
  if (zoneKind === 'QUARANTINE') {
    return [0.16, 1.48];
  }
  // RECEIVING uses floor-level pallet staging pads
  return [0.04];
}

/**
 * Composite multi-part industrial racking & staging structures:
 * - STORAGE: Heavy-duty 3-tier steel selective pallet rack (uprights, footplates, diagonal braces,
 *   steel-green load beams, wire mesh decking, bin identification plate)
 * - RECEIVING: Cyan-accented inbound staging bay with steel wheel-stop bumpers, staging desk pillar, and floor markings
 * - QUARANTINE: Amber-accented 2-tier quarantine inspection rack with caution corner posts
 */
export function WarehouseRack({
  code,
  zoneKind,
  width,
  depth,
  height,
  isAccessible,
  isSelected,
  isHovered,
  enableShadows,
}: WarehouseRackProps) {
  const { gl } = useThree();
  const maxAnisotropy = useMemo(() => Math.min(8, gl.capabilities.getMaxAnisotropy()), [gl]);

  const accentColor = !isAccessible
    ? WARETRACE_COLORS.inaccessible
    : isSelected
      ? WARETRACE_COLORS.selected
      : isHovered
        ? WARETRACE_COLORS.hover
        : ZONE_STYLE[zoneKind].accent;

  const plateTexture = useMemo(
    () => createBinPlateTexture(code, accentColor, maxAnisotropy),
    [code, accentColor, maxAnisotropy],
  );

  useEffect(() => {
    return () => {
      plateTexture.dispose();
    };
  }, [plateTexture]);

  const halfW = width / 2;
  const halfD = depth / 2;
  const shelfLevels = useMemo(() => getShelfLevelsForZoneKind(zoneKind), [zoneKind]);

  // RECEIVING: Floor-level staging bay with steel bumper curbs and corner stanchions
  if (zoneKind === 'RECEIVING') {
    return (
      <group name={`rack-${code}`}>
        {/* Painted bay deck mat */}
        <mesh position={[0, 0.032, 0]} receiveShadow={enableShadows}>
          <boxGeometry args={[width - 0.08, 0.025, depth - 0.08]} />
          <meshStandardMaterial color="#142B3E" roughness={0.78} metalness={0.14} />
        </mesh>

        {/* Cyan steel perimeter wheel-stop rails */}
        <mesh position={[0, 0.075, -halfD + 0.06]} castShadow={enableShadows}>
          <boxGeometry args={[width, 0.11, 0.08]} />
          <meshStandardMaterial color={accentColor} roughness={0.38} metalness={0.55} />
        </mesh>
        <mesh position={[-halfW + 0.06, 0.075, 0]} castShadow={enableShadows}>
          <boxGeometry args={[0.08, 0.11, depth - 0.12]} />
          <meshStandardMaterial color={WARETRACE_COLORS.steelFrame} roughness={0.42} metalness={0.68} />
        </mesh>
        <mesh position={[halfW - 0.06, 0.075, 0]} castShadow={enableShadows}>
          <boxGeometry args={[0.08, 0.11, depth - 0.12]} />
          <meshStandardMaterial color={WARETRACE_COLORS.steelFrame} roughness={0.42} metalness={0.68} />
        </mesh>

        {/* Rear upright staging sign gantry */}
        {[-halfW + 0.1, halfW - 0.1].map((px, i) => (
          <group key={i} position={[px, 0, -halfD + 0.1]}>
            <mesh position={[0, height / 2, 0]} castShadow={enableShadows}>
              <boxGeometry args={[0.09, height, 0.09]} />
              <meshStandardMaterial color={WARETRACE_COLORS.steelFrame} roughness={0.36} metalness={0.72} />
            </mesh>
            <mesh position={[0, 0.02, 0]}>
              <boxGeometry args={[0.18, 0.04, 0.18]} />
              <meshStandardMaterial color={WARETRACE_COLORS.steelDark} roughness={0.5} metalness={0.65} />
            </mesh>
          </group>
        ))}

        {/* Top crossbar & identification plate */}
        <mesh position={[0, height - 0.06, -halfD + 0.1]} castShadow={enableShadows}>
          <boxGeometry args={[width - 0.1, 0.09, 0.09]} />
          <meshStandardMaterial color={accentColor} roughness={0.38} metalness={0.52} />
        </mesh>
        <mesh position={[0, height - 0.06, -halfD + 0.16]}>
          <planeGeometry args={[0.82, 0.26]} />
          <meshBasicMaterial map={plateTexture} />
        </mesh>
      </group>
    );
  }

  // STORAGE & QUARANTINE: Full composite steel pallet rack bay
  const postPositions: [number, number][] = [
    [-halfW + 0.08, -halfD + 0.08],
    [halfW - 0.08, -halfD + 0.08],
    [-halfW + 0.08, halfD - 0.08],
    [halfW - 0.08, halfD - 0.08],
  ];

  const beamColor = !isAccessible
    ? WARETRACE_COLORS.inaccessible
    : zoneKind === 'QUARANTINE'
      ? WARETRACE_COLORS.quarantine
      : WARETRACE_COLORS.storage;

  return (
    <group name={`rack-${code}`}>
      {/* 4 vertical galvanized steel uprights + bolted floor baseplates */}
      {postPositions.map(([px, pz], idx) => (
        <group key={`post-${idx}`} position={[px, 0, pz]}>
          {/* Floor anchor footplate */}
          <mesh position={[0, 0.02, 0]}>
            <boxGeometry args={[0.18, 0.04, 0.18]} />
            <meshStandardMaterial color={WARETRACE_COLORS.steelDark} roughness={0.5} metalness={0.7} />
          </mesh>
          {/* Main upright steel column */}
          <mesh position={[0, height / 2, 0]} castShadow={enableShadows} receiveShadow={enableShadows}>
            <boxGeometry args={[0.09, height, 0.09]} />
            <meshStandardMaterial color={WARETRACE_COLORS.steelFrame} roughness={0.36} metalness={0.74} />
          </mesh>
          {/* Column guard bumper at base */}
          <mesh position={[0, 0.18, 0]}>
            <boxGeometry args={[0.115, 0.32, 0.115]} />
            <meshStandardMaterial
              color={zoneKind === 'QUARANTINE' ? WARETRACE_COLORS.quarantine : '#D69E2E'}
              roughness={0.45}
              metalness={0.28}
            />
          </mesh>
        </group>
      ))}

      {/* Side frame horizontal struts & diagonal cross-bracing */}
      {[-halfW + 0.08, halfW - 0.08].map((sx, sideIdx) => (
        <group key={`side-brace-${sideIdx}`} position={[sx, 0, 0]}>
          {/* Top & mid horizontal end ties */}
          {[0.65, height - 0.35].map((by, bi) => (
            <mesh key={bi} position={[0, by, 0]}>
              <boxGeometry args={[0.045, 0.05, depth - 0.2]} />
              <meshStandardMaterial color={WARETRACE_COLORS.steelDark} roughness={0.42} metalness={0.7} />
            </mesh>
          ))}
          {/* Diagonal cross brace */}
          <mesh position={[0, height * 0.48, 0]} rotation={[Math.atan2(height * 0.55, depth - 0.24), 0, 0]}>
            <boxGeometry args={[0.038, 0.045, Math.hypot(depth - 0.24, height * 0.55)]} />
            <meshStandardMaterial color={WARETRACE_COLORS.steelDark} roughness={0.44} metalness={0.7} />
          </mesh>
        </group>
      ))}

      {/* Multi-tier horizontal load beams + wire mesh decking */}
      {shelfLevels.map((levelY, tierIdx) => (
        <group key={`tier-${tierIdx}`} position={[0, levelY, 0]}>
          {/* Front horizontal load beam */}
          <mesh position={[0, -0.04, halfD - 0.08]} castShadow={enableShadows} receiveShadow={enableShadows}>
            <boxGeometry args={[width - 0.1, 0.1, 0.075]} />
            <meshStandardMaterial color={beamColor} roughness={0.42} metalness={0.48} />
          </mesh>
          {/* Back horizontal load beam */}
          <mesh position={[0, -0.04, -halfD + 0.08]} castShadow={enableShadows} receiveShadow={enableShadows}>
            <boxGeometry args={[width - 0.1, 0.1, 0.075]} />
            <meshStandardMaterial color={beamColor} roughness={0.42} metalness={0.48} />
          </mesh>
          {/* Galvanized wire decking shelf surface */}
          <mesh position={[0, -0.005, 0]} receiveShadow={enableShadows}>
            <boxGeometry args={[width - 0.22, 0.025, depth - 0.24]} />
            <meshStandardMaterial color="#586A80" roughness={0.48} metalness={0.62} />
          </mesh>
          {/* Support cross-bars under wire decking */}
          {[-0.65, 0, 0.65].map((cx) => (
            <mesh key={cx} position={[cx, -0.035, 0]}>
              <boxGeometry args={[0.045, 0.04, depth - 0.2]} />
              <meshStandardMaterial color={WARETRACE_COLORS.steelDark} roughness={0.45} metalness={0.68} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Front & Rear Bin Code Identification Plates on upper beam */}
      <mesh position={[0, shelfLevels[shelfLevels.length - 1] - 0.04, halfD - 0.035]}>
        <planeGeometry args={[0.74, 0.23]} />
        <meshBasicMaterial map={plateTexture} />
      </mesh>
      <mesh
        position={[0, shelfLevels[shelfLevels.length - 1] - 0.04, -halfD + 0.035]}
        rotation={[0, Math.PI, 0]}
      >
        <planeGeometry args={[0.74, 0.23]} />
        <meshBasicMaterial map={plateTexture} />
      </mesh>
    </group>
  );
}
