/* eslint-disable react-hooks/immutability */
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  AMR_HOME_POSITION,
  AMR_MAST_BASE_HEIGHT_M,
  AMR_MAST_MAX_STROKE_M,
  AMR_WHEEL_RADIUS_M,
  getAmrPovInsetSize,
  type AmrPhase,
  type AmrVisualizationState,
} from '../services/amrMission';
import { WARETRACE_COLORS } from './warehouseMaterials';

interface WarehouseAmrProps {
  amr: AmrVisualizationState;
  enableShadows: boolean;
  showPovInset?: boolean;
}

function statusBeaconColor(phase: AmrPhase, isPaused: boolean): string {
  if (isPaused) return '#FFB547';
  switch (phase) {
    case 'IDLE':
      return '#64748B';
    case 'TRAVELING':
    case 'STOPPING':
      return WARETRACE_COLORS.receiving;
    case 'ELEVATING_MAST':
      return '#FFB547';
    case 'SCANNING':
      return '#38BDF8';
    case 'SCANNED':
      return '#34D399';
  }
}

/**
 * Secondary scene camera mounted on the AMR's telescopic mast head.
 * Renders a small bottom-right SIMULATED POV inset inside the existing WebGL context.
 */
function AmrPovRenderer({ amr }: { amr: AmrVisualizationState }) {
  const povCamera = useMemo(
    () => new THREE.PerspectiveCamera(62, 16 / 10, 0.1, 60),
    [],
  );

  useFrame(({ gl, scene, camera, size }) => {
    const camY =
      AMR_MAST_BASE_HEIGHT_M +
      0.08 +
      amr.pose.mastExtension * AMR_MAST_MAX_STROKE_M;
    const fx = Math.sin(amr.pose.headingRad);
    const fz = Math.cos(amr.pose.headingRad);

    povCamera.position.set(
      amr.pose.x + fx * 0.16,
      camY,
      amr.pose.z + fz * 0.16,
    );
    povCamera.lookAt(
      amr.pose.x + fx * 2.4,
      camY - 0.16,
      amr.pose.z + fz * 2.4,
    );

    const { width: insetW, height: insetH } = getAmrPovInsetSize(size.width);
    const margin = 12;
    const insetX = Math.max(0, size.width - insetW - margin);
    const insetY = margin;

    povCamera.aspect = insetW / Math.max(1, insetH);
    povCamera.updateProjectionMatrix();

    gl.setScissorTest(false);
    gl.setViewport(0, 0, size.width, size.height);
    gl.render(scene, camera);

    gl.setScissorTest(true);
    gl.setViewport(insetX, insetY, insetW, insetH);
    gl.setScissor(insetX, insetY, insetW, insetH);
    gl.clearDepth();
    gl.render(scene, povCamera);
    gl.setScissorTest(false);
    gl.setViewport(0, 0, size.width, size.height);
  }, 1);

  return null;
}

/**
 * Procedurally rendered warehouse AMR with:
 * - Differential-drive chassis, safety bumpers, and rotating drive/caster wheels
 * - 3-stage telescopic mast that extends vertically when stopped at the target bin
 * - Mast-mounted dual-lens camera head
 * - Simple scan indicator beacon and scan cone active only during simulated scanning
 * - Deterministic preplanned aisle route floor path
 */
