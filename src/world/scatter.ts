/**
 * scatter.ts — §5.3 seeded procedural placement.
 *
 * generateWorld(ctx) runs once at load, entirely from ctx.rng, in a fixed order
 * so the same seed always yields the same world:
 *   1. POIs   — one per project in data/projects.ts (rejection-sampled).
 *   2. Decoration — trees / bushes / rocks around (but clear of) the POIs.
 *
 * Only rocks register colliders; trees and bushes are drive-through.
 */

import * as THREE from 'three';
import type { AssetKey, Collider, GameContext, PoiSpot, ScatterResult } from '../types';
import { getProjects } from '../data/projects';
import {
  DECO_BUSHES,
  DECO_MIN_FROM_POI,
  DECO_MIN_FROM_SPAWN,
  DECO_MIN_SPACING,
  DECO_ROCKS,
  DECO_TREES,
  POI_MAX_FROM_ORIGIN,
  POI_MIN_FROM_SPAWN,
  POI_MIN_SPACING,
  WORLD_BOUND,
} from '../config';

// --- Local tunables (not named by config) ---------------------------------
/** Ground below this height is lake / beach — nothing is placed there (§5.3). */
const GROUND_MIN_HEIGHT = -0.9;
/** Corner offset (units) used to probe local slope via a 4-sample height spread. */
const SLOPE_PROBE = 1.5;
/** Max height spread across the 4 corners for a POI (≈ 15° over 2·SLOPE_PROBE). */
const POI_SLOPE_MAX_SPREAD = 0.8;
/** Attempts per candidate before a constraint round is relaxed. */
const ATTEMPTS_PER_ROUND = 200;
/** Safety cap on relaxation rounds (guarantees termination). */
const MAX_RELAX_ROUNDS = 40;
/** Attempts per decoration instance before it is skipped. */
const DECO_ATTEMPTS = 150;
/** Warn threshold: more POIs than the 100×100 terrain comfortably fits (§7.4). */
const POI_SOFT_MAX = 12;

/** Target heights (units) that decoration clones are normalized to before jitter. */
const TREE_HEIGHT = 4;
const BUSH_HEIGHT = 1.2;
const ROCK_HEIGHT = 1.4;
/** Uniform per-instance scale jitter: ±15%. */
const SCALE_JITTER = 0.15;

const TREE_KEYS: AssetKey[] = ['low-poly-tree', 'lowpoly-oak-tree'];

interface Placed {
  x: number;
  z: number;
}

function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

/** 4-corner height spread around (x,z); large spread ⇒ steep ⇒ reject. */
function slopeSpread(ctx: GameContext, x: number, z: number): number {
  const d = SLOPE_PROBE;
  const h0 = ctx.sampleGround(x - d, z - d).height;
  const h1 = ctx.sampleGround(x + d, z - d).height;
  const h2 = ctx.sampleGround(x - d, z + d).height;
  const h3 = ctx.sampleGround(x + d, z + d).height;
  const min = Math.min(h0, h1, h2, h3);
  const max = Math.max(h0, h1, h2, h3);
  return max - min;
}

/**
 * Normalize a clone to `targetHeight`, apply yaw + ±15% jitter, and seat its
 * base on the ground at (x, groundHeight, z). Returns the xz footprint radius.
 */
function seat(
  obj: THREE.Object3D,
  x: number,
  z: number,
  groundHeight: number,
  yaw: number,
  targetHeight: number,
  jitter: number,
): number {
  obj.rotation.y = yaw;
  obj.scale.setScalar(1);
  obj.position.set(0, 0, 0);
  obj.updateMatrixWorld(true);

  const box0 = new THREE.Box3().setFromObject(obj);
  const natural = box0.max.y - box0.min.y || 1;
  const s = (targetHeight / natural) * jitter;
  obj.scale.setScalar(s);
  obj.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(obj);
  obj.position.set(x, groundHeight - box.min.y, z);

  const sx = box.max.x - box.min.x;
  const sz = box.max.z - box.min.z;
  return Math.max(sx, sz) / 2;
}

