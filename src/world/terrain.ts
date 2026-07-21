/**
 * terrain.ts — ground mesh + the single height authority (PRD §5.1).
 *
 * createTerrain(scene, assets):
 *   - Extracts the 'terrain' mesh from the shared terrain GLB (which also
 *     contains the 'water' mesh — that one is owned by water.ts).
 *   - Re-parents it into the scene (preserving world transform) and enables
 *     shadow receiving.
 *   - Exposes sampleGround(x, z): a single downward raycast from y = 50 against
 *     the terrain mesh, returning { height, normal } where normal is the hit
 *     face normal transformed into world space. Off-mesh → { height: 0, up }.
 *
 * This sampleGround is THE height authority consumed by tank, scatter, POI, and
 * projectile. A single Raycaster and its origin/direction vectors are reused
 * across calls (no per-call allocation in the cast path).
 */

import * as THREE from 'three';
import type { AssetLibrary, GroundSample, TerrainSystem } from '../types';

const RAY_START_Y = 50;

export function createTerrain(
  scene: THREE.Scene,
  assets: AssetLibrary,
): TerrainSystem {
  const group = assets.scene('terrain');

  // Make sure world matrices are current before we read/reparent.
  group.updateMatrixWorld(true);

  // The terrain exports as MULTIPLE primitives (grass + a separate sand/lakebed
  // primitive that dips to ~-4), which glTF splits into separate meshes under the
  // 'terrain' group. We must render AND raycast ALL of them — sampling only one
  // leaves the lakebed invisible to sampleGround (lake reads as flat y=0, which
  // silently drops decoration into the water and breaks tank wading). The 'water'
  // surface mesh is owned by water.ts, so exclude it (and anything under it).
  const isWater = (obj: THREE.Object3D): boolean => {
    for (let o: THREE.Object3D | null = obj; o; o = o.parent) {
      if (o.name === 'water') return true;
    }
    return false;
  };

  const groundMeshes: THREE.Mesh[] = [];
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh && !isWater(obj)) groundMeshes.push(obj);
  });
  if (groundMeshes.length === 0) {
    throw new Error("terrain: no ground mesh found in low-poly-terrain.glb");
  }

  // Re-parent every ground primitive into the scene, preserving world transform.
  // Precompute each mesh's world→normal matrix once (the terrain never moves).
  const normalMatrices = new Map<THREE.Mesh, THREE.Matrix3>();
  for (const gm of groundMeshes) {
    scene.attach(gm);
    gm.receiveShadow = true;
    gm.castShadow = false; // ground receives shadows, doesn't cast
    gm.updateMatrixWorld(true);
    normalMatrices.set(gm, new THREE.Matrix3().getNormalMatrix(gm.matrixWorld));
  }

  // --- Reusable cast machinery (no per-call allocation in the hot path) ---
  const raycaster = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0);
  const UP = new THREE.Vector3(0, 1, 0);

  // Single reused sample + normal. Safe because every caller consumes the result
  // (height and/or normal) immediately, before the next sampleGround() call — no
  // caller retains a normal across calls. Avoids per-call heap churn (this is the
  // height authority, hit several times per frame).
  const outNormal = new THREE.Vector3(0, 1, 0);
  const out: GroundSample = { height: 0, normal: outNormal };

  function sampleGround(x: number, z: number): GroundSample {
    origin.set(x, RAY_START_Y, z);
    raycaster.set(origin, down);
    // Hit any ground primitive (grass or the sand lakebed); no recursion needed.
    const hits = raycaster.intersectObjects(groundMeshes, false);

    if (hits.length === 0) {
      out.height = 0;
      outNormal.copy(UP);
      return out;
    }

    const hit = hits[0];
    const nm = normalMatrices.get(hit.object as THREE.Mesh);
    if (hit.face && nm) {
      outNormal.copy(hit.face.normal).applyMatrix3(nm).normalize();
      // Guard against a degenerate/near-zero transformed normal.
      if (outNormal.lengthSq() < 1e-8) outNormal.copy(UP);
    } else {
      outNormal.copy(UP);
    }

    out.height = hit.point.y;
    return out;
  }

  return {
    sampleGround,
    mesh: groundMeshes[0],
  };
}
