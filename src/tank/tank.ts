/**
 * tank/tank.ts — the player tank (PRD §5.1, §5.2, §5.5-context).
 *
 * Responsibilities:
 *  - Clone the 'tank' GLB, measure its hull bbox and scale so hull length ≈ TANK_LENGTH.
 *  - Drive from InputSystem.drive() (throttle/steer) — forward/reverse + hull yaw, all × dt.
 *  - Terrain follow: y from sampleGround under hull center; pitch/roll from the ground
 *    normal, lerped ~10%/frame.
 *  - Cylinder collision against ctx.colliders with slide-along resolution; clamp to WORLD_BOUND.
 *  - Water rule: while wading, speed × TANK_WATER_SPEED_MULT and spawn wake ripples.
 *  - Turret yaw from InputSystem.turret(); optional roadwheel/sprocket spin while driving.
 *  - getMuzzle(): world position + barrel direction of the 'muzzle' node.
 *  - Barrel recoil on fire (§6.1) and wading wake rings every 0.3 s (§6.3).
 */

import * as THREE from 'three';
import type { GameContext, InputSystem, WaterSystem, TankSystem } from '../types';
import type { FX } from '../fx/explosion';
import {
  TANK_LENGTH,
  TANK_FORWARD_SPEED,
  TANK_REVERSE_SPEED,
  TANK_YAW_SPEED,
  TANK_WATER_SPEED_MULT,
  WATER_LEVEL,
  WORLD_BOUND,
  RIPPLE_TANK_INTERVAL,
  RIPPLE_TANK_AMP,
} from '../config';

// --- Local (non-config) tuning: aesthetic / spec-described, not named in config.ts ---
const NORMAL_LERP = 0.1; // ~10%/frame slope alignment (PRD §5.1)
const WHEEL_SPIN_PER_UNIT = 6; // radians of wheel roll per world unit travelled
const COLLISION_ITERATIONS = 3; // slide-resolution passes per frame
const RADIUS_PADDING = 1.15; // grow footprint radius a touch beyond half-width

// The tank GLB is authored forward = +X (hull long axis on X, tracks split on ±Z,
// barrel runs mantlet→muzzle along +X). The game drives/aims toward −Z at heading 0,
// so the model gets a base yaw that maps its authored +X onto world −Z.
const BASE_YAW = Math.PI / 2;

// Barrel recoil (§6.1): kick back 0.15 world units, ease back over 150 ms.
const RECOIL_DIST = 0.15;
const RECOIL_S = 0.15;
// Visible white wake ring while wading (§6.3), on its own cadence.
const WAKE_INTERVAL = 0.3;

const UP = new THREE.Vector3(0, 1, 0);
// In the 'muzzle' node's local frame the barrel points +Y (the node carries a +90°
// Z rotation; local +Y maps to turret +X, the physical barrel axis).
const MUZZLE_FORWARD = new THREE.Vector3(0, 1, 0);

