/**
 * types.ts — the cross-module contract (PRD §9).
 * These interfaces are the exact API each module produces/consumes. Do not
 * change a shape here without updating every module that depends on it.
 */

import * as THREE from 'three';
import type { Project } from './data/projects';

// ---------------------------------------------------------------------------
// Core value shapes
// ---------------------------------------------------------------------------

/** Result of a downward ground raycast at some (x, z). */
export interface GroundSample {
  height: number;
  normal: THREE.Vector3;
}

/** A cylinder collider registered by buildings and rocks. */
export interface Collider {
  x: number;
  z: number;
  radius: number;
}

/** Normalized drive intent; throttle & steer each in [-1, 1]. */
export interface DriveInput {
  throttle: number;
  steer: number;
}

/** A project that has been placed into the world as a building POI. */
export interface PlacedPOI {
  project: Project;
  position: THREE.Vector3;
  radius: number;
  /** World Y of the building's top — used to gate mid-air hit tests (§5.5). */
  top: number;
  mesh: THREE.Object3D;
}

/** A chosen POI location before the building mesh is instantiated. */
export interface PoiSpot {
  project: Project;
  position: THREE.Vector3;
  yaw: number;
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export type AssetKey =
  | 'tank'
  | 'terrain'
  | 'wrecked-building'
  | 'low-poly-house'
  | 'low-poly-tree'
  | 'lowpoly-oak-tree'
  | 'low-poly-bush'
  | 'low-poly-rocks';

/** Loaded GLB registry. `scene` returns the shared loaded group; `clone` a deep copy. */
export interface AssetLibrary {
  scene(key: AssetKey): THREE.Group;
  clone(key: AssetKey): THREE.Object3D;
}

// ---------------------------------------------------------------------------
// Shared game context (passed into world/tank/poi factories)
// ---------------------------------------------------------------------------

export interface GameContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  assets: AssetLibrary;
  rng: () => number;
  seed: number;
  sampleGround(x: number, z: number): GroundSample;
  colliders: Collider[];
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/** Unified keyboard + touch input (PRD §5.6). */
export interface InputSystem {
  /** Hull drive intent (throttle/steer). */
  drive(): DriveInput;
  /** Turret yaw delta for this frame, in radians. */
  turret(): number;
  /** Edge-triggered fire: true once per press, then consumed. */
  consumeFire(): boolean;
  /** When true, gameplay input is paused (popup/dialog open). */
  paused: boolean;
  /** True on coarse-pointer / touch devices. */
  isTouch: boolean;
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

export interface FXSystem {
  muzzleFlash(pos: THREE.Vector3, dir: THREE.Vector3): void;
  groundExplosion(pos: THREE.Vector3): void;
  splash(pos: THREE.Vector3): void;
  update(dt: number): void;
}

// ---------------------------------------------------------------------------
// World / gameplay systems (factory return shapes)
// ---------------------------------------------------------------------------

export interface TerrainSystem {
  sampleGround(x: number, z: number): GroundSample;
  mesh: THREE.Object3D;
}

export interface WaterSystem {
  update(dt: number): void;
  addRipple(x: number, z: number, amp: number): void;
}

export interface ScatterResult {
  colliders: Collider[];
  poiSpots: PoiSpot[];
  decoration: THREE.Object3D[];
}

export interface POISystem {
  pois: PlacedPOI[];
  hitTest(p: THREE.Vector3): PlacedPOI | null;
  /** Kick off the building scale-pulse (1 → 1.06 → 1, 200 ms) on a POI hit (§5.5). */
  pulse(target: PlacedPOI): void;
  update(dt: number, tankPos: THREE.Vector3): void;
}

export interface TankSystem {
  object: THREE.Object3D;
  position: THREE.Vector3;
  getMuzzle(): { position: THREE.Vector3; direction: THREE.Vector3 };
  update(dt: number): void;
}

export interface ProjectileSystem {
  fire(origin: THREE.Vector3, dir: THREE.Vector3): void;
  update(dt: number): void;
}

export interface CameraRig {
  update(dt: number, target: THREE.Vector3): void;
}

// ---------------------------------------------------------------------------
// UI systems (factory return shapes)
// ---------------------------------------------------------------------------

export interface LoadingUI {
  setProgress(p: number, label?: string): void;
  waitForEnter(): Promise<void>;
  /** Close the Battle City curtains over the briefing; resolves once the screen
   *  is fully covered (build the world underneath, then call reveal()). */
  hide(): Promise<void>;
  /** Open the curtains onto the world (enforces a minimum STAGE-card hold). */
  reveal(): void;
}

export interface IntroDialog {
  start(anchor: () => { x: number; y: number } | null): void;
  update(): void;
  done: boolean;
}

export interface Popup {
  open(project: Project): void;
  close(): void;
  isOpen: boolean;
}

export interface HUD {
  fadeAfterFirstShot(): void;
  /** Update the "sites visited" counter (e.g. 4/6). */
  setSites(visited: number, total: number): void;
  element: HTMLElement;
}

/**
 * Commander Reza's radio: non-blocking transmission toasts (proximity quips)
 * plus the one input-pausing finale card shown when every site is visited.
 */
export interface RadioSystem {
  say(text: string): void;
  finale(): void;
}

export type { Project };