export function WarehouseAmr({
  amr,
  enableShadows,
  showPovInset = false,
}: WarehouseAmrProps) {
  const { invalidate } = useThree();

  useEffect(() => {
    invalidate();
  }, [amr, showPovInset, invalidate]);

  const routeGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const vertices = amr.waypoints.flatMap((pt) => [pt.x, 0.052, pt.z]);
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    return geometry;
  }, [amr.waypoints]);

  useEffect(() => {
    return () => {
      routeGeometry.dispose();
    };
  }, [routeGeometry]);

  const routeLineObject = useMemo(() => {
    const material = new THREE.LineBasicMaterial({
      color: amr.phase === 'IDLE' ? '#38BDF8' : WARETRACE_COLORS.auditAffected,
      transparent: true,
      opacity: amr.phase === 'IDLE' ? 0.72 : 0.95,
    });
    return new THREE.Line(routeGeometry, material);
  }, [routeGeometry, amr.phase]);

  useEffect(() => {
    return () => {
      routeLineObject.material.dispose();
    };
  }, [routeLineObject]);

  const liftMeters = amr.pose.mastExtension * AMR_MAST_MAX_STROKE_M;
  const stage2Offset = liftMeters * 0.5;
  const stage3Offset = liftMeters;
  const cameraBaseY = AMR_MAST_BASE_HEIGHT_M + stage3Offset;
  const beaconColor = statusBeaconColor(amr.phase, amr.isPaused);
  const isScanning = amr.phase === 'SCANNING' && !amr.isPaused;
  const scanPulse = isScanning
    ? 0.24 + 0.16 * Math.sin(amr.pose.scanProgress * Math.PI * 6)
    : 0;
  const casterSpin =
    amr.pose.wheelRotationRad * (AMR_WHEEL_RADIUS_M / 0.072);

  const lastWaypoint =
    amr.waypoints.length > 0
      ? amr.waypoints[amr.waypoints.length - 1]
      : null;

  return (
    <group name="simulated-amr-system">
      {showPovInset && <AmrPovRenderer amr={amr} />}

      {/* Staging pad ring at AMR home position */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[AMR_HOME_POSITION.x, 0.036, AMR_HOME_POSITION.z]}
      >
        <ringGeometry args={[0.58, 0.74, 24]} />
        <meshBasicMaterial
          color="#35D6F2"
          transparent
          opacity={0.75}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-2}
        />
      </mesh>

      {/* Preplanned aisle route line */}
      {amr.waypoints.length >= 2 && (
        <primitive object={routeLineObject} />
      )}

      {/* Preplanned stand-off stop marker in front of target bin */}
      {lastWaypoint && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[lastWaypoint.x, 0.044, lastWaypoint.z]}
        >
          <ringGeometry args={[0.3, 0.44, 20]} />
          <meshBasicMaterial
            color={WARETRACE_COLORS.auditAffected}
            transparent
            opacity={0.85}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-2}
          />
        </mesh>
      )}

      {/* AMR mobile base + telescopic mast + camera head */}
      <group
        name={`amr-${amr.deviceId}`}
        position={[amr.pose.x, 0, amr.pose.z]}
        rotation={[0, amr.pose.headingRad, 0]}
      >
        {/* Subtle under-chassis floor ring for overview legibility */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <ringGeometry args={[0.52, 0.62, 24]} />
          <meshBasicMaterial
            color={beaconColor}
            transparent
            opacity={0.7}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-2}
          />
        </mesh>

        {/* Main center drive wheels (left/right) */}
        {[-0.36, 0.36].map((xOffset, idx) => (
          <group
            key={`drive-wheel-${idx}`}
            position={[xOffset, AMR_WHEEL_RADIUS_M, 0]}
            rotation={[amr.pose.wheelRotationRad, 0, 0]}
          >
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow={enableShadows}>
              <cylinderGeometry
                args={[AMR_WHEEL_RADIUS_M, AMR_WHEEL_RADIUS_M, 0.08, 18]}
              />
              <meshStandardMaterial
                color="#111827"
                roughness={0.85}
                metalness={0.12}
              />
            </mesh>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.072, 0.072, 0.086, 12]} />
              <meshStandardMaterial
                color="#64748B"
                roughness={0.38}
                metalness={0.75}
              />
            </mesh>
            {/* Spoke bar so wheel rotation is visibly readable */}
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[0.092, 0.024, 0.16]} />
              <meshStandardMaterial color="#E2E8F0" roughness={0.4} metalness={0.6} />
            </mesh>
          </group>
        ))}

        {/* Front & rear caster wheels */}
        {[
          [-0.25, -0.34],
          [0.25, -0.34],
          [-0.25, 0.34],
          [0.25, 0.34],
        ].map(([cx, cz], idx) => (
          <group
            key={`caster-wheel-${idx}`}
            position={[cx, 0.072, cz]}
            rotation={[casterSpin, 0, 0]}
          >
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.072, 0.072, 0.05, 14]} />
              <meshStandardMaterial color="#1F2937" roughness={0.8} metalness={0.2} />
            </mesh>
          </group>
        ))}

        {/* Lower chassis skirt */}
        <mesh position={[0, 0.17, 0]} castShadow={enableShadows}>
          <boxGeometry args={[0.66, 0.15, 0.92]} />
          <meshStandardMaterial color="#162233" roughness={0.55} metalness={0.45} />
        </mesh>

        {/* Upper chassis deck */}
        <mesh position={[0, 0.29, 0]} castShadow={enableShadows} receiveShadow={enableShadows}>
          <boxGeometry args={[0.62, 0.12, 0.86]} />
          <meshStandardMaterial color="#2C425D" roughness={0.42} metalness={0.52} />
        </mesh>

        {/* Front industrial safety bumper (+Z forward) */}
        <mesh position={[0, 0.18, 0.48]}>
          <boxGeometry args={[0.68, 0.08, 0.05]} />
          <meshStandardMaterial color="#FFB547" roughness={0.4} metalness={0.25} />
        </mesh>

        {/* Side status LED strips */}
        {[-0.318, 0.318].map((sx, idx) => (
          <mesh key={`led-strip-${idx}`} position={[sx, 0.29, 0]}>
            <boxGeometry args={[0.02, 0.036, 0.64]} />
            <meshStandardMaterial
              color={beaconColor}
              emissive={beaconColor}
              emissiveIntensity={1.0}
              roughness={0.3}
            />
          </mesh>
        ))}

        {/* Front sensor housing (aesthetic detail; preplanned route only) */}
        <mesh position={[0, 0.38, 0.33]}>
          <cylinderGeometry args={[0.075, 0.085, 0.07, 16]} />
          <meshStandardMaterial color="#0F172A" roughness={0.3} metalness={0.7} />
        </mesh>

        {/* Mast base plinth */}
        <mesh position={[0, 0.38, -0.04]}>
          <boxGeometry args={[0.24, 0.07, 0.24]} />
          <meshStandardMaterial color="#1E293B" roughness={0.45} metalness={0.65} />
        </mesh>

        {/* Telescopic Mast Stage 1 (outer fixed column) */}
        <mesh position={[0, 0.66, -0.04]} castShadow={enableShadows}>
          <boxGeometry args={[0.15, 0.56, 0.15]} />
          <meshStandardMaterial color="#1E2E42" roughness={0.42} metalness={0.68} />
        </mesh>

        {/* Telescopic Mast Stage 2 (intermediate sleeve) */}
        <mesh position={[0, 0.67 + stage2Offset, -0.04]} castShadow={enableShadows}>
          <boxGeometry args={[0.112, 0.54, 0.112]} />
          <meshStandardMaterial color="#64748B" roughness={0.35} metalness={0.75} />
        </mesh>

        {/* Telescopic Mast Stage 3 (upper inner mast) */}
        <mesh position={[0, 0.68 + stage3Offset, -0.04]} castShadow={enableShadows}>
          <boxGeometry args={[0.082, 0.54, 0.082]} />
          <meshStandardMaterial color="#CBD5E1" roughness={0.28} metalness={0.8} />
        </mesh>

        {/* Mast-top Camera Head + Scan Indicator */}
        <group position={[0, cameraBaseY, -0.04]}>
          {/* Tilt bracket */}
          <mesh position={[0, 0.02, 0]}>
            <boxGeometry args={[0.13, 0.06, 0.12]} />
            <meshStandardMaterial color="#334155" roughness={0.4} metalness={0.7} />
          </mesh>

          {/* Vision head bar */}
          <mesh position={[0, 0.09, 0.03]} castShadow={enableShadows}>
            <boxGeometry args={[0.32, 0.11, 0.15]} />
            <meshStandardMaterial color="#0F172A" roughness={0.35} metalness={0.65} />
          </mesh>

          {/* Dual optical camera lenses pointing +Z */}
          {[-0.085, 0.085].map((lx, idx) => (
            <group key={`lens-${idx}`} position={[lx, 0.09, 0.11]}>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.032, 0.032, 0.024, 14]} />
                <meshStandardMaterial color="#334155" roughness={0.3} metalness={0.8} />
              </mesh>
              <mesh position={[0, 0, 0.013]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.022, 0.022, 0.008, 12]} />
                <meshStandardMaterial
                  color={isScanning ? '#38BDF8' : '#1E3A5F'}
                  emissive={isScanning ? '#38BDF8' : beaconColor}
                  emissiveIntensity={isScanning ? 1.5 : 0.6}
                  roughness={0.15}
                />
              </mesh>
            </group>
          ))}

          {/* Top status / scan indicator beacon */}
          <mesh position={[0, 0.165, 0.03]}>
            <cylinderGeometry args={[0.052, 0.052, 0.04, 16]} />
            <meshStandardMaterial
              color={beaconColor}
              emissive={beaconColor}
              emissiveIntensity={isScanning ? 1.8 : 1.0}
              roughness={0.25}
            />
          </mesh>

          {/* Simple scan indicator beam visible strictly during SCANNING */}
          {isScanning && (
            <group position={[0, 0.085, 0.12]}>
              <mesh position={[0, 0, 0.68]} rotation={[-Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.48, 1.38, 18, 1, true]} />
                <meshBasicMaterial
                  color="#38BDF8"
                  transparent
                  opacity={Math.min(0.62, scanPulse * 1.65)}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                />
              </mesh>
              <mesh position={[0, 0, 0.68]}>
                <boxGeometry args={[0.03, 0.03, 1.32]} />
                <meshBasicMaterial color="#BAE6FD" transparent opacity={0.9} />
              </mesh>
              <mesh position={[0, 0, 1.26]}>
                <boxGeometry args={[0.84, 0.036, 0.036]} />
                <meshBasicMaterial
                  color="#7DD3FC"
                  transparent
                  opacity={Math.min(0.95, scanPulse * 2.4)}
                />
              </mesh>
            </group>
          )}
        </group>
      </group>
    </group>
  );
}
