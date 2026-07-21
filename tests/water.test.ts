import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createWater } from '../src/world/water';
import type { AssetKey, AssetLibrary } from '../src/types';
import { RIPPLE_SPLASH_AMP } from '../src/config';

/** Fake asset library whose 'terrain' group contains a grid mesh named 'water'. */
function makeFakeAssets(): { assets: AssetLibrary; water: THREE.Mesh } {
  const geom = new THREE.PlaneGeometry(40, 40, 20, 20);
  geom.rotateX(-Math.PI / 2); // lie flat in the XZ plane like the GLB water grid
  const water = new THREE.Mesh(
    geom,
    new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.85 }),
  );
  water.name = 'water';
  const group = new THREE.Group();
  group.add(water);

  const assets: AssetLibrary = {
    scene: (_key: AssetKey) => group,
    clone: (_key: AssetKey) => group.clone(true),
  };
  return { assets, water };
}

function allYFinite(mesh: THREE.Mesh): boolean {
  const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    if (!Number.isFinite(pos.getY(i))) return false;
  }
  return true;
}

describe('water ripple/displacement stays finite (PRD §5.4)', () => {
  it('ambient waves keep every vertex finite over time', () => {
    const scene = new THREE.Scene();
    const { assets, water } = makeFakeAssets();
    const sim = createWater(scene, assets);

    let t = 0;
    for (let i = 0; i < 600; i++) {
      sim.update(1 / 60);
      t += 1 / 60;
    }
    expect(t).toBeGreaterThan(0);
    expect(allYFinite(water)).toBe(true);
  });

  it('stays finite after many overlapping ripple sources', () => {
    const scene = new THREE.Scene();
    const { assets, water } = makeFakeAssets();
    const sim = createWater(scene, assets);

    // Flood the ripple pool well past its cap, at varied positions/amplitudes.
    for (let i = 0; i < 50; i++) {
      sim.addRipple((i % 7) - 3, (i % 5) - 2, RIPPLE_SPLASH_AMP);
      sim.update(1 / 60);
      expect(allYFinite(water)).toBe(true);
    }

    // Let them decay out; must remain finite the whole way.
    for (let i = 0; i < 300; i++) {
      sim.update(1 / 30);
      expect(allYFinite(water)).toBe(true);
    }
  });

  it('displacement is bounded near the water level', () => {
    const scene = new THREE.Scene();
    const { assets, water } = makeFakeAssets();
    const sim = createWater(scene, assets);
    for (let i = 0; i < 10; i++) sim.addRipple(0, 0, RIPPLE_SPLASH_AMP);

    const pos = water.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let step = 0; step < 100; step++) {
      sim.update(1 / 60);
      for (let i = 0; i < pos.count; i++) {
        // Never drift absurdly far from the surface plane (~-1.2).
        expect(Math.abs(pos.getY(i))).toBeLessThan(10);
      }
    }
  });
});
