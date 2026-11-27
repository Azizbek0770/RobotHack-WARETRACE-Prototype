import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  AMR_HOME_POSITION,
  AMR_MAST_MAX_STROKE_M,
  AMR_WHEEL_RADIUS_M,
  type AmrPhase,
  type AmrVisualizationState,
} from '../services/amrMission';
import { WARETRACE_COLORS } from './warehouseMaterials';

interface WarehouseAmrProps {
  amr: AmrVisualizationState;
  enableShadows: boolean;
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
 * Procedurally rendered warehouse AMR with:
 * - Differential-drive chassis, safety bumpers, and rotating drive/caster wheels
 * - 3-stage telescopic mast that extends vertically when stopped at the target bin
 * - Mast-mounted dual-lens camera head
 * - Simple scan indicator beacon and scan cone active only during simulated scanning
 * - Deterministic preplanned aisle route floor path
 */
export function WarehouseAmr({ amr, enableShadows }: WarehouseAmrProps) {
  const { invalidate } = useThree();

  useEffect(() => {
    invalidate();
  }, [amr, invalidate]);

  const routeGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const vertices = amr.waypoints.flatMap((pt) => [pt.x, 0.048, pt.z]);
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
      opacity: amr.phase === 'IDLE' ? 0.55 : 0.88,
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
  const cameraBaseY = 0.91 + stage3Offset;
  const beaconColor = statusBeaconColor(amr.phase, amr.isPaused);
  const isScanning = amr.phase === 'SCANNING' && !amr.isPaused;
  const scanPulse = isScanning
    ? 0.22 + 0.16 * Math.sin(amr.pose.scanProgress * Math.PI * 6)
    : 0;
  const casterSpin =
    amr.pose.wheelRotationRad * (AMR_WHEEL_RADIUS_M / 0.065);

  const lastWaypoint =
    amr.waypoints.length > 0
      ? amr.waypoints[amr.waypoints.length - 1]
      : null;

  return (
    <group name="simulated-amr-system">
      {/* Staging pad ring at AMR home position */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[AMR_HOME_POSITION.x, 0.036, AMR_HOME_POSITION.z]}
      >
        <ringGeometry args={[0.52, 0.64, 24]} />
        <meshBasicMaterial
          color="#35D6F2"
          transparent
          opacity={0.55}
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
          <ringGeometry args={[0.26, 0.36, 20]} />
          <meshBasicMaterial
            color={WARETRACE_COLORS.auditAffected}
            transparent
            opacity={0.75}
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
        {/* Main center drive wheels (left/right) */}
        {[-0.315, 0.315].map((xOffset, idx) => (
          <group
            key={`drive-wheel-${idx}`}
            position={[xOffset, AMR_WHEEL_RADIUS_M, 0]}
            rotation={[amr.pose.wheelRotationRad, 0, 0]}
          >
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow={enableShadows}>
              <cylinderGeometry
                args={[AMR_WHEEL_RADIUS_M, AMR_WHEEL_RADIUS_M, 0.07, 18]}
              />
              <meshStandardMaterial
                color="#111827"
                roughness={0.85}
                metalness={0.12}
              />
            </mesh>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.062, 0.062, 0.076, 12]} />
              <meshStandardMaterial
                color="#64748B"
                roughness={0.38}
                metalness={0.75}
              />
            </mesh>
            {/* Spoke bar so wheel rotation is visibly readable */}
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[0.08, 0.02, 0.14]} />
              <meshStandardMaterial color="#CBD5E1" roughness={0.4} metalness={0.6} />
            </mesh>
          </group>
        ))}

        {/* Front & rear caster wheels */}
        {[
          [-0.22, -0.3],
          [0.22, -0.3],
          [-0.22, 0.3],
          [0.22, 0.3],
        ].map(([cx, cz], idx) => (
          <group
            key={`caster-wheel-${idx}`}
            position={[cx, 0.065, cz]}
            rotation={[casterSpin, 0, 0]}
          >
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.065, 0.065, 0.045, 14]} />
              <meshStandardMaterial color="#1F2937" roughness={0.8} metalness={0.2} />
            </mesh>
          </group>
        ))}

        {/* Lower chassis skirt */}
        <mesh position={[0, 0.15, 0]} castShadow={enableShadows}>
          <boxGeometry args={[0.56, 0.13, 0.82]} />
          <meshStandardMaterial color="#162233" roughness={0.55} metalness={0.45} />
        </mesh>

        {/* Upper chassis deck */}
        <mesh position={[0, 0.26, 0]} castShadow={enableShadows} receiveShadow={enableShadows}>
          <boxGeometry args={[0.52, 0.11, 0.76]} />
          <meshStandardMaterial color="#273B54" roughness={0.42} metalness={0.52} />
        </mesh>

        {/* Front industrial safety bumper (+Z forward) */}
        <mesh position={[0, 0.16, 0.425]}>
          <boxGeometry args={[0.58, 0.07, 0.04]} />
          <meshStandardMaterial color="#FFB547" roughness={0.4} metalness={0.25} />
        </mesh>

        {/* Side status LED strips */}
        {[-0.268, 0.268].map((sx, idx) => (
          <mesh key={`led-strip-${idx}`} position={[sx, 0.26, 0]}>
            <boxGeometry args={[0.015, 0.03, 0.56]} />
            <meshStandardMaterial
              color={beaconColor}
              emissive={beaconColor}
              emissiveIntensity={0.85}
              roughness={0.3}
            />
          </mesh>
        ))}

        {/* Front sensor housing (aesthetic detail; preplanned route only) */}
        <mesh position={[0, 0.34, 0.29]}>
          <cylinderGeometry args={[0.065, 0.075, 0.065, 16]} />
          <meshStandardMaterial color="#0F172A" roughness={0.3} metalness={0.7} />
        </mesh>

        {/* Mast base plinth */}
        <mesh position={[0, 0.34, -0.04]}>
          <boxGeometry args={[0.2, 0.06, 0.2]} />
          <meshStandardMaterial color="#1E293B" roughness={0.45} metalness={0.65} />
        </mesh>

        {/* Telescopic Mast Stage 1 (outer fixed column) */}
        <mesh position={[0, 0.62, -0.04]} castShadow={enableShadows}>
          <boxGeometry args={[0.13, 0.54, 0.13]} />
          <meshStandardMaterial color="#1E2E42" roughness={0.42} metalness={0.68} />
        </mesh>

        {/* Telescopic Mast Stage 2 (intermediate sleeve) */}
        <mesh position={[0, 0.63 + stage2Offset, -0.04]} castShadow={enableShadows}>
          <boxGeometry args={[0.098, 0.52, 0.098]} />
          <meshStandardMaterial color="#64748B" roughness={0.35} metalness={0.75} />
        </mesh>

        {/* Telescopic Mast Stage 3 (upper inner mast) */}
        <mesh position={[0, 0.64 + stage3Offset, -0.04]} castShadow={enableShadows}>
          <boxGeometry args={[0.07, 0.52, 0.07]} />
          <meshStandardMaterial color="#94A3B8" roughness={0.28} metalness={0.8} />
        </mesh>

        {/* Mast-top Camera Head + Scan Indicator */}
        <group position={[0, cameraBaseY, -0.04]}>
          {/* Tilt bracket */}
          <mesh position={[0, 0.02, 0]}>
            <boxGeometry args={[0.11, 0.06, 0.1]} />
            <meshStandardMaterial color="#334155" roughness={0.4} metalness={0.7} />
          </mesh>

          {/* Vision head bar */}
          <mesh position={[0, 0.08, 0.03]} castShadow={enableShadows}>
            <boxGeometry args={[0.28, 0.095, 0.13]} />
            <meshStandardMaterial color="#0F172A" roughness={0.35} metalness={0.65} />
          </mesh>

          {/* Dual optical camera lenses pointing +Z */}
          {[-0.075, 0.075].map((lx, idx) => (
            <group key={`lens-${idx}`} position={[lx, 0.08, 0.1]}>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.028, 0.028, 0.022, 14]} />
                <meshStandardMaterial color="#334155" roughness={0.3} metalness={0.8} />
              </mesh>
              <mesh position={[0, 0, 0.012]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.019, 0.019, 0.008, 12]} />
                <meshStandardMaterial
                  color={isScanning ? '#38BDF8' : '#1E3A5F'}
                  emissive={isScanning ? '#38BDF8' : beaconColor}
                  emissiveIntensity={isScanning ? 1.4 : 0.45}
                  roughness={0.15}
                />
              </mesh>
            </group>
          ))}

          {/* Top status / scan indicator ring */}
          <mesh position={[0, 0.14, 0.03]}>
            <cylinderGeometry args={[0.042, 0.042, 0.03, 16]} />
            <meshStandardMaterial
              color={beaconColor}
              emissive={beaconColor}
              emissiveIntensity={isScanning ? 1.6 : 0.85}
              roughness={0.25}
            />
          </mesh>

          {/* Simple scan indicator beam visible strictly during SCANNING */}
          {isScanning && (
            <group position={[0, 0.075, 0.11]}>
              <mesh position={[0, 0, 0.65]} rotation={[-Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.42, 1.3, 18, 1, true]} />
                <meshBasicMaterial
                  color="#38BDF8"
                  transparent
                  opacity={scanPulse}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                />
              </mesh>
              <mesh position={[0, 0, 1.18]}>
                <boxGeometry args={[0.72, 0.025, 0.025]} />
                <meshBasicMaterial
                  color="#7DD3FC"
                  transparent
                  opacity={Math.min(0.95, scanPulse * 2.2)}
                />
              </mesh>
            </group>
          )}
        </group>
      </group>
    </group>
  );
}
