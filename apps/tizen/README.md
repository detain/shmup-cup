# @shmup/tizen

The **Samsung Tizen TV web app** (`.wgt`) — the primary target. Tizen 5.5+ (2020+ TVs and
our Smart Monitor M7 / M70A test displays, Chromium 69). Remote-first.

## Build

```sh
pnpm --filter @shmup/tizen build      # release: vite build + scripts/check-bundle.mjs (no debug code)
pnpm --filter @shmup/tizen build:dev  # on-device debug build (--mode development): the debug tools behind Pause, Ch+ ×3
pnpm --filter @shmup/tizen build:test # the same as a test build (--mode test) — what pnpm test:e2e opens
pnpm --filter @shmup/tizen dev        # desktop-browser preview (no window.tizen: no EXIT, Back never exits)
```

The widget version is **0.1.0** (M1) in `public/config.xml` and `package.json`, kept equal by a
test.

`dist/` then contains `index.html`, **one classic IIFE script `app.js`**, `config.xml`,
`icon.png` and the sprite-atlas pages under `assets/atlas/` (`main.png`). The build (`vite.config.ts`) follows `shmup_tech.md` §2.1:

- syntax lowered with `build.target: ['chrome69', 'es2018']`;
- `format: 'iife'`, no code splitting, no module preload; Vite's
  `<script type="module">` is rewritten to `<script defer src="./app.js">`;
- a hand-written ES5 **`globalThis` polyfill** (`polyfills/global-this.js`, Chrome 71+ API
  used by PixiJS) is prepended after minification.
- the repo's **`shmupContent()`** plugin (`vite.shared.ts`) serves `virtual:shmup-content`:
  every shipped `content/**/*.json` inlined into `app.js`, because a widget on `file://`
  cannot `fetch()` local files (decision D25). No content files are copied into `dist/`.
  `main.ts` imports the module and the shell validates it at boot; see
  [`docs/dev/content-data.md`](../../docs/dev/content-data.md).
- **`shmupAssets()`** (same file) runs the placeholder asset pipeline, inlines the atlas
  manifest into `app.js` as `virtual:shmup-assets` and emits the atlas pages into
  `dist/assets/atlas/` with fixed names; the app loads them with relative URLs, which work
  from `file://` (decision D25). See
  [`docs/dev/asset-pipeline.md`](../../docs/dev/asset-pipeline.md).

