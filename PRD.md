# PRD — "PLAYER 2": Tank-Driven Interactive Portfolio

> **Brand note:** the site is named **PLAYER 2**, an homage to Battle City (NES) played two-player with Reza's late mother — the origin of the whole tank concept. By Reza's choice the homage stays visual/nominal only (name + Battle City stage-curtain entry transition); no origin story or dedication appears in site copy.

## 1. Overview

A personal portfolio website that is a small 3D game. The visitor drives a low-poly tank through a procedurally-scattered world, and Reza's real projects appear as buildings ("points of interest", POIs) with hovering text labels. Shooting near a POI opens a popup card describing that project with a link to visit it. There is no score, no win condition, no ending — the world exists to be explored.

**Owner:** Reza Ahmad Nurfauzan — frontend-focused software engineer (React/React Native/TypeScript at Jagad, building J-Wallet). This site is itself a portfolio piece: the code should be clean, typed, and readable.

**This document is the implementation contract.** It contains all decisions, exact asset facts, data schemas, UI copy, and acceptance criteria. An implementing agent should not need to re-ask product questions.

## 2. Player experience (end-to-end flow)

1. **Loading screen** covers everything while assets load: "WELCOME TO MY WORLD" headline, Reza's name/title, progress bar. When loaded, it becomes "Click or press any key to enter".
2. On enter, the camera is on the tank at the world center. A **speech bubble above the tank** introduces Commander Reza and teaches the controls in 3 short steps (copy in §8.3).
3. Player drives with **WASD**, rotates the turret with **←/→ arrows**, fires with **SPACE**. Shots produce a muzzle flash; impacts produce a low-poly explosion (or a splash if they land in the lake).
4. Buildings scattered around the world have **hovering text labels** with project names. A shell landing within the POI's radius opens a **popup card**: project title, brief description, tech chips, "Visit →" button (new tab), Close.
5. The tank can **drive into and through the lake**: it slows down, sinks to the lakebed, and the water reacts with **simulated ripples**. Driving out the far side works.
6. World layout (trees, bushes, rocks, POI building positions) is **procedurally placed from a seed**, so every visit is a slightly different world. The seed is shareable via URL.

### 2b. Content & story layer (added post-v1)
- **Two-door entry:** the loading screen is a briefing card — name/title/stack + LinkedIn/Email links (clickable during load) — and when ready offers **[🎮 Explore my world]** (game; any key works too) and **[📄 Just the facts]** (→ `classic.html`).
- **Classic page** (`classic.html` + `src/classic.ts`, second Vite entry): traditional single-page portfolio rendered from the same `getProjects()` data plus web-safe resume content (**no phone/address**). Cross-linked both ways (in-game "📄 classic site" link under the HUD legend).
- **Commander Reza radio persona:** the intro bubble is a typewriter "transmission" (copy in §8.3); driving near a POI for the first time triggers its `radioLine` as a non-blocking bottom-center transmission toast (`src/ui/radio.ts`), suppressed until the intro is done and while a popup is open.
- **Completion:** POI hits are tracked (`sites n/N` HUD counter, transparent, above the seed chip). When all sites are hit, after the last FIELD REPORT closes, a finale card appears: tour-complete transmission + `[✉ Open a channel]` (mailto) + `[LinkedIn]` + `[Keep roaming]`. Once per visit.

## 3. Tech stack & constraints

| Decision | Value |
|---|---|
| Language | TypeScript (strict) — Reza's core language, part of the showcase |
| Renderer | Three.js (latest), plain — no React, no game framework |
| Build | Vite, static output |
| Physics | None. Hand-rolled: raycast height sampling + radial colliders + distance checks |
| UI layer | Plain HTML/CSS absolutely positioned over the canvas (no in-world 3D UI except POI labels) |
| Hosting | Static (Vercel/Netlify/GitHub Pages) |
| Performance budget | 60 fps on a mid-range laptop; total payload < 3 MB; `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))` |
| Browser targets | Latest Chrome/Firefox/Safari, desktop **and mobile**. Mobile is fully playable via touch controls (§5.6); on phones, cap pixel ratio at 1.5 and halve the shadow-map resolution. |

