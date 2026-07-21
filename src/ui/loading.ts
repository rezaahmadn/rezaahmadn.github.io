/**
 * ui/loading.ts — full-viewport loading screen (PRD §8.1).
 *
 * "WELCOME TO MY WORLD" headline + name/title + progress bar.
 * setProgress(p, label?) drives the bar; when ready the status line becomes
 * "Click or press any key to enter"; waitForEnter() resolves on the first
 * click/keydown; hide() fades out over 400ms (matches the CSS transition).
 */

import type { LoadingUI } from '../types';

const HEADLINE = 'WELCOME TO MY WORLD';
const SUBTITLE = 'Reza Ahmad Nurfauzan — Software Engineer';
const ENTER_TEXT = 'Click or press any key to enter';
const FADE_MS = 400;

function mustGet(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`[loading] missing #${id} root element`);
  return el;
}

export function createLoading(): LoadingUI {
  const root = mustGet('loading');

  const wrap = document.createElement('div');
  wrap.className = 'loading';
  wrap.innerHTML = `
    <h1></h1>
    <p class="subtitle"></p>
    <div class="bar"><span></span></div>
    <div class="status"></div>
  `;
  // Use textContent for the static copy (no injection surface).
  (wrap.querySelector('h1') as HTMLElement).textContent = HEADLINE;
  (wrap.querySelector('.subtitle') as HTMLElement).textContent = SUBTITLE;

  const fill = wrap.querySelector('.bar > span') as HTMLElement;
  const status = wrap.querySelector('.status') as HTMLElement;

  root.appendChild(wrap);

  let ready = false;

  function setProgress(p: number, label?: string): void {
    const clamped = Math.max(0, Math.min(1, p));
    fill.style.width = `${clamped * 100}%`;
    if (ready) return; // once ready, keep the enter prompt
    status.textContent =
      label ?? `Deploying tank… ${Math.round(clamped * 100)}%`;
  }

  function waitForEnter(): Promise<void> {
    ready = true;
    wrap.classList.add('ready');
    status.textContent = ENTER_TEXT;
    fill.style.width = '100%';

    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.removeEventListener('keydown', finish);
        wrap.removeEventListener('pointerdown', finish);
        resolve();
      };
      window.addEventListener('keydown', finish);
      wrap.addEventListener('pointerdown', finish);
    });
  }

  function hide(): void {
    wrap.classList.add('hidden');
    window.setTimeout(() => {
      wrap.style.display = 'none';
    }, FADE_MS);
  }

  return { setProgress, waitForEnter, hide };
}
