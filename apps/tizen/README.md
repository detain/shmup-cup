# @shmup/tizen

The **Samsung Tizen TV web app** (`.wgt`) — the primary target. Tizen 5.5+ (2020+ TVs and
our Smart Monitor M7 / M70A test displays, Chromium 69). Remote-first.

## Build

```sh
pnpm --filter @shmup/tizen build   # vite build + scripts/check-bundle.mjs
pnpm --filter @shmup/tizen dev     # desktop-browser preview (no window.tizen: no EXIT, Back never exits)
```

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
page exists under `dist/assets/atlas/` (the shell cannot boot without it). The checks are also exported as
`checkTizenBundle(distDir)` for the tests.

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
  renderer and AudioContext.

`pnpm test:e2e` (repo root) also opens the built `dist/index.html` via `file://` in headless
Chromium, like the TV runs the widget, and checks it boots to the title, that the remote's OK
(13) starts a game and Back (10009) pauses and resumes it without exiting, that with a fake
`window.tizen` Back on the title opens the exit confirmation and `exit()` runs only after YES
(M1-16), and — on `?scene=flight` — that the remote's arrow key codes move the KESTREL, and that
the ship autofires
with no key held (remote mode, M1-10) while the web-only `?loadout=full` is ignored (no Options,
no laser, no Force Field — M1-11). To open `dist/index.html` from disk in desktop Chrome yourself, start Chrome with
`--allow-file-access-from-files` — otherwise Chrome treats the atlas page as cross-origin and
WebGL refuses it (the TV serves the widget's files as same-origin). On the TV the app always
runs the shell's default scene, the **scene flow** (M1-16), because a widget has no `?scene=`
query string (and so no `?stage=` or `?loadout=` either): the title (logo, `PRESS OK`, START /
OPTIONS / EXIT, the title theme), then START flies the KESTREL in open space with the remote's
directional pad, its main gun firing on its own (`remoteMode` forces autofire,
`shmup_feat.md` §4 rule 1), under the core HUD with the power meter. **Back** goes through the
scene stack — game → pause menu, pause → resume, menus → back, title → **EXIT SHMUP CUP?** →
`platform.exit()` only after YES; the app's own Back watcher (`watchBackKey`) is installed before
boot and removed once the shell runs, so it exits directly only from the loading and boot error
screens. A resume from the home screen during a game opens the pause menu. The remote's OK is
the menus' Confirm and the game's `PowerUp` (M1-11): open space has no capsules, so a press there
is simply denied — but holding an arrow and pressing OK must not stop the ship (the input-probe
question the M1-11 manual check asks). Nothing can hit the ship in open space, so the M1-12 life
cycle (deaths, respawns, the game-over screen) is not reachable on the TV yet. Likewise the M1-13
bosses and their WARNING need a stage (`?stage=test-boss` in the web build) and are not reachable
on the TV until zone A (M1-18). Of the M1-14 game feel (explosions, sparks, shake, flashes, score
popups) only the muzzle spark in front of the ship's nose shows in open space on the TV;
`pnpm test:e2e` checks the effects gallery (`?scene=fx-gallery`) in the Tizen build opened from
disk too.

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
| `main.ts` | — | Entry (no `import.meta`, no top-level await) |
| `boot` | implemented | Composition root: remote-first input (`tizen-remote-safe` profile, or the saved choice; `gamepad-standard`), Web Audio and the Tizen platform handed to `@shmup/shell`'s `bootShell` (content + atlas from `file://`, boot error screen, renderer, game, rAF loop, audio unlocked at boot — the shell's audio engine plays the sound effects from the start; the title theme plays in the scene flow, M1-16); Back goes through the scene stack (game → pause, menus → back, title → exit confirmation → `platform.exit()` after YES); only while the game is not running (loading, boot error screen) does Back exit directly |
| `platform` | partial | `registerKeyBatch` of the active input profile's `register` list (Play/Pause, Ch±; without a profile the fallback list adds the colour keys — never Exit/volume; falls back to per-key `registerKey` when the batch fails, so one key a model lacks does not block the rest), Back 10009 watcher, `visibilitychange` lifecycle, `exit()`, localStorage |
| `device-info` | placeholder | UA / resolution / WebGL / product-info diagnostics |
| `live-reload` | placeholder | Dev-only reload-on-change on the TV |

Input device facts (diagonals, repeat behaviour, extra keys, latency) come from
`tools/input-probe` (a separate npm project) — results change the input profiles in
`content/input/remote.input-profiles.json` (release debounce, diagonal policy, keys to
register), read by `@shmup/input-web`'s `rebind` and `remote` modules — data, not code
([`docs/dev/input-profiles.md`](../../docs/dev/input-profiles.md)).
