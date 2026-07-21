/**
 * poi.ts — §7 points of interest.
 *
 * createPOIs(ctx, spots) instantiates one building per PoiSpot, seats it on the
 * ground, registers a footprint collider, and floats a canvas-text label above
 * it. Labels bob (±0.3, 2 s), always face camera (sprites do), and brighten /
 * scale up when the tank is within 15 units.
 */

import * as THREE from 'three';
import type { Collider, GameContext, PlacedPOI, PoiSpot, POISystem } from '../types';
import { POI_RADIUS } from '../config';

// --- Local tunables (not named by config) ---------------------------------
/** Buildings normalize to ~7 units tall (§ asset facts: 6–8). */
const BUILDING_HEIGHT = 7;
/** Vertical gap between building top and label. */
const LABEL_GAP = 1.2;
const LABEL_BOB_AMP = 0.3;
const LABEL_BOB_PERIOD = 2; // seconds
const LABEL_BOB_OMEGA = (Math.PI * 2) / LABEL_BOB_PERIOD;
const LABEL_SWAY_AMP = 0.08;
/** Within this xz distance the label brightens / scales up (§7.1). */
const LABEL_NEAR_DIST = 15;
const LABEL_NEAR_BOOST = 0.25; // extra scale fraction when adjacent
const LABEL_BASE_OPACITY = 0.85;
const LABEL_APPROACH = 0.15; // per-frame lerp toward the near/far target

const LABEL_CANVAS_W = 256;
const LABEL_CANVAS_H = 64;
/** World width of a label sprite (height derives from the canvas aspect). */
const LABEL_WORLD_WIDTH = 5;

/** Scale-pulse on POI hit: 1 → PULSE_PEAK → 1 over PULSE_MS (§5.5). */
const PULSE_MS = 200;
const PULSE_S = PULSE_MS / 1000;
const PULSE_PEAK = 0.06;

interface Entry {
  poi: PlacedPOI;
  sprite: THREE.Sprite;
  mesh: THREE.Object3D;
  baseScale: number; // uniform building scale before pulsing
  baseX: number;
  baseZ: number;
  baseY: number;
  phase: number;
  boost: number; // smoothed 0..1 nearness
  pulseAge: number; // ≥ PULSE_S when idle (no pulse running)
}

