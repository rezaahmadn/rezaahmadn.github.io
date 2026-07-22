/**
 * ui/minimap.ts — top-right navigation radar (PRD §8.2-adjacent).
 *
 * A HEADING-UP radar: the player tank sits locked at the centre pointing up, and
 * the whole world rotates around it as the hull turns (like a car sat-nav).
 *   - a STATIC whole-world terrain/water texture, sampled once from
 *     ctx.sampleGround over the full terrain mesh, then blitted each frame under
 *     a translate(to tank) + rotate(to heading) transform;
 *   - every POI as a dot — amber while unvisited, dim teal once its field report
 *     has been opened — with POIs beyond the view radius pinned to the rim as a
 *     chevron pointing the way there;
 *   - a rotating "N" tick around the rim so true north is always readable.
 *
 * Area past the mapped terrain is filled with an open-ground tone (not a dark
 * void), so the disc always reads as full even when the tank hugs an edge.
 *
 * Per frame only cheap work happens (one transformed image blit + a few markers);
 * there is no per-frame raycasting.
 */

import * as THREE from 'three';
import type { GameContext, MinimapSystem, PlacedPOI } from '../types';
import { WORLD_SIZE, WATER_LEVEL } from '../config';

// --- Layout (CSS px) --------------------------------------------------------
const SIZE_DESKTOP = 132; // disc diameter
const SIZE_TOUCH = 92; // smaller on phones — leaves the corner uncluttered
const PAD = 3; // inset from canvas edge to the disc rim
const GRID = 72; // terrain sample resolution (GRID×GRID one-time casts at build)
const PPU_BASE = 5; // px per world unit in the pre-rendered world texture
/** World units from the tank to the disc rim (the radar's zoom). */
const VIEW_RADIUS = 50;
/** The terrain texture spans the full mesh (±WORLD_SIZE/2). */
const SAMPLE_BOUND = WORLD_SIZE / 2;
const SAMPLE_SPAN = WORLD_SIZE;

// --- Palette (dusk / military, tuned to style.css) --------------------------
const COL_OOB = 'rgb(45, 53, 39)'; // open-ground fill beyond the mapped terrain
const COL_RING = '#2c3852';
const COL_WATER_SHALLOW = [44, 82, 100] as const;
const COL_WATER_DEEP = [24, 50, 66] as const;
const COL_LAND_LO = [52, 60, 42] as const; // dark olive (low ground)
const COL_LAND_HI = [96, 108, 74] as const; // lit olive (high ground)
const COL_POI = '#e8a23d'; // amber — unvisited
const COL_POI_DONE = 'rgba(111, 211, 198, 0.75)'; // dim teal — visited
const COL_TANK = '#f4f6ff';

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerpRgb = (a: readonly number[], b: readonly number[], t: number): string =>
  `rgb(${Math.round(lerp(a[0], b[0], t))}, ${Math.round(lerp(a[1], b[1], t))}, ${Math.round(
    lerp(a[2], b[2], t),
  )})`;