function placePOIs(ctx: GameContext): PoiSpot[] {
  const projects = getProjects();
  if (projects.length > POI_SOFT_MAX) {
    console.warn(
      `[scatter] ${projects.length} POIs exceeds the ~${POI_SOFT_MAX} the 100×100 terrain fits comfortably; consider a larger terrain export.`,
    );
  }

  const spots: PoiSpot[] = [];
  let spacing = POI_MIN_SPACING;
  let slopeMax = POI_SLOPE_MAX_SPREAD;

  for (const project of projects) {
    let placed = false;

    for (let round = 0; round < MAX_RELAX_ROUNDS && !placed; round++) {
      for (let attempt = 0; attempt < ATTEMPTS_PER_ROUND; attempt++) {
        const x = (ctx.rng() * 2 - 1) * POI_MAX_FROM_ORIGIN;
        const z = (ctx.rng() * 2 - 1) * POI_MAX_FROM_ORIGIN;

        // ≥ POI_MIN_FROM_SPAWN from origin.
        if (dist2(x, z, 0, 0) < POI_MIN_FROM_SPAWN * POI_MIN_FROM_SPAWN) continue;

        // Not in lake / on beach. Capture the height now: sampleGround returns a
        // reused scratch, and slopeSpread() below overwrites it with corner samples.
        const groundHeight = ctx.sampleGround(x, z).height;
        if (groundHeight <= GROUND_MIN_HEIGHT) continue;

        // Not too steep.
        if (slopeSpread(ctx, x, z) > slopeMax) continue;

        // ≥ spacing from every other POI.
        let ok = true;
        for (const s of spots) {
          if (dist2(x, z, s.position.x, s.position.z) < spacing * spacing) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;

        const yaw = ctx.rng() * Math.PI * 2;
        spots.push({ project, position: new THREE.Vector3(x, groundHeight, z), yaw });
        placed = true;
        break;
      }

      if (!placed) {
        // Relax distances by 20% (and loosen slope) and retry — guarantees termination.
        spacing *= 0.8;
        slopeMax *= 1.25;
      }
    }

    if (!placed) {
      console.warn(`[scatter] could not place POI "${project.id}" after relaxation; skipping.`);
    }
  }

  return spots;
}

function scatterDecoration(
  ctx: GameContext,
  spots: PoiSpot[],
): { decoration: THREE.Object3D[]; colliders: Collider[] } {
  const decoration: THREE.Object3D[] = [];
  const rockColliders: Collider[] = [];
  const placed: Placed[] = [];

  const kinds: Array<{ count: number; height: number; isRock: boolean; pick: () => AssetKey }> = [
    {
      count: DECO_TREES,
      height: TREE_HEIGHT,
      isRock: false,
      pick: () => (ctx.rng() < 0.5 ? TREE_KEYS[0] : TREE_KEYS[1]),
    },
    { count: DECO_BUSHES, height: BUSH_HEIGHT, isRock: false, pick: () => 'low-poly-bush' },
    { count: DECO_ROCKS, height: ROCK_HEIGHT, isRock: true, pick: () => 'low-poly-rocks' },
  ];

  const spawnMin2 = DECO_MIN_FROM_SPAWN * DECO_MIN_FROM_SPAWN;
  const poiMin2 = DECO_MIN_FROM_POI * DECO_MIN_FROM_POI;
  const spacing2 = DECO_MIN_SPACING * DECO_MIN_SPACING;

  for (const kind of kinds) {
    for (let i = 0; i < kind.count; i++) {
      for (let attempt = 0; attempt < DECO_ATTEMPTS; attempt++) {
        const x = (ctx.rng() * 2 - 1) * WORLD_BOUND;
        const z = (ctx.rng() * 2 - 1) * WORLD_BOUND;

        if (dist2(x, z, 0, 0) < spawnMin2) continue;

        const ground = ctx.sampleGround(x, z);
        if (ground.height <= GROUND_MIN_HEIGHT) continue;

        // Keep sightlines to POIs clear.
        let ok = true;
        for (const s of spots) {
          if (dist2(x, z, s.position.x, s.position.z) < poiMin2) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;

        for (const p of placed) {
          if (dist2(x, z, p.x, p.z) < spacing2) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;

        const yaw = ctx.rng() * Math.PI * 2;
        const jitter = 1 + (ctx.rng() * 2 - 1) * SCALE_JITTER;
        const obj = ctx.assets.clone(kind.pick());
        const radius = seat(obj, x, z, ground.height, yaw, kind.height, jitter);

        ctx.scene.add(obj);
        decoration.push(obj);
        placed.push({ x, z });

        if (kind.isRock) {
          const collider: Collider = { x, z, radius };
          rockColliders.push(collider);
          ctx.colliders.push(collider);
        }

        break;
      }
    }
  }

  return { decoration, colliders: rockColliders };
}

export function generateWorld(ctx: GameContext): ScatterResult {
  const poiSpots = placePOIs(ctx);
  const { decoration, colliders } = scatterDecoration(ctx, poiSpots);
  return { colliders, poiSpots, decoration };
}
