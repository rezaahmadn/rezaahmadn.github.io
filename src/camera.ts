/**
 * camera.ts — pure follow camera rig (PRD §5, Camera).
 *
 * Small-FOV isometric feel: the camera trails the target by a fixed world-space
 * offset and eases toward it every frame, always looking at the target. The FOV
 * itself is set in main (CAMERA_FOV); this rig only handles position + aim.
 */

import * as THREE from 'three';
import { CAMERA_OFFSET, CAMERA_LERP } from './config';
import type { CameraRig } from './types';

export function createCameraRig(camera: THREE.PerspectiveCamera): CameraRig {
  const offset = new THREE.Vector3(
    CAMERA_OFFSET.x,
    CAMERA_OFFSET.y,
    CAMERA_OFFSET.z,
  );
  // Scratch vector reused each frame — no per-frame allocation.
  const desired = new THREE.Vector3();

  return {
    update(dt: number, target: THREE.Vector3): void {
      // desired = target + fixed offset
      desired.copy(target).add(offset);

      // Frame-rate-aware approximation of an exponential ease toward `desired`.
      // At 60fps (dt ≈ 1/60) alpha ≈ CAMERA_LERP, matching the plain lerp feel;
      // longer frames ease proportionally more so behaviour stays stable.
      const alpha = 1 - Math.pow(1 - CAMERA_LERP, Math.max(dt, 0) * 60);
      camera.position.lerp(desired, alpha);

      camera.lookAt(target);
    },
  };
}
