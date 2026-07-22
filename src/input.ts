/**
 * input.ts — unified keyboard + touch input (PRD §5.6).
 *
 * Keyboard: WASD/arrows drive & turret, Space fires (edge-triggered).
 * Touch:    left-half floating joystick drives; right-half horizontal drag
 *           rotates the turret; a fixed round FIRE button (bottom-right) fires
 *           with a visual cooldown sweep.
 *
 * `paused` (set by popup/dialog) forces drive/turret/fire to read neutral.
 * Cooldown timing for actual firing is the caller's job — consumeFire() only
 * reports edge-triggered intent. The FIRE button's sweep is a local visual that
 * approximates FIRE_COOLDOWN after each accepted shot.
 */

import type { InputSystem, DriveInput } from './types';
import { TURRET_YAW_SPEED, FIRE_COOLDOWN } from './config';

const JOY_RADIUS = 56; // px the joystick nub travels for full deflection
const RAD_PER_PX = (0.5 * Math.PI) / 180; // ~0.5° per pixel of turret drag
const MAX_DT = 0.05; // clamp self-measured frame time to avoid post-pause spikes

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function createInput(canvas: HTMLCanvasElement): InputSystem {
  // --- keyboard state -------------------------------------------------------
  const keys = new Set<string>();
  let fireQueued = false;

  // --- touch state ----------------------------------------------------------
  let joyId: number | null = null;
  let joyOX = 0;
  let joyOY = 0;
  let joyX = 0; // normalized [-1,1], right positive
  let joyY = 0; // normalized [-1,1], down positive

  let turretId: number | null = null;
  let turretLastX = 0;
  let turretAccum = 0; // radians of drag pending consumption by turret()

  // --- turret self-timing (keyboard rate integration) -----------------------
  let lastTurretTime = performance.now();

  // --- fire cooldown sweep (visual only) ------------------------------------
  let cooldownEnd = 0;

  // Touch DOM (built lazily on activation)
  let joystickEl: HTMLDivElement | null = null;
  let nubEl: HTMLDivElement | null = null;
  let fireBtn: HTMLDivElement | null = null;
  let sweepEl: HTMLDivElement | null = null;

  const obj: InputSystem = {
    paused: false,
    isTouch: false,
    drive,
    turret,
    consumeFire,
  };

  // ==========================================================================
  // Keyboard
  // ==========================================================================
  window.addEventListener('keydown', (e) => {
    // Edge-detect Space before recording it (keydown auto-repeats while held).
    if (e.code === 'Space' && !keys.has('Space') && !obj.paused) {
      fireQueued = true;
    }
    keys.add(e.code);
    // Prevent Space/arrows from scrolling the page.
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
  });
  // Losing focus should release everything so keys don't stick.
  window.addEventListener('blur', () => keys.clear());

  // ==========================================================================
  // Touch activation
  // ==========================================================================
  const coarse =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;

  // Declared BEFORE activateTouch() can run below: on coarse-pointer devices
  // activateTouch() executes immediately during setup, and maybeShowRotateHint
  // reading this any later in the file is a TDZ ReferenceError that kills boot.
  let rotateHintShown = false;

  function activateTouch(): void {
    if (obj.isTouch) return;
    obj.isTouch = true;
    document.body.classList.add('is-touch');
    buildTouchUI();
  }

  if (coarse) {
    activateTouch();
  } else {
    // Fallback: first real touch anywhere flips us into touch mode.
    window.addEventListener('touchstart', activateTouch, { once: true, passive: true });
  }

  function buildTouchUI(): void {
    const root = document.getElementById('touch-controls');
    if (!root || joystickEl) return;

    joystickEl = document.createElement('div');
    joystickEl.className = 'joystick';
    joystickEl.style.display = 'none';
    nubEl = document.createElement('div');
    nubEl.className = 'nub';
    joystickEl.appendChild(nubEl);
    root.appendChild(joystickEl);

    fireBtn = document.createElement('div');
    fireBtn.className = 'fire-btn';
    fireBtn.setAttribute('role', 'button');
    fireBtn.setAttribute('aria-label', 'Fire');
    sweepEl = document.createElement('div');
    sweepEl.className = 'sweep';
    const label = document.createElement('span');
    label.textContent = 'FIRE';
    fireBtn.appendChild(sweepEl);
    fireBtn.appendChild(label);
    root.appendChild(fireBtn);

    fireBtn.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        if (!obj.paused) fireQueued = true;
      },
      { passive: false },
    );

    maybeShowRotateHint(root);

    requestAnimationFrame(sweepTick);
  }

  // Portrait-only, dismissible "↻ rotate for the best view" hint, shown once (§5.6).
  function maybeShowRotateHint(root: HTMLElement): void {
    if (rotateHintShown) return;
    if (window.innerHeight <= window.innerWidth) return; // landscape already
    rotateHintShown = true;

    const hint = document.createElement('div');
    hint.className = 'rotate-hint';
    hint.textContent = '↻ rotate for the best view';
    root.appendChild(hint);

    let removed = false;
    const dismiss = (): void => {
      if (removed) return;
      removed = true;
      hint.classList.add('hidden');
      window.removeEventListener('orientationchange', dismiss);
      // Remove after the CSS opacity transition (300 ms).
      window.setTimeout(() => hint.remove(), 350);
    };

    hint.addEventListener('touchstart', dismiss, { passive: true });
    hint.addEventListener('click', dismiss);
    window.addEventListener('orientationchange', dismiss);
  }

  // ==========================================================================
  // Touch handlers (attached to the canvas; overlay passes through)
  // ==========================================================================
  function onTouchStart(e: TouchEvent): void {
    activateTouch();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      // Ignore touches that begin on the popup card (or FIRE button, which
      // handles its own events).
      const target = t.target as Element | null;
      if (target && target.closest && target.closest('.popup-card, .fire-btn')) continue;
      if (obj.paused) continue;

      const leftHalf = t.clientX < window.innerWidth / 2;
      if (leftHalf && joyId === null) {
        joyId = t.identifier;
        joyOX = t.clientX;
        joyOY = t.clientY;
        joyX = 0;
        joyY = 0;
        if (joystickEl) {
          joystickEl.style.left = `${joyOX}px`;
          joystickEl.style.top = `${joyOY}px`;
          joystickEl.style.display = 'block';
        }
        if (nubEl) nubEl.style.transform = 'translate(0px, 0px)';
        e.preventDefault();
      } else if (!leftHalf && turretId === null) {
        turretId = t.identifier;
        turretLastX = t.clientX;
        e.preventDefault();
      }
    }
  }

  function onTouchMove(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === joyId) {
        let dx = t.clientX - joyOX;
        let dy = t.clientY - joyOY;
        const mag = Math.hypot(dx, dy);
        if (mag > JOY_RADIUS) {
          const s = JOY_RADIUS / mag;
          dx *= s;
          dy *= s;
        }
        joyX = dx / JOY_RADIUS;
        joyY = dy / JOY_RADIUS;
        if (nubEl) nubEl.style.transform = `translate(${dx}px, ${dy}px)`;
        e.preventDefault();
      } else if (t.identifier === turretId) {
        const dx = t.clientX - turretLastX;
        turretLastX = t.clientX;
        turretAccum += dx * RAD_PER_PX;
        e.preventDefault();
      }
    }
  }

  function onTouchEnd(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === joyId) {
        joyId = null;
        joyX = 0;
        joyY = 0;
        if (joystickEl) joystickEl.style.display = 'none';
      } else if (t.identifier === turretId) {
        turretId = null;
      }
    }
  }

  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('touchcancel', onTouchEnd, { passive: true });

  // ==========================================================================
  // Cooldown sweep animation (visual)
  // ==========================================================================
  function sweepTick(): void {
    if (sweepEl) {
      const remaining = cooldownEnd - performance.now();
      const frac = remaining > 0 ? clamp(remaining / (FIRE_COOLDOWN * 1000), 0, 1) : 0;
      sweepEl.style.setProperty('--sweep', `${frac * 360}deg`);
    }
    requestAnimationFrame(sweepTick);
  }

  // ==========================================================================
  // Public reads
  // ==========================================================================
  function drive(): DriveInput {
    if (obj.paused) return { throttle: 0, steer: 0 };

    // Keyboard (WASD).
    let throttle = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    let steer = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);

    // Touch joystick (up = forward → negate down-positive joyY).
    if (joyId !== null) {
      throttle += -joyY;
      steer += joyX;
    }

    return { throttle: clamp(throttle, -1, 1), steer: clamp(steer, -1, 1) };
  }

  function turret(): number {
    const now = performance.now();
    let dt = (now - lastTurretTime) / 1000;
    lastTurretTime = now;

    if (obj.paused) {
      turretAccum = 0; // drop pending drag so we don't lurch on resume
      return 0;
    }

    if (dt > MAX_DT) dt = MAX_DT;
    if (dt < 0) dt = 0;

    // Keyboard: ArrowRight − ArrowLeft, integrated at TURRET_YAW_SPEED.
    const kb =
      (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
    let delta = kb * TURRET_YAW_SPEED * dt;

    // Touch: consume accumulated horizontal drag.
    delta += turretAccum;
    turretAccum = 0;

    return delta;
  }

  function consumeFire(): boolean {
    if (obj.paused) {
      fireQueued = false;
      return false;
    }
    if (fireQueued) {
      fireQueued = false;
      cooldownEnd = performance.now() + FIRE_COOLDOWN * 1000; // start visual sweep
      return true;
    }
    return false;
  }

  return obj;
}
