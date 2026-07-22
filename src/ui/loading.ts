/**
 * ui/loading.ts — two-door briefing screen (PRD §8.1).
 *
 * While assets load: "PLAYER 2" + name/title/stack + contact links (clickable
 * during load) + progress bar. When ready, "— press start —" pulses and two
 * doors appear: [🎮 Press start] resolves waitForEnter() (pressing any key
 * also works), [📄 Just the facts] is a plain link to the classic page.
 *
 * hide() plays a Battle City-style stage wipe: gray curtains close over the
 * briefing, a blocky "STAGE 1" card shows, then the curtains open onto the
 * world. (The name PLAYER 2 and this transition are an homage to Battle City
 * on the NES — the game behind this site's whole tank idea.)
 */

import type { LoadingUI } from '../types';

const HEADLINE = 'PLAYER 2';
const SUBTITLE = 'Reza Ahmad Nurfauzan — Software Engineer';
const TAGLINE = 'React · React Native · TypeScript · Node.js';
const READY_TEXT = '— press start —';
const STAGE_TEXT = 'STAGE 1';
const CURTAIN_CLOSE_MS = 350;
const STAGE_HOLD_MS = 700;
const CURTAIN_OPEN_MS = 450;
const LINKS: Array<{ label: string; href: string; newTab: boolean }> = [
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/rezaahmadn/', newTab: true },
  { label: 'GitHub', href: 'https://github.com/rezaahmadn', newTab: true },
  { label: 'Email', href: 'mailto:rezaahmadn@gmail.com', newTab: false },
];
const EXPLORE_LABEL = '🎮 Press start';
const CLASSIC_LABEL = '📄 Just the facts';
const CLASSIC_HREF = 'classic.html';

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
    status.textContent = READY_TEXT;
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

  // Battle City stage wipe. hide() closes NES-gray curtains over the briefing
  // and shows the blocky STAGE card, resolving once the screen is covered so
  // main.ts can build the world underneath (like an NES loading a stage);
  // reveal() then opens the curtains onto the finished world, enforcing a
  // minimum card hold so the homage always reads even on instant builds.
  const curtainTop = document.createElement('div');
  curtainTop.className = 'curtain curtain-top';
  const curtainBottom = document.createElement('div');
  curtainBottom.className = 'curtain curtain-bottom';
  const stageCard = document.createElement('div');
  stageCard.className = 'stage-card';
  stageCard.textContent = STAGE_TEXT;
  let coveredAt = 0; // performance.now() when the curtains finished closing

  function hide(): Promise<void> {
    root.appendChild(curtainTop);
    root.appendChild(curtainBottom);
    root.appendChild(stageCard);

    return new Promise<void>((resolve) => {
      // Next frame → transition to closed (needs one painted frame first).
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          curtainTop.classList.add('closed');
          curtainBottom.classList.add('closed');
          window.setTimeout(() => {
            // Curtains shut: show the stage card, drop the briefing beneath.
            stageCard.classList.add('show');
            wrap.style.display = 'none';
            coveredAt = performance.now();
            resolve();
          }, CURTAIN_CLOSE_MS);
        });
      });
    });
  }

  function reveal(): void {
    const heldFor = performance.now() - coveredAt;
    const wait = Math.max(0, STAGE_HOLD_MS - heldFor);
    window.setTimeout(() => {
      stageCard.classList.remove('show');
      curtainTop.classList.remove('closed');
      curtainBottom.classList.remove('closed');
      window.setTimeout(() => {
        curtainTop.remove();
        curtainBottom.remove();
        stageCard.remove();
      }, CURTAIN_OPEN_MS + 100);
    }, wait);
  }

  return { setProgress, waitForEnter, hide, reveal };
}
