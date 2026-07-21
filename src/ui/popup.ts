/**
 * ui/popup.ts — project popup card (PRD §7.2, §8.4).
 *
 * open(project) fills title / blurb / tech chips / [Visit project →] (a real
 * <a target="_blank" rel="noopener"> to project.url) / [Keep exploring].
 * Footer: "— fired from Reza's World —". Sets input.paused=true while open;
 * Esc or click-outside closes (input.paused=false). Enter animation (scale
 * .95→1 + fade, 150ms) is driven by the .open class in style.css.
 */

import type { InputSystem, Popup } from '../types';
import type { Project } from '../data/projects';

const FOOTER_TEXT = "— fired from Reza's World —";
const VISIT_LABEL = 'Visit project →';
const CLOSE_LABEL = 'Keep exploring';

function mustGet(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`[popup] missing #${id} root element`);
  return el;
}

export function createPopup(input: InputSystem): Popup {
  const root = mustGet('popup');

  const container = document.createElement('div');
  container.className = 'popup';
  container.innerHTML = `
    <div class="backdrop"></div>
    <div class="popup-card" role="dialog" aria-modal="true">
      <h2></h2>
      <p class="blurb"></p>
      <div class="chips"></div>
      <div class="actions">
        <a class="btn primary" target="_blank" rel="noopener"></a>
        <button class="btn ghost" type="button"></button>
      </div>
      <div class="footer"></div>
    </div>
  `;

  const backdrop = container.querySelector('.backdrop') as HTMLElement;
  const card = container.querySelector('.popup-card') as HTMLElement;
  const titleEl = container.querySelector('h2') as HTMLElement;
  const blurbEl = container.querySelector('.blurb') as HTMLElement;
  const chipsEl = container.querySelector('.chips') as HTMLElement;
  const visitEl = container.querySelector('.btn.primary') as HTMLAnchorElement;
  const closeEl = container.querySelector('.btn.ghost') as HTMLButtonElement;
  const footerEl = container.querySelector('.footer') as HTMLElement;

  visitEl.textContent = VISIT_LABEL;
  closeEl.textContent = CLOSE_LABEL;
  footerEl.textContent = FOOTER_TEXT;

  root.appendChild(container);

  const api: Popup = { isOpen: false, open, close };

  function open(project: Project): void {
    titleEl.textContent = project.title;
    blurbEl.textContent = project.blurb;
    visitEl.href = project.url;

    chipsEl.replaceChildren();
    for (const t of project.tech) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = t;
      chipsEl.appendChild(chip);
    }

    container.classList.add('open');
    api.isOpen = true;
    input.paused = true;
    card.scrollTop = 0;
  }

  function close(): void {
    if (!api.isOpen) return;
    container.classList.remove('open');
    api.isOpen = false;
    input.paused = false;
  }

  // Click outside the card (backdrop or padding area) closes.
  container.addEventListener('pointerdown', (e) => {
    if (!api.isOpen) return;
    if (e.target === container || e.target === backdrop) close();
  });
  closeEl.addEventListener('click', close);

  // Esc closes (allowed even though input is paused).
  window.addEventListener('keydown', (e) => {
    if (api.isOpen && e.key === 'Escape') close();
  });

  return api;
}