## 4. Assets (all exist in `3dassets/`; use only the `.glb` files)

| File | Contents / named nodes | Role |
|---|---|---|
| `low-poly-tank.glb` | Root `tank` → `hull`, `turret` (→ `turret_body`, `hatch`, `mantlet`, `barrel`, `muzzle`), `track_left`, `track_right` (each with sprockets, roadwheels, ~26 `track_*_link_N` children) | Player. Turret yaw = rotate the `turret` node. Projectile spawns at the `muzzle` node's world position/direction. Optional flourish: spin `*_sprocket_*` / `*_roadwheel_*` while driving. |
| `low-poly-terrain.glb` | `terrain` (16,200 tris, grass + sand materials), `water` (511 verts / 920 tris, flat grid trimmed to the lake shoreline) | Ground + lake surface. **Facts:** world is 100×100 units centered at origin; ground undulates ±0.8; flat spawn zone ≈ radius 6 at origin; lake center ≈ `(x −25, z −20)` in Three.js coordinates; lakebed reaches y ≈ −4; **water surface plane at y = −1.2**. |
| `wrecked-building.glb`, `low-poly-house.glb` | Buildings | POI markers (alternate between them; wrecked building suits the tank theme for "battle-tested" projects) |
| `low-poly-tree.glb`, `lowpoly-oak-tree.glb`, `low-poly-bush.glb`, `low-poly-rocks.glb` | Decoration | Procedural scatter |

Asset notes for the implementer:
- glTF is Y-up; Blender's `(x, y)` ground plane becomes Three.js `(x, −z)`. All facts above are already in Three.js coordinates.
- Measure the tank's bounding box after load and scale the root so the hull is ≈ 4.5 units long. Scale buildings/trees to read correctly against that (building ≈ 6–8 units tall).
- The terrain/water GLB is regenerable from `blender/terrain.blend` (parameterized Python; see repo history) — don't hand-edit the exported GLB.

## 5. World systems

### 5.1 Height sampling & ground following
- One `Raycaster` pointed straight down. `sampleGround(x, z)` raycasts from y = 50 against the `terrain` mesh → `{ height, normal }`. This is the single source of truth for "how high is the ground"; used by tank, scatter placement, projectile impact, and POI placement.
- Tank follows terrain: sample under hull center for position; sample at 4 hull corners (or use face normal, lerped ~10%/frame) to pitch/roll the tank on slopes.
- World bounds: clamp tank to |x|, |z| ≤ 47.

