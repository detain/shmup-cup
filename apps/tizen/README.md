# @shmup/tizen

The **Samsung Tizen TV web app** (`.wgt`) — the primary target. Tizen 5.5+ (2020+ TVs and
our Smart Monitor M7 / M70A test displays, Chromium 69). Remote-first.

## Build

```sh
pnpm --filter @shmup/tizen build   # vite build + scripts/check-bundle.mjs
pnpm --filter @shmup/tizen dev     # desktop-browser preview (no window.tizen; Back does nothing)
```

`dist/` then contains `index.html`, **one classic IIFE script `app.js`**, `config.xml` and
`icon.png`. The build (`vite.config.ts`) follows `shmup_tech.md` §2.1:

- syntax lowered with `build.target: ['chrome69', 'es2018']`;
- `format: 'iife'`, no code splitting, no module preload; Vite's
  `<script type="module">` is rewritten to `<script defer src="./app.js">`;
- a hand-written ES5 **`globalThis` polyfill** (`polyfills/global-this.js`, Chrome 71+ API
  used by PixiJS) is prepended after minification.

`scripts/check-bundle.mjs` fails the build unless: exactly one script exists, it is loaded
as a classic deferred script, **it parses with acorn as an ES2018 script**, it starts with
the polyfill, and `config.xml` / `icon.png` are present.

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
| `boot` | partial | Composition root: remote-first input, audio, renderer, Tizen platform, loop; Back exits from the root screen until the title/exit-confirm scene exists |
| `platform` | partial | `registerKeyBatch` (Play/Pause, Ch±, colours — never Exit/volume), Back 10009 watcher, `visibilitychange` lifecycle, `exit()`, localStorage |
| `frame-loop` | implemented | rAF driver (one tick per frame on the 60 Hz M7) |
| `device-info` | placeholder | UA / resolution / WebGL / product-info diagnostics |
| `live-reload` | placeholder | Dev-only reload-on-change on the TV |

Input device facts (diagonals, repeat behaviour, extra keys, latency) come from
`tools/input-probe` (a separate npm project) — results feed `@shmup/input-web`'s `remote`
module.
