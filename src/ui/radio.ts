/**
 * ui/radio.ts — Commander Reza's radio.
 *
 * say(text): queued, non-blocking transmission toast (bottom-center, above the
 * seed chip): "COMMANDER REZA — INCOMING TRANSMISSION" header + typewriter body.
 * One toast at a time; auto-dismisses a few seconds after the text completes;
 * never pauses input.
 *
 * finale(): the one modal moment — an input-pausing radio card (reuses the
 * popup's styling) shown when every site has been visited, with contact links.
 */

import type { InputSystem, RadioSystem } from '../types';

const HEADER = 'COMMANDER REZA — INCOMING TRANSMISSION';
const TYPE_CPS = 45; // typewriter chars/second
const HOLD_MS = 5500; // toast lifetime after the text completes
const FADE_MS = 250;

const FINALE_TEXT =
  "*bzzt* That's every site in the sector, soldier. Tour complete. If you like what you've seen, open a channel. Commander Reza, out.";
const EMAIL_URL = 'mailto:rezaahmadn@gmail.com';
const LINKEDIN_URL = 'https://www.linkedin.com/in/rezaahmadn/';

function mustGet(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`[radio] missing #${id} root element`);
  return el;
}

export function createRadio(input: InputSystem): RadioSystem {
  const root = mustGet('radio');

  // --- Transmission toast ----------------------------------------------------
  const toast = document.createElement('div');
  toast.className = 'radio hidden';
  toast.innerHTML = `
    <div class="radio-head"></div>
    <div class="radio-body"></div>
  `;
  (toast.querySelector('.radio-head') as HTMLElement).textContent = HEADER;
  const body = toast.querySelector('.radio-body') as HTMLElement;
  root.appendChild(toast);

  const queue: string[] = [];
  let current: string | null = null; // full text of the toast on screen
  let typing = 0; // interval id (0 = not typing)
  let holdTimer = 0;
  let fadeTimer = 0;

  function showNext(): void {
    const text = queue.shift();
    if (text === undefined) {
      current = null;
      return;
    }
    current = text;

    window.clearTimeout(fadeTimer);
    toast.classList.remove('hidden');
    body.textContent = '';

    let i = 0;
    typing = window.setInterval(() => {
      i++;
      body.textContent = text.slice(0, i);
      if (i >= text.length) {
        window.clearInterval(typing);
        typing = 0;
        holdTimer = window.setTimeout(dismiss, HOLD_MS);
      }
    }, 1000 / TYPE_CPS);
  }

  function dismiss(): void {
    window.clearInterval(typing);
    window.clearTimeout(holdTimer);
    typing = 0;
    toast.classList.add('hidden');
    fadeTimer = window.setTimeout(showNext, FADE_MS);
  }

  function say(text: string): void {
    queue.push(text);
    if (current === null) showNext();
  }

  // Tapping the toast: skip typing to the full text, or dismiss if complete.
  toast.addEventListener('pointerdown', () => {
    if (current === null) return;
    if (typing !== 0) {
      window.clearInterval(typing);
      typing = 0;
      body.textContent = current;
      holdTimer = window.setTimeout(dismiss, HOLD_MS);
    } else {
      dismiss();
    }
  });

  // --- Finale card -----------------------------------------------------------
  let finaleShown = false;

  function finale(): void {
    if (finaleShown) return;
    finaleShown = true;

    const container = document.createElement('div');
    container.className = 'popup finale';
    container.innerHTML = `
      <div class="backdrop"></div>
      <div class="popup-card" role="dialog" aria-modal="true">
        <h2>TOUR COMPLETE</h2>
        <p class="blurb"></p>
        <div class="actions">
          <a class="btn primary"></a>
          <a class="btn ghost link"></a>
          <button class="btn ghost" type="button"></button>
        </div>
        <div class="footer">— end of transmission —</div>
      </div>
    `;
    (container.querySelector('.blurb') as HTMLElement).textContent = FINALE_TEXT;
    const emailBtn = container.querySelector('.btn.primary') as HTMLAnchorElement;
    emailBtn.textContent = '✉ Open a channel';
    emailBtn.href = EMAIL_URL;
    const liBtn = container.querySelector('.btn.ghost.link') as HTMLAnchorElement;
    liBtn.textContent = 'LinkedIn';
    liBtn.href = LINKEDIN_URL;
    liBtn.target = '_blank';
    liBtn.rel = 'noopener';
    const closeBtn = container.querySelector('button.btn.ghost') as HTMLButtonElement;
    closeBtn.textContent = 'Keep roaming';

    root.appendChild(container);
    // Next frame so the .open transition runs.
    requestAnimationFrame(() => container.classList.add('open'));
    input.paused = true;

    const close = (): void => {
      container.classList.remove('open');
      input.paused = false;
      window.removeEventListener('keydown', onKey);
      window.setTimeout(() => container.remove(), 200);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    closeBtn.addEventListener('click', close);
    container.addEventListener('pointerdown', (e) => {
      if (e.target === container || (e.target as HTMLElement).classList?.contains('backdrop'))
        close();
    });
    window.addEventListener('keydown', onKey);
  }

  return { say, finale };
}