export function createTank(
  ctx: GameContext,
  input: InputSystem,
  water: WaterSystem,
  fx: FX,
): TankSystem {
  // ----- Build the visual -----
  const object = new THREE.Group();
  object.name = 'tank-rig';

  const model = ctx.assets.clone('tank');
  model.updateMatrixWorld(true);

  // Measure hull length (fall back to the whole tank if 'hull' is missing).
  const hull = model.getObjectByName('hull') ?? model;
  const hullBox = new THREE.Box3().setFromObject(hull);
  const hullSize = hullBox.getSize(new THREE.Vector3());
  const hullLength = Math.max(hullSize.z, hullSize.x, 1e-3);
  const scale = TANK_LENGTH / hullLength;
  model.scale.setScalar(scale);
  // Align the authored +X-forward model with the game's −Z forward.
  model.rotation.y = BASE_YAW;

  // Footprint radius for collision (half-WIDTH of the hull — the minor xz axis —
  // padded, in scaled units). Using the major axis would over-inflate the radius.
  const hullWidth = Math.min(hullSize.x, hullSize.z);
  const tankRadius = 0.5 * Math.max(hullWidth, 1e-3) * scale * RADIUS_PADDING;

  // Enable shadows on the tank meshes (renderer decides whether they're used).
  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  object.add(model);
  ctx.scene.add(object);

  // ----- Sub-nodes -----
  const turretNode = model.getObjectByName('turret');
  const muzzleNode = model.getObjectByName('muzzle');
  const barrelNode = model.getObjectByName('barrel');
  // The barrel node's local +X runs toward the muzzle; recoil pushes it −X. Cache
  // its base local X and convert the world-space kick into local (unscaled) units.
  const barrelBaseX = barrelNode ? barrelNode.position.x : 0;
  const recoilLocal = RECOIL_DIST / scale;
  // Roll the road wheels + drive sprockets while driving. (The segmented track
  // links themselves are baked into the model with identity transforms and share
  // a single mesh, so the belt can't be scrolled from code — the rolling wheels
  // carry the sense of motion. A true scrolling belt would need the tank
  // re-authored in Blender with an animatable track.)
  const wheels: THREE.Object3D[] = [];
  model.traverse((o) => {
    const n = o.name.toLowerCase();
    if (n.includes('roadwheel') || n.includes('sprocket')) wheels.push(o);
  });

  // ----- State -----
  let heading = 0; // hull yaw about Y (radians)
  const smoothNormal = new THREE.Vector3(0, 1, 0);
  let rippleTimer = 0;
  let wakeTimer = 0;
  let recoilTimer = 0; // counts down from RECOIL_S after each shot

  // Place at origin on the ground.
  {
    const g = ctx.sampleGround(0, 0);
    object.position.set(0, g.height, 0);
    smoothNormal.copy(g.normal);
  }

  // Scratch objects (avoid per-frame allocation).
  const qTilt = new THREE.Quaternion();
  const qYaw = new THREE.Quaternion();
  const muzzlePos = new THREE.Vector3();
  const muzzleQuat = new THREE.Quaternion();
  const muzzleDir = new THREE.Vector3();

  function resolveCollisions(nx: number, nz: number): { x: number; z: number } {
    let x = nx;
    let z = nz;
    for (let iter = 0; iter < COLLISION_ITERATIONS; iter++) {
      let moved = false;
      for (const c of ctx.colliders) {
        const dx = x - c.x;
        const dz = z - c.z;
        const minDist = c.radius + tankRadius;
        const d2 = dx * dx + dz * dz;
        if (d2 < minDist * minDist) {
          const d = Math.sqrt(d2);
          if (d > 1e-4) {
            // Push out along the surface normal → cancels the into-collider component (slide).
            x = c.x + (dx / d) * minDist;
            z = c.z + (dz / d) * minDist;
          } else {
            // Degenerate: dead-center. Nudge out along +X.
            x = c.x + minDist;
            z = c.z;
          }
          moved = true;
        }
      }
      if (!moved) break;
    }
    return { x, z };
  }

  function update(dt: number): void {
    const active = !input.paused;

    // --- Drive intent ---
    const drive = active ? input.drive() : { throttle: 0, steer: 0 };
    const throttle = THREE.MathUtils.clamp(drive.throttle, -1, 1);
    const steer = THREE.MathUtils.clamp(drive.steer, -1, 1);

    // --- Water: sample under the current hull centre to decide wading ---
    const hereGround = ctx.sampleGround(object.position.x, object.position.z);
    const depth = WATER_LEVEL - hereGround.height;
    const wading = depth > 0;
    const speedMult = wading ? TANK_WATER_SPEED_MULT : 1;

    // --- Hull yaw ---
    heading -= steer * TANK_YAW_SPEED * dt;

    // --- Forward / reverse translation ---
    const baseSpeed = throttle >= 0 ? TANK_FORWARD_SPEED : TANK_REVERSE_SPEED;
    const travel = throttle * baseSpeed * speedMult * dt; // signed world units this frame

    const fwdX = -Math.sin(heading);
    const fwdZ = -Math.cos(heading);
    let nx = object.position.x + fwdX * travel;
    let nz = object.position.z + fwdZ * travel;

    // --- Collision slide ---
    ({ x: nx, z: nz } = resolveCollisions(nx, nz));

    // --- World bounds clamp ---
    nx = THREE.MathUtils.clamp(nx, -WORLD_BOUND, WORLD_BOUND);
    nz = THREE.MathUtils.clamp(nz, -WORLD_BOUND, WORLD_BOUND);

    object.position.x = nx;
    object.position.z = nz;

    // --- Terrain follow: height + pitch/roll ---
    const g = ctx.sampleGround(nx, nz);
    object.position.y = g.height;
    smoothNormal.lerp(g.normal, NORMAL_LERP);
    if (smoothNormal.lengthSq() < 1e-6) smoothNormal.copy(UP);
    smoothNormal.normalize();

    qTilt.setFromUnitVectors(UP, smoothNormal);
    qYaw.setFromAxisAngle(UP, heading);
    object.quaternion.copy(qTilt).multiply(qYaw);

    // --- Wake ripples (sim displacement) + wake rings (visible surface, §6.3) ---
    if (wading && Math.abs(travel) > 1e-5) {
      rippleTimer += dt;
      while (rippleTimer >= RIPPLE_TANK_INTERVAL) {
        rippleTimer -= RIPPLE_TANK_INTERVAL;
        water.addRipple(object.position.x, object.position.z, RIPPLE_TANK_AMP);
      }
      wakeTimer += dt;
      while (wakeTimer >= WAKE_INTERVAL) {
        wakeTimer -= WAKE_INTERVAL;
        fx.spawnWakeRing(object.position);
      }
    } else {
      rippleTimer = 0;
      wakeTimer = 0;
    }

    // --- Barrel recoil easing (§6.1): eases from −RECOIL_DIST back to base ---
    if (barrelNode) {
      if (recoilTimer > 0) {
        recoilTimer = Math.max(0, recoilTimer - dt);
        const frac = recoilTimer / RECOIL_S; // 1 at the kick, → 0 as it returns
        barrelNode.position.x = barrelBaseX - recoilLocal * frac;
      } else {
        barrelNode.position.x = barrelBaseX;
      }
    }

    // --- Turret yaw (input.turret() is a per-frame radian delta, per types.ts) ---
    // Negate so ArrowRight/right-drag swings the turret to the viewer's right
    // (inverts keyboard AND touch consistently at the single application point).
    if (turretNode && active) {
      turretNode.rotation.y -= input.turret();
    }

    // --- Roadwheel / sprocket roll, proportional to and in the direction of travel ---
    if (Math.abs(travel) > 1e-6) {
      // Wheels roll about their lateral axle. The model is authored forward = +X,
      // so the axle is the local Z axis (rolling about X would spin them flat).
      const spin = travel * WHEEL_SPIN_PER_UNIT;
      for (const w of wheels) w.rotation.z += spin;
    }

    object.updateMatrixWorld(true);
  }

  function getMuzzle(): { position: THREE.Vector3; direction: THREE.Vector3 } {
    object.updateMatrixWorld(true);
    // Called exactly once per shot (from main's fire block), so trigger recoil here.
    recoilTimer = RECOIL_S;
    if (muzzleNode) {
      muzzleNode.getWorldPosition(muzzlePos);
      muzzleNode.getWorldQuaternion(muzzleQuat);
      muzzleDir.copy(MUZZLE_FORWARD).applyQuaternion(muzzleQuat).normalize();
    } else {
      // Fallback: fire from hull centre along hull forward.
      muzzlePos.copy(object.position);
      muzzleDir.set(-Math.sin(heading), 0, -Math.cos(heading)).normalize();
    }
    return {
      position: muzzlePos.clone(),
      direction: muzzleDir.clone(),
    };
  }

  return {
    object,
    position: object.position,
    getMuzzle,
    update,
  };
}