/** Render `text` into a rounded-backed canvas sprite (§7.1). */
function makeLabel(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = LABEL_CANVAS_W;
  canvas.height = LABEL_CANVAS_H;
  const g = canvas.getContext('2d');

  if (g) {
    const pad = 10;
    const r = 14;
    const w = LABEL_CANVAS_W;
    const h = LABEL_CANVAS_H;

    // Rounded dark backing.
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(18, 22, 34, 0.72)';
    g.beginPath();
    g.moveTo(pad + r, pad);
    g.lineTo(w - pad - r, pad);
    g.arcTo(w - pad, pad, w - pad, pad + r, r);
    g.lineTo(w - pad, h - pad - r);
    g.arcTo(w - pad, h - pad, w - pad - r, h - pad, r);
    g.lineTo(pad + r, h - pad);
    g.arcTo(pad, h - pad, pad, h - pad - r, r);
    g.lineTo(pad, pad + r);
    g.arcTo(pad, pad, pad + r, pad, r);
    g.closePath();
    g.fill();

    // Fit the text horizontally by shrinking the font if needed.
    let fontSize = 26;
    const maxW = w - pad * 2 - 12;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    do {
      g.font = `600 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      if (g.measureText(text).width <= maxW || fontSize <= 12) break;
      fontSize -= 1;
    } while (fontSize > 12);

    g.fillStyle = '#f4f6ff';
    g.fillText(text, w / 2, h / 2 + 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    opacity: LABEL_BASE_OPACITY,
  });

  const sprite = new THREE.Sprite(material);
  const aspect = LABEL_CANVAS_H / LABEL_CANVAS_W;
  sprite.scale.set(LABEL_WORLD_WIDTH, LABEL_WORLD_WIDTH * aspect, 1);
  return sprite;
}

export function createPOIs(ctx: GameContext, spots: PoiSpot[]): POISystem {
  const pois: PlacedPOI[] = [];
  const entries: Entry[] = [];
  let time = 0;

  spots.forEach((spot, index) => {
    // --- Building ---------------------------------------------------------
    const mesh = ctx.assets.clone(spot.project.building ?? 'wrecked-building');
    mesh.rotation.y = spot.yaw;
    mesh.scale.setScalar(1);
    mesh.position.set(0, 0, 0);
    mesh.updateMatrixWorld(true);

    const box0 = new THREE.Box3().setFromObject(mesh);
    const natural = box0.max.y - box0.min.y || 1;
    const s = BUILDING_HEIGHT / natural;
    mesh.scale.setScalar(s);
    mesh.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(mesh);
    mesh.position.set(spot.position.x, spot.position.y - box.min.y, spot.position.z);
    ctx.scene.add(mesh);

    // Footprint collider (physical size, not the generous hit radius).
    const footprint = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
    const collider: Collider = { x: spot.position.x, z: spot.position.z, radius: footprint };
    ctx.colliders.push(collider);

    // --- Hovering label ---------------------------------------------------
    const sprite = makeLabel(spot.project.title);
    const topY = spot.position.y + (box.max.y - box.min.y);
    const baseY = topY + LABEL_GAP + sprite.scale.y / 2;
    sprite.position.set(spot.position.x, baseY, spot.position.z);
    ctx.scene.add(sprite);

    const poi: PlacedPOI = {
      project: spot.project,
      position: spot.position.clone(),
      radius: POI_RADIUS,
      top: topY,
      mesh,
    };
    pois.push(poi);
    entries.push({
      poi,
      sprite,
      mesh,
      baseScale: s,
      baseX: spot.position.x,
      baseZ: spot.position.z,
      baseY,
      phase: index * 1.3,
      boost: 0,
      pulseAge: PULSE_S, // idle (no pulse)
    });
  });

  function hitTest(p: THREE.Vector3): PlacedPOI | null {
    let best: PlacedPOI | null = null;
    let bestD2 = Infinity;
    for (const poi of pois) {
      // Gate on altitude: a shell arcing high over the building (within the xz
      // radius but well above its roof) must not trigger a mid-air POI hit (§5.5).
      if (p.y > poi.top) continue;
      const dx = p.x - poi.position.x;
      const dz = p.z - poi.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= poi.radius * poi.radius && d2 < bestD2) {
        bestD2 = d2;
        best = poi;
      }
    }
    return best;
  }

  function pulse(target: PlacedPOI): void {
    for (const e of entries) {
      if (e.poi === target) {
        e.pulseAge = 0;
        break;
      }
    }
  }

  function update(dt: number, tankPos: THREE.Vector3): void {
    time += dt;
    for (const e of entries) {
      // Scale-pulse: half-sine 1 → 1+PULSE_PEAK → 1 across PULSE_S (§5.5).
      if (e.pulseAge < PULSE_S) {
        e.pulseAge = Math.min(PULSE_S, e.pulseAge + dt);
        const factor = 1 + PULSE_PEAK * Math.sin(Math.PI * (e.pulseAge / PULSE_S));
        e.mesh.scale.setScalar(e.baseScale * factor);
      }

      const bob = Math.sin(time * LABEL_BOB_OMEGA + e.phase) * LABEL_BOB_AMP;
      const sway = Math.sin(time * 0.6 + e.phase) * LABEL_SWAY_AMP;
      e.sprite.position.set(e.baseX + sway, e.baseY + bob, e.baseZ);

      const dx = tankPos.x - e.poi.position.x;
      const dz = tankPos.z - e.poi.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const target = dist < LABEL_NEAR_DIST ? 1 - dist / LABEL_NEAR_DIST : 0;
      e.boost += (target - e.boost) * LABEL_APPROACH;

      const scale = 1 + LABEL_NEAR_BOOST * e.boost;
      const aspect = LABEL_CANVAS_H / LABEL_CANVAS_W;
      e.sprite.scale.set(LABEL_WORLD_WIDTH * scale, LABEL_WORLD_WIDTH * aspect * scale, 1);
      const mat = e.sprite.material as THREE.SpriteMaterial;
      mat.opacity = LABEL_BASE_OPACITY + (1 - LABEL_BASE_OPACITY) * e.boost;
    }
  }

  return { pois, hitTest, pulse, update };
}
