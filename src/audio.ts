/**
 * audio.ts — looping background music + a mute toggle (post-gesture start).
 *
 * Browsers block audio autoplay until a real user gesture, so start() must be
 * called AFTER the loading screen's "press to enter" resolves (see boot() in
 * main.ts). The <audio> element loops a single track at a gentle volume; a
 * small round button appended to the UI overlay toggles el.muted and swaps its
 * 🔊 / 🔇 glyph. A failed media load is logged once and otherwise ignored — the
 * game runs fine without music.
 */

const MUSIC_SRC = '/assets/music.mp3';
const VOLUME = 0.2;

export interface AudioController {
  /** Begin (or resume) playback. Safe to call after the enter gesture. */
  start(): void;
  /** Flip mute on/off and update the button glyph. */
  toggleMute(): void;
  /** Current mute state; assignable to force a specific state. */
  muted: boolean;
}

export function createAudio(): AudioController {
  const el = new Audio(MUSIC_SRC);
  el.loop = true;
  el.volume = VOLUME;
  el.preload = 'auto';

  // If the file 404s or the codec is unsupported, degrade to silence.
  let failed = false;
  el.addEventListener('error', () => {
    failed = true;
    // eslint-disable-next-line no-console
    console.warn('[audio] failed to load background music:', MUSIC_SRC);
  });

  // --- Mute toggle button ---------------------------------------------------
  // The #ui overlay is pointer-events:none, so the button re-enables its own
  // pointer events (see .mute-btn in style.css). Prefer a dedicated root, then
  // fall back to the overlay, then the body — never throw on a missing node.
  const btn = document.createElement('button');
  btn.className = 'mute-btn';
  btn.type = 'button';
  btn.textContent = '🔊';
  btn.setAttribute('aria-label', 'Mute music');
  btn.setAttribute('aria-pressed', 'false');

  const root =
    document.getElementById('audio-ctl') ??
    document.getElementById('ui') ??
    document.body;
  root.appendChild(btn);

  function syncIcon(): void {
    btn.textContent = el.muted ? '🔇' : '🔊';
    btn.setAttribute('aria-label', el.muted ? 'Unmute music' : 'Mute music');
    btn.setAttribute('aria-pressed', String(el.muted));
  }

  function toggleMute(): void {
    el.muted = !el.muted;
    syncIcon();
  }

  btn.addEventListener('click', toggleMute);

  function start(): void {
    if (failed) return;
    // play() returns a promise that some browsers still reject (autoplay policy,
    // interrupted load). Music is optional, so swallow the rejection.
    const p = el.play() as Promise<void> | undefined;
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        /* ignore — the mute button still lets the player start audio manually */
      });
    }
  }

  return {
    start,
    toggleMute,
    get muted(): boolean {
      return el.muted;
    },
    set muted(value: boolean) {
      el.muted = value;
      syncIcon();
    },
  };
}