export function createMinimap(
  ctx: GameContext,
  pois: PlacedPOI[],
  isTouch: boolean,
): MinimapSystem {
  const root = document.getElementById('hud');
  if (!root) throw new Error('[minimap] missing #hud root element');

  const size = isTouch ? SIZE_TOUCH : SIZE_DESKTOP;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const center = size / 2;
  const R = size / 2 - PAD;
  const scaleWorld = R / VIEW_RADIUS; // CSS px per world unit on the disc

  // --- DOM -----------------------------------------------------------------
  const el = document.createElement('div');
  el.className = 'minimap';
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  el.appendChild(canvas);
  root.appendChild(el);

  const g = canvas.getContext('2d');
  if (!g) throw new Error('[minimap] 2D context unavailable');
  g.scale(dpr, dpr); // draw in CSS px; the dpr base transform persists
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';

  // Rim vignette (built once) — subtle darkening toward the edge for radar depth
  // and to soften the seam where mapped terrain meets the open-ground fill.
  const vignette = g.createRadialGradient(center, center, R * 0.6, center, center, R);
  vignette.addColorStop(0, 'rgba(8, 12, 18, 0)');
  vignette.addColorStop(1, 'rgba(8, 12, 18, 0.32)');

  // --- Static whole-world terrain texture, rendered ONCE -------------------
  // Its pixel (0,0) is world (−SAMPLE_BOUND, −SAMPLE_BOUND); +x → world +x,
  // +y → world +z. Blitted each frame under a tank-centred, heading-up transform.
  const worldPx = Math.round(SAMPLE_SPAN * PPU_BASE);
  const worldCanvas = document.createElement('canvas');
  worldCanvas.width = worldPx;
  worldCanvas.height = worldPx;
  renderWorld(worldCanvas);

  function renderWorld(c: HTMLCanvasElement): void {
    const w = c.getContext('2d');
    if (!w) throw new Error('[minimap] world 2D context unavailable');

    // Open-ground base so out-of-mesh corners never read as a void.
    w.fillStyle = COL_OOB;
    w.fillRect(0, 0, worldPx, worldPx);

    const cell = SAMPLE_SPAN / GRID;
    const cellPx = cell * PPU_BASE;

    // Pass 1: sample heights; track land min/max for relief shading.
    const heights = new Float32Array(GRID * GRID);
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const wx = -SAMPLE_BOUND + (i + 0.5) * cell;
        const wz = -SAMPLE_BOUND + (j + 0.5) * cell;
        const h = ctx.sampleGround(wx, wz).height;
        heights[j * GRID + i] = h;
        if (h >= WATER_LEVEL) {
          if (h < lo) lo = h;
          if (h > hi) hi = h;
        }
      }
    }
    const span = hi - lo > 1e-3 ? hi - lo : 1;

    // Pass 2: paint each cell (water shaded by depth, land by relief).
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const h = heights[j * GRID + i];
        if (h < WATER_LEVEL) {
          w.fillStyle = lerpRgb(COL_WATER_SHALLOW, COL_WATER_DEEP, clamp01((WATER_LEVEL - h) / 3));
        } else {
          w.fillStyle = lerpRgb(COL_LAND_LO, COL_LAND_HI, clamp01((h - lo) / span));
        }
        // +1 overlap hides seams between neighbouring cells.
        w.fillRect(i * cellPx, j * cellPx, cellPx + 1, cellPx + 1);
      }
    }
  }

  // --- Dynamic layer -------------------------------------------------------
  const visited = new Set<string>();

  function setVisited(id: string): void {
    visited.add(id);
  }

  /** Small filled triangle at (x,y) pointing along `angle` (rim indicator). */
  function chevron(x: number, y: number, angle: number, fill: string): void {
    g!.save();
    g!.translate(x, y);
    g!.rotate(angle);
    g!.beginPath();
    g!.moveTo(4.5, 0);
    g!.lineTo(-3, -3.4);
    g!.lineTo(-3, 3.4);
    g!.closePath();
    g!.fillStyle = fill;
    g!.fill();
    g!.restore();
  }

  function update(tankPos: THREE.Vector3, forward: THREE.Vector3): void {
    // Rotate the map so the tank's forward points to the top of the disc.
    // θ = −π/2 − atan2(fz, fx): forward (0,0,−1) → 0 (already north-up).
    const theta = -Math.PI / 2 - Math.atan2(forward.z, forward.x);
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);

    g!.clearRect(0, 0, size, size);

    // Clip everything to the disc.
    g!.save();
    g!.beginPath();
    g!.arc(center, center, R, 0, Math.PI * 2);
    g!.clip();

    // Open-ground backdrop, then the world texture under the heading-up,
    // tank-centred transform.
    g!.fillStyle = COL_OOB;
    g!.fillRect(0, 0, size, size);
    g!.save();
    g!.translate(center, center);
    g!.rotate(theta);
    g!.scale(scaleWorld, scaleWorld);
    g!.translate(-tankPos.x, -tankPos.z);
    g!.drawImage(worldCanvas, -SAMPLE_BOUND, -SAMPLE_BOUND, SAMPLE_SPAN, SAMPLE_SPAN);
    g!.restore();

    // Rim vignette (over terrain, under the markers).
    g!.fillStyle = vignette;
    g!.fillRect(0, 0, size, size);

    // POIs — project each into disc pixels; pin far ones to the rim.
    const rimAt = R - 6; // radius the clamped chevrons sit at
    const inMax = R - 4; // beyond this a POI counts as "off radar"
    for (const p of pois) {
      const dx = (p.position.x - tankPos.x) * scaleWorld;
      const dz = (p.position.z - tankPos.z) * scaleWorld;
      const ox = dx * cos - dz * sin; // rotate offset into disc space
      const oy = dx * sin + dz * cos;
      const done = visited.has(p.project.id);
      const dist = Math.hypot(ox, oy);

      if (dist > inMax) {
        const a = Math.atan2(oy, ox);
        chevron(center + Math.cos(a) * rimAt, center + Math.sin(a) * rimAt, a, done ? COL_POI_DONE : COL_POI);
        continue;
      }

      const px = center + ox;
      const py = center + oy;
      if (done) {
        g!.beginPath();
        g!.arc(px, py, 2.6, 0, Math.PI * 2);
        g!.fillStyle = COL_POI_DONE;
        g!.fill();
      } else {
        g!.beginPath();
        g!.arc(px, py, 5.5, 0, Math.PI * 2);
        g!.fillStyle = 'rgba(232, 162, 61, 0.18)'; // amber glow halo
        g!.fill();
        g!.beginPath();
        g!.arc(px, py, 3.2, 0, Math.PI * 2);
        g!.fillStyle = COL_POI;
        g!.fill();
        g!.lineWidth = 1;
        g!.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        g!.stroke();
      }
    }

    // Tank — locked at the centre, always pointing up.
    g!.save();
    g!.translate(center, center);
    g!.beginPath();
    g!.moveTo(0, -5.8); // nose
    g!.lineTo(3.8, 4.4);
    g!.lineTo(0, 2.3);
    g!.lineTo(-3.8, 4.4);
    g!.closePath();
    g!.fillStyle = COL_TANK;
    g!.fill();
    g!.lineWidth = 1;
    g!.strokeStyle = 'rgba(10, 14, 20, 0.9)';
    g!.stroke();
    g!.restore();

    g!.restore(); // un-clip

    // Rim + rotating north tick (drawn last, unclipped, crisp on the edge).
    g!.beginPath();
    g!.arc(center, center, R, 0, Math.PI * 2);
    g!.lineWidth = 1.5;
    g!.strokeStyle = COL_RING;
    g!.stroke();

    // North (world −z) direction in disc space = (sinθ, −cosθ).
    const nX = center + sin * (R - 8);
    const nY = center - cos * (R - 8);
    g!.fillStyle = 'rgba(154, 167, 189, 0.95)';
    g!.font = '700 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    g!.textAlign = 'center';
    g!.textBaseline = 'middle';
    g!.fillText('N', nX, nY);
  }

  // First paint (tank at origin, facing north) so the disc isn't blank pre-loop.
  update(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1));

  return { update, setVisited, element: el };
}
