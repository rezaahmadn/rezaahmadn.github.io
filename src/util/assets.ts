/**
 * assets.ts — GLTFLoader + LoadingManager wrapper (PRD §5, §9).
 * Loads all 8 GLBs from /assets/, exposes them by AssetKey.
 *   scene(key) → the shared loaded gltf.scene (do not mutate for reuse)
 *   clone(key) → a deep copy (.clone(true)) for independent placement
 *
 * Note: the terrain file contains BOTH the 'terrain' and 'water' meshes,
 * so both live inside scene('terrain').
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AssetKey, AssetLibrary } from '../types';

const FILES: Record<AssetKey, string> = {
  tank: 'low-poly-tank.glb',
  terrain: 'low-poly-terrain.glb',
  'wrecked-building': 'wrecked-building.glb',
  'low-poly-house': 'low-poly-house.glb',
  'low-poly-tree': 'low-poly-tree.glb',
  'lowpoly-oak-tree': 'lowpoly-oak-tree.glb',
  'low-poly-bush': 'low-poly-bush.glb',
  'low-poly-rocks': 'low-poly-rocks.glb',
};

// Resolve /assets relative to the app base so it works under sub-path hosting.
const ASSET_BASE = `${import.meta.env.BASE_URL}assets/`.replace(/\/{2,}/g, '/');

export function createAssetLibrary(): {
  load(onProgress: (f: number) => void): Promise<AssetLibrary>;
} {
  return {
    load(onProgress: (f: number) => void): Promise<AssetLibrary> {
      return new Promise((resolve, reject) => {
        const scenes = new Map<AssetKey, THREE.Group>();
        const keys = Object.keys(FILES) as AssetKey[];

        const manager = new THREE.LoadingManager();
        manager.onProgress = (_url, loaded, total) => {
          onProgress(total > 0 ? loaded / total : 0);
        };
        manager.onError = (url) => {
          reject(new Error(`Failed to load asset: ${url}`));
        };

        const loader = new GLTFLoader(manager);
        let remaining = keys.length;

        for (const key of keys) {
          loader.load(
            `${ASSET_BASE}${FILES[key]}`,
            (gltf) => {
              scenes.set(key, gltf.scene);
              remaining -= 1;
              if (remaining === 0) {
                onProgress(1);
                resolve(makeLibrary(scenes));
              }
            },
            undefined,
            (err) => reject(err instanceof Error ? err : new Error(String(err))),
          );
        }
      });
    },
  };
}

function makeLibrary(scenes: Map<AssetKey, THREE.Group>): AssetLibrary {
  const get = (key: AssetKey): THREE.Group => {
    const s = scenes.get(key);
    if (!s) throw new Error(`Asset not loaded: ${key}`);
    return s;
  };
  return {
    scene: get,
    clone: (key: AssetKey): THREE.Object3D => get(key).clone(true),
  };
}
