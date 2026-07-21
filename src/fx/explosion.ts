/**
 * fx/explosion.ts — pooled, texture-free effects (PRD §6).
 *
 * createFX(scene) exposes an FXSystem:
 *   muzzleFlash(pos, dir) — brief bright icosahedron + warm PointLight (~MUZZLE_FLASH_MS).
 *   groundExplosion(pos)  — tetra shards + expanding fireball + rising smoke + light (~EXPLOSION_LIFETIME).
 *   splash(pos)           — pale-blue droplet shards + expanding white surface ring (~0.8 s).
 *   update(dt)            — advances and recycles every live effect (all motion scaled by dt).
 *
 * Everything is pooled: meshes/lights are created once, added to the scene hidden,
 * and toggled visible on acquire. When a pool is exhausted the effect is skipped
 * (cosmetic only) — never allocated per-hit in update().
 */

import * as THREE from 'three';
import { MUZZLE_FLASH_MS, EXPLOSION_LIFETIME, WATER_LEVEL, SHELL_GRAVITY } from '../config';
import type { FXSystem } from '../types';

// --- Pool sizes (generous enough for several concurrent shell impacts) ---
const SHARD_POOL = 96;
const FIREBALL_POOL = 8;
const SMOKE_POOL = 24;
const RING_POOL = 24;
const LIGHT_POOL = 8;

// --- Palette ---
const COL_SHARD_HOT = new THREE.Color(0xff7722);
const COL_SHARD_DARK = new THREE.Color(0x333333);
const COL_DROPLET = new THREE.Color(0x99ccff);
const COL_FIRE_A = new THREE.Color(0xffdd55); // yellow
const COL_FIRE_B = new THREE.Color(0xff5511); // orange
const COL_SMOKE = new THREE.Color(0x676767);
const COL_RING = new THREE.Color(0xffffff);
const COL_MUZZLE = new THREE.Color(0xffcc66);
const COL_LIGHT_WARM = new THREE.Color(0xffaa44);

const MUZZLE_FLASH_S = MUZZLE_FLASH_MS / 1000;
const SPLASH_RING_LIFE = 0.8;

// Scratch objects reused across frames (no per-frame allocation).
const _tmpVec = new THREE.Vector3();

type Kind = 'shard' | 'fireball' | 'smoke' | 'ring' | 'muzzle';

interface Particle {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
  kind: Kind;
  active: boolean;
  age: number;
  life: number;
  vel: THREE.Vector3;
  angVel: THREE.Vector3;
  baseScale: number;
  maxScale: number;
  colorA: THREE.Color;
  colorB: THREE.Color;
  fade: number; // peak opacity
}

interface LightFx {
  light: THREE.PointLight;
  active: boolean;
  age: number;
  life: number;
  intensity: number;
}

export interface FX extends FXSystem {
  /** Expanding white surface ring reused for the tank's wading wake (PRD §6.3). */
  spawnWakeRing(pos: THREE.Vector3): void;
}

