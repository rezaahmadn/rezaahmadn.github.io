/**
 * projectile.ts — shell pool, ballistics, and impact routing (PRD §5.5).
 *
 * A fixed pool of SHELL_POOL shells (small stretched spheres). `fire` activates
 * one at the muzzle with a velocity along the aim direction and triggers the
 * muzzle flash. `update` integrates gravity and, per active shell, tests impacts
 * in order: POI hit → water splash (over the lake) → ground explosion → expire.
 */

import * as THREE from 'three';
import type { GameContext, FXSystem, POISystem, WaterSystem, PlacedPOI, ProjectileSystem } from '../types';
import {
  SHELL_POOL,
  SHELL_SPEED,
  SHELL_GRAVITY,
  SHELL_LIFETIME,
  FIRE_COOLDOWN,
  WATER_LEVEL,
  RIPPLE_SPLASH_AMP,
} from '../config';

interface Shell {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  age: number;
  active: boolean;
}

// Local long axis of the shell geometry (stretched along +Z below).
const FORWARD = new THREE.Vector3(0, 0, 1);
// Scratch reused by orient() so no Vector3 is allocated per shell per frame.
const _dir = new THREE.Vector3();

export function createProjectiles(
  ctx: GameContext,
  fx: FXSystem,
  poi: POISystem,
  water: WaterSystem,
  onPoiHit: (p: PlacedPOI) => void,
): ProjectileSystem {
  // Shared geometry: a small sphere stretched along Z into a shell-like slug.
  const geometry = new THREE.SphereGeometry(0.12, 8, 6);
  geometry.scale(1, 1, 2.4);

  // Shared material — flat-shaded, faintly self-lit so shells read against fog.
  const material = new THREE.MeshStandardMaterial({
    color: 0x2b2b2b,
    emissive: 0xffb84d,
    emissiveIntensity: 0.6,
    metalness: 0.2,
    roughness: 0.5,
    flatShading: true,
  });

  const shells: Shell[] = [];
  for (let i = 0; i < SHELL_POOL; i++) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    mesh.castShadow = false;
    mesh.matrixAutoUpdate = true;
    ctx.scene.add(mesh);
    shells.push({ mesh, velocity: new THREE.Vector3(), age: 0, active: false });
  }

  // Soft internal cooldown guard (the caller also gates via input.consumeFire()).
  let sinceLastFire = FIRE_COOLDOWN;

  function acquire(): Shell {
    // Prefer an inactive shell; otherwise recycle the oldest active one.
    let free: Shell | null = null;
    let oldest: Shell = shells[0];
    for (const s of shells) {
      if (!s.active) {
        free = s;
        break;
      }
      if (s.age > oldest.age) oldest = s;
    }
    return free ?? oldest;
  }

  function deactivate(s: Shell): void {
    s.active = false;
    s.mesh.visible = false;
  }

  function orient(s: Shell): void {
    if (s.velocity.lengthSq() > 1e-8) {
      s.mesh.quaternion.setFromUnitVectors(FORWARD, _dir.copy(s.velocity).normalize());
    }
  }

  function fire(origin: THREE.Vector3, dir: THREE.Vector3): void {
    if (sinceLastFire < FIRE_COOLDOWN) return;
    if (dir.lengthSq() < 1e-8) return;
    sinceLastFire = 0;

    const s = acquire();
    s.age = 0;
    s.active = true;
    s.velocity.copy(dir).normalize().multiplyScalar(SHELL_SPEED);
    s.mesh.position.copy(origin);
    s.mesh.visible = true;
    orient(s);

    fx.muzzleFlash(origin, dir);
  }

  function update(dt: number): void {
    sinceLastFire += dt;

    for (const s of shells) {
      if (!s.active) continue;

      s.age += dt;

      // Ballistic integration (semi-implicit Euler): gravity, then position.
      s.velocity.y += SHELL_GRAVITY * dt;
      s.mesh.position.addScaledVector(s.velocity, dt);
      orient(s);

      const pos = s.mesh.position;

      // 1) POI hit — highest priority.
      const hit = poi.hitTest(pos);
      if (hit) {
        onPoiHit(hit);
        fx.groundExplosion(pos);
        poi.pulse(hit); // quick building scale-pulse (§5.5)
        deactivate(s);
        continue;
      }

      // 2) Water splash — below the surface while over the lake. The lakebed is
      // the only terrain that dips beneath WATER_LEVEL, so a ground sample below
      // the surface reliably identifies "over the lake".
      const ground = ctx.sampleGround(pos.x, pos.z);
      if (pos.y < WATER_LEVEL && ground.height < WATER_LEVEL) {
        fx.splash(pos);
        water.addRipple(pos.x, pos.z, RIPPLE_SPLASH_AMP);
        deactivate(s);
        continue;
      }

      // 3) Ground explosion — at or below the terrain surface.
      if (pos.y <= ground.height) {
        fx.groundExplosion(pos);
        deactivate(s);
        continue;
      }

      // 4) Expire after its lifetime with no impact.
      if (s.age > SHELL_LIFETIME) {
        deactivate(s);
      }
    }
  }

  return { fire, update };
}
