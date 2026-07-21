/**
 * ui/hud.ts — control legend + seed chip (PRD §8.2).
 *
 * Top-left semi-transparent control legend (keyboard vs touch copy), fading to
 * 30% opacity after the first shot. Bottom-right "world #<seed>" chip that
 * copies a ?seed= share URL on click and flashes "copied!".
 */

import type { HUD } from '../types';

const COPIED_MS = 1200;

function mustGet(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`[hud] missing #${id} root element`);
  return el;
}

function shareUrl(seed: number): string {
  const url = new URL(window.location.href);
  url.searchParams.set('seed', String(seed));
  return url.toString();
}

async function copyText(text: string): Promise<void> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    /* fall through to legacy path */
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  ta.style.pointerEvents = 'none';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } catch {
    /* best effort */
  }
  document.body.removeChild(ta);
}

export function createHUD(seed: number, isTouch: boolean): HUD {
  const root = mustGet('hud');

  const hud = document.createElement('div');
  hud.className = 'hud';

  const keys = document.createElement('div');
  keys.className = 'keys';

  const legend: Array<[string, string]> = isTouch
    ? [
        ['left stick', 'drive'],
        ['drag right side', 'turret'],
        ['🔘', 'fire'],
      ]
    : [
        ['W A S D', 'drive'],
        ['← →', 'turret'],
        ['SPACE', 'fire'],
      ];

  for (const [key, label] of legend) {
    const span = document.createElement('span');
    const b = document.createElement('b');
    b.textContent = key;
    span.appendChild(b);
    span.appendChild(document.createTextNode(` ${label}`));
    keys.appendChild(span);
  }
  hud.appendChild(keys);

  // Seed chip, pinned to the bottom of the screen. Appended to the root (not the
  // HUD box) so its fixed positioning is relative to the viewport — the HUD box's
  // backdrop-filter would otherwise become its containing block — and so it never
  // fades with the HUD legend.
  const seedChip = document.createElement('div');
  seedChip.className = 'seed';
  const baseLabel = `world #${seed}`;
  seedChip.textContent = baseLabel;
  seedChip.title = 'Copy a shareable link to this world';
  root.appendChild(seedChip);

  let flashTimer = 0;
  seedChip.addEventListener('click', () => {
    void copyText(shareUrl(seed));
    seedChip.textContent = 'copied!';
    seedChip.classList.add('copied');
    window.clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => {
      seedChip.textContent = baseLabel;
      seedChip.classList.remove('copied');
    }, COPIED_MS);
  });

  // Sites-visited counter, just above the seed chip (same transparent style).
  const sites = document.createElement('div');
  sites.className = 'sites';
  root.appendChild(sites);

  // "classic site" escape hatch under the control legend — nobody is ever
  // trapped in the game (PRD §2 two-door entry).
  const classicLink = document.createElement('a');
  classicLink.className = 'classic-link';
  classicLink.textContent = '📄 classic site';
  classicLink.href = 'classic.html';
  root.appendChild(classicLink);

  root.appendChild(hud);

  function fadeAfterFirstShot(): void {
    hud.classList.add('dim');
  }

  function setSites(visited: number, total: number): void {
    sites.textContent = `sites ${visited}/${total}`;
  }

  return { fadeAfterFirstShot, setSites, element: hud };
}