`scripts/check-bundle.mjs` fails the build unless: exactly one script exists, it is loaded
as a classic deferred script, **it parses with acorn as an ES2018 script**, it starts with
the polyfill, `config.xml` / `icon.png` are present, every other file lives under
`dist/assets/` (so nothing unexpected is packaged into the `.wgt`), and at least one atlas
page exists under `dist/assets/atlas/` (the shell cannot boot without it), and — since M1-19 — the
**budgets** hold: `app.js` ≤ 384 KB gzipped (350 KB until M2-16), every atlas page a PNG of at most 2048², the whole
`dist/` ≤ 8 MB (`APP_JS_GZIP_BUDGET`, `ATLAS_PAGE_MAX_SIZE`, `DIST_BUDGET`; at M1-19 `app.js` is
228.6 KB gzipped and `dist/` 812.4 KB; after M2-11 `app.js` is 307.5 KB gzipped, after M2-12 313.5 KB,
after M2-13 320.3 KB, after M2-14 331.5 KB, after M2-15 343.8 KB, after M2-16 ≈ 359 KB — the shipped content is inlined, so every new zone adds to it; M2-15 added the front end's scenes and the nine attract demos, M2-16 the two UI string tables, the Options pages and the rebinding). The checks are also exported as `checkTizenBundle(distDir)`
(and `pngSize`) for the tests.

## Debug build (M1-19)

`build:dev` / `build:test` set `__SHMUP_DEV__`, so `main.ts` passes `tizenDebugTools(window,
__SHMUP_BUILD__)` to the boot: the shell's debug tools in **sequence** mode. Nothing reacts until
the remote enters **Pause (Play/Pause 10252, or a keyboard's Pause 19), Ch+, Ch+, Ch+** within
3 s; that unlocks the tools, shows the overlay (FPS, tick / render ms, draw calls, pools, rank, RNG
calls, state hash, WebGL version, boot ms, build id, frame graph), registers the number keys
(`DEBUG_REMOTE_KEYS`, `'1'` … `'8'`) with `tvinputdevice`, and **1–8** then work like the web's
F1–F8 (overlay, god mode, outlines, frame advance, step, slow motion, next checkpoint, skip to the
boss). `window.__shmupDebug` is there for the remote inspector. Package and install a debug build
like any other; package from a plain `build` for anything else (`pnpm test:e2e` leaves a test build
in `dist/`). Tester guide: [`docs/client/debug-tools.md`](../../docs/client/debug-tools.md);
developer guide: [`docs/dev/debug-and-replays.md`](../../docs/dev/debug-and-replays.md).

## Tests

`pnpm --filter @shmup/tizen test` (headless Node, no TV needed):

- `test/build/tizen-build.test.ts` runs the real Vite build into a temp folder, applies the
  bundle checks, parses `app.js` with acorn (ES2018, script) and executes it in a V8 realm
  with `globalThis` removed (like Chrome 69) up to the app entry; it also checks that
  `dist/` holds exactly the widget files plus the atlas pages, byte-identical to the
  pipeline output;
- `test/build/vite-config.test.ts` covers the classic-script rewrite, the build target and
  the polyfill; `test/scripts/` covers the bundle checker and the Tizen CLI wrappers (with
  `spawnSync` mocked — nothing is ever executed);
- `test/boot/boot-wiring.test.ts` boots the app against a fake window, `window.tizen`,
  renderer and AudioContext; `test/boot/debug-tools.test.ts` checks the TV debug tools (number
  keys registered once, only on the unlock);
- `test/build/tizen-build.test.ts` also asserts that the release bundle holds no debug code, and
  `test/config-xml/` that `config.xml`'s version equals the package's (M1-19).

`pnpm test:e2e` (repo root) builds `build:test` and opens `dist/index.html` via `file://` in
headless Chromium (since M1-19 the smoke also checks the locked debug tools and their unlock), like the TV runs the widget, and checks it boots to the title, that the remote's OK
(13) starts a game and Back (10009) pauses and resumes it without exiting, that with a fake
`window.tizen` Back on the title opens the exit confirmation and `exit()` runs only after YES
(M1-16), and — on `?scene=flight` — that the remote's arrow key codes move the KESTREL, and that
the ship autofires
with no key held (remote mode, M1-10) while the web-only `?loadout=full` is ignored (no Options,
no laser, no Force Field — M1-11). To open `dist/index.html` from disk in desktop Chrome yourself, start Chrome with
`--allow-file-access-from-files` — otherwise Chrome treats the atlas page as cross-origin and
WebGL refuses it (the TV serves the widget's files as same-origin). On the TV the app always
runs the shell's default scene, the **scene flow** (M1-16), because a widget has no `?scene=`
query string (and so no `?stage=` or `?loadout=` either): the title (logo, `PRESS OK`, 1 PLAYER /
2 PLAYERS / OPTIONS / EXIT, the title theme — 2 PLAYERS, M2-06, is a co-op game: the remote flies
player 1 and a USB / Bluetooth gamepad joins as player 2 with START), then 1 PLAYER (or 2 PLAYERS)
opens the difficulty menu (M2-01), OK on a
difficulty opens the ship select (M2-05 — the KESTREL, or the Direct-mode MANTA, which starts at
once and whose speed the remote's Ch− toggles), OK on the KESTREL opens the weapon select (M2-03 —
remote arrows and OK only; its OPTION row since M2-04, whose FORMATION / ROTATE Options the
remote's Ch+ spreads in the game), and OK on its START plays **zone A, AZURE VERGE** (M1-18 — `@shmup/shell`
`defaultStageId`; the dev scenes still fly in open space) and, since M2-10, the rest of the run
across the zone map (the zone tally, the ZONE MAP driven by the remote's ▲ / ▼, OK and Back, since
M2-11 the real zones B and C with zone B's secret bonus stage, since M2-12 the real zones D — its
dive into the caves and brick maze — and E, since M2-13 the real zones F — its regrowing tissue
walls and tentacles — and G with zone G's secret bonus stage, since M2-14 the final zones H — the
piston hall, the parade, IRON SOVEREIGN — and I — the ABYSS ARK raid and THE HOLLOW KING —, the
ending scenes and the credits; since M2-15 the front end — left alone on `PRESS OK` the title plays
the attract loop (a zone demo, the high-score tables, the story; the remote's OK returns), a high
score is named with the remote's arrows and OK, and the mode select offers PRACTICE and SOUND TEST
besides 1 PLAYER, 2 PLAYERS, OPTIONS and EXIT) with
the remote's
directional pad, its main gun firing on its own (`remoteMode` forces autofire,
`shmup_feat.md` §4 rule 1), under the core HUD with the power meter. **Back** goes through the
scene stack — game → pause menu, pause → resume, menus → back, title → **EXIT SHMUP CUP?** →
`platform.exit()` only after YES; the app's own Back watcher (`watchBackKey`) is installed before
boot and removed once the shell runs, so it exits directly only from the loading and boot error
screens. A resume from the home screen during a game opens the pause menu. The remote's OK is
the menus' Confirm and the game's `PowerUp` (M1-11): zone A's red saucers and completed
formations drop capsules, and holding an arrow while pressing OK must not stop the ship (the
input-probe question the M1-11 manual check asks). Since zone A the TV reaches everything the
browser stages had: the M1-12 life cycle (deaths, respawns, the game-over screen), the M1-13
WARNING and boss (HALCYON BULWARK), the M1-14 game feel and the zone's music. There is no
`?skip=boss` on the TV — the debug build's key 8 (after Pause, Ch+ ×3) is its skip to the boss
(M1-19). `pnpm test:e2e`
checks the effects gallery (`?scene=fx-gallery`) in the Tizen build opened from disk too; the
manual zone A checks are 19–24 of
[`docs/client/preview-build.md`](../../docs/client/preview-build.md#on-the-samsung-smart-monitor--tv).

Since M1-17 **OPTIONS** (on the title and in the pause menu) opens the Options screen: MASTER /
MUSIC / SFX volume sliders and **CONTROLS**, which offers `SAFE 4-WAY (DEFAULT)`
(`tizen-remote-safe`) and `FAST 8-WAY` (`tizen-remote-diagonal`) — the remote profiles whose menus
the remote can drive — and switches at once, registering the new profile's keys. The shell reads
the save from the widget's `localStorage` (`shmup-cup:save.v1`) before the title and applies the
saved volumes and profile; the save is written when the Options screen closes and when a game
ends, so quitting with Back → YES (or the TV killing the app) loses nothing, and Tizen deletes it
when the app is uninstalled. Since zone A (M1-18) games on the TV score, so the hi-score table
fills there too. `pnpm test:e2e` checks the Options screen with remote key codes only in the build
opened from disk (SFX and CONTROLS kept after a reload); the manual check is in
[`docs/client/preview-build.md`](../../docs/client/preview-build.md#on-the-samsung-smart-monitor--tv)
(checks 16–18). Guide: [`docs/dev/saves-and-options.md`](../../docs/dev/saves-and-options.md).

## Package, install, run (desktop with Tizen CLI + certificate — never in CI)

Cross-platform Node wrappers around the Tizen CLI; configure with environment variables:

| Variable | Meaning |
|---|---|
| `TIZEN_PROFILE` | Certificate profile (author + Samsung distributor cert listing the monitors' DUIDs) — required to package |
| `TIZEN_CLI` | Path to `tizen` / `tizen.bat` (default: on `PATH`) |
| `SDB` | Path to `sdb` (default: on `PATH`) |
| `TV_IP` | Monitor IP (Developer Mode → host = this PC); install/run `sdb connect` it first |
| `TIZEN_TARGET` | sdb serial (default `${TV_IP}:26101`) |

```powershell
# Windows PowerShell
$env:TIZEN_PROFILE = "shmup"; $env:TV_IP = "192.168.1.50"
pnpm --filter @shmup/tizen build
pnpm --filter @shmup/tizen tizen:package   # tizen package -t wgt -s shmup -- dist
pnpm --filter @shmup/tizen tizen:install   # tizen install -n <wgt> -s 192.168.1.50:26101 -- dist
pnpm --filter @shmup/tizen tizen:run       # tizen run -p ShmpCupGam.ShmupCup -s …
```

## config.xml

`public/config.xml`: profile `tv-samsung`, privileges `tv.inputdevice` (extra remote keys)
and `internet`, application id `ShmpCupGam.ShmupCup` (package id = 10 alphanumerics),
`required_version="5.5"`, landscape, no background support.

## Modules

| Module | Status | Responsibility |
|---|---|---|
| `main.ts` | — | Entry (no `import.meta`, no top-level await); `tizenDebugTools` when `__SHMUP_DEV__` (M1-19) |
| `boot` | implemented | Composition root: remote-first input (`tizen-remote-safe` profile, or the choice saved from OPTIONS → CONTROLS, applied when the shell has read the save — M1-17; `gamepad-standard`; since M2-16 both applied with the player's rebinding, SOCD and debounce — `ProfileState`, `customizeInputProfile` — and offered to the rebind screen through `inputProfiles.customize` / `rebindable`: the remote's buttons are rebound with the remote itself, Back never moves), Web Audio and the Tizen platform handed to `@shmup/shell`'s `bootShell` (content + atlas from `file://`, boot error screen, renderer, game, rAF loop, audio unlocked at boot — the shell's audio engine plays the sound effects from the start; the title theme plays in the scene flow, M1-16); Back goes through the scene stack (game → pause, menus → back, title → exit confirmation → `platform.exit()` after YES); only while the game is not running (loading, boot error screen) does Back exit directly |
| `platform` | partial | `registerKeyBatch` of the active input profile's `register` list (Play/Pause, Ch±; without a profile the fallback list adds the colour keys — never Exit/volume; falls back to per-key `registerKey` when the batch fails, so one key a model lacks does not block the rest), Back 10009 watcher, `visibilitychange` lifecycle, `exit()`, localStorage |
| `device-info` | placeholder | UA / resolution / WebGL / product-info diagnostics |
| `live-reload` | placeholder | Dev-only reload-on-change on the TV |

Input device facts (diagonals, repeat behaviour, extra keys, latency) come from
`tools/input-probe` (a separate npm project) — results change the input profiles in
`content/input/remote.input-profiles.json` (release debounce, diagonal policy, keys to
register), read by `@shmup/input-web`'s `rebind` and `remote` modules — data, not code
([`docs/dev/input-profiles.md`](../../docs/dev/input-profiles.md)).
