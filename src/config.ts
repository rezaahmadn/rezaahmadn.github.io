/**
 * config.ts — every tunable named in the PRD.
 * All game modules import their constants from here (single source of truth).
 */

// --- World ---
export const WORLD_SIZE = 100;
export const WORLD_BOUND = 47;
export const SPAWN_FLAT_RADIUS = 6;
export const LAKE_CENTER = { x: -25, z: -20 } as const;
export const WATER_LEVEL = -1.2;

// --- Tank ---
export const TANK_LENGTH = 4.5;
export const TANK_FORWARD_SPEED = 8;
export const TANK_REVERSE_SPEED = 5;
export const TANK_YAW_SPEED = 1.6;
export const TANK_WATER_SPEED_MULT = 0.6;
export const TURRET_YAW_SPEED = 1.8;

// --- Projectiles ---
export const FIRE_COOLDOWN = 0.6;
export const SHELL_SPEED = 30;
export const SHELL_GRAVITY = -9;
export const SHELL_LIFETIME = 4;
export const SHELL_POOL = 6;

// --- POIs ---
export const POI_RADIUS = 7;
export const POI_MIN_SPACING = 22;
export const POI_MIN_FROM_SPAWN = 12;
export const POI_MAX_FROM_ORIGIN = 40;

// --- Decoration ---
export const DECO_TREES = 45;
export const DECO_BUSHES = 30;
export const DECO_ROCKS = 18;
export const DECO_MIN_FROM_SPAWN = 8;
export const DECO_MIN_FROM_POI = 5;
export const DECO_MIN_SPACING = 2.5;

// --- Camera ---
export const CAMERA_FOV = 20;
export const CAMERA_OFFSET = { x: 31, y: 39, z: 31 } as const;
export const CAMERA_LERP = 0.05;

// --- Water / ripples ---
export const RIPPLE_MAX = 12;
export const RIPPLE_TANK_INTERVAL = 0.25;
export const RIPPLE_TANK_AMP = 0.25;
export const RIPPLE_SPLASH_AMP = 0.5;

// --- Sky / fog (dusk-ish) ---
export const SKY_COLOR = 0x2a3550;
export const FOG_COLOR = 0x2a3550;

// --- FX timings ---
export const MUZZLE_FLASH_MS = 90;
export const EXPLOSION_LIFETIME = 0.7;

/**
 * Ambient water waves (§5.4): three summed sine waves.
 * amp ≈ 0.04–0.07, k = spatial frequency, (dirX,dirZ) unit direction, omega = temporal.
 */
export const WAVE_AMBIENT = [
  { amp: 0.06, k: 0.55, dirX: 1.0, dirZ: 0.0, omega: 1.1 },
  { amp: 0.05, k: 0.8, dirX: 0.3, dirZ: 0.95, omega: 1.6 },
  { amp: 0.04, k: 1.15, dirX: -0.7, dirZ: 0.7, omega: 2.0 },
] as const;
