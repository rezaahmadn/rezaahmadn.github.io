/**
 * projects.ts — the single source of truth for POIs (PRD §7.3).
 *
 * IMPORTANT: keep this file free of imports from the rest of the app (pure data)
 * so editing it can never break game code. Everything downstream (POI count,
 * placement, labels, hit zones, popups) derives from this array.
 *
 * To add a project: append one Project object with at least id/title/blurb/tech/url.
 * `building` is optional — omit it to auto-alternate wrecked-building / low-poly-house.
 */

export interface Project {
  id: string;
  title: string; // hovering label + popup title
  blurb: string; // 1–2 sentences shown in the popup (SITREP)
  tech: string[]; // chips (ARMAMENT)
  url: string; // "Deploy to project" target
  building?: 'wrecked-building' | 'low-poly-house'; // omit → auto-alternate by index
  /** Commander Reza's radio quip when the tank first drives near this POI. */
  radioLine?: string;
}

// Placeholder used for every TODO url so all buttons work before launch.
const LINKEDIN = 'https://www.linkedin.com/in/rezaahmadn/';

const PROJECTS: Project[] = [
  {
    id: 'jwallet-mobile',
    title: 'J-Wallet Mobile App',
    blurb:
      'A decentralized wallet and payment app for Indonesia — crypto top-ups, an IDR-backed stablecoin, everyday payments, and withdrawals to local banks and e-wallets. Live on Google Play.',
    tech: ['React Native', 'TypeScript', 'Solana', 'Zustand', 'Fastlane'],
    url: LINKEDIN, // TODO (Play Store)
    building: 'wrecked-building',
    radioLine:
      "That's J-Wallet HQ, soldier. A crypto wallet for Indonesia — live on Google Play. Fire on it for the field report. Over.",
  },
  {
    id: 'jwallet-miniapp',
    title: 'J-Wallet Telegram Mini App',
    blurb:
      'The mobile wallet ported into a TON-based Telegram Mini App at ~90% feature parity, with a from-scratch Storybook component library and deep Telegram WebApp SDK integration.',
    tech: ['React', 'TypeScript', 'Vite', 'styled-components', 'TON'],
    url: LINKEDIN, // TODO (Telegram)
    building: 'low-poly-house',
    radioLine:
      'Telegram outpost ahead. We rebuilt the entire wallet inside Telegram at ninety percent parity. Shell it for details. Over.',
  },
  {
    id: 'jwallet-backend',
    title: 'J-Wallet Backend',
    blurb:
      'The Node.js/TypeScript engine behind J-Wallet: crypto-to-fiat settlement, payment-link APIs, escrow workers, and bank virtual-account top-ups — with Jest/Supertest coverage.',
    tech: ['Node.js', 'TypeScript', 'Express', 'Prisma', 'Solana'],
    url: LINKEDIN, // TODO
    building: 'wrecked-building',
    radioLine:
      'That bunker runs the backend — settlements, escrow, payment rails. Rock solid under fire. Take the shot. Over.',
  },
  {
    id: 'easyidrbot',
    title: 'easyIDRBot',
    blurb:
      "A Telegram bot built for the Coinfest Asia web3 conference that became Jagad's ongoing onboarding path — simple service access straight from Telegram.",
    tech: ['TypeScript', 'Telegram Bot API'],
    url: LINKEDIN, // TODO (Telegram)
    building: 'low-poly-house',
    radioLine:
      'Comms relay station. Built a Telegram bot for Coinfest Asia — kept serving long after the conference ended. Light it up. Over.',
  },
  {
    id: 'adx-asia',
    title: 'ADX Asia Platform',
    blurb:
      'Landing page rework and "Stack", an operations-management app for an out-of-home advertising platform.',
    tech: ['Vue.js', 'SCSS', 'Node.js', 'Firebase'],
    url: LINKEDIN, // TODO (website)
    building: 'low-poly-house',
    radioLine:
      'Old ADX garrison, my first tour. Vue.js ops platform and a landing-page rework. One round, on target. Over.',
  },
  {
    id: 'commander-hq',
    title: 'Commander HQ — About Reza',
    blurb:
      'Software engineer with ~4 years across web and mobile. I ship features end to end — React Native and React/TypeScript frontends, Node.js backends. This world is my portfolio; the tank is a bonus.',
    tech: ['About me'],
    url: LINKEDIN,
    building: 'wrecked-building',
    radioLine:
      "That's my HQ, soldier. The full story on your commander is inside. Knock first — with the cannon. Over.",
  },
];

const BUILDINGS: Array<NonNullable<Project['building']>> = ['wrecked-building', 'low-poly-house'];

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isValidUrl(v: unknown): boolean {
  if (!isNonEmptyString(v)) return false;
  try {
    // eslint-disable-next-line no-new
    new URL(v);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates an arbitrary project list (pure — no module state). Invalid entries
 * are console.error'd and skipped rather than crashing the world. Missing
 * `building` is auto-alternated by (surviving) index. Warns if the count exceeds
 * what the terrain comfortably fits (§7.4). Exported so it can be unit-tested
 * against deliberately-malformed input without touching the real data.
 */
export function validateProjects(raw: readonly Project[]): Project[] {
  const valid: Project[] = [];

  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    const problems: string[] = [];
    if (!isNonEmptyString(p.id)) problems.push('id');
    if (!isNonEmptyString(p.title)) problems.push('title');
    if (!isNonEmptyString(p.blurb)) problems.push('blurb');
    if (!Array.isArray(p.tech) || p.tech.length === 0 || !p.tech.every(isNonEmptyString))
      problems.push('tech');
    if (!isValidUrl(p.url)) problems.push('url');

    if (problems.length > 0) {
      console.error(
        `[projects] skipping invalid entry at index ${i} (id=${String(p.id)}): bad field(s): ${problems.join(', ')}`,
      );
      continue;
    }

    // radioLine is optional flavor — a bad one is stripped (with a warning),
    // never grounds for skipping the whole project.
    let radioLine = p.radioLine;
    if (radioLine !== undefined && !isNonEmptyString(radioLine)) {
      console.warn(
        `[projects] entry "${p.id}": ignoring empty/invalid radioLine`,
      );
      radioLine = undefined;
    }

    const idx = valid.length;
    valid.push({
      ...p,
      radioLine,
      building: p.building ?? BUILDINGS[idx % BUILDINGS.length],
    });
  }

  if (valid.length === 0) {
    console.error('[projects] no valid projects — the world will have no POIs.');
  }
  if (valid.length > 12) {
    console.warn(
      `[projects] ${valid.length} POIs exceeds the ~12 the 100×100 terrain fits comfortably; consider a larger terrain export.`,
    );
  }

  return valid;
}

/**
 * Returns the validated real project list (§7.3). Thin wrapper over
 * validateProjects so game code has a zero-argument entry point.
 */
export function getProjects(): Project[] {
  return validateProjects(PROJECTS);
}
