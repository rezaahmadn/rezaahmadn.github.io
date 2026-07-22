/**
 * main.ts — bootstrap, system wiring, and the render loop (PRD §2, §9).
 *
 * Cold-load flow:
 *   1. Build renderer + scene + lights + fog + isometric camera on #app.
 *   2. Show the loading screen; load every GLB, streaming progress into it.
 *   3. Wait for the player to press/click "enter", then fade the loader out.
 *   4. Build the shared GameContext (seeded rng + terrain height authority).
 *   5. Instantiate world, water, decoration/POIs, tank, camera, FX, projectiles,
 *      and all UI, then start the intro speech bubble anchored above the tank.
 *   6. Run the loop: fire on demand, advance every system by dt, render.
 *
 * Systems communicate only through the small interfaces in types.ts — no globals.
 */

import * as THREE from 'three';
import {
  SKY_COLOR,
  FOG_COLOR,
  CAMERA_FOV,
  CAMERA_OFFSET,
  FIRE_COOLDOWN,
} from './config';
import type { GameContext, Collider } from './types';
import { createAssetLibrary } from './util/assets';
import { initRng } from './util/rng';
import { createTerrain } from './world/terrain';
import { createWater } from './world/water';
import { generateWorld } from './world/scatter';
import { createPOIs } from './world/poi';
import { createInput } from './input';
import { createRadio } from './ui/radio';
import { createTank } from './tank/tank';
import { createProjectiles } from './tank/projectile';
import { createFX } from './fx/explosion';
import { createCameraRig } from './camera';
import { createAudio } from './audio';
import { createLoading } from './ui/loading';
import { createIntroDialog } from './ui/dialog';
import { createPopup } from './ui/popup';
import { createHUD } from './ui/hud';

// --- Canvas -----------------------------------------------------------------
const canvas = document.getElementById('app') as HTMLCanvasElement;

// Phones (coarse pointer): cap pixel ratio at 1.5 and halve the shadow map (§3, §5.6).
const isCoarsePointer =
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: coarse)').matches;
const MAX_PIXEL_RATIO = isCoarsePointer ? 1.5 : 2;
const SHADOW_MAP_SIZE = isCoarsePointer ? 1024 : 2048;

// Prefer the visual viewport (URL-bar show/hide, pinch-zoom) over the layout
// viewport so the canvas and projected screen anchors stay aligned on mobile (§5.6).
const viewportWidth = (): number => window.visualViewport?.width ?? window.innerWidth;
const viewportHeight = (): number => window.visualViewport?.height ?? window.innerHeight;

// --- Renderer ---------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
renderer.setSize(viewportWidth(), viewportHeight());
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// --- Scene + fog ------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY_COLOR);
scene.fog = new THREE.Fog(FOG_COLOR, 60, 160);

// --- Camera (isometric-ish follow, fov 20) ----------------------------------
const camera = new THREE.PerspectiveCamera(
  CAMERA_FOV,
  viewportWidth() / viewportHeight(),
  0.1,
  500,
);
camera.position.set(CAMERA_OFFSET.x, CAMERA_OFFSET.y, CAMERA_OFFSET.z);
camera.lookAt(0, 0, 0);

