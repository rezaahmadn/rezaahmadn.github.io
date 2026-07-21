/**
 * ui/dialog.ts — intro speech bubble (PRD §8.3).
 *
 * A DOM bubble with a CSS tail, anchored above the tank by projecting the
 * tank's world position to screen space every frame. Three steps of copy
 * (step 2 has a touch variant); advance on SPACE / click / tap; step dots
 * shown. After step 3 the bubble dismisses permanently (per-visit; done=true).
 */

import type { IntroDialog } from '../types';

const WHO = 'Commander Reza — Transmission';
const TYPE_CPS = 45; // typewriter chars/second

interface Step {
  text: string;
  touch?: string;
}

const STEPS: Step[] = [
  {
    text: '*bzzt* Commander Reza here — welcome to my world, soldier. By day I ship web and mobile apps. Out here, I drive the tank. Over.',
  },
  {
    text: 'Controls, listen up: WASD drives. ◄ ► swings the turret. SPACE fires. Go on — squeeze one off. Over.',
    touch:
      'Controls, listen up: left stick drives. Drag the right side to swing the turret. Tap FIRE. Go on — squeeze one off. Over.',
  },
  {
    text: "No missions. No score. No ending. See a building with a floating sign? That's one of my projects — put a shell near it and I'll send you the field report. Out.",
  },
];

function mustGet(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`[dialog] missing #${id} root element`);
  return el;
}

export function createIntroDialog(isTouch: boolean): IntroDialog {
  const root = mustGet('dialog');

  const bubble = document.createElement('div');
  bubble.className = 'bubble hidden';
  // #dialog is an absolute 0-size container at viewport (0,0); positioning the
  // bubble absolutely lets left/top read as viewport coordinates.
  bubble.style.position = 'absolute';
  bubble.innerHTML = `
    <div class="who"></div>
    <div class="text"></div>
    <div class="dots"></div>
  `;
  (bubble.querySelector('.who') as HTMLElement).textContent = WHO;
  const textEl = bubble.querySelector('.text') as HTMLElement;
  const dotsEl = bubble.querySelector('.dots') as HTMLElement;

  // Build step dots + advance hint.
  for (let i = 0; i < STEPS.length; i++) {
    dotsEl.appendChild(document.createElement('i'));
  }
  const hint = document.createElement('span');
  hint.className = 'hint';
  hint.textContent = isTouch ? 'tap to continue' : 'space / click';
  dotsEl.appendChild(hint);
  const dotEls = Array.from(dotsEl.querySelectorAll('i'));

  root.appendChild(bubble);

  const api: IntroDialog = {
    done: false,
    start,
    update,
  };

  let started = false;
  let step = 0;
  let anchorFn: (() => { x: number; y: number } | null) | null = null;

  // Typewriter reveal: first advance-press skips to the full line, the next
  // one moves to the following step (radio-transmission feel, PRD §8.3).
  let typing = 0; // interval id (0 = not typing)
  let fullText = '';

  function render(): void {
    const s = STEPS[step];
    fullText = isTouch && s.touch ? s.touch : s.text;
    dotEls.forEach((d, i) => d.classList.toggle('on', i === step));

    window.clearInterval(typing);
    textEl.textContent = '';
    let i = 0;
    typing = window.setInterval(() => {
      i++;
      textEl.textContent = fullText.slice(0, i);
      if (i >= fullText.length) {
        window.clearInterval(typing);
        typing = 0;
      }
    }, 1000 / TYPE_CPS);
  }

  function advance(): void {
    if (api.done || !started) return;
    if (typing !== 0) {
      // Mid-type: complete the current line instead of advancing.
      window.clearInterval(typing);
      typing = 0;
      textEl.textContent = fullText;
      return;
    }
    step++;
    if (step >= STEPS.length) {
      finish();
      return;
    }
    render();
  }

  function finish(): void {
    api.done = true;
    window.clearInterval(typing);
    typing = 0;
    bubble.classList.add('hidden');
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('pointerdown', onPointer);
    window.setTimeout(() => {
      bubble.style.display = 'none';
    }, 220);
  }

  function onKey(e: KeyboardEvent): void {
    if (e.code === 'Space') {
      e.preventDefault();
      advance();
    }
  }

  function onPointer(): void {
    advance();
  }

  function start(anchor: () => { x: number; y: number } | null): void {
    if (started) return;
    started = true;
    anchorFn = anchor;
    step = 0;
    render();
    bubble.classList.remove('hidden');
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
  }

  function update(): void {
    if (api.done || !started || !anchorFn) return;
    const p = anchorFn();
    if (!p) {
      // Tank not on screen (behind camera): hide the bubble this frame.
      bubble.classList.add('hidden');
      return;
    }
    bubble.classList.remove('hidden');
    bubble.style.left = `${p.x}px`;
    bubble.style.top = `${p.y}px`;
  }

  return api;
}
