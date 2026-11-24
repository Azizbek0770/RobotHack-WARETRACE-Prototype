import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { WAREHOUSE_VISUALIZATION_ASSUMPTIONS } from '../data/warehouseCoordinates';
import {
  WARETRACE_COLORS,
  createConcreteFloorTextures,
  createSignTexture,
} from './warehouseMaterials';

interface WarehouseFloorProps {
  enableShadows: boolean;
}

/**
 * Architectural industrial warehouse shell:
 * - Sealed troweled concrete floor slab with expansion seams & exterior apron
 * - Cutaway North & West corrugated cladding walls so isometric & top-down views remain unobstructed
 * - Structural steel I-beam columns and overhead roof trusses
 * - Overhead high-bay LED luminaire fixtures
 * - Loading dock doors (`DOCK 01`, `DOCK 02`) with dock bumpers & leveler plates adjacent to Receiving
 * - Main forklift traffic aisle lane markings
 */
export function WarehouseFloor({ enableShadows }: WarehouseFloorProps) {
  const { gl } = useThree();
  const maxAnisotropy = useMemo(() => Math.min(8, gl.capabilities.getMaxAnisotropy()), [gl]);

  const { floorWidthMeters: W, floorDepthMeters: D, wallHeightMeters: H } =
    WAREHOUSE_VISUALIZATION_ASSUMPTIONS;

  const { map: concreteMap, bumpMap: concreteBump } = useMemo(
    () => createConcreteFloorTextures(maxAnisotropy),
    [maxAnisotropy],
  );

  const dock1Sign = useMemo(
    () => createSignTexture('DOCK 01', 'INBOUND RECEIVING', WARETRACE_COLORS.receiving, maxAnisotropy),
    [maxAnisotropy],
  );
  const dock2Sign = useMemo(
    () => createSignTexture('DOCK 02', 'INBOUND RECEIVING', WARETRACE_COLORS.receiving, maxAnisotropy),
    [maxAnisotropy],
  );

  useEffect(() => {
    return () => {
      concreteMap.dispose();
      concreteBump.dispose();
      dock1Sign.dispose();
      dock2Sign.dispose();
    };
  }, [concreteMap, concreteBump, dock1Sign, dock2Sign]);

  // Perimeter structural steel column positions (North & West cutaway walls)
  const northColumnXs = useMemo(() => [-17.5, -11.6, -5.8, 0, 5.8, 11.6, 17.5], []);
  const westColumnZs = useMemo(() => [-10.5, -5.25, 0, 5.25, 10.5], []);
  const roofTrussXs = useMemo(() => [-11.6, -5.8, 0, 5.8, 11.6], []);

  // Overhead industrial LED high-bay fixtures mounted cleanly along the North cantilevered eave
  const luminairePositions = useMemo<[number, number, number][]>(
    () => [
      [-12.4, H - 0.38, -8.8],
      [-6.2, H - 0.38, -8.8],
      [0, H - 0.38, -8.8],
      [6.2, H - 0.38, -8.8],
      [12.4, H - 0.38, -8.8],
    ],
    [H],
  );

  return (
    <group name="warehouse-architecture">
      {/* Subtle dark industrial ground surround so warehouse sits solidly in world space */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.26, 0]}>
        <planeGeometry args={[140, 140]} />
        <meshStandardMaterial color="#0A1423" roughness={0.95} metalness={0.05} />
      </mesh>

      {/* Main concrete slab foundation */}
      <mesh position={[0, -0.12, 0]} receiveShadow={enableShadows}>
        <boxGeometry args={[W, 0.24, D]} />
        <meshStandardMaterial
          map={concreteMap}
          bumpMap={concreteBump}
          bumpScale={0.025}
          color="#FFFFFF"
          roughness={0.78}
          metalness={0.08}
        />
      </mesh>

      {/* Slab perimeter concrete curb / plinth */}
      <mesh position={[0, -0.14, D / 2 + 0.16]}>
        <boxGeometry args={[W + 0.6, 0.28, 0.32]} />
        <meshStandardMaterial color="#18273B" roughness={0.85} metalness={0.15} />
      </mesh>
      <mesh position={[W / 2 + 0.16, -0.14, 0]}>
        <boxGeometry args={[0.32, 0.28, D + 0.6]} />
        <meshStandardMaterial color="#18273B" roughness={0.85} metalness={0.15} />
      </mesh>

      {/* Main Forklift Traffic Aisle Lines (offset Y=+0.022 with polygonOffset to prevent Z-fighting) */}
      <group position={[0, 0.022, 0]}>
        {/* Central storage forklift aisle borders between Row 1 (Z=-2.7) and Row 2 (Z=+2.7) */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-0.35, 0, -1.1]}>
          <planeGeometry args={[12.8, 0.12]} />
          <meshStandardMaterial
            color="#CBD5E1"
            roughness={0.6}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-0.35, 0, 1.1]}>
          <planeGeometry args={[12.8, 0.12]} />
          <meshStandardMaterial
            color="#CBD5E1"
            roughness={0.6}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
        {/* Dashed aisle centerline */}
        {[-5.2, -3.2, -1.2, 0.8, 2.8, 4.8].map((xPos) => (
          <mesh key={xPos} rotation={[-Math.PI / 2, 0, 0]} position={[xPos, 0, 0]}>
            <planeGeometry args={[1.0, 0.07]} />
            <meshStandardMaterial
              color="#64748B"
              roughness={0.6}
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-1}
            />
          </mesh>
        ))}

        {/* Cross-aisle walkway connecting Receiving -> Storage -> Quarantine along South corridor */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 7.2]}>
          <planeGeometry args={[W - 2.4, 0.1]} />
          <meshStandardMaterial
            color="#64748B"
            roughness={0.6}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 8.9]}>
          <planeGeometry args={[W - 2.4, 0.1]} />
          <meshStandardMaterial
            color="#64748B"
            roughness={0.6}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      </group>

      {/* Cutaway North Wall (back wall at Z = -D/2) */}
      <group position={[0, 0, -D / 2 - 0.12]}>
        {/* Lower concrete dado wall */}
        <mesh position={[0, 0.75, 0]} receiveShadow={enableShadows}>
          <boxGeometry args={[W + 0.4, 1.5, 0.24]} />
          <meshStandardMaterial color="#1E2E43" roughness={0.85} metalness={0.12} />
        </mesh>
        {/* Upper insulated steel cladding wall */}
        <mesh position={[0, 1.5 + (H - 1.5) / 2, 0]} receiveShadow={enableShadows}>
          <boxGeometry args={[W + 0.4, H - 1.5, 0.18]} />
          <meshStandardMaterial color={WARETRACE_COLORS.wallPanel} roughness={0.62} metalness={0.34} />
        </mesh>
        {/* Clerestory translucent industrial skylight ribbon along upper north wall */}
        <mesh position={[0, H - 1.15, 0.1]}>
          <boxGeometry args={[W - 3, 0.85, 0.04]} />
          <meshStandardMaterial
            color="#94B8D8"
            emissive="#1E3A5F"
            emissiveIntensity={0.45}
            roughness={0.25}
            metalness={0.1}
          />
        </mesh>
        {/* Top roof parapet cap beam */}
        <mesh position={[0, H + 0.1, 0]}>
          <boxGeometry args={[W + 0.6, 0.22, 0.34]} />
          <meshStandardMaterial color={WARETRACE_COLORS.steelDark} roughness={0.45} metalness={0.62} />
        </mesh>
      </group>

      {/* Cutaway West Wall (Loading dock wall at X = -W/2) */}
      <group position={[-W / 2 - 0.12, 0, 0]}>
        <mesh position={[0, 0.75, 0]} receiveShadow={enableShadows}>
          <boxGeometry args={[0.24, 1.5, D + 0.4]} />
          <meshStandardMaterial color="#1E2E43" roughness={0.85} metalness={0.12} />
        </mesh>
        <mesh position={[0, 1.5 + (H - 1.5) / 2, 0]} receiveShadow={enableShadows}>
          <boxGeometry args={[0.18, H - 1.5, D + 0.4]} />
          <meshStandardMaterial color={WARETRACE_COLORS.wallPanel} roughness={0.62} metalness={0.34} />
        </mesh>
        <mesh position={[0, H + 0.1, 0]}>
          <boxGeometry args={[0.34, 0.22, D + 0.6]} />
          <meshStandardMaterial color={WARETRACE_COLORS.steelDark} roughness={0.45} metalness={0.62} />
        </mesh>

        {/* Two sectional industrial loading dock bay doors adjacent to Receiving */}
        {[-1.9, 1.9].map((zPos, idx) => (
          <group key={zPos} position={[0.14, 0, zPos]}>
            {/* Steel door jamb frame */}
            <mesh position={[0, 1.95, -1.48]}>
              <boxGeometry args={[0.16, 3.9, 0.16]} />
              <meshStandardMaterial color="#35D6F2" roughness={0.4} metalness={0.5} />
            </mesh>
            <mesh position={[0, 1.95, 1.48]}>
              <boxGeometry args={[0.16, 3.9, 0.16]} />
              <meshStandardMaterial color="#35D6F2" roughness={0.4} metalness={0.5} />
            </mesh>
            <mesh position={[0, 3.92, 0]}>
              <boxGeometry args={[0.18, 0.18, 3.12]} />
              <meshStandardMaterial color="#35D6F2" roughness={0.4} metalness={0.5} />
            </mesh>
            {/* Sectional ribbed roll-up door panels */}
            {[0.55, 1.25, 1.95, 2.65, 3.35].map((panelY) => (
              <mesh key={panelY} position={[-0.02, panelY, 0]}>
                <boxGeometry args={[0.08, 0.64, 2.78]} />
                <meshStandardMaterial color="#2D3E54" roughness={0.52} metalness={0.55} />
              </mesh>
            ))}
            {/* Steel dock leveler floor plate */}
            <mesh position={[0.7, 0.025, 0]}>
              <boxGeometry args={[1.35, 0.04, 2.5]} />
              <meshStandardMaterial color="#334155" roughness={0.58} metalness={0.65} />
            </mesh>
            {/* Yellow industrial dock safety bollards */}
            <mesh position={[0.32, 0.52, -1.62]}>
              <cylinderGeometry args={[0.08, 0.08, 1.04, 12]} />
              <meshStandardMaterial color="#FFB547" roughness={0.42} metalness={0.35} />
            </mesh>
            <mesh position={[0.32, 0.52, 1.62]}>
              <cylinderGeometry args={[0.08, 0.08, 1.04, 12]} />
              <meshStandardMaterial color="#FFB547" roughness={0.42} metalness={0.35} />
            </mesh>
            {/* Overhead Dock Signage */}
            <mesh position={[0.08, 4.48, 0]} rotation={[0, Math.PI / 2, 0]}>
              <planeGeometry args={[1.95, 0.56]} />
              <meshBasicMaterial map={idx === 0 ? dock1Sign : dock2Sign} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Low cutaway perimeter dwarf walls on South & East corners for architectural framing */}
      <mesh position={[W / 2 + 0.08, 0.35, -D / 2 + 1.8]}>
        <boxGeometry args={[0.18, 0.7, 3.6]} />
        <meshStandardMaterial color="#1E2E43" roughness={0.82} metalness={0.2} />
      </mesh>
      <mesh position={[-W / 2 + 1.8, 0.35, D / 2 + 0.08]}>
        <boxGeometry args={[3.6, 0.7, 0.18]} />
        <meshStandardMaterial color="#1E2E43" roughness={0.82} metalness={0.2} />
      </mesh>

      {/* Structural Steel Columns along North Wall */}
      {northColumnXs.map((xPos) => (
        <group key={`ncol-${xPos}`} position={[xPos, 0, -D / 2 + 0.1]}>
          <mesh position={[0, H / 2, 0]} castShadow={enableShadows}>
            <boxGeometry args={[0.3, H, 0.32]} />
            <meshStandardMaterial color={WARETRACE_COLORS.steelDark} roughness={0.42} metalness={0.68} />
          </mesh>
          {/* Yellow safety guard base */}
          <mesh position={[0, 0.48, 0.02]}>
            <boxGeometry args={[0.34, 0.96, 0.36]} />
            <meshStandardMaterial color="#D99B38" roughness={0.5} metalness={0.28} />
          </mesh>
        </group>
      ))}

      {/* Structural Steel Columns along West Wall */}
      {westColumnZs.map((zPos) => (
        <group key={`wcol-${zPos}`} position={[-W / 2 + 0.1, 0, zPos]}>
          <mesh position={[0, H / 2, 0]} castShadow={enableShadows}>
            <boxGeometry args={[0.32, H, 0.3]} />
            <meshStandardMaterial color={WARETRACE_COLORS.steelDark} roughness={0.42} metalness={0.68} />
          </mesh>
        </group>
      ))}

      {/* Cutaway Overhead Steel Roof Trusses (cantilevered along North eave so top-down plan view stays crisp) */}
      {roofTrussXs.map((xPos) => (
        <group key={`truss-${xPos}`} position={[xPos, H - 0.12, -D / 2 + 1.6]}>
          <mesh>
            <boxGeometry args={[0.16, 0.24, 3.2]} />
            <meshStandardMaterial color="#1E3046" roughness={0.48} metalness={0.65} />
          </mesh>
        </group>
      ))}

      {/* Overhead High-Bay Industrial LED Light Fixtures */}
      {luminairePositions.map(([lx, ly, lz], idx) => (
        <group key={`led-${idx}`} position={[lx, ly, lz]}>
          {/* Fixture aluminum housing */}
          <mesh position={[0, 0.08, 0]}>
            <boxGeometry args={[1.35, 0.08, 0.42]} />
            <meshStandardMaterial color="#27384D" roughness={0.4} metalness={0.7} />
          </mesh>
          {/* Emissive LED panel */}
          <mesh position={[0, 0.02, 0]}>
            <boxGeometry args={[1.22, 0.04, 0.34]} />
            <meshStandardMaterial
              color="#FFFFFF"
              emissive="#E2F1FF"
              emissiveIntensity={1.6}
              roughness={0.2}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