// --- Lighting: 1 directional (shadows) + hemisphere -------------------------
const sun = new THREE.DirectionalLight(0xffe6c4, 2.1);
sun.position.set(30, 45, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 200;
sun.shadow.camera.left = -60;
sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60;
sun.shadow.camera.bottom = -60;
sun.shadow.bias = -0.0005;
scene.add(sun);
scene.add(sun.target);

const hemi = new THREE.HemisphereLight(0x9fb4d8, 0x3a3324, 0.7);
scene.add(hemi);

// --- Resize -----------------------------------------------------------------
function onResize(): void {
  const w = viewportWidth();
  const h = viewportHeight();
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
}
window.addEventListener('resize', onResize);
// The visual viewport changes independently of the layout viewport on mobile.
window.visualViewport?.addEventListener('resize', onResize);
window.visualViewport?.addEventListener('scroll', onResize);

/** Project a world point to viewport pixels, or null if it's behind the camera. */
const _proj = new THREE.Vector3();
function projectToScreen(world: THREE.Vector3): { x: number; y: number } | null {
  _proj.copy(world).project(camera);
  if (_proj.z > 1) return null; // behind camera / beyond the far plane
  return {
    x: (_proj.x * 0.5 + 0.5) * viewportWidth(),
    y: (-_proj.y * 0.5 + 0.5) * viewportHeight(),
  };
}

// --- Boot -------------------------------------------------------------------
async function boot(): Promise<void> {
  // 1) Loading screen + asset load.
  const loading = createLoading();
  const assets = await createAssetLibrary().load((f) => loading.setProgress(f));
  await loading.waitForEnter();
  // Battle City stage wipe: wait until the curtains fully cover the screen,
  // build the whole world underneath the STAGE card, then reveal() at the end
  // of boot — the authentic NES loading structure (and it keeps the heavy
  // world-build from ever blocking the wipe animation).
  await loading.hide();

  // waitForEnter() resolved on a real click/keypress, so the browser autoplay
  // policy is satisfied — start the looping background music now (post-gesture).
  const audio = createAudio();
  audio.start();

  // 2) Seeded rng + terrain (the single height authority).
  const { seed, rng } = initRng();
  const terrain = createTerrain(scene, assets);

  // 3) Shared game context. colliders start empty; scatter + POIs fill it.
  const colliders: Collider[] = [];
  const ctx: GameContext = {
    scene,
    camera,
    renderer,
    assets,
    rng,
    seed,
    sampleGround: (x, z) => terrain.sampleGround(x, z),
    colliders,
  };

  // 4) Water (single shared instance) and the procedural world layout.
  const water = createWater(scene, assets);
  const { poiSpots } = generateWorld(ctx);

  // 5) Input, radio, and POIs. The radio needs input (its finale pauses the
  //    game); POIs need the radio for proximity quips. canTalk defers reading
  //    `dialog`/`popup` until the loop runs — both exist by then.
  const input = createInput(canvas);
  const radio = createRadio(input);
  const poi = createPOIs(ctx, poiSpots, radio, () => dialog.done && !popup.isOpen);

  // FX is built before the tank so the tank can spawn its wading wake rings
  // (§6.3) through the shared FX system.
  const fx = createFX(scene);
  const tank = createTank(ctx, input, water, fx);
  const cameraRig = createCameraRig(camera);

  // Dev-only: ?spawn=x,z drops the tank at a world position (terrain-follow sets y).
  const spawnParam = new URLSearchParams(location.search).get('spawn');
  if (spawnParam) {
    const [sx, sz] = spawnParam.split(',').map(Number);
    if (Number.isFinite(sx) && Number.isFinite(sz)) {
      tank.position.x = sx;
      tank.position.z = sz;
    }
  }
  // Dev-only: mark sites visited from the console (tour/finale testing).
  (window as unknown as Record<string, unknown>).__visit = (id: string) =>
    markVisited(id);

  // 6) UI. The popup must exist before projectiles so the POI-hit callback can
  //    open it. A POI hit opens the FIELD REPORT and advances the tour; when
  //    every site has been visited, Commander Reza sends the finale.
  const popup = createPopup(input);
  const hud = createHUD(seed, input.isTouch);
  const visited = new Set<string>();
  const totalSites = poi.pois.length;
  hud.setSites(0, totalSites);

  // Advance the tour; when every site is visited, send the finale — but let the
  // player read/close the current field report first.
  function markVisited(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);
    hud.setSites(visited.size, totalSites);
    if (visited.size === totalSites && totalSites > 0) {
      const check = window.setInterval(() => {
        if (!popup.isOpen) {
          window.clearInterval(check);
          radio.finale();
        }
      }, 300);
    }
  }

  const projectiles = createProjectiles(ctx, fx, poi, water, (p) => {
    popup.open(p.project);
    markVisited(p.project.id);
  });

  // 7) Intro speech bubble, anchored just above the tank each frame.
  const _anchorWorld = new THREE.Vector3();
  const dialog = createIntroDialog(input.isTouch);
  dialog.start(() => {
    _anchorWorld.copy(tank.position);
    _anchorWorld.y += 3.5; // float the bubble over the turret
    return projectToScreen(_anchorWorld);
  });

  // World's built — render one frame beneath the curtains, then open them.
  renderer.render(scene, camera);
  loading.reveal();

  // --- Render loop ----------------------------------------------------------
  const clock = new THREE.Clock();
  let fireTimer = FIRE_COOLDOWN; // ready to fire on the very first press
  let firstShotFired = false;

  function tick(): void {
    const dt = Math.min(clock.getDelta(), 0.05); // clamp post-tab-switch spikes

    // Fire: edge-triggered by input, gated by the shared cooldown. input.paused
    // (popup/dialog) makes consumeFire() report false, so combat stays paused
    // while time — and the water sim — keep advancing.
    fireTimer += dt;
    // Check the cooldown BEFORE consuming: consumeFire() has side effects (clears
    // the queued press, starts the FIRE sweep), so a press during cooldown must not
    // be swallowed — it stays queued until the weapon is actually ready.
    if (fireTimer >= FIRE_COOLDOWN && input.consumeFire()) {
      const muzzle = tank.getMuzzle();
      projectiles.fire(muzzle.position, muzzle.direction);
      fireTimer = 0;
      if (!firstShotFired) {
        firstShotFired = true;
        hud.fadeAfterFirstShot();
      }
    }

    // Advance systems. Tank/POI read input.paused internally, so gameplay
    // freezes on pause while water/FX/projectiles keep animating.
    tank.update(dt);
    cameraRig.update(dt, tank.position);
    water.update(dt);
    projectiles.update(dt);
    poi.update(dt, tank.position);
    fx.update(dt);
    dialog.update();

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  tick();
}

boot().catch((err) => console.error('[boot] failed:', err));
