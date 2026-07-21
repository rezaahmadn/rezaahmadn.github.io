import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { generateWorld } from '../src/world/scatter';
import { getProjects } from '../src/data/projects';
import type { AssetKey, GameContext, Collider, GroundSample } from '../src/types';

/**
 * Minimal fake GameContext with a FLAT ground so placement is driven purely by
 * the seeded rng (no terrain raycasts). assets.clone() returns a fresh unit-box
 * Object3D so seat()/Box3 math has a real, non-zero bounding box to normalize.
 */
function makeFakeContext(seed: number): GameContext {
  const scene = new THREE.Scene();
  const colliders: Collider[] = [];

  let a = seed >>> 0;
  const rng = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const up = new THREE.Vector3(0, 1, 0);
  const sampleGround = (): GroundSample => ({ height: 0.5, normal: up.clone() });

  const clone = (_key: AssetKey): THREE.Object3D => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const g = new THREE.Group();
    g.add(mesh);
    return g;
  };

  return {
    scene,
    camera: new THREE.PerspectiveCamera(),
    // renderer is never touched by scatter; a bare object satisfies the type in tests.
    renderer: {} as THREE.WebGLRenderer,
    assets: { scene: () => new THREE.Group(), clone },
    rng,
    seed,
    sampleGround,
    colliders,
  };
}

describe('scatter determinism (PRD §5.3, §10 P5)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('same seed yields identical POI spot positions', () => {
    const first = generateWorld(makeFakeContext(987654321));
    const second = generateWorld(makeFakeContext(987654321));

    expect(first.poiSpots.length).toBeGreaterThan(0);
    expect(second.poiSpots.length).toBe(first.poiSpots.length);

    const posOf = (r: typeof first) =>
      r.poiSpots.map((s) => [s.position.x, s.position.y, s.position.z, s.yaw]);

    expect(posOf(second)).toEqual(posOf(first));
  });

  it('different seeds yield different POI layouts', () => {
    const a = generateWorld(makeFakeContext(1));
    const b = generateWorld(makeFakeContext(2));
    const flat = (r: typeof a) => r.poiSpots.map((s) => [s.position.x, s.position.z]);
    expect(flat(a)).not.toEqual(flat(b));
  });

  it('places every project as a POI on a flat, unobstructed map', () => {
    const r = generateWorld(makeFakeContext(555));
    // Every project should place comfortably on flat ground — derived from the
    // data so adding a project needs no test edit (§7.4).
    expect(r.poiSpots.length).toBe(getProjects().length);
    // Rocks register colliders; there should be some.
    expect(r.colliders.length).toBeGreaterThan(0);
  });
});
