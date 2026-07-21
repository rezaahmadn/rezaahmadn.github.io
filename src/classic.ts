/**
 * classic.ts — the traditional single-page portfolio ("Just the facts").
 *
 * Rendered from the same `getProjects()` data as the game world, so adding a
 * project to data/projects.ts updates both. Content is a web-safe subset of the
 * resume: NO phone number, NO address. Links back to the game — the two sites
 * are two doors into the same portfolio.
 */

import { getProjects } from './data/projects';

const LINKEDIN = 'https://www.linkedin.com/in/rezaahmadn/';
const EMAIL = 'rezaahmadn@gmail.com';

const ABOUT =
  'Software engineer with a frontend focus and ~4 years of experience building web and mobile applications. At Jagad I work on J-Wallet across a React Native mobile app and a React/TypeScript Telegram Mini App, and ship payment and settlement features into the Node.js/TypeScript backend. I enjoy building reusable UI components and delivering features end to end.';

const SKILLS: Array<[string, string]> = [
  ['Languages', 'JavaScript, TypeScript, SQL, HTML, CSS'],
  ['Frontend', 'React, React Native, Vue.js, Vite, Zustand, styled-components, Tailwind, Storybook'],
  ['Backend', 'Node.js, Express, Prisma, REST APIs'],
  ['Databases', 'MySQL, PostgreSQL, Firebase'],
  ['Other', 'Git, Solana, TON, Telegram Mini Apps & Bot API, Fastlane (iOS/Android CI/CD)'],
];

const EXPERIENCE: Array<{ role: string; where: string; when: string; points: string[] }> = [
  {
    role: 'Software Engineer',
    where: 'PT Jagadraya Jaring Terdistribusi (Jagad)',
    when: 'Dec 2022 – Present',
    points: [
      'Work on J-Wallet across two frontend codebases — a React Native mobile app and a React/TypeScript Telegram Mini App — plus the shared Node.js/TypeScript backend.',
      'Ported ~90% of the mobile wallet into a TON-based Telegram Mini App, building the Storybook component library from scratch.',
      'Built backend features (Express, Prisma): crypto-to-fiat settlement, payment-link APIs, escrow workers, bank virtual-account top-ups — with Jest/Supertest coverage.',
      'Shipped money-movement and onboarding flows: P2P transfers with QR codes, top-ups, redemptions, payment links, referrals, bill payments, Sumsub KYC, biometric/PIN auth.',
      'Maintained the iOS/Android release pipeline with Fastlane through major React Native upgrades (0.73 → 0.81) and Solana integration.',
    ],
  },
  {
    role: 'Junior Software Engineer',
    where: 'ADX Asia',
    when: 'Jul 2022 – Dec 2022',
    points: [
      'Developed client and server features for an out-of-home advertising platform using Vue.js and Node.js.',
      'Built bulk user management with Excel import/export; fixed and documented platform reliability issues.',
    ],
  },
];

const EDUCATION: Array<[string, string]> = [
  ['Full-Stack JavaScript Coding Bootcamp — Hacktiv8, Indonesia', '2022'],
  ['MBA, International Business Management — Khon Kaen University, Thailand', '2019 – 2021'],
  ['B.Eng, Telecommunication Engineering — Telkom University, Indonesia', '2014 – 2018'],
];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function link(label: string, href: string, newTab = true): HTMLAnchorElement {
  const a = el('a', undefined, label);
  a.href = href;
  if (newTab) {
    a.target = '_blank';
    a.rel = 'noopener';
  }
  return a;
}

function section(title: string): HTMLElement {
  const s = el('section');
  s.appendChild(el('h2', undefined, title));
  return s;
}

const root = document.getElementById('classic');
if (!root) throw new Error('[classic] missing #classic root');

// --- Hero -------------------------------------------------------------------
const hero = el('header', 'c-hero');
hero.appendChild(el('h1', undefined, 'Reza Ahmad Nurfauzan'));
hero.appendChild(el('p', 'c-role', 'Software Engineer — React · React Native · TypeScript · Node.js'));
const heroLinks = el('div', 'c-links');
heroLinks.appendChild(link('LinkedIn', LINKEDIN));
heroLinks.appendChild(link('Email', `mailto:${EMAIL}`, false));
hero.appendChild(heroLinks);
const gameDoor = el('a', 'c-game-door', '🎮 Or drive a tank through all this instead →');
(gameDoor as HTMLAnchorElement).href = './';
hero.appendChild(gameDoor);
root.appendChild(hero);

// --- About ------------------------------------------------------------------
const about = section('About');
about.appendChild(el('p', undefined, ABOUT));
root.appendChild(about);

// --- Projects (from the shared data) ---------------------------------------
const projects = section('Projects');
for (const p of getProjects()) {
  const card = el('article', 'c-project');
  const head = el('div', 'c-project-head');
  head.appendChild(el('h3', undefined, p.title));
  head.appendChild(link('Visit →', p.url));
  card.appendChild(head);
  card.appendChild(el('p', undefined, p.blurb));
  const chips = el('div', 'chips');
  for (const t of p.tech) chips.appendChild(el('span', 'chip', t));
  card.appendChild(chips);
  projects.appendChild(card);
}
root.appendChild(projects);

// --- Skills -----------------------------------------------------------------
const skills = section('Skills');
const dl = el('dl', 'c-skills');
for (const [k, v] of SKILLS) {
  dl.appendChild(el('dt', undefined, k));
  dl.appendChild(el('dd', undefined, v));
}
skills.appendChild(dl);
root.appendChild(skills);

// --- Experience -------------------------------------------------------------
const exp = section('Experience');
for (const e of EXPERIENCE) {
  const item = el('article', 'c-exp');
  const head = el('div', 'c-exp-head');
  head.appendChild(el('h3', undefined, `${e.role} — ${e.where}`));
  head.appendChild(el('span', 'c-when', e.when));
  item.appendChild(head);
  const ul = el('ul');
  for (const pt of e.points) ul.appendChild(el('li', undefined, pt));
  item.appendChild(ul);
  exp.appendChild(item);
}
root.appendChild(exp);

// --- Education --------------------------------------------------------------
const edu = section('Education');
const eduList = el('ul', 'c-edu');
for (const [what, when] of EDUCATION) {
  const li = el('li');
  li.appendChild(el('span', undefined, what));
  li.appendChild(el('span', 'c-when', when));
  eduList.appendChild(li);
}
edu.appendChild(eduList);
root.appendChild(edu);

// --- Footer -----------------------------------------------------------------
const foot = el('footer', 'c-foot');
const footLine = el('p');
footLine.append('Open a channel: ');
footLine.appendChild(link('Email', `mailto:${EMAIL}`, false));
footLine.append(' · ');
footLine.appendChild(link('LinkedIn', LINKEDIN));
foot.appendChild(footLine);
foot.appendChild(el('p', 'c-fine', '— this page and the tank world are rendered from the same data —'));
root.appendChild(foot);
