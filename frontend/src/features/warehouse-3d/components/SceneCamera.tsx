/* eslint-disable react-hooks/immutability */
import { useEffect, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { CameraPreset, WorldPosition } from '../data/contracts';
import { isSoftwareWebGL } from './warehouseMaterials';

export interface CameraDirective {
  id: number;
  preset?: CameraPreset;
  focusPosition?: WorldPosition;
}

interface SceneCameraProps {
  directive: CameraDirective | null;
}

// Reusable scratch vectors (zero per-frame GC allocations)
const _desiredPos = new THREE.Vector3();
const _desiredTarget = new THREE.Vector3();

function computePresetVectors(
  preset: CameraPreset,
  viewportAspect: number,
  outPos: THREE.Vector3,
  outTarget: THREE.Vector3,
) {
  // Adaptive distance scaling so square side-by-side canvas or narrow mobile viewports frame the full 36m warehouse
  const aspectScale =
    viewportAspect < 1.38 ? Math.min(1.85, 1.38 / Math.max(0.5, viewportAspect)) : 1.0;

  if (preset === 'top-down') {
    outTarget.set(0, 0.4, 0.2);
    outPos.set(0, 34 * aspectScale, 4.2 * aspectScale);
    return;
  }

  // Default isometric / reset framing showcasing Receiving, Storage Area A, and Quarantine completely
  outTarget.set(-0.2, 0.8, 0.2);
  outPos.set(16.0 * aspectScale, 19.5 * aspectScale, 25.0 * aspectScale);
}

/**
 * Orbit, zoom, pan, and smooth preset/focus camera controller.
 *
 * - Strictly prevents dipping below the warehouse floor (`maxPolarAngle`, `minTargetY`, `minCameraY`).
 * - Cancels scripted transitions immediately when the user grabs OrbitControls.
 * - Uses exponential damping (`THREE.MathUtils.damp`) and triggers `invalidate()` strictly while moving
 *   so `frameloop="demand"` renders zero wasted frames at rest.
 */
export function SceneCamera({ directive }: SceneCameraProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { camera, size, invalidate } = useThree();
  const softwareGl = isSoftwareWebGL();

  const animatingRef = useRef(false);
  const targetPosRef = useRef(new THREE.Vector3(17.5, 16.5, 21.5));
  const targetLookRef = useRef(new THREE.Vector3(0, 1.0, 0.2));
  const initializedRef = useRef(false);

  // Adaptive initial framing on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const aspect = size.width / Math.max(1, size.height);
    computePresetVectors('isometric', aspect, _desiredPos, _desiredTarget);
    camera.position.copy(_desiredPos);
    if (controlsRef.current) {
      controlsRef.current.target.copy(_desiredTarget);
      controlsRef.current.update();
    } else {
      camera.lookAt(_desiredTarget);
    }
    invalidate();
  }, [camera, size.width, size.height, invalidate]);

  // Apply camera directives (Isometric, Top-Down, Reset, or Focus on Bin)
  useEffect(() => {
    if (!directive) return;
    const aspect = size.width / Math.max(1, size.height);

    if (directive.focusPosition) {
      const { x, y, z } = directive.focusPosition;
      targetLookRef.current.set(x, Math.max(1.2, y + 1.4), z);
      // Offset camera diagonally toward front-right and above the selected bin
      targetPosRef.current.set(x + 5.6, Math.max(5.8, y + 5.6), z + 6.8);
    } else if (directive.preset) {
      computePresetVectors(
        directive.preset,
        aspect,
        targetPosRef.current,
        targetLookRef.current,
      );
    } else {
      return;
    }

    if (softwareGl) {
      // On software WebGL, jump smoothly in 1 frame to avoid multi-frame CPU stalls
      camera.position.copy(targetPosRef.current);
      if (controlsRef.current) {
        controlsRef.current.target.copy(targetLookRef.current);
        controlsRef.current.update();
      }
      animatingRef.current = false;
      invalidate();
    } else {
      animatingRef.current = true;
      invalidate();
    }
  }, [directive, camera, size.width, size.height, softwareGl, invalidate]);

  // Smooth exponential damping loop (active only during scripted transitions)
  useFrame((_, rawDelta) => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (animatingRef.current) {
      const delta = Math.min(rawDelta, 0.05);
      const lambda = 7.5;

      camera.position.x = THREE.MathUtils.damp(
        camera.position.x,
        targetPosRef.current.x,
        lambda,
        delta,
      );
      camera.position.y = THREE.MathUtils.damp(
        camera.position.y,
        targetPosRef.current.y,
        lambda,
        delta,
      );
      camera.position.z = THREE.MathUtils.damp(
        camera.position.z,
        targetPosRef.current.z,
        lambda,
        delta,
      );

      controls.target.x = THREE.MathUtils.damp(
        controls.target.x,
        targetLookRef.current.x,
        lambda,
        delta,
      );
      controls.target.y = THREE.MathUtils.damp(
        controls.target.y,
        targetLookRef.current.y,
        lambda,
        delta,
      );
      controls.target.z = THREE.MathUtils.damp(
        controls.target.z,
        targetLookRef.current.z,
        lambda,
        delta,
      );

      controls.update();

      const posDist = camera.position.distanceTo(targetPosRef.current);
      const targetDist = controls.target.distanceTo(targetLookRef.current);

      if (posDist < 0.04 && targetDist < 0.04) {
        camera.position.copy(targetPosRef.current);
        controls.target.copy(targetLookRef.current);
        controls.update();
        animatingRef.current = false;
      } else {
        invalidate();
      }
    }
  });

  // Floor safety guard during manual panning / orbiting
  const handleControlsChange = () => {
    const controls = controlsRef.current;
    if (!controls) return;

    let clamped = false;
    if (controls.target.y < 0.4) {
      controls.target.y = 0.4;
      clamped = true;
    }
    if (camera.position.y < 1.15) {
      camera.position.y = 1.15;
      clamped = true;
    }
    if (clamped) {
      controls.update();
    }
  };

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableRotate
      enableZoom
      enablePan
      screenSpacePanning={false}
      enableDamping={!softwareGl}
      dampingFactor={0.08}
      rotateSpeed={0.75}
      zoomSpeed={0.95}
      panSpeed={0.85}
      minDistance={5}
      maxDistance={65}
      minPolarAngle={0.05}
      maxPolarAngle={Math.PI / 2 - 0.06}
      onStart={() => {
        // User manual navigation immediately takes priority over scripted transitions
        animatingRef.current = false;
      }}
      onChange={handleControlsChange}
    />
  );
}