### 5.2 Movement & collision
- Classic tank controls: W/S = forward/reverse along hull heading (≈ 8 units/s forward, 5 reverse), A/D = yaw hull (≈ 1.6 rad/s). All motion × `delta` from `THREE.Clock`.
- Obstacles: every placed building and rock registers a cylinder collider `{x, z, radius}`. Before moving, test the next position; on overlap, cancel the movement component into the collider (slide along it). Trees/bushes are drive-through (they're small; keeping it forgiving feels better).
- **Water rule:** depth = `WATER_LEVEL(−1.2) − sampleGround(x,z).height`, when positive the tank is in water. Effects: speed ×0.6, tank continues to follow the lakebed (it visibly submerges — the translucent water tints it blue), ripple sources spawn while moving (§5.4). No blocking anywhere in the lake; crossing is allowed and encouraged.

### 5.3 Procedural placement (seeded)
- `util/rng.ts`: mulberry32 PRNG. Seed = `?seed=` URL param if present, else `Math.floor(Math.random() * 1e9)`. Show the seed bottom-corner of the HUD as `world #123456789` (clicking it copies a shareable URL).
- Placement runs once at load, entirely from the PRNG, in this order:
  1. **POIs** (all entries in `data/projects.ts`, 6 total): rejection-sample positions with constraints — within |x|,|z| ≤ 40; ≥ 12 units from spawn (origin); ≥ 22 units apart from each other; ground height > −0.9 (not in the lake or on the beach); slope < ~15° (compare 4-corner sample spread). ≤ 200 attempts each, then relax distances by 20% and retry (guarantees termination).
  2. **Decoration**: ~45 trees (mix of the two tree assets), ~30 bushes, ~18 rocks. Same constraints but: ≥ 8 from spawn, ≥ 5 from any POI (keep sightlines to buildings clear), ≥ 2.5 apart, not below y = −0.9. Random uniform yaw and ±15% uniform scale per instance.
- Rocks register colliders; trees/bushes don't.
- Same seed ⇒ identical world (acceptance test).

### 5.4 Water simulation
The `water` mesh's vertices are animated on the CPU each frame (511 verts — trivial cost):

```
y(v, t) = WATER_LEVEL
        + Σ ambient: aᵢ · sin(kᵢ·(v.x·dᵢ.x + v.z·dᵢ.z) + t·ωᵢ)      // 3 waves, aᵢ ≈ 0.04–0.07, different directions
        + Σ ripples: A·e^(−1.8·age)·e^(−0.18·r)·sin(6·r − 8·age)     // r = dist(v, source), source dies at age > 2.5s
```

- Ripple sources: array capped at 12 (oldest evicted). Spawned by (a) tank moving in water — one source at the hull every 0.25 s, A ≈ 0.25; (b) projectile water impact — one source, A ≈ 0.5, plus splash FX (§6.3).
- After displacement: `geometry.computeVertexNormals()`, material `flatShading: true` — faceted waves match the art style.
- Keep the imported `MeshStandardMaterial` (transparent, opacity ~0.85 from the GLB); just enable flatShading and mark `position` attribute + normals for update.

### 5.5 Projectiles
- SPACE (edge-triggered, 0.6 s cooldown) spawns a shell (small stretched sphere, pooled ×6) at the `muzzle` node's world position, velocity 30 units/s along muzzle direction + slight gravity (−9 y/s²) for an arc.
- Each frame test, in order: distance to each POI center < POI radius (≈ 7) → **POI hit**; below water surface while over the lake → **splash**; y ≤ sampleGround height → **ground explosion**; lifetime > 4 s → despawn.
- POI hit also plays the ground-explosion effect at the impact point plus a quick scale-pulse on the building (1 → 1.06 → 1, 200 ms).

### 5.6 Touch controls (mobile is a first-class platform)
- Activate when `matchMedia('(pointer: coarse)')` matches (plus on first touch event as a fallback). Keyboard input stays active regardless — hybrid devices get both.
- **Left half of screen:** floating virtual joystick — appears where the thumb lands, drags up to ~56 px. Vertical axis = throttle (forward/reverse), horizontal axis = hull yaw. Both proportional (half-stick = half-speed), feeding the same tank-controller inputs as WASD.
- **Right half:** horizontal drag anywhere = turret yaw (relative, ~0.5°/px), plus a fixed round **FIRE** button bottom-right (72 px, same 0.6 s cooldown, visual cooldown sweep).
- Joystick/fire zones are semi-transparent DOM overlays; `touch-action: none` on the canvas and controls; ignore touches that start on the popup card.
- Intro bubble and HUD swap their control copy on touch devices (§8.2–8.3). Bubble advances on tap.
- Portrait works but landscape is better: in portrait, show a small dismissible hint `↻ rotate for the best view` once.
- Camera and UI must respect `visualViewport`/safe-area insets (notches).

## 6. Effects

### 6.1 Muzzle flash — every shot
Small bright sprite (or icosahedron) at the muzzle + `PointLight` (intensity spike, warm color), both alive ~90 ms. Tiny turret recoil: barrel kicks back 0.15 units, eases back over 150 ms.

### 6.2 Ground explosion — shell impact on land
All from pooled objects, total lifetime ~0.7 s, no textures needed:
- 12–16 tetrahedron shards (orange/dark-grey mix) burst outward with gravity, shrinking to zero.
- One expanding flat-shaded icosahedron "fireball", scale 0.3 → 2.2, color lerp yellow → orange, opacity → 0.
- 3–4 grey "smoke" icosahedrons drifting up, expanding, fading.
- `PointLight` flash, 120 ms.

### 6.3 Water splash — shell impact on lake
- Ripple source in the water sim (§5.4).
- 8–10 pale-blue droplet shards up-and-out with gravity.
- One expanding white ring mesh on the surface fading over 0.8 s (also used as the tank's wake ring while wading, spawned every 0.3 s).

## 7. POIs & project data

### 7.1 Hovering label
- Canvas-rendered text (`CanvasTexture` on a `Sprite`, ~256×64 px, white text, subtle dark rounded backing) floating above each building; gentle bob (±0.3 units, 2 s period) and slow sway. Always faces camera (sprites do by default).
- Within 15 units of the tank, the label brightens/scales up slightly — a nudge toward "this thing is interactive".

### 7.2 Popup card (HTML overlay)
Opens on POI hit. Pauses game input (except Esc). Content: title, `blurb`, tech chips, buttons **[Visit project →]** (real `<a target="_blank" rel="noopener">`) and **[Keep exploring]** (Esc or click-outside also closes). Enter animation: scale 0.95→1 + fade, 150 ms. While open, the game world keeps rendering (water keeps moving) — it's a pause of input, not of time.

### 7.3 `data/projects.ts` — the single source of truth

```ts
export interface Project {
  id: string;
  title: string;        // hovering label + popup title
  blurb: string;        // 1–2 sentences shown in the popup (SITREP)
  tech: string[];       // chips (ARMAMENT)
  url: string;          // "Deploy to project" target
  building?: 'wrecked-building' | 'low-poly-house';  // omit → auto-alternate by index
  radioLine?: string;   // Commander Reza's proximity quip; invalid → stripped w/ warning, never drops the entry
  classicHidden?: boolean; // hide from the classic page's project list (still a game POI) — used by commander-hq
}
```

**Everything downstream derives from this array — POI count, placement, labels, hit zones, popups.** Nothing else in the codebase may reference a specific project id, count, or hardcode per-project behavior.

Content (URLs are live; `url` omitted ⇒ the popup/classic page show **CLASSIFIED** instead of a link). Each project has a hand-modeled landmark building (the ex-POI `wrecked-building`/`low-poly-house` are now scattered ambience decoration with colliders):

| id | title | url | building (landmark) |
|---|---|---|---|
| `jwallet-mobile` | J-Wallet Mobile App | play.google.com/store/apps/details?id=to.jagad.wallet | `low-poly-bank` (columned bank + gold coin) |
| `jwallet-miniapp` | J-Wallet Telegram Mini App | t.me/JagadWalletBot | `watchtower` (Telegram outpost) |
| `jwallet-backend` | J-Wallet Backend | — (CLASSIFIED) | `concrete-bunker` |
| `easyidrbot` | easyIDRBot | t.me/easyIDRBot | `relay-station` (dish + antenna) |
| `adx-asia` | ADX Asia Platform | adxasia.co.id | `billboard-tower` (OOH billboard) |
| `commander-hq` | Commander HQ — About Reza | linkedin.com/in/rezaahmadn | `command-post` (flag + sandbags) |

(Blurbs/tech unchanged — see `src/data/projects.ts`, the source of truth.)

### 7.4 Adding a project later (design requirement, not just convenience)

Reza will add projects over time. The complete workflow must be:

1. Open `src/data/projects.ts`, append one `Project` object.
2. Done. On next load the world has one more labeled building that opens the new popup.

Rules that make this hold:
- Placement (§5.3) iterates over the projects array — never a hardcoded count. POI min-spacing adapts to the count: start at 22 units and, if rejection sampling can't place everything, relax by 20% per round (already specified). This comfortably supports ~10–12 POIs on the 100×100 terrain; if the array ever exceeds 12, log a console warning suggesting a larger terrain export.
- `building` omitted → alternate wrecked-building / low-poly-house by index, so a minimal entry is just id/title/blurb/tech/url.
- Labels and popups render from data at runtime (canvas text, DOM) — nothing is pre-baked per project.
- Keep `projects.ts` free of imports from the rest of the app (pure data) so editing it can never break game code, and a malformed entry fails loudly: validate the array at startup (non-empty strings, valid URL) and `console.error` + skip invalid entries rather than crashing the world.

## 8. UI copy & screens (exact text)

### 8.1 Briefing screen (loading + two doors, §2b)
```
PLAYER 2
Reza Ahmad Nurfauzan — Software Engineer
React · React Native · TypeScript · Node.js
[LinkedIn] [GitHub] [Email]
[———— progress bar ————]  Deploying tank… 47%
```
When ready the status line becomes a pulsing `— press start —` and two doors appear: `🎮 Press start` (button; any non-Tab/Shift/Enter key also enters) and `📄 Just the facts` (link → classic.html). On enter, a **Battle City stage wipe** plays: NES-gray curtains close (~350 ms), a blocky `STAGE 1` card shows (~700 ms), curtains open (~450 ms) onto the world.

### 8.2 HUD (top-left transparent legend; fades to 30% opacity after first shot)
```
W A S D  drive      ← →  turret      SPACE  fire
📄 classic site                                  ← escape-hatch link under the legend
```
Touch devices instead: `left stick  drive      drag right side  turret      🔘  fire`.
Bottom-left: transparent `stage #<seed>` (click = copy shareable URL, flash "copied!") with `sites n/N` counter above it.

### 8.3 Intro transmission (bubble anchored above the tank; ~45 chars/s typewriter — first SPACE/click completes the line, next advances; step dots shown)
Header: `COMMANDER REZA — TRANSMISSION`
1. `*bzzt* Commander Reza here — glad you pressed start, soldier. By day I ship web and mobile apps. Out here, I drive the tank. Over.`
2. `Controls, listen up: WASD drives. ◄ ► swings the turret. SPACE fires. Go on — squeeze one off. Over.` — touch: `Controls, listen up: left stick drives. Drag the right side to swing the turret. Tap FIRE. Go on — squeeze one off. Over.`
3. `No missions. No score. No ending. See a building with a floating sign? That's one of my projects — put a shell near it and I'll send you the field report. Out.`
After step 3 the bubble dismisses permanently (per-visit; no persistence needed).

### 8.4 FIELD REPORT popup
See §7.2, restyled as a report: `FIELD REPORT` kicker chip, title, `SITREP` label + blurb, `ARMAMENT` label + chips, `[Deploy to project →]` `[Keep exploring]`, footer `— transmission ends —`.

### 8.5 Radio toasts + finale
- Proximity toast (bottom-center): header `COMMANDER REZA — INCOMING TRANSMISSION`, typewriter body from `project.radioLine`, auto-dismiss ~5.5 s after completing; tap = skip/dismiss; queued one-at-a-time; never pauses input.
- Finale (all sites visited, shown after the last report closes; input-pausing; once per visit): title `TOUR COMPLETE`, body `*bzzt* That's every site in the sector, soldier. Tour complete. If you like what you've seen, open a channel. Commander Reza, out.`, buttons `✉ Open a channel` (mailto) / `LinkedIn` / `Keep roaming`, footer `— end of transmission —`.

## 9. Architecture / file map

```
src/
├─ main.ts               # bootstrap, render loop, system wiring, resize
├─ classic.ts            # "Just the facts" page (second Vite entry, renders from data/projects)
├─ ui/radio.ts           # transmission toasts + finale card (§8.5)
├─ config.ts             # every tunable named in this PRD (speeds, radii, wave params…)
├─ input.ts              # key state Set + edge-trigger helper; "paused" flag popup/dialog can set
├─ camera.ts             # isometric follow: PerspectiveCamera fov 20, offset ≈ (22, 28, 22), lerped
├─ util/rng.ts           # mulberry32, seed from URL/random
├─ util/assets.ts        # GLTFLoader + LoadingManager wrapper; loads all GLBs, exposes by name
├─ world/terrain.ts      # terrain mesh, sampleGround(x, z), world bounds
├─ world/water.ts        # §5.4 sim: ambient waves, ripple sources, addRipple(x, z, A)
├─ world/scatter.ts      # §5.3 seeded placement of POIs + decoration; collider registry
├─ world/poi.ts          # buildings, hovering labels, hit test, proximity glow
├─ tank/tank.ts          # movement, terrain follow, water rule, collider slide, track spin
├─ tank/projectile.ts    # pool, ballistics, impact routing (POI / water / ground)
├─ fx/explosion.ts       # muzzle flash, ground explosion, splash (pooled)
├─ ui/loading.ts  ui/dialog.ts  ui/popup.ts  ui/hud.ts
└─ data/projects.ts      # §7.3
```
`index.html` holds the canvas plus one `<div id="ui">` layer containing the four UI roots. Keep modules dependency-light: systems communicate through small interfaces passed in `main.ts`, not globals.

## 10. Implementation phases (each ends runnable + verifiable)

| Phase | Scope | Acceptance criteria |
|---|---|---|
| **P1 Scaffold & world** | Vite+TS, load terrain/water GLB, lighting (1 directional w/ shadows + hemisphere), fog + matching background, isometric camera at spawn | `npm run dev` shows the terrain with lake; 60 fps; no console errors |
| **P2 Tank** | Load tank, scale, WASD drive + terrain follow + pitch/roll, camera follows, bounds clamp | Drive everywhere on land; tank tilts on slopes; camera glides |
| **P3 Combat & FX** | Turret arrows, SPACE fire from muzzle, ballistics, muzzle flash, ground explosion, recoil | Shell arcs and explodes on land with shards/fireball/smoke; cooldown works |
| **P4 Water** | §5.4 sim + water rule + wake rings + splash | Ambient waves visible; driving in slows tank, submerges it, ripples trail it; shells splash with ring + droplets; same fps |
| **P5 World gen & POIs** | Seeded scatter, colliders+slide, POI buildings with labels, hit → popup with real data | Same `?seed=` ⇒ identical world; nothing spawns in lake/spawn zone; shooting near a building opens the right card; Visit opens correct URL in new tab; **appending a 7th test entry to `projects.ts` (only `id/title/blurb/tech/url`) and reloading yields a new labeled, shootable POI with no other code changes — then remove the test entry** |
| **P6 Personal UX** | Loading screen, intro bubble (3 steps, projected anchor), HUD + seed chip, popup polish | Full cold-load flow matches §2 end to end |
| **P7 Mobile** | §5.6 touch controls, coarse-pointer copy swaps, pixel-ratio/shadow reduction, safe-area/rotate hint | On a phone (or DevTools touch emulation): full flow of §2 playable by touch at steady frame rate; popup taps don't fire the cannon |
| **P8 Ship** | `gltf-transform optimize` pass on GLBs (script in package.json), payload check < 3 MB, deploy config, README | `npm run build && npm run preview` clean; deployed URL works on desktop + phone |

Suggested verification when driving this with the Chrome/browser MCP or manually: cold load → read the three intro bubbles → drive a lap including through the lake → fire at 2 POIs → open both popups → click a Visit link → reload with the same seed and confirm identical layout.

## 11. Non-goals (v1) / stretch
- **Non-goals:** backend/analytics, sound (stretch: engine hum + shot + splash via WebAudio, muted by default), enemy AI, damage/health, save state, React.
- **Stretch:** track-link crawl animation, day/night toggle, birds.

## 12. Open items for Reza
1. ~~Replace the TODO URLs~~ — done (real links live; backend intentionally CLASSIFIED with no link).
2. Optional: a favicon + `<meta>` OG tags ("Reza's World — drive a tank through my portfolio") before sharing the link.