export function createFX(scene: THREE.Scene): FX {
  // --- Shared geometries (never mutated per-instance; transforms live on the mesh) ---
  const tetraGeo = new THREE.TetrahedronGeometry(0.22);
  const icoGeo = new THREE.IcosahedronGeometry(1, 0);
  const smokeGeo = new THREE.IcosahedronGeometry(1, 0);
  const muzzleGeo = new THREE.IcosahedronGeometry(0.35, 0);
  const ringGeo = new THREE.RingGeometry(0.55, 0.8, 28);

  const particles: Particle[] = [];
  const lights: LightFx[] = [];

  function makeStandardParticle(geo: THREE.BufferGeometry, kind: Kind, emissive: boolean): Particle {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      flatShading: true,
      transparent: true,
      opacity: 1,
      roughness: 0.9,
      metalness: 0,
      depthWrite: false,
    });
    if (emissive) mat.emissive = new THREE.Color(0x000000);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return {
      mesh,
      mat,
      kind,
      active: false,
      age: 0,
      life: 1,
      vel: new THREE.Vector3(),
      angVel: new THREE.Vector3(),
      baseScale: 1,
      maxScale: 1,
      colorA: new THREE.Color(),
      colorB: new THREE.Color(),
      fade: 1,
    };
  }

  function makeRingParticle(): Particle {
    const mat = new THREE.MeshBasicMaterial({
      color: COL_RING,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(ringGeo, mat);
    mesh.rotation.x = -Math.PI / 2; // lie flat on the water surface
    mesh.visible = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return {
      mesh,
      mat,
      kind: 'ring',
      active: false,
      age: 0,
      life: 1,
      vel: new THREE.Vector3(),
      angVel: new THREE.Vector3(),
      baseScale: 1,
      maxScale: 1,
      colorA: new THREE.Color(),
      colorB: new THREE.Color(),
      fade: 1,
    };
  }

  // Pre-allocate pools.
  for (let i = 0; i < SHARD_POOL; i++) particles.push(makeStandardParticle(tetraGeo, 'shard', true));
  for (let i = 0; i < FIREBALL_POOL; i++) particles.push(makeStandardParticle(icoGeo, 'fireball', true));
  for (let i = 0; i < SMOKE_POOL; i++) particles.push(makeStandardParticle(smokeGeo, 'smoke', false));
  for (let i = 0; i < RING_POOL; i++) particles.push(makeRingParticle());
  // Muzzle flash uses the emissive-ico family too.
  for (let i = 0; i < 4; i++) particles.push(makeStandardParticle(muzzleGeo, 'muzzle', true));

  for (let i = 0; i < LIGHT_POOL; i++) {
    const light = new THREE.PointLight(COL_LIGHT_WARM, 0, 18, 2);
    light.visible = false;
    scene.add(light);
    lights.push({ light, active: false, age: 0, life: 1, intensity: 0 });
  }

  function acquire(kind: Kind): Particle | null {
    for (const p of particles) {
      if (!p.active && p.kind === kind) return p;
    }
    return null;
  }

  function acquireLight(): LightFx | null {
    for (const l of lights) if (!l.active) return l;
    return null;
  }

  function rand(a: number, b: number): number {
    return a + Math.random() * (b - a);
  }

  function activate(p: Particle): void {
    p.active = true;
    p.age = 0;
    p.mesh.visible = true;
    p.mat.opacity = p.fade;
  }

  // --- Public: muzzle flash --------------------------------------------------
  function muzzleFlash(pos: THREE.Vector3, dir: THREE.Vector3): void {
    const p = acquire('muzzle');
    if (p) {
      p.life = MUZZLE_FLASH_S;
      p.baseScale = rand(0.9, 1.3);
      p.maxScale = p.baseScale;
      p.fade = 1;
      p.vel.set(0, 0, 0);
      p.angVel.set(rand(-8, 8), rand(-8, 8), rand(-8, 8));
      p.colorA.copy(COL_MUZZLE);
      p.colorB.copy(COL_MUZZLE);
      p.mat.color.copy(COL_MUZZLE);
      if ('emissive' in p.mat) p.mat.emissive.copy(COL_MUZZLE);
      // Nudge slightly out of the barrel so the flash reads at the muzzle tip.
      _tmpVec.copy(dir).normalize().multiplyScalar(0.25);
      p.mesh.position.copy(pos).add(_tmpVec);
      p.mesh.scale.setScalar(p.baseScale);
      activate(p);
    }
    const l = acquireLight();
    if (l) {
      l.active = true;
      l.age = 0;
      l.life = MUZZLE_FLASH_S;
      l.intensity = 6;
      l.light.color.copy(COL_MUZZLE);
      l.light.position.copy(pos);
      l.light.intensity = l.intensity;
      l.light.visible = true;
    }
  }

  // --- Public: ground explosion ---------------------------------------------
  function groundExplosion(pos: THREE.Vector3): void {
    const shardCount = 12 + Math.floor(Math.random() * 5); // 12–16
    for (let i = 0; i < shardCount; i++) {
      const p = acquire('shard');
      if (!p) break;
      const hot = Math.random() < 0.6;
      const col = hot ? COL_SHARD_HOT : COL_SHARD_DARK;
      p.life = rand(0.45, EXPLOSION_LIFETIME);
      p.baseScale = rand(0.7, 1.3);
      p.maxScale = p.baseScale;
      p.fade = 1;
      p.mat.color.copy(col);
      if ('emissive' in p.mat) p.mat.emissive.copy(hot ? col : new THREE.Color(0x000000)).multiplyScalar(hot ? 0.6 : 0);
      // Burst outward + up.
      const ang = Math.random() * Math.PI * 2;
      const outward = rand(2.5, 6);
      p.vel.set(Math.cos(ang) * outward, rand(3.5, 8), Math.sin(ang) * outward);
      p.angVel.set(rand(-12, 12), rand(-12, 12), rand(-12, 12));
      p.mesh.position.copy(pos);
      p.mesh.scale.setScalar(p.baseScale);
      activate(p);
    }

    // Expanding fireball.
    const fb = acquire('fireball');
    if (fb) {
      fb.life = EXPLOSION_LIFETIME;
      fb.baseScale = 0.3;
      fb.maxScale = 2.2;
      fb.fade = 1;
      fb.vel.set(0, 0, 0);
      fb.angVel.set(0, 0, 0);
      fb.colorA.copy(COL_FIRE_A);
      fb.colorB.copy(COL_FIRE_B);
      fb.mat.color.copy(COL_FIRE_A);
      if ('emissive' in fb.mat) fb.mat.emissive.copy(COL_FIRE_A);
      fb.mesh.position.copy(pos);
      fb.mesh.scale.setScalar(fb.baseScale);
      activate(fb);
    }

    // Rising smoke puffs.
    const smokeCount = 3 + Math.floor(Math.random() * 2); // 3–4
    for (let i = 0; i < smokeCount; i++) {
      const p = acquire('smoke');
      if (!p) break;
      p.life = rand(EXPLOSION_LIFETIME, EXPLOSION_LIFETIME * 1.4);
      p.baseScale = rand(0.5, 0.9);
      p.maxScale = p.baseScale * rand(2.2, 3.2);
      p.fade = 0.55;
      p.mat.color.copy(COL_SMOKE);
      p.vel.set(rand(-1, 1), rand(1.2, 2.4), rand(-1, 1));
      p.angVel.set(rand(-2, 2), rand(-2, 2), rand(-2, 2));
      p.mesh.position.set(pos.x + rand(-0.4, 0.4), pos.y + rand(0.2, 0.6), pos.z + rand(-0.4, 0.4));
      p.mesh.scale.setScalar(p.baseScale);
      activate(p);
    }

    // Flash light (~120 ms).
    const l = acquireLight();
    if (l) {
      l.active = true;
      l.age = 0;
      l.life = 0.12;
      l.intensity = 12;
      l.light.color.copy(COL_FIRE_A);
      l.light.position.copy(pos).add(_tmpVec.set(0, 0.6, 0));
      l.light.intensity = l.intensity;
      l.light.visible = true;
    }
  }

  // --- Public: water splash --------------------------------------------------
  function splash(pos: THREE.Vector3): void {
    const dropCount = 8 + Math.floor(Math.random() * 3); // 8–10
    for (let i = 0; i < dropCount; i++) {
      const p = acquire('shard');
      if (!p) break;
      p.life = rand(0.4, 0.8);
      p.baseScale = rand(0.4, 0.8);
      p.maxScale = p.baseScale;
      p.fade = 1;
      p.mat.color.copy(COL_DROPLET);
      if ('emissive' in p.mat) p.mat.emissive.copy(COL_DROPLET).multiplyScalar(0.2);
      const ang = Math.random() * Math.PI * 2;
      const outward = rand(1.5, 4);
      p.vel.set(Math.cos(ang) * outward, rand(4, 8), Math.sin(ang) * outward);
      p.angVel.set(rand(-10, 10), rand(-10, 10), rand(-10, 10));
      p.mesh.position.set(pos.x, WATER_LEVEL + 0.05, pos.z);
      p.mesh.scale.setScalar(p.baseScale);
      activate(p);
    }
    spawnRing(pos, 4.5, SPLASH_RING_LIFE, 0.9);
  }

  // --- Shared ring spawner (splash + wake) -----------------------------------
  function spawnRing(pos: THREE.Vector3, maxScale: number, life: number, fade: number): void {
    const p = acquire('ring');
    if (!p) return;
    p.life = life;
    p.baseScale = 0.4;
    p.maxScale = maxScale;
    p.fade = fade;
    p.vel.set(0, 0, 0);
    p.angVel.set(0, 0, 0);
    p.mat.color.copy(COL_RING);
    p.mesh.position.set(pos.x, WATER_LEVEL + 0.02, pos.z);
    p.mesh.scale.setScalar(p.baseScale);
    activate(p);
  }

  function spawnWakeRing(pos: THREE.Vector3): void {
    spawnRing(pos, 2.2, 0.8, 0.5);
  }

  // --- Update ---------------------------------------------------------------
  function update(dt: number): void {
    for (const p of particles) {
      if (!p.active) continue;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }

      switch (p.kind) {
        case 'shard': {
          p.vel.y += SHELL_GRAVITY * dt;
          p.mesh.position.addScaledVector(p.vel, dt);
          p.mesh.rotation.x += p.angVel.x * dt;
          p.mesh.rotation.y += p.angVel.y * dt;
          p.mesh.rotation.z += p.angVel.z * dt;
          const s = p.baseScale * (1 - t); // shrink to zero
          p.mesh.scale.setScalar(Math.max(0.0001, s));
          p.mat.opacity = p.fade * (1 - t * t);
          break;
        }
        case 'fireball': {
          const s = p.baseScale + (p.maxScale - p.baseScale) * t;
          p.mesh.scale.setScalar(s);
          const mat = p.mat as THREE.MeshStandardMaterial;
          mat.color.copy(p.colorA).lerp(p.colorB, t);
          if (mat.emissive) mat.emissive.copy(p.colorA).lerp(p.colorB, t);
          mat.opacity = p.fade * (1 - t);
          break;
        }
        case 'smoke': {
          p.mesh.position.addScaledVector(p.vel, dt);
          p.mesh.rotation.x += p.angVel.x * dt;
          p.mesh.rotation.y += p.angVel.y * dt;
          const s = p.baseScale + (p.maxScale - p.baseScale) * t;
          p.mesh.scale.setScalar(s);
          p.mat.opacity = p.fade * (1 - t);
          break;
        }
        case 'ring': {
          const s = p.baseScale + (p.maxScale - p.baseScale) * t;
          p.mesh.scale.set(s, s, s);
          p.mat.opacity = p.fade * (1 - t);
          break;
        }
        case 'muzzle': {
          p.mesh.rotation.x += p.angVel.x * dt;
          p.mesh.rotation.y += p.angVel.y * dt;
          p.mesh.rotation.z += p.angVel.z * dt;
          // brief pop then fade
          p.mesh.scale.setScalar(p.baseScale * (1 + 0.4 * Math.sin(Math.PI * t)));
          p.mat.opacity = p.fade * (1 - t);
          break;
        }
      }
    }

    for (const l of lights) {
      if (!l.active) continue;
      l.age += dt;
      const t = l.age / l.life;
      if (t >= 1) {
        l.active = false;
        l.light.intensity = 0;
        l.light.visible = false;
        continue;
      }
      l.light.intensity = l.intensity * (1 - t);
    }
  }

  return { muzzleFlash, groundExplosion, splash, spawnWakeRing, update };
}
