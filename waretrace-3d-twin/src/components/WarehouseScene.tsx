import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type {
  NormalizedBin,
  RenderQuality,
  WarehouseSnapshot,
  ZoneKind,
} from '../data/contracts';
import { SceneCamera, type CameraDirective } from './SceneCamera';
import { WarehouseFloor } from './WarehouseFloor';
import { WarehouseZone } from './WarehouseZone';
import { WARETRACE_COLORS, isSoftwareWebGL } from './warehouseMaterials';

interface WarehouseSceneProps {
  snapshot: WarehouseSnapshot | null;
  selectedBinId: string | null;
  hoveredBinId: string | null;
  visibleZoneKinds: Record<ZoneKind, boolean>;
  cameraDirective: CameraDirective | null;
  quality: RenderQuality;
  onSelectBin: (bin: NormalizedBin) => void;
  onHoverBin: (bin: NormalizedBin | null) => void;
}

/**
 * Generates a zero-dependency procedural PBR studio environment map (`RoomEnvironment`)
 * so galvanized steel racks and concrete surfaces exhibit crisp industrial reflections.
 */
function StudioEnvironment() {
  const { gl, scene, invalidate } = useThree();

  useEffect(() => {
    const pmremGenerator = new THREE.PMREMGenerator(gl);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    invalidate();

    return () => {
      if (scene.environment === envTarget.texture) {
        scene.environment = null;
      }
      envTarget.dispose();
      roomEnv.dispose();
      pmremGenerator.dispose();
    };
  }, [gl, scene, invalidate]);

  return null;
}

/**
 * Main Three.js scene tree containing:
 * - Studio PMREM reflections & balanced warm/cool 3-point industrial lighting
 * - Architectural warehouse shell (`WarehouseFloor`)
 * - Filtered `WarehouseZone` instances with interactive `WarehouseBin` bays
 * - Floor-clamped `SceneCamera` orbit & preset controller
 */
export function WarehouseScene({
  snapshot,
  selectedBinId,
  hoveredBinId,
  visibleZoneKinds,
  cameraDirective,
  quality,
  onSelectBin,
  onHoverBin,
}: WarehouseSceneProps) {
  const softwareGl = isSoftwareWebGL();
  const enableShadows = !softwareGl && quality === 'high';

  const unassignedHandlingUnits = useMemo(
    () => (snapshot?.handlingUnits ?? []).filter((hu) => hu.binId === null),
    [snapshot?.handlingUnits],
  );

  const visibleZones = useMemo(
    () => (snapshot?.zones ?? []).filter((zone) => visibleZoneKinds[zone.kind] !== false),
    [snapshot?.zones, visibleZoneKinds],
  );

  return (
    <>
      <color attach="background" args={[WARETRACE_COLORS.background]} />
      <fog attach="fog" args={[WARETRACE_COLORS.background, 42, 95]} />

      <StudioEnvironment />

      {/* Warm overhead key light (single shadow caster with tight warehouse frustum) */}
      <directionalLight
        position={[14, 24, 15]}
        intensity={1.75}
        color="#FFF4E3"
        castShadow={enableShadows}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-near={4}
        shadow-camera-far={60}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      />

      {/* Cool skylight / slate ground hemisphere fill */}
      <hemisphereLight args={['#B6D3F2', '#172334', 0.95]} />

      {/* Soft cool rim light from back-left to separate steel rack silhouettes */}
      <directionalLight position={[-18, 12, -14]} intensity={0.55} color="#84B6E8" />

      {/* Architectural warehouse floor, walls, trusses, and loading docks */}
      <WarehouseFloor enableShadows={enableShadows} />

      {/* Interactive warehouse zones & bins */}
      {visibleZones.map((zone) => (
        <WarehouseZone
          key={zone.id}
          zone={zone}
          selectedBinId={selectedBinId}
          hoveredBinId={hoveredBinId}
          unassignedHandlingUnits={
            zone.kind === 'RECEIVING' ? unassignedHandlingUnits : []
          }
          onSelectBin={onSelectBin}
          onHoverBin={onHoverBin}
          enableShadows={enableShadows}
        />
      ))}

      <SceneCamera directive={cameraDirective} />
    </>
  );
}
