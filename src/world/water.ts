/**
 * water.ts — animated lake surface (PRD §5.4).
 *
 * Extracts the 'water' mesh from the terrain GLB, keeps its imported material
 * (flat-shaded, translucent), and displaces its vertices each frame with three
 * ambient sine waves plus a pool of decaying ripple sources spawned by the
 * tank driving through / shells splashing into the lake.
 *
 * Allocation-light: base vertex positions are cached once; the ripple pool is a
 * fixed-size preallocated array of reusable slots; the per-frame update touches
 * only the existing typed arrays.
 */

import * as THREE from 'three';
import type { AssetLibrary, WaterSystem } from '../types';
import { WATER_LEVEL, WAVE_AMBIENT, RIPPLE_MAX } from '../config';

/** Ripple sources drop out once older than this many seconds. */
const RIPPLE_MAX_AGE = 2.5;

interface RippleSource {
  active: boolean;
  x: number;
  z: number;
  amp: number;
  age: number;
}

export function createWater(scene: THREE.Scene, assets: AssetLibrary): WaterSystem {
  // --- Locate the 'water' mesh inside the shared terrain scene ---------------
  const terrain = assets.scene('terrain');
  const found = terrain.getObjectByName('water');
  if (!found || !(found as THREE.Mesh).isMesh) {
    throw new Error("water.ts: 'water' mesh not found in terrain GLB");
  }
  const water = found as THREE.Mesh;

  // Bake the mesh's world transform into its geometry, then reparent to the
  // scene root with an identity matrix. This keeps the cached base positions in
  // true world space so `y = WATER_LEVEL + waves` lands on the intended plane
  // regardless of any transform the GLB root carried.
  water.updateWorldMatrix(true, false);
  water.geometry.applyMatrix4(water.matrixWorld);
  water.position.set(0, 0, 0);
  water.quaternion.identity();
  water.scale.set(1, 1, 1);
  scene.add(water);

  // --- Material: reuse imported, make it low-poly + translucent --------------
  const applyLook = (mat: THREE.Material) => {
    const m = mat as THREE.MeshStandardMaterial;
    if ('flatShading' in m) {
      m.flatShading = true;
    }
    m.transparent = true;
    m.opacity = 0.85;
    m.needsUpdate = true;
  };
  if (Array.isArray(water.material)) {
    water.material.forEach(applyLook);
  } else {
    applyLook(water.material);
  }

  // --- Cache base vertex positions ------------------------------------------
  const geom = water.geometry as THREE.BufferGeometry;
  const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
  const positions = posAttr.array as Float32Array;
  const vertexCount = posAttr.count;
  const baseX = new Float32Array(vertexCount);
  const baseZ = new Float32Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    baseX[i] = positions[i * 3];
    baseZ[i] = positions[i * 3 + 2];
  }

  // --- Ripple pool (fixed, reusable slots) -----------------------------------
  const ripples: RippleSource[] = new Array(RIPPLE_MAX);
  for (let i = 0; i < RIPPLE_MAX; i++) {
    ripples[i] = { active: false, x: 0, z: 0, amp: 0, age: 0 };
  }

  let time = 0;

  function addRipple(x: number, z: number, amp: number): void {
    // Prefer an inactive slot; otherwise evict the oldest active one.
    let slot: RippleSource | null = null;
    let oldest: RippleSource | null = null;
    for (let i = 0; i < RIPPLE_MAX; i++) {
      const r = ripples[i];
      if (!r.active) {
        slot = r;
        break;
      }
      if (oldest === null || r.age > oldest.age) {
        oldest = r;
      }
    }
    const target = slot ?? oldest!;
    target.active = true;
    target.x = x;
    target.z = z;
    target.amp = amp;
    target.age = 0;
  }

  function update(dt: number): void {
    time += dt;

    // Age ripples; retire the expired ones.
    for (let i = 0; i < RIPPLE_MAX; i++) {
      const r = ripples[i];
      if (!r.active) continue;
      r.age += dt;
      if (r.age > RIPPLE_MAX_AGE) {
        r.active = false;
      }
    }

    for (let v = 0; v < vertexCount; v++) {
      const x = baseX[v];
      const z = baseZ[v];

      // Three ambient travelling sine waves.
      let y = WATER_LEVEL;
      for (let w = 0; w < WAVE_AMBIENT.length; w++) {
        const wave = WAVE_AMBIENT[w];
        const phase = wave.k * (wave.dirX * x + wave.dirZ * z) + wave.omega * time;
        y += wave.amp * Math.sin(phase);
      }

      // Active ripple sources: decaying radial ring.
      for (let i = 0; i < RIPPLE_MAX; i++) {
        const r = ripples[i];
        if (!r.active) continue;
        const dx = x - r.x;
        const dz = z - r.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        y +=
          r.amp *
          Math.exp(-1.8 * r.age) *
          Math.exp(-0.18 * dist) *
          Math.sin(6 * dist - 8 * r.age);
      }

      positions[v * 3 + 1] = y;
    }

    posAttr.needsUpdate = true;
    geom.computeVertexNormals();
  }

  return { update, addRipple };
}
