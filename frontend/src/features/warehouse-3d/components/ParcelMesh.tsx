import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import type { HandlingUnitNote, NormalizedBin } from '../data/contracts';
import {
  WARETRACE_COLORS,
  createCardboardTexture,
  createSeededRandom,
} from './warehouseMaterials';

interface ParcelMeshProps {
  bin: NormalizedBin;
  shelfLevelsY: number[];
  enableShadows: boolean;
}

interface GeneratedBoxSpec {
  id: string;
  position: [number, number, number];
  size: [number, number, number];
  rotationY: number;
  shadeIndex: number;
  isQuarantineUnit?: boolean;
}

/**
 * Reusable composite wooden EUR pallet (3 bottom runners + 5 top deck slats).
 */
export function EuroPallet({
  position = [0, 0, 0],
  width = 1.75,
  depth = 1.25,
  enableShadows = false,
}: {
  position?: [number, number, number];
  width?: number;
  depth?: number;
  enableShadows?: boolean;
}) {
  const slatCount = 5;
  const slatDepth = (depth - 0.18) / slatCount;
  const runnerOffsets = [-width * 0.42, 0, width * 0.42];

  return (
    <group position={position}>
      {/* 3 longitudinal bottom stringers */}
      {runnerOffsets.map((rx, idx) => (
        <mesh
          key={`runner-${idx}`}
          position={[rx, 0.045, 0]}
          castShadow={enableShadows}
          receiveShadow={enableShadows}
        >
          <boxGeometry args={[0.1, 0.09, depth]} />
          <meshStandardMaterial color="#8F6E48" roughness={0.86} metalness={0.04} />
        </mesh>
      ))}
      {/* 5 top timber deck boards */}
      {Array.from({ length: slatCount }).map((_, idx) => {
        const z = -depth / 2 + slatDepth / 2 + idx * (slatDepth + 0.04);
        return (
          <mesh
            key={`slat-${idx}`}
            position={[0, 0.105, z]}
            castShadow={enableShadows}
            receiveShadow={enableShadows}
          >
            <boxGeometry args={[width, 0.03, slatDepth * 0.88]} />
            <meshStandardMaterial color={WARETRACE_COLORS.woodPallet} roughness={0.82} metalness={0.04} />
          </mesh>
        );
      })}
    </group>
  );
}

/**
 * Renders wooden pallets and realistically stacked cardboard parcels inside a bin bay.
 *
 * Parcel density scales faithfully from `bin.totalExpectedUnits`:
 * - 0 units -> empty shelf/bay (never fabricates stock!)
 * - 1..30+ units -> proportional stacked boxes with subtle natural size & rotation variation
 * - Non-stock quarantined HUs (e.g. HU-0010 at QA-01) render as amber-banded quarantine crates
 */
