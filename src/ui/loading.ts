/**
 * ui/loading.ts — two-door briefing screen (PRD §8.1).
 *
 * While assets load: "WELCOME TO MY WORLD" + name/title/stack + contact links
 * (clickable during load) + progress bar. When ready, two doors appear:
 * [🎮 Explore my world] resolves waitForEnter() (pressing any key also works),
 * [📄 Just the facts] is a plain link to the classic page. hide() fades out
 * over 400ms (matches the CSS transition).
 */

import type { LoadingUI } from '../types';

const HEADLINE = 'WELCOME TO MY WORLD';
const SUBTITLE = 'Reza Ahmad Nurfauzan — Software Engineer';
const TAGLINE = 'React · React Native · TypeScript · Node.js';
const LINKS: Array<{ label: string; href: string; newTab: boolean }> = [
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/rezaahmadn/', newTab: true },
  { label: 'Email', href: 'mailto:rezaahmadn@gmail.com', newTab: false },
];
const EXPLORE_LABEL = '🎮 Explore my world';
const CLASSIC_LABEL = '📄 Just the facts';
const CLASSIC_HREF = 'classic.html';
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
    <p class="tagline"></p>
    <div class="load-links"></div>
    <div class="bar"><span></span></div>
    <div class="status"></div>
    <div class="doors">
      <button class="door primary" type="button"></button>
      <a class="door ghost"></a>
    </div>
  `;
  // Use textContent for the copy (no injection surface).
  (wrap.querySelector('h1') as HTMLElement).textContent = HEADLINE;
  (wrap.querySelector('.subtitle') as HTMLElement).textContent = SUBTITLE;
  (wrap.querySelector('.tagline') as HTMLElement).textContent = TAGLINE;

  const linksEl = wrap.querySelector('.load-links') as HTMLElement;
  for (const l of LINKS) {
    const a = document.createElement('a');
    a.textContent = l.label;
    a.href = l.href;
    if (l.newTab) {
      a.target = '_blank';
      a.rel = 'noopener';
    }
    linksEl.appendChild(a);
  }

  const fill = wrap.querySelector('.bar > span') as HTMLElement;
  const status = wrap.querySelector('.status') as HTMLElement;
  const exploreBtn = wrap.querySelector('.door.primary') as HTMLButtonElement;
  const classicLink = wrap.querySelector('.door.ghost') as HTMLAnchorElement;
  exploreBtn.textContent = EXPLORE_LABEL;
  classicLink.textContent = CLASSIC_LABEL;
  classicLink.href = CLASSIC_HREF;

  root.appendChild(wrap);

  let ready = false;

  function setProgress(p: number, label?: string): void {
    const clamped = Math.max(0, Math.min(1, p));
    fill.style.width = `${clamped * 100}%`;
    if (ready) return;
    status.textContent = label ?? `Deploying tank… ${Math.round(clamped * 100)}%`;
  }

  function waitForEnter(): Promise<void> {
    ready = true;
    wrap.classList.add('ready');
    status.textContent = '';
    fill.style.width = '100%';

    return new Promise<void>((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        window.removeEventListener('keydown', onKey);
        resolve();
      };
      const onKey = (e: KeyboardEvent): void => {
        // Let keyboard users Tab/activate the links without launching the game.
        if (e.key === 'Tab' || e.key === 'Shift' || e.key === 'Enter') return;
        finish();
      };
      // Explore door + most keys. (Clicks elsewhere do nothing — the classic
      // door and contact links must stay ordinary navigations.)
      exploreBtn.addEventListener('click', finish);
      window.addEventListener('keydown', onKey);
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