export function ParcelMesh({ bin, shelfLevelsY, enableShadows }: ParcelMeshProps) {
  const { gl } = useThree();
  const maxAnisotropy = useMemo(() => Math.min(8, gl.capabilities.getMaxAnisotropy()), [gl]);

  const textures = useMemo(
    () => [
      createCardboardTexture(WARETRACE_COLORS.cardboardLight, maxAnisotropy),
      createCardboardTexture(WARETRACE_COLORS.cardboardMid, maxAnisotropy),
      createCardboardTexture(WARETRACE_COLORS.cardboardDark, maxAnisotropy),
    ],
    [maxAnisotropy],
  );

  useEffect(() => {
    return () => {
      textures.forEach((tex) => tex.dispose());
    };
  }, [textures]);

  const { palletsY, boxes } = useMemo(() => {
    const rand = createSeededRandom(`${bin.id}:${bin.code}`);
    const generatedBoxes: GeneratedBoxSpec[] = [];
    const activePallets: number[] = [];

    // Regular expected inventory boxes
    const units = bin.totalExpectedUnits;
    if (units > 0 && shelfLevelsY.length > 0) {
      // Visual boxes scale clearly with quantity: 1..15 units -> 1..15 visible boxes (capped at 18 for crisp perf)
      const totalBoxes = Math.min(18, Math.max(1, units));
      const usableLevels = shelfLevelsY.slice(0, Math.min(shelfLevelsY.length, totalBoxes > 6 ? 2 : 1));

      const boxesPerLevel = Math.ceil(totalBoxes / usableLevels.length);
      let remaining = totalBoxes;

      usableLevels.forEach((levelY, levelIdx) => {
        activePallets.push(levelY);
        const countOnLevel = Math.min(remaining, boxesPerLevel);
        remaining -= countOnLevel;

        const cols = 3;
        const rows = 2;
        const slotsPerLayer = cols * rows;
        const baseY = levelY + 0.12; // Top of EuroPallet

        for (let i = 0; i < countOnLevel; i += 1) {
          const layer = Math.floor(i / slotsPerLayer);
          const slot = i % slotsPerLayer;
          const col = slot % cols;
          const row = Math.floor(slot / cols);

          const w = 0.42 + rand() * 0.1;
          const h = 0.3 + rand() * 0.1;
          const d = 0.4 + rand() * 0.08;

          const xSpacing = 0.56;
          const zSpacing = 0.54;
          const x = (col - 1) * xSpacing + (rand() - 0.5) * 0.05;
          const z = (row - 0.5) * zSpacing + (rand() - 0.5) * 0.05;
          const y = baseY + layer * 0.38 + h / 2;

          generatedBoxes.push({
            id: `${bin.id}-box-${levelIdx}-${i}`,
            position: [x, y, z],
            size: [w, h, d],
            rotationY: (rand() - 0.5) * 0.12,
            shadeIndex: Math.floor(rand() * 3),
          });
        }
      });
    }

    // Non-stock quarantined handling units explicitly held at this bin (e.g., HU-0010 at QA-01)
    if (bin.handlingUnits.length > 0 && shelfLevelsY.length > 0) {
      const baseLevelY = shelfLevelsY[0];
      if (!activePallets.includes(baseLevelY)) {
        activePallets.push(baseLevelY);
      }
      bin.handlingUnits.forEach((hu, idx) => {
        generatedBoxes.push({
          id: `${bin.id}-hu-${hu.id}`,
          position: [idx * 0.65 - (bin.handlingUnits.length - 1) * 0.32, baseLevelY + 0.12 + 0.28, 0],
          size: [0.64, 0.56, 0.58],
          rotationY: 0.06,
          shadeIndex: 0,
          isQuarantineUnit: hu.status === 'QUARANTINED',
        });
      });
    }

    return { palletsY: activePallets, boxes: generatedBoxes };
  }, [bin.id, bin.code, bin.totalExpectedUnits, bin.handlingUnits, shelfLevelsY]);

  if (palletsY.length === 0 && boxes.length === 0) {
    return null;
  }

  return (
    <group name={`parcels-${bin.code}`}>
      {palletsY.map((py, idx) => (
        <EuroPallet
          key={`pallet-${idx}`}
          position={[0, py, 0]}
          width={Math.min(1.88, bin.bayDimensions.width - 0.45)}
          depth={Math.min(1.32, bin.bayDimensions.depth - 0.38)}
          enableShadows={enableShadows}
        />
      ))}

      {boxes.map((box) => (
        <group
          key={box.id}
          position={box.position}
          rotation={[0, box.rotationY, 0]}
        >
          <mesh castShadow={enableShadows} receiveShadow={enableShadows}>
            <boxGeometry args={box.size} />
            {box.isQuarantineUnit ? (
              <meshStandardMaterial color="#8A643C" roughness={0.82} metalness={0.05} />
            ) : (
              <meshStandardMaterial
                map={textures[box.shadeIndex]}
                color="#FFFFFF"
                roughness={0.84}
                metalness={0.02}
              />
            )}
          </mesh>

          {/* Amber quarantine strapping band for quarantined handling units (HU-0010) */}
          {box.isQuarantineUnit && (
            <>
              <mesh position={[0, 0, 0]}>
                <boxGeometry args={[box.size[0] + 0.025, 0.09, box.size[2] + 0.025]} />
                <meshStandardMaterial
                  color={WARETRACE_COLORS.quarantine}
                  roughness={0.38}
                  metalness={0.18}
                />
              </mesh>
              <mesh position={[0, box.size[1] / 2 + 0.012, 0]}>
                <boxGeometry args={[0.24, 0.02, 0.16]} />
                <meshStandardMaterial color="#F8FAFC" roughness={0.5} />
              </mesh>
            </>
          )}
        </group>
      ))}
    </group>
  );
}

/**
 * Unassigned inbound handling unit staged on a pallet in the Receiving area (e.g., HU-0009).
 */
export function UnassignedStagingPallet({
  handlingUnit,
  position,
  enableShadows,
}: {
  handlingUnit: HandlingUnitNote;
  position: [number, number, number];
  enableShadows: boolean;
}) {
  const { gl } = useThree();
  const maxAnisotropy = useMemo(() => Math.min(8, gl.capabilities.getMaxAnisotropy()), [gl]);
  const cardboardMap = useMemo(
    () => createCardboardTexture(WARETRACE_COLORS.cardboardLight, maxAnisotropy),
    [maxAnisotropy],
  );

  useEffect(() => {
    return () => {
      cardboardMap.dispose();
    };
  }, [cardboardMap]);

  return (
    <group position={position} name={`staging-${handlingUnit.code}`}>
      <EuroPallet width={1.45} depth={1.15} enableShadows={enableShadows} />
      {/* Two wrapped inbound cartons representing HU-0009 qty 2 */}
      <mesh position={[-0.3, 0.12 + 0.24, 0]} castShadow={enableShadows} receiveShadow={enableShadows}>
        <boxGeometry args={[0.52, 0.48, 0.56]} />
        <meshStandardMaterial map={cardboardMap} color="#FFFFFF" roughness={0.84} />
      </mesh>
      <mesh position={[0.3, 0.12 + 0.22, 0.03]} rotation={[0, 0.08, 0]} castShadow={enableShadows} receiveShadow={enableShadows}>
        <boxGeometry args={[0.5, 0.44, 0.52]} />
        <meshStandardMaterial map={cardboardMap} color="#FFFFFF" roughness={0.84} />
      </mesh>
      {/* Cyan inbound wrap strap */}
      <mesh position={[0, 0.36, 0]}>
        <boxGeometry args={[1.22, 0.06, 0.64]} />
        <meshStandardMaterial color={WARETRACE_COLORS.receiving} roughness={0.35} metalness={0.2} />
      </mesh>
    </group>
  );
}
