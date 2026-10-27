# Platform polish: Electron, Tizen extras, storage and memory

How plan step **M2-17** made the desktop build first-class and added the TV's extras. The
**Electron** app gained **file saves** through IPC (JSON in the user-data folder, atomic write +
backup, a quota), a **remembered window** (fullscreen, the scale of the game frame — 384×216 at
M2-17, 640×360 since R2-01 — the position, keyboard shortcuts), a locked-down window and a
**packaging config**; the web build it
loads now knows it runs inside Electron (platform `'electron'`, EXIT quits, sound from the start).
The **Tizen** app gained opt-in **`config.xml` variants** (Samsung's game-mode and gamepad
metadata), **`device-info`** (the TV's model and firmware in the debug overlay), a dev-only **live
reload** to the TV (`tizen:watch`) and the `productinfo` privilege. Both browser hosts share one
**`localStorage` adapter with quota checks** and a **debug save export / import**, and the shell
got a **memory budget**: an estimator that keeps every campaign zone under 100 MB and the atlas-page
residency that unloads pages between zones. Plan step **R1-05** (v2) gave that budget real work: the
atlas is split into a `common` page and one page per zone, the residency uploads the next zone's
pages eagerly, and the texture and audio shares are derived anew. Plan step **R3-04** then made the
residency **lazy** — pages fetch, decode, upload and drop their images at the stage change — and set
the atlas byte caps and `DIST_BUDGET` from the art-bible stand-in projection —
[below](#memory-budget-shmupshell-memory).

This page is the *how and why* and the map of the step's code. Exact signatures are in
[api-reference.md](api-reference.md) (`save`, `@shmup/render-pixi` `debug`, `@shmup/shell`
`storage` / `memory` / `debug` / `boot`, the apps); the TSDoc of `apps/electron/src/`,
`apps/tizen/src/{device-info,live-reload,boot,platform}/`, `apps/tizen/scripts/{config-xml,
tizen-watch}.mjs`, `apps/web/src/platform/`, `packages/shell/src/{storage,memory,debug}/` and
`packages/render-pixi/src/debug/` is the authoritative reference. What testers and the owner see is
in [`../client/desktop-app.md`](../client/desktop-app.md) (the desktop app),
[`../client/install-on-tv.md`](../client/install-on-tv.md#the-game-mode-build-latency-ab-test) (the
game-mode build, live reload) and [`../client/debug-tools.md`](../client/debug-tools.md#the-device-line)
(the device line, the save export). The save document itself is
[saves-and-options.md](saves-and-options.md); the debug tools and the overlay
[debug-and-replays.md](debug-and-replays.md); the shell's boot and the atlas
[rendering-and-shell.md](rendering-and-shell.md); build and deploy commands
[build-test-deploy.md](build-test-deploy.md).

Background: `shmup_feat.md` §23 (Electron: fullscreen window, file-based saves, gamepad, window /
scale settings, >60 Hz; Tizen: game-mode metadata, `webapis.productinfo`, uninstall deletes
data), §24 (live reload to the TV, the debug overlay), §21 (saves: storage abstraction, never lose
a save), §22 (texture / audio budgets); `shmup_tech.md` §2.3 (latency, Game Mode), §2.5 (memory:
120 MB dev cap, < 100 MB budget), §2.6 (HMR to the TV), §4.8 (Electron: `backgroundThrottling`,
fixed step with an accumulator).

## The picture at a glance

```text
 Electron main process (apps/electron/src/main)          renderer = the apps/web build
   main.ts ── app://game/ ─► dist/renderer/           ┌── preload.cts: window.shmupElectron
     createFileStore(<userData>/saves)                │     platform: 'electron', quit(),
     registerIpcHandlers(ipcMain, { store, quit })  ◄─┤     storage.get / storage.set (invoke)
       sender = app://game/… (or SHMUP_DEV_URL)       │
       key = isStorageKey, value ≤ 1 MiB              └── apps/web platform: getElectronBridge
     window.json ─ parseWindowState ─ fitWindowScale        → id 'electron', createBridgeStorage,
     before-input-event ─ windowShortcut (F11, Ctrl+=…)       exit = quit, audioUnlock 'immediate'

 Tizen app (apps/tizen)                                  @shmup/shell (web + Tizen hosts)
   public/config.xml (default) ─ configXmlVariant() ─►     storage: createWebStorage (quota,
     build:game-mode → use.game.mode                         QuotaExceededError retry, usage)
     TIZEN_GAMEPADS → gamepad check (popup!)               debug: __shmupDebug.save (export /
   check-bundle: validateConfigXml                           import), DebugToolsOptions.device
   tizenDebugTools ─ unlock ─► loadWebapis ─► device line   memory: estimateStageMemory,
   tizen:watch ─ HTTP + WebSocket ─► connectLiveReload        stageSpriteSets → atlasPageNeeds →
                                                              createAtlasResidency ◄ PrepareStage
```

## Electron: file saves (`main/saves.ts`)

`createFileStore(directory, options?)` backs the core's async `PlatformStorage` with files in
`join(app.getPath('userData'), SAVES_DIRECTORY)` — `<userData>/saves/`:

| File | What |
|---|---|
| `save.v1.json` | the save document (`core/save`'s `SAVE_STORAGE_KEY`) |
| `save.corrupt.json` | the copy of a corrupt save, written by `loadSave` for inspection |
| `window.json` | the window settings (`main/window-state.ts`) |
| `<key>.json.bak` | each key's previous text |
| `<key>.json.tmp` | a write in progress (removed when it fails) |

- **One file per key.** `storageFileName(key)` → `<key>.json`; a key must pass `shared/ipc`
  `isStorageKey` — 1–64 characters of `A–Z a–z 0–9 . _ -`, starting with a letter or digit, not
  ending with `.` — so a key is always one plain file name (no `/`, no `..`). Anything else throws
  `StorageKeyError`.
- **Atomic write + backup.** `set` writes `<key>.json.tmp` and `fsync`s it
  (`FileStoreFs.writeFileSynced`), copies the current `<key>.json` to `<key>.json.bak`, then renames
  the temporary file over `<key>.json`. A crash at any moment leaves the old or the new text, never
  half a file, and the previous text survives as the backup.
- **Recovery on read.** A missing `<key>.json` falls back to its backup; a file that is not valid
  JSON (a disk error, a hand edit) falls back to a backup that *is* — else its text is returned as it
  is and the core's defensive parser decides (a corrupt save becomes `save.corrupt`, the game runs on
  defaults).
- **Order.** Reads and writes of one key are queued (a read after a write sees the new text); keys
  run independently.
- **Quota.** One value at most `STORAGE_VALUE_MAX_BYTES` (1 MiB, UTF-8), the folder — every
  `*.json` and `*.json.bak` after the write, the key's current file counted as its new backup — at
  most `FILE_STORE_QUOTA_BYTES` (8 MiB); over either, `set` rejects with `StorageQuotaError { key,
  bytes, limit }`. A full save (32 hi-score tables) is about 26 KB.
- `store.directory` is the folder; `store.usage()` → `{ bytes, keys, quotaBytes }`.

The file system arrives as `FileStoreFs` (default `nodeFileStoreFs`, `node:fs/promises`), so the
tests run against a temporary folder and a failing fake.

## Electron: the IPC contract (`shared/ipc.ts`, `main/ipc-handlers.ts`, `preload/preload.cts`)

| Channel | Kind | Renderer call | Main side |
|---|---|---|---|
| `shmup:quit` | `send` | `shmupElectron.quit()` | `app.quit()` |
| `shmup:storage-get` | `invoke` | `shmupElectron.storage.get(key)` → `string \| null` | `store.get(key)` |
| `shmup:storage-set` | `invoke` | `shmupElectron.storage.set(key, value)` → `void` | `store.set(key, value)` |

`registerIpcHandlers(ipcMain, { store, quit, devUrl })` checks every message before it reaches the
store:

- **The sender.** `event.senderFrame.url` must be the game's page — `isTrustedRendererUrl`:
  `app://game/…`, or, when the window loads the Vite dev server, a page of `SHMUP_DEV_URL`'s origin
  (http / https only). A refused `invoke` throws `IpcRefusedError` (the renderer's promise rejects);
  a refused `quit` is dropped silently.
- **The arguments.** The key must pass `isStorageKey`, a value must be a string of at most 1 MiB.
- The store's own errors (`StorageQuotaError`, a disk error) reject the renderer's call the same way.

The sandboxed preload cannot `require` local files, so `preload.cts` repeats the channel strings;
`test/preload/preload.test.ts` keeps them equal to `IPC_CHANNELS`, and
`test/main/ipc-contract.test.ts` runs the **compiled** preload against the real handlers and a real
store in a temporary folder. The window itself only ever shows the game: `will-navigate` to an
untrusted URL is prevented and `setWindowOpenHandler` denies every pop-up.

## Electron: the web build inside it (`apps/web/src/platform`)

The desktop app loads the same `apps/web` build (`app://game/index.html`). `getElectronBridge(win)`
returns `window.shmupElectron` when it has the preload's shape (`platform === 'electron'`, `quit`,
`storage.get` / `storage.set`), else `null`. `bootWebApp` passes it as
`WebPlatformOptions.electron`, and with it `createWebPlatform`:

- `id` is `'electron'` (the `PlatformId` already had it);
- `storage` is `createBridgeStorage(bridge)` instead of `localStorage` — no key prefix; a failing
  read resolves from an in-memory copy (the save loads as empty at worst, never a boot failure); a
  failing write **rejects**, so `SaveStore.flush` counts it as not written and tries again at its
  next flush; written values are also kept in memory;
- `exit` calls `bridge.quit()` — so the title offers **EXIT** and Back on the title asks
  **EXIT SHMUP CUP?** (the scene flow shows both whenever `platform.exit` exists);
- `audioUnlock` is `'immediate'` — the window is created with `autoplayPolicy:
  'no-user-gesture-required'`, so the sound starts at boot as on the TV.

`ElectronBridge` repeats `shared/ipc.ts` `ShmupElectronApi` (the web app cannot import the desktop
app); `apps/web/test/platform/platform-electron.test.ts` runs the real compiled preload against it.

**Gamepads and 120 / 144 Hz needed no Electron code**: the web build's Gamepad API adapter, the
shell's fixed 60 Hz step with its accumulator and the render interpolation that switches on above
`INTERPOLATION_MIN_HZ` (M2-08, `createRefreshMonitor` —
[presentation-polish.md](presentation-polish.md)) run in the renderer as they are;
`backgroundThrottling: false` keeps the loop steady when the window is covered.

## Electron: the window (`main/window-state.ts`, `main/window-options.ts`, `main/main.ts`)

`window.json` (`WINDOW_STATE_KEY`, through the same `FileStore`) holds `WindowState { version: 2,
fullscreen, scale, x, y }`:

- **Scale.** The window's **content** is `FRAME_WIDTH × scale` by `FRAME_HEIGHT × scale`
  (`windowContentSize`, `useContentSize: true`) — ×1 … ×`MAX_WINDOW_SCALE`, default
  `DEFAULT_WINDOW_SCALE` — so the game's INTEGER scale mode fills it without borders. Since R1-02
  `FRAME_WIDTH` / `FRAME_HEIGHT` are the main process's mirror of core's `FRAME_W` / `FRAME_H`
  (it cannot import core — owner decision O8), pinned to core by `test/main/window-frame.test.ts`,
  and R2-01's flip moved the mirror from 384 / 216 to 640 / 360 with core; the scales derive from
  them: `floor(1280 / FRAME_WIDTH)` = **2** (1280×720) and `floor(3840 / FRAME_WIDTH)` = **6**
  today (they were 3 — 1152×648 — and 10 at the v1 frame). `fitWindowScale(scale,
  workArea)` lowers a scale that does not fit the screen's work area (at least ×1; a fraction rounds
  down, `NaN` counts as ×1).
- **Versions** (`WINDOW_STATE_VERSION` = 2, decision W4-10). Version 1 (M2-17) stored the scale of
  the 384-px frame; a version-1 file is read through `scale′ = max(1, round(scale × 384 /
  FRAME_WIDTH))`, so ×3 → ×2, ×5 → ×3, ×10 → ×6 and ×1 → ×1 — the window keeps its size as nearly
  as a whole scale allows — while an invalid v1 scale gives the default; fullscreen and the position
  are kept, and the next save writes version 2. Any other version is read as it is. **Pre-flip dev
  builds:** from `346c430` until the flip `72b18a1`, a local desktop dev build already wrote
  version-2 files counted in 384-px frames; a flipped build reads such a file as 640-px frames, so
  the window comes out ×5/3 wider and is then fitted to the screen — only local dev builds are
  affected, released v1 writes version 1, which converts correctly.
- **Fullscreen.** Remembered from `enter-full-screen` / `leave-full-screen`;
  `SHMUP_FULLSCREEN=1` still forces it for one launch.
- **Position.** The top-left corner, used only while `isOnScreen` (at least 64×32 px of the title
  bar inside a screen's work area) — else the window is centred (a monitor that was unplugged).
- `parseWindowState(text)` never throws: missing, corrupt or foreign files give
  `DEFAULT_WINDOW_STATE` field by field (a position needs both coordinates);
  `serializeWindowState` writes every field.

**Shortcuts** (`windowShortcut(input, mac)`, read from `webContents`' `before-input-event` in the
main process, the default prevented so the game never sees them): **F11** or **Alt+Enter** toggle
fullscreen; **Ctrl+=** / **Ctrl++** and **Ctrl+-** step the scale (fitted to the work area of the
screen the window is on; ignored in fullscreen), **Ctrl+0** resets it to `DEFAULT_WINDOW_SCALE` (×2
today) — Cmd instead of Ctrl
on macOS. Only a first key-down counts. None of these keys is a game or menu binding.

**When it is saved.** Fullscreen and scale changes are written at once (best effort). The
position is saved `WINDOW_MOVE_SAVE_MS` (400 ms) after the **last `move`** event and again on
**`close`** — never while fullscreen or minimised, and only when it changed. Electron emits `moved`
on macOS and Windows only, so the Linux builds (AppImage, the Steam Deck) must listen to `move`,
which comes many times per drag (review round 1). Because a write started by `close` could be cut
off by the process exit, `will-quit` waits while window writes are pending (a counter plus a
settled promise) and calls `app.quit()` again once they are done — the write itself is atomic, so
at worst it is lost, never half-written.

`createWindowOptions({ preloadPath, fullscreen, scale?, x?, y? })` builds the
`BrowserWindowConstructorOptions`: the content size, `x` / `y` or `center`, a minimum of one frame
(`FRAME_WIDTH` × `FRAME_HEIGHT`, 640×360 since the flip), hidden
until `ready-to-show`, dark background, auto-hidden menu bar, and `webPreferences`
`contextIsolation`, `sandbox`, no `nodeIntegration`, `backgroundThrottling: false`, no spellcheck,
`autoplayPolicy: 'no-user-gesture-required'`. There is **no in-game Options entry** for the window
(that would be core UI work outside this step); the game's own SCALE option (INTEGER / FIT /
STRETCH) still decides how the picture fills the window.

## Electron: packaging (`apps/electron/electron-builder.json`)

```sh
pnpm --filter @shmup/electron build     # tsc + copy apps/web/dist → dist/renderer
pnpm --filter @shmup/electron package   # pnpm dlx electron-builder@26.15.3 --config electron-builder.json --publish never
```

The config packages `dist/**` (without source maps and `.d.ts`) and `package.json` into an asar:
Windows NSIS (with a chosen folder) + portable, Linux AppImage + tar.gz (category Game — the Steam
Deck), macOS dmg; output `apps/electron/release/` (git-, Prettier- and ESLint-ignored).
**electron-builder is not a dependency** — the step names none — so the script runs a pinned version
through `pnpm dlx`. It cannot read the workspace's `catalog:` specifier, so `electronVersion` is
pinned in the config and `test/main/packaging.test.ts` keeps its major equal to the catalog's. The
icon is `build/icon.png` — M2-18's set, drawn by `pnpm store:assets`, from the v2 art since
R4-05.E5 (the last RR-3 hold-out fell there); nothing is signed; CI never packages (no binary is
downloaded there).

## Tizen: `config.xml` variants (`apps/tizen/scripts/config-xml.mjs`)

`public/config.xml` is the **default variant** — what `pnpm build` ships — with **no Samsung
metadata**, and since M2-17 the `http://developer.samsung.com/privilege/productinfo` privilege
(Samsung's ProductInfo API needs it). Two opt-in metadata entries make the other variants:

| Variant | How to build it | Adds | Why opt-in |
|---|---|---|---|
| **game mode** | `pnpm --filter @shmup/tizen build:game-mode` (`vite build --mode game-mode`, a release build) or `TIZEN_GAME_MODE=1` with any build | `<tizen:metadata key="http://samsung.com/tv/metadata/use.game.mode" value="true"/>` | May switch 2022+ panels to their low-latency Game Mode — unverified for non-streaming apps (`shmup_tech.md` §2.3): the §8.5 A/B latency test decides |
| **gamepad check** | `TIZEN_GAMEPADS=dualshock4::usbgamepad` (models separated by `::` or `,`) | `<tizen:metadata key="http://samsung.com/tv/metadata/gamepad" value="…"/>` | Samsung's launch-time check: the TV shows a **popup when none of the named pads is connected** — a remote-first game must never ship it |

The Vite plugin `configXmlVariant()` (in `apps/tizen/vite.config.ts`) rewrites the copied
`dist/config.xml` in `closeBundle` (`variantFromEnv(process.env, mode)` → `applyConfigVariant`,
which inserts the entries before `</widget>` and refuses XML that already has metadata or a gamepad
model that is not a plain name); the default variant leaves the file as copied. `check-bundle.mjs`
validates **whatever was built** with `validateConfigXml` — a structural check, not a full XML
parser: balanced tags, the W3C widget root with the `tizen` namespace, one `<tizen:application>`
(a 10-alphanumeric package prefixing the id, `required_version`), `<content src>`, `<icon src>`,
`<name>`, exactly one `tv-samsung` profile, `REQUIRED_PRIVILEGES`, and metadata only from
`KNOWN_METADATA_KEYS`, each once, game mode `"true"`. The bundle-check tests now use the real
`config.xml` as their fixture. Combine variants freely: `TIZEN_GAME_MODE=1 pnpm --filter @shmup/tizen
build:dev` is the debug build with game mode.

## Tizen: `device-info` (`apps/tizen/src/device-info`)

Status `implemented`. The pure `collectDeviceInfo(sources)` reads what it is handed —
`navigator.userAgent` (→ `chromeMajor`), `innerWidth` / `innerHeight` / `devicePixelRatio`, the
renderer's WebGL version and its context's `MAX_TEXTURE_SIZE` (`readMaxTextureSize`), and
`webapis.productinfo` (`readProductInfo`: `getRealModel` › `getModel`, `getModelCode` — new field
`DeviceInfo.modelCode` —, `getFirmware`; each getter may be missing or throw `SecurityError`, an
empty answer counts as none). `formatDeviceLine(info)` makes the one-line summary, e.g.
`LS43AM702U 20_KANTSU2 FW T-KSU2EUC-1234.5 1920x1080@1 C69 GL1/4096` (`?` / `-` for unknowns).

`loadWebapis(win, timeoutMs = 3000)` adds `<script src="$WEBAPIS/webapis/webapis.js">` (the Tizen
runtime resolves `$WEBAPIS`) — **only when `window.tizen` exists** (a desktop browser never requests
it: the 404 would be a console error), once per window, and resolves with `window.webapis` or
`null` on load, error or timeout. It never rejects.

**Into the overlay.** `tizenDebugTools(win, buildId, canvas?)` (`main.ts` passes the game canvas)
collects the facts in the tools' `onUnlock` — so release builds and locked dev builds never load
`webapis.js` — first from the window and the renderer, then again once `loadWebapis` settles, and
logs the snapshot as `Shmup Cup device` for the remote Web Inspector. The shell reads the line
every frame through `DebugToolsOptions.device` (the same string until it changes) and hands it to
the render-pixi overlay (below).

## The debug overlay's device line (`@shmup/render-pixi` `debug`, `@shmup/shell` `debug`)

The panel gained a **sixth line** under its five: `setDebugPanelDevice(lists, text)` writes the
values list's third string slot (`''` — the web's case — removes the line and the backdrop shrinks
back); `debugDeviceText(text)` makes it drawable by the pixel font — characters outside printable
ASCII become `?`, the line is cut to `DEBUG_DEVICE_MAX` (56) characters. `DebugOverlay.setDevice`
is what the shell calls in `beforeRender`, **every frame**: it compares the input with the last one
and returns at once when equal. The first version cut the ~66-character TV line with `slice()` on
every frame — a new string per frame, caught in review round 1 (≈ 1.7 MB over 20,000 calls); the
guard in `packages/render-pixi/test/debug/debug-device.test.ts` now allows 16 KiB, and
`packages/shell/test/debug/debug-device-alloc.test.ts` guards the shell's side.

## The GRAPHICS page's boot knobs (R6-04, decision W5-20)

The GRAPHICS page itself is [scenes-and-ui.md](scenes-and-ui.md)'s (`GraphicsScene`); what
belongs to the platform story is where its two **boot knobs** act. OUTPUT and RENDERER are
read once per launch, **before the renderer exists**: the web, Tizen and webOS hosts hand
`localStorage['shmup-cup:save.v1']`'s raw text to `@shmup/shell` `bootDisplayFromSaveText`
(the Electron flavour of the web host first fetches the same key through the preload
bridge), and a corrupt or older document simply lands on `auto` / `auto`. Changing a knob
mid-session stores the choice but does not apply it — nothing between frames can re-make
the canvas or the GL context — so the page's hint row reads `APPLIES AT RESTART`, and what
that restart is depends on the host: on `apps/web`, a page reload; in Electron, quitting and
reopening the app (or reloading the window — the boot read runs through the bridge either
way); on the two TVs, exiting the app (the title's exit confirm) and launching it again
from the portal.

**OUTPUT** is the canvas backbuffer cap. `outputCapHeight` turns an `OUTPUT_CAPS` value
into display rows (`1080` / `720` / `540`; a TV's `auto` resolves to the measured 720p cap
already in `bootDisplayFromSaveText`, the desktop's to no cap), and `capDisplaySize`
shrinks the window to it keeping the aspect — the canvas element keeps filling the screen
through CSS while its backbuffer becomes that size and the display's compositor upscales.
It is the TV render bench's mechanism (`apps/tizen/src/bench/run.ts`), measured there end
to end; the cap never upscales a window no taller than it, and the picture is never cropped.

**RENDERER** follows the floor-and-probe law of `resolveBootGLVersion`: a dev pin (`?gl=`,
the Tizen debug key) wins; an explicit `WEBGL 2` / `WEBGL 1` row pins its version; `auto`
asks for WebGL 2 only where `chromiumMajorFromUserAgent` clears `WEBGL2_MIN_CHROMIUM` (71)
**and** `probeWebGL2` actually got a WebGL 2 context — the safety net for an engine nobody
has measured (webOS 5 has never run on hardware). The floor sits above both TVs' engines
(68 / 69), so a TV on `auto` stays on the shipped, measured WebGL 1 path even though the M7
does expose a WebGL 2 context.

The sweep that motivated the cap is
`tools/input-probe/results/2026-10-19-m7-bench-resolutions/`: the M7's 172-scenario
matrix, four passes per output (1080p, 720p, 540p). The output size is the main lever —
the M7's cost is the full-screen fill, not the 640×360 scene: `640x360-worst` misses a
vsync on 59.5 % of checks at a 1080p backbuffer, 11.3 % at 720p and 1.8 % at 540p, while
at 720p every other 640×360 variant sits at ≤ 0.8 % two-tick and the synced p95 moves
little with the output (within about 3 ms). WebGL 2's measured win at 1080p (21 scenarios
better, 0 worse) is a fill-rate win and fades with the backbuffer (6 / 0 at 720p, 3 / 1 at
540p, both inside the drift band) — the plan §13 step to WebGL 2 matters only while the
game draws a 1080p output, so on the TVs the cap does the real work and WebGL 1 stays the
default.

## Storage quota checks (`@shmup/shell` `storage`)

`createWebStorage(backend, { prefix?, quotaBytes?, valueMaxBytes?, onIssue? })` replaced the two
copies of the `localStorage` adapter in `apps/web` and `apps/tizen` (both now call it:
`createLocalStorage` / `createTvStorage`, logging issues with `console.warn`). It is the core's
`PlatformStorage` plus `usage()` and `issues` (`QuotaStorage`):

| Situation | What happens | Issue |
|---|---|---|
| The write fits the app's own budget | `setItem(prefix + key, value)` | — |
| The value is over `STORAGE_VALUE_MAX_BYTES` (256 KiB) or all app keys with it over `STORAGE_QUOTA_BYTES` (1 MiB) | kept **in memory** for the session; the next write of the key tries storage again | `'over-budget'` |
| The browser throws a quota error (`isQuotaExceededError`: `QuotaExceededError`, Firefox's `NS_ERROR_DOM_QUOTA_REACHED`, codes 22 / 1014) | drops the disposable keys (`DISPOSABLE_STORAGE_KEYS` — `save.corrupt`, never the save) and retries once; still refused → that value in memory, the backend stays in use | `'quota-exceeded'` |
| Any other storage error (private mode, disabled storage) | the whole adapter switches to memory for the rest of the session, as before | `'unavailable'` |

Sizes are counted the way browsers count Web Storage — two bytes per UTF-16 code unit of key and
value (`storageBytes`); the budget is far below the ~5 MB an origin gets, so a growing save is
noticed long before the browser refuses it. Reads prefer a value the session had to keep in memory,
so the game always reads back what it wrote. The adapter never rejects. `usage()` → `{ bytes, keys,
quotaBytes, persistent }` (cold: scans the storage — with `key()` / `length`, else the keys this
session saw). The one behaviour change: before M2-17 **any** error switched to memory for good; now
a full storage only costs that one value.

## Debug save export / import (`@shmup/shell` `storage` / `debug`, `core/save`)

In dev / test builds `window.__shmupDebug.save` (`DebugSaveApi`, or `null` without a save store):

- `export()` → the save the game plays with as readable JSON (`exportSaveText`: the canonical
  `serializeSave` text, pretty-printed) — a tester copies it out of the TV's remote inspector for a
  bug report (`copy(__shmupDebug.save.export())` in DevTools);
- `import(text)` → `Promise<SaveImportResult { ok, status, reason, written }>` (`importSaveText`):
  parsed like a stored save (`parseSave` — migrations and sanitising); `'empty'`, `'corrupt'` and
  `'unreadable'` texts are refused and change nothing; otherwise the new core
  **`SaveStore.replace(data)`** swaps the document (sanitised again) and the store flushes it. The
  hi-score tables are used at once; the options the session already applied (volumes, the input
  profile) are not re-applied — **reload** to use them;
- `usage()` → the storage's `StorageUsage` when the platform storage can tell (`createWebStorage`
  can; Electron's bridge storage cannot → `null`).

`bootShell` hands the tools the save store (`DebugToolsHost.save`). Release builds have none of it.

## Tizen: live reload (`apps/tizen/src/live-reload`, `scripts/tizen-watch.mjs`)

Status `implemented`, dev builds only. `pnpm --filter @shmup/tizen tizen:watch` (never in CI):

1. picks this desktop's LAN IPv4 (`lanAddress`; `SHMUP_LIVE_RELOAD_HOST` overrides it) and a port
   (`SHMUP_LIVE_RELOAD_PORT`, default `DEFAULT_PORT` 5175), and sets
   `SHMUP_LIVE_RELOAD_URL=ws://<host>:<port>`;
2. runs `vite build --watch` in **development** mode — `liveReloadDefine()` bakes that URL into the
   new define `__SHMUP_LIVE_RELOAD__` (`''` in every non-dev build);
3. serves `dist/` over HTTP (`createLiveReloadServer`: `resolveStaticFile` refuses traversal,
   `cache-control: no-store`) with a hand-written RFC 6455 WebSocket on the same port
   (`websocketAccept`, `encodeTextFrame`, `readFrameOpcode` — no dependency);
4. after every rebuild sends `{"type":"reload","url":"http://<host>:<port>/index.html"}` to every
   client (`reloadMessage`).

In the app, `main.ts` calls `connectLiveReload({ url: __SHMUP_LIVE_RELOAD__ }, window)` only when
`__SHMUP_DEV__` and the URL is non-empty, so the release bundle folds the branch away. The
connection parses messages (`parseLiveReloadMessage`: JSON `reload` / `hello`, or the bare text
`reload`), and on a reload either reloads in place (a page the server already serves) or — the
installed widget, loaded from `file://` — navigates to the served `index.html`
(`reloadTarget`, `location.replace`). A closed connection is retried after
`LIVE_RELOAD_RETRY_MS` (1 s), doubling up to `LIVE_RELOAD_MAX_RETRY_MS` (10 s); a message resets the
delay; nothing is shown to the player. The workflow: package and install the watch's **first**
build once; from then on every saved change reloads the TV without repackaging. **Whether the Tizen
runtime keeps the widget's APIs (`tizen`, key registration) on the served http page is unverified**
— part of the manual §8.5 check. The placeholder's `'hot-data'` mode was dropped.

## Memory budget (`@shmup/shell` `memory`)

The TV caps dev-installed apps at 120 MB; the budget is **< 100 MB** (`MEMORY_BUDGET_BYTES`).

**The budgets (R1-05, decisions W3-4 / W3-5).** Out of the 100 MiB, three shares are fixed and the
atlas gets the rest:

| Share | Value | Where it comes from |
|---|---|---|
| JS heap baseline (`HEAP_BASELINE_BYTES`) | 24 MiB | an assumption the §8.5 on-device check confirms or corrects |
| Audio (`AUDIO_BUDGET_BYTES`) | **24 MiB** (32 MiB until R1-05) | the worst zone today needs ≈ 17.8 MiB (SFX bank + zone I's music set) |
| Fixed render targets (`fixedTargetBytes(frame, DEFAULT_DISPLAY, FILTER_TARGETS)`) | 26,263,552 B (25.05 MiB) at 384×216; 29,999,104 B (28.61 MiB) at 640×360 | the frame target, two pooled filter passes and the canvas's three 1080p buffers (table below) |
| **Atlas** (`TEXTURE_BUDGET_BYTES` = `textureBudgetFor({ FRAME_W, FRAME_H })`) | **26 MiB** at 384×216, **23 MiB at 640×360** (32 MiB flat until R1-05) | 100 − 24 − 24 − the targets, floored to whole MiB — derived from core's frame, so R2-01's flip lowers it with no edit; `memory-hand.test.ts` pins both values |

The atlas share holds the GPU copies **and** the decoded images — and the two cannot both be kept
at the art-bible density. `test/integration/standin-budget.test.ts` (R3-04.M2a, decision W5-14)
measured the stand-in against `TEXTURE_BUDGET_BYTES`: a zone's `common` (1024×1024) plus one
2048×1024 stand-in page charges 12,582,912 B of textures + images under `imagePolicy: 'none'` —
inside the 23 MiB share — while the same row under `'resident'` charges 25,165,824 B, **1 MiB over
it**. That split is why the stand-in is gated at `'none'` and why the lazy residency (below,
decision W5-15) drops the decoded images: at the bible's density, keeping them does not fit.

**The download budget.** `DIST_BUDGET` (the packaged widget, `apps/tizen/scripts/check-bundle.mjs`)
is **16 MiB since R3-04.M2b** (owner decision W5-16; it was 8 MiB, decision W3-4, kept through the
flip until the projection could say more). The script's docblock carries the full derivation, built
from the stand-in set re-measured byte-identical at `7baeb4d`: the stand-in atlas **3,401,438 B**
(`common` 91,921 + the nine zone-group pages 3,309,517 together — the residency rows of M2a's table
Σ 4,228,727, less the nine repeated `common` copies 827,289 because a download ships each page
once), `app.js` raw **1,450,743 B** (385.8 KB gzip of the 512 KB `APP_JS_GZIP_BUDGET`), the atlas
manifest + `index.html` + `config.xml` + icon **211,360 B** (`main.json` alone is 204,896), and the
recorded audio as one natural play-through **6,002,830 B** (the 24 music tracks as intro + one loop
— 818.7 s — at 5,838,044 B, the 26 SFX one-shots at 164,786 B; `oggenc -q5` at 22,050 Hz mono, the
rate `real-assets.md` prescribes). Sum **11,066,371 B ≈ 10.55 MiB**, a margin of **5,710,845 B
(≈ 5.45 MiB)**. The audio term and the code term count the same music **twice, on purpose**:
`app.js` carries the inlined chip-song JSONs until R5 replaces them with recordings, so until then
the budget carries both costs (W5-16). Three ceilings sit around the projection; R6-02 adjudicated
them with evidence and nothing moved — P3 closed the five budgets on the owner's M7 logs (met or
open as stated), all four P4 lanes came back NOT NEEDED, **no cap was raised** (§9 of
[render-performance-review.md](render-performance-review.md), the tables in
[input-probe-results.md §12](input-probe-results.md#12-resolution-benchmark-r0-03)); a budget
moves to a new measurement, never to quiet a check. The ceilings stand as weighed: art at
the RR-7 band's top (the atlas byte caps below stand 2,298,562 B above the measured stand-in), code
at its gzip ceiling (≈ 1.93 MB raw at today's compression), longer v2 tracks (the audio term is
≈ 7.1 KB a natural second, ≈ 57 kbit/s mono). The corrected sum exceeds the old 8 MiB by
2,677,763 B — what W5-16 weighed against keeping it ("R4 / R5 trip it zone by zone"). The real caps
are far above — the Tizen dev-install cap is 120 MB, the TV memory budget 100 MB — so `DIST_BUDGET`
is a download regression guard, not a platform limit; `dist-bench/` shares it (rule 8). A change
updates the pins in `check-bundle.test.ts`, `check-bundle-budgets.test.ts`,
`test/integration/tv-engine-floor.test.ts`, `apps/webos/test/scripts/check-bundle.test.ts`, both
apps' READMEs and the budget tables of `docs/dev`.

**The atlas byte caps** (`test/scripts/assets/atlas-budget.ts`, the same decision W5-16) hold an
atlas *build* to the projection: `ATLAS_COMMON_PNG_CAP` 300,000 B for the `common` group (the RR-7
band's top — 0.6 MB per 2048×1024 page — scaled to `common`'s 1024×1024; the stand-in measures
91,921 B, the band's floor for this size 150,000 B), `ATLAS_ZONE_PNG_CAP` 600,000 B for one zone's
**own** pages summed (the band's top; the worst stand-in zone sits at 446,323 B — the cap is the
band, not a number the art already hides under), and `ATLAS_PNG_BYTES_CAP` = common + 9 × zone =
5,700,000 B for the whole set (stand-in 3,401,438 B; the interim placeholder art 143,775 B today).
Two gates read them: `test/integration/cjk-budget.test.ts` (the shipped zone-split atlas) and
`test/scripts/assets/interim-pipeline.test.ts` (the interim ×1.5 atlas), and the first pins
`ATLAS_PNG_BYTES_CAP < DIST_BUDGET`.

**The estimator.** `estimateMemory(inputs)` adds up what stays resident: the atlas pages on the GPU
(`w × h × 4`, `pageBytes`) plus the decoded images (the texture's resource, kept to re-upload it —
an `ImageBitmap` since plan v20x P0-1 on engines with `createImageBitmap`, an `HTMLImageElement`
on the fallback, the charge's `w × h × 4` shape unchanged and now GPU-side; a detached page's
bitmap is closed by `Atlas.unloadPage` at once, so only attached images are ever charged; the
estimate charges the images of the `imagePages` it is
given, default the GPU pages themselves — the `resident` set, the estimator's default since MF10
`66e54bcb` — and the shipped runtime reports its real policy from the residency, see below; the
conservative `all`, every page's image, is the explicit charge of the eager `atlasPages: 'eager'`
option), the SFX bank (`sfxBankBytes` — synthesized cues at the synth rate, mono float), the music set
(`trackBytes`: chip songs from their rows — `songFrameBound`, `renderSong`'s length without
rendering —, recorded tracks up to their loop end, else `FILE_TRACK_FALLBACK_SECONDS` of stereo),
the render targets and a
**24 MiB heap baseline** (`HEAP_BASELINE_BYTES` — an assumption, not a measurement: the §8.5
on-device check compares it with DevTools' heap). `withinBudget` also needs the atlas (GPU pages +
images) within `textureBudgetFor` of the estimate's own frame — so a 640×360 estimate is judged
against 23 MiB — and the audio within `AUDIO_BUDGET_BYTES`.
`estimateStageMemory({ content, manifest, sfx, music, stageIndex, imagePolicy? })` estimates one
stage: its pages (`stagePages`), the images its `imagePolicy` charges — `resident` (only the stage's
own pages — the default since MF10 `66e54bcb`, what the shipped lazy residency keeps and reports to
the estimator) or, explicitly, `all` (every page's image — the charge of the eager
`atlasPages: 'eager'` option, what the whole-atlas and hand-comparison rows pass) or `none` (no
image) — and its music set (`stageMusicTracks`: the title theme plus every cue the
stage can ask for). Every campaign zone passes: R6-02.P1's real-zone probe over the final shipped
content at 640×360 (grouped, art-scale-3/2 manifest) measures per-stage totals of 75.1–84.2 MiB
against the 100 MiB budget — PASS ×9 — with the atlas charge at 9.44–10.49 MiB on the estimator's
`'none'` policy and 18.87–20.97 MiB on `'resident'` (what the shipped lazy residency reports)
against the frame's 23 MiB texture budget — every zone inside both. The totals carry the 24 MiB
audio reservation, the 24 MiB heap baseline and the fixed 1080p render targets; the rise over the
old 384×216-era figures is that targets term, not the art — the texture charge fell from the
interim. Since R2-01's interim ×1.5 art the `common` page is 1024² where the R1-05 rows had
1024×512, so its GPU and image terms grew — the hand calculation below recomputes every sum from
the manifest on each run, so the gate stays honest though the quoted figures drift.

**The hand calculation (R1-05).** `memory-hand.test.ts` recomputes every campaign zone from
`manifest.pages` and the constants alone — the GPU copies of `stagePages`, the images of every page,
`sfxBankBytes` + the zone's music, `FRAME_W·FRAME_H·4 + potBytes(frame)·2 + 1920·1080·4·3`, 24 MiB —
at the current frame, at 384×216 and at 640×360, and asserts the estimate equals it and stays within
budget.

**The render-target term, corrected by M3-02d** (the render review's **F3** — it used to model
`frame × (1 + FILTER_TARGETS)` flat and miss the CRT's target entirely). The rows walk M3-02d's
384×216 default; at today's 640×360 the same formulas hold, and `memory-hand.test.ts` pins the sum
at both frames:

| Term | Bytes at the defaults | Why |
|---|---|---|
| The 384×216 frame | `384 × 216 × 4` = 331,776 | Created directly by `RenderTexture.create`, so it is **exactly** its own size |
| `filterTargets` (default `FILTER_TARGETS` = 2) filter passes | `potBytes(384, 216) × 2` = 1,048,576 | Pooled by Pixi's `TexturePool`: each axis is the next power of two — since pixi.js **8.21** capped by the smallest registered screen (the renderer's own backbuffer) the request fits inside, so a 384×216 pass is a 512×256 texture at the 1080p default and no bigger than the screen itself on a smaller one. `FILTER_TARGETS` is the **nesting depth** (one texture per size class, handed back when a filter pops), not the number of filtered layers |
| The canvas | `1920 × 1080 × 4 × 3` = 24,883,200 | Front, back and depth / stencil |
| The CRT | **0** | Since M3-02d it is the pass-2 blit's own shader and pools nothing, at any setting |

The one exception is `crtAsFilter: true` — the renderer's `screenPass: 'filter'` escape hatch —
which adds `potBytes(display)` (16.8 MiB at 1080p). **That term is deliberately conservative and
should stay that way:** it ignores `crtResolution`'s `CRT_MAX_HEIGHT` cap (so a 4K display is
charged four times the target the capped pass would really pool) and it charges the whole display
even when an aspect mode pillarboxes the picture into part of it. The estimator exists to defend a
budget, so over-charging a path nothing ships on is the safe direction; `memory-edge.test.ts` pins
both behaviours on purpose so that nobody "fixes" them into an exact model. Since pixi.js **8.21**
the pool caps each pooled axis at the smallest registered screen (a renderer's own backbuffer) the
request fits inside — so `potBytes`' bare power of two is an **upper bound** on what a pass really
pools, never an under-booking, and the estimator needs no screen term; the render benches model the
cap exactly (`test/bench/render-harness/bench-gates.ts` `pooledAxisSize`, pinned digit-for-digit against
measured records since the 8.22 upgrade).

**Atlas residency between zones.** At boot (load time, once):

1. `stageSpriteSets(content)` walks each campaign zone's stage spec and everything it names — enemy
   references (`enemyId`, `bossId`, `innerId`, `doubleId`, `partnerId`, `minionId`, `childId`),
   `tilesetId`, linked `stageId`s (a bonus stage) — collecting every `sprite…Id`; a sprite no zone
   names (ships, shots, bullets, items, particles, the UI, the dev ranges' enemies) is **global**,
   and so — since R1-05 — is every engine, UI-kit and scene-view sprite (`ENGINE_SPRITES`,
   `UI_SPRITES`, `SCENE_VIEW_SPRITES`) even when a zone names one, because the renderer draws them
   everywhere and the packer keeps them in `common`;
2. `atlasPageNeeds(manifest, spriteNames, sets)` maps that onto the pages: a page is global when it
   holds a global sprite (a content sprite covers its `name@…` siblings — hit flash, player 2,
   palettes), a font glyph or a frame of no sprite;
3. `createAtlasResidency(atlas.pages, needs, { upload, onChange, now })` (eager) starts with every
   page resident; a `prepare(stageIndex)` unloads every page the stage does not need (Pixi
   `TextureSource.unload`) and then — R1-05, W3-2 — **uploads every needed page that has no GPU
   copy** through the renderer's `uploadTextureSource`, so nothing uploads on its first draw
   mid-play. It runs at boot for the boot stage (before the warm-up frame), on each `PrepareStage`
   (`connectAtlasResidency`: the zone map's launch, a run or practice start, the title's return) and
   — W3-9 — whenever the frame shows a **new World** (`prepareShownWorld`: the attract demo, which
   never emits `PrepareStage`, a replay). A stage outside the campaign needs every page.
   `createLazyAtlasResidency(pages, needs, { …, lazy: { atlas, loadImage } })` keeps the same page
   bookkeeping and the same call sites, but its `prepare` **loads**: it fetches and decodes the
   images of the pages the stage needs, attaches and uploads them, and detaches the pages it does
   not need **with their decoded images** (policy "resident"). Its prepare is asynchronous; the
   shell exposes the eager contract over it with `asAtlasResidency` so the debug tools and the event
   wiring see one shape.

**Since R1-05 the atlas is really split** — `main.png` (`common`, 1024×512 at the split and 1024²
since R2-01's interim art) and one 256-wide page per zone (256×128 / 256×256 then, up to 256×512
with the interim art), from the content-derived `assets/source/atlas-groups.json`
([asset-pipeline.md](asset-pipeline.md#atlas-groups-r1-05)) — so a zone keeps `common` + its own
page on the GPU (≈ 2.1–2.25 MiB at the v1 scale instead of the old 4 MiB page; ≈ 4.25–4.5 MiB with
the interim ×1.5 pages). Under eager the decoded images of
all ten pages also stay in memory (3.5 MiB); the lazy default (below) keeps only the shown stage's
own images and drops the rest. Three rules keep the residency honest:

- **It owns the pages' GPU lifetime.** `createAtlas` turns each page's `autoGarbageCollect` off
  (Pixi's `ImageSource` forces it on, and its texture GC dropped a page no frame bound for 60 s —
  a zone's second page would have been dropped a minute in and re-uploaded mid-play when the boss
  appeared). Only `unload()` and `Atlas.destroy()` free a page.
- **The unload is self-healing.** A prepare unloads every page the stage does not need **whether or
  not it believes it resident**: the weapon select's live preview flies the dev `weapon-range`,
  whose `terrain-a` tiles sit on zone A's page, and Pixi uploads that page on the preview's first
  draw — the game start's prepare frees it again. Unloading a page with no GPU copy costs nothing;
  the return value, `unloads` and `onChange` count only the believed-resident pages. The preview is
  deliberately not placed by the World-change trigger: a stage outside the campaign would put every
  page on the GPU for a menu.
- **It is measured** (W3-6). The canvas carries `data-shmup-atlas-pages` (resident pages),
  `data-shmup-atlas-load-ms` (the boot's manifest + pages + uploads, then each stage change's
  unload + upload — in lazy mode a prepare loads as it prepares, so the change's figure covers its
  fetches and decodes too) and `data-shmup-atlas-page-ms` (per page — fetch / decode / upload at
  boot, the
  uploads of a stage change), and `Shell.atlasTiming` holds the boot's figures; dev / test builds
  expose `window.__shmupDebug.atlas` ([debug tools](../client/debug-tools.md)). The owner reads
  them on the M7 (plan R1-05, Manual; the lazy timings and the context-loss path ride the same
  marks — the on-device confirmation R3-04 asks for).

**The lazy residency (R3-04.M3a–M3e — the shipped default).** The paragraph above held until the
art came: with the stand-in measurement showing images of every page cannot fit the atlas share
(W5-14, above), W5-15 made laziness the plan and R3-04 built it:

- **M3a — deferred pages** in `createAtlas`: a page may start unloaded (`null` in the image list)
  and be brought in later by `Atlas.loadPage` / freed again by `Atlas.unloadPage`. Until a page is
  loaded, every frame of it draws nothing — its texture points at Pixi's empty source with a 0×0
  frame, so no sampling of a missing image ever happens; page sources and frame textures keep their
  object identity across load/unload, only their contents move.
- **M3b — `createLazyAtlasResidency`** (above): pages start detached; a stage change fetches,
  decodes, attaches and uploads what the stage needs and drops the rest **with their decoded
  images** — the bytes leave memory, policy "resident"; since plan v20x P0-1 the image is an
  `ImageBitmap` and leaving means `Atlas.unloadPage` **closing** it, so its GPU-side backing goes
  with the page instead of waiting for the GC (the leak class W5-15's numbers assumed away).
- **M3c/M3e — the boot switch**: `ShellOptions.atlasPages` (`'eager' | 'lazy'`) defaults to
  `'lazy'` since M3e. No page is fetched at boot; boot awaits its own prepare, so the first frame
  draws the boot stage. While the shown World's pages are in flight the frame loop **holds the
  game**: the last displayed frame is redrawn, no tick runs and no input is consumed — a slow page
  load cannot move a replay (decision W5-16). A malformed page URL rejects at once
  (`AtlasPageUrlError`, review M3RV F1) and a failed load is tagged with its page URL, so the boot
  error screen prints the same `${url}: ${describe(error)}` line the eager page load prints.
- **Preview parity (M3e)**: the weapon select's preview World stays outside the residency — boot
  attaches only the **images** of unloaded pages; the preview's page uploads on its first draw
  exactly as under eager, and the next real prepare unloads it again (the self-healing rule above).
- **M3d — context loss**: because a dropped image's bytes are gone, recovery re-fetches. On
  `webglcontextlost` the shell calls `preventDefault` (Pixi's own listener agrees — the two calls
  are one intention); on `webglcontextrestored`, after Pixi has cleared its texture bookkeeping,
  `recoverAtlasPages` walks the resident pages: re-fetch (the boot's page-image factory —
  `loadImageTimed`'s bitmap successor since plan v20x P0-1), swap the image (`Atlas.loadPage`,
  which **closes the replaced bitmap**), `unload()` the dead GPU copy, `uploadTextureSource`. A failed re-fetch keeps
  the old image standing in (it still decodes from its bytes; the next prepare retries), and a
  failed upload leaves Pixi's own lazy re-creation to heal the page on its next drawn frame.

Linked and dev stages (the bonus stages, `escape`, boss rush, the ranges) still need every page.
`Shell.atlasResidency` exposes the residency — in lazy mode as the eager-contract view built by
`asAtlasResidency`, counters and `resident` forwarding live. Music was already one set resident
(M1-15 / M2-10); the SFX bank is pre-rendered once.

## The LG webOS host (`apps/webos`, M3-03)

A fourth host, next to `web`, `tizen` and `electron`: the same game, the same `@shmup/shell` boot,
a different manifest and a different Back key (`shmup_tech.md` §3.3 — "LG webOS: same model,
`.ipk`, new adapter ≈ 1 day").

> **Nothing in `apps/webos` has run on a device.** No LG TV, no developer account, no SDK: every
> line is verified against fakes, `ares-package` / `ares-install` / `ares-launch` have never been
> executed, and the on-device checks are plan §8.7. Read
> [`docs/client/webos.md`](../client/webos.md) before touching a real set.

| | `@shmup/tizen` | `@shmup/webos` |
|---|---|---|
| Manifest | `public/config.xml` | `public/appinfo.json` (validated by `scripts/appinfo.mjs`) |
| Package | `.wgt`, `tizen package` | `.ipk`, `ares-package` |
| `Platform.id` | `tizen` | `webos` (already in the core's `PlatformId` union since M1) |
| Back | **10009** | **461** |
| Play/Pause | 10252 | 415, 19 |
| Key registration | `tizen.tvinputdevice.registerKeyBatch` | none — webOS delivers every remote key |
| Exit | `application.getCurrentApplication().exit()` | `webOS.platformBack()`, else `window.close()` |
| Profile | `tizen-remote-safe` | `webos-remote-safe` |
| Device line | `webapis.productinfo` | none (nothing verifiable from here) |

Three things are worth knowing beyond the table:

- **The engine floor is shared — and it is 68, not 69.** webOS 5 runs Chromium **68**
  (LG's published [web engine table](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine),
  re-checked 2026-09-16), one release *older* than Tizen 5.5's 69, so the webOS build uses the same
  `chrome69` + `es2018` target, the same `.browserslistrc` and the **same polyfill pair** —
  `global-this.js` and, since the PixiJS 8.22 boot cure, `string-match-all.js` — read straight out
  of `apps/tizen/polyfills/`, so the two cannot drift. webOS 4 (Chromium 53) is
  not a target. The subtlety worth carrying away: the target list lowers **syntax** and its
  `es2018` entry is what makes the output safe on 68 (Chrome 69 added no syntax, only
  `Array.prototype.flat` / `flatMap`), while **runtime APIs** are nobody's job but yours — and
  because the lint's browserslist floor is `chrome >= 69`, `[].flat()` *passes the lint* and would
  throw on an LG set. `test/integration/tv-engine-floor.test.ts` scans the shipped sources for that
  gap and pins the shared target, polyfill pair and budgets;
  [conventions.md § Two TVs, two engines](conventions.md#two-tvs-two-engines) says exactly what it
  covers and what it does not.
- **The budgets are shared too.** `apps/webos/scripts/check-bundle.mjs` imports
  `APP_JS_GZIP_BUDGET`, `ATLAS_PAGE_MAX_SIZE` and `DIST_BUDGET` from the Tizen check, so there is
  one source of truth; it adds its own file-set and `appinfo.json` rules.
- **A profile now names its hosts.** Both TVs read the same `content/input/`, and their Back keys
  disagree — so an `input-profiles` entry carries `hosts` (M3-03): `["tizen"]`, `["webos"]`, or
  empty for "any host", which is what the keyboard and gamepad profiles use.
  `selectableKeyProfiles(profiles, keySpace, host)` applies it. Without it a Tizen player could
  pick the webOS profile in CONTROLS and lose Back entirely — a lock-out no rebinding guard
  catches, because the profile itself binds every required action.

## Electron: Steamworks (`main/steam.ts`, M3-03)

> **Nothing here has touched Steam.** No partner account, no app id, and `steamworks-ffi-node` is
> deliberately **not** a dependency — `initSteam()` without a loader reports `available: false`,
> which is what every build this repo produces does. See
> [`docs/client/steam.md`](../client/steam.md) for the owner's side.

The design decision worth recording: **achievements are derived from the save document**, not from
new game events. The main process already owns the save file, so `createAchievementStore` wraps the
`FileStore` and, after each write of `save.v1`, parses it and unlocks whatever
`achievementsFor(save)` returns. That keeps `@shmup/core`, the scene flow and the IPC surface
completely unchanged, and it makes the whole rule set a pure function of a `SaveData` — eleven
rules, each two lines, each with a test. An assisted run (`HiScoreEntry.assisted`: god mode, the
speed or invincibility assist, a secret code) never earns one, the same rule the hi-score tables
use for their asterisk.

Steam Cloud is the second wrapper, `createCloudStore`: a write goes **to disk first** and is then
mirrored to the cloud; a read that finds nothing locally restores the cloud copy and writes it
back. Local disk stays the source of truth, so a Steam outage or a full quota cannot lose a save —
it is reported through `onIssue` and the game carries on. The two wrappers compose in that order
(`createAchievementStore(createCloudStore(createFileStore(dir), steam.cloud), steam)`), so the save
reaches disk and the cloud before anything is derived from it, and both are the identity when Steam
is absent.

## Running it

```sh
# Desktop
pnpm build && pnpm --filter @shmup/electron start           # needs the Electron binary
SHMUP_FULLSCREEN=1 pnpm --filter @shmup/electron start
pnpm --filter @shmup/electron package                       # after build; output apps/electron/release/

# TV (the packaging commands need the Tizen CLI and a certificate — never run by agents or CI)
pnpm --filter @shmup/tizen build:game-mode                   # the use.game.mode variant (release)
TIZEN_GAME_MODE=1 pnpm --filter @shmup/tizen build:dev       # debug build + game mode
TIZEN_GAMEPADS=dualshock4::usbgamepad pnpm --filter @shmup/tizen build   # gamepad check (testing only)
pnpm --filter @shmup/tizen tizen:watch                       # live reload; package + install its first build once

# Debug builds, in the browser's or the TV's DevTools console
copy(__shmupDebug.save.export())                             # the save → clipboard
await __shmupDebug.save.import(text); location.reload()
__shmupDebug.save.usage()                                    # { bytes, keys, quotaBytes, persistent }
```

## Extending it

- **A new Electron storage key** (e.g. a replay file): any `isStorageKey` name works through the
  existing channels — keep values under 1 MiB and remember the 8 MiB folder quota counts backups.
  Raise `FILE_STORE_QUOTA_BYTES` rather than bypassing the store.
- **A new IPC channel**: add it to `IPC_CHANNELS`, repeat the string in `preload.cts` (the preload
  test compares them), expose it on `ShmupElectronApi` *and* `apps/web` `ElectronBridge`, register
  it in `registerIpcHandlers` behind `checkSender`, and extend `ipc-contract.test.ts`.
- **A new `config.xml` metadata key**: add it to `KNOWN_METADATA_KEYS` (and a check of its value in
  `validateConfigXml`), a variant field in `ConfigVariant` / `variantFromEnv` / `applyConfigVariant`,
  and a variant test. Keep anything that changes launch behaviour opt-in.
- **Another device fact**: add a `DeviceInfoSources` input and a `DeviceInfo` field, read it in
  `collectDeviceInfo` (tolerating absence), and decide whether it belongs in the 56-character line or
  only in the logged snapshot.
- **More atlas pages**: nothing to do — `atlasPageNeeds` follows the manifest, and since R1-05 the
  packer keeps each zone's sprites on pages of their own (`atlas-groups.json`, re-derived from the
  content — [asset-pipeline.md](asset-pipeline.md#atlas-groups-r1-05)); check a zone with
  `estimateStageMemory` (and `imagePolicy: 'resident'` for the shipped lazy residency's figure).
- **A new sprite reference field** in content specs: name it `sprite…Id` (picked up by the walk), or
  add an enemy-reference key to `ENEMY_REF_KEYS`, or the sprite counts as global.

## Tests

- Electron (`apps/electron/test/`): `main/saves.test.ts` / `saves-edge.test.ts` (a temp folder:
  atomic write, backup recovery for missing and corrupt files, a failed rename, per-key ordering,
  keys, both quotas), `main/ipc-contract.test.ts` (the compiled preload ↔ the real handlers ↔ a real
  store), `main/ipc-handlers-edge.test.ts` (gone or untrusted senders, the dev origin, UTF-8 byte
  limits, forwarded store errors, re-registering), `main/window-state.test.ts` / `-edge.test.ts` (parsing, fitting — `NaN` —, on-screen, shortcuts),
  `main/window-options.test.ts`, `main/packaging.test.ts`, `main/main.test.ts` (a real user-data
  folder, restoring the window, shortcuts, navigation, the move-settle save and `will-quit` waiting),
  `preload/*.test.ts`.
- Tizen (`apps/tizen/test/`): `device-info/*.test.ts`, `live-reload/*.test.ts` (fakes),
  `config-xml/config-xml-variants*.test.ts` (variants, validation, a real `build --mode game-mode`
  through the bundle check), `scripts/tizen-watch*.test.ts` (a real server and WebSocket client),
  `boot/debug-tools-device.test.ts` (the device line after the unlock).
- Shell (`packages/shell/test/`): `storage/*.test.ts` (budget, quota retry, unavailable, usage),
  `memory/*.test.ts` (every campaign zone under budget, song bounds, the residency on a three-page
  atlas and on the shipped zone-split one; R1-05: `memory-hand.test.ts` — the hand calculation at
  both frames and both budgets pinned —, `residency-eager.test.ts` — unload before upload,
  idempotence, the self-healing unload, the World-change trigger; R3-04: `residency-lazy.test.ts` —
  nothing attached at creation, prepare loads / uploads / detaches the rest with their images,
  parallel page loads, a failed load or upload retried by the next prepare, a superseded prepare
  handing the GPU pass to the newer one —, `residency-lazy-alloc.test.ts`),
  `boot/boot-residency.test.ts`
  (the boot stage's pages before `warmUp`, the canvas attributes; R3-04.M3e lazy cases: the boot
  awaits and uploads only its stage's pages, a stage change fetches its own and detaches the others
  with their images, the showcase keeps every page; the tagged `AtlasPageUrlError` on the boot
  error screen is in `boot/boot.test.ts`), `boot/residency-hold.test.ts` (M3c: a replay across a
  zone change hashes the same with and without the hold, a frame advance asked for mid-load runs
  exactly one tick once the pages are in), `debug/debug-atlas.test.ts`
  (`__shmupDebug.atlas`), `debug/debug-save.test.ts`, `debug/debug-device-alloc.test.ts`; the real
  browser path is `test/e2e/atlas-residency.spec.ts` (WebGL's own view of the pages) and
  `test/e2e/atlas-context-loss.spec.ts` (R3-04.M3d: through `WEBGL_lose_context` the web build
  draws again after a restore, still ticks, still takes input, and the residency's marks agree
  with the GPU).
- webOS (`apps/webos/test/`, M3-03 — every one against fakes): `platform/platform.test.ts` (Back on
  **461** and not on 10009, auto-repeat, the two-reason lifecycle, exit through `platformBack` with
  the `close` fallback, the capabilities), `boot/boot-wiring.test.ts` (the real `@shmup/shell` on a
  fake window: `webos-remote-safe` applied, CONTROLS offering **only** the webOS remote, Back → the
  exit confirmation → `platformBack`, audio unlocked without a gesture, suspend / resume, rAF →
  ticks → render, a clean stop), `scripts/appinfo.test.ts`, `scripts/check-bundle.test.ts` (fixture
  folders; the budgets really are the Tizen ones), `scripts/webos-cli.test.ts` (the command lines
  the `ares-*` wrappers would build — they are never run), `build/vite-config.test.ts`,
  `build/webos-build.test.ts` (a **real** Vite build into a temp folder, then the bundle check, the
  file set, a valid `appinfo.json`, byte-identical atlas pages, ES2018 with the polyfill pair
  first, a classic script tag, and no debug code — the closest anything here gets to packaging).
- Steam (`apps/electron/test/main/steam.test.ts`, M3-03 — every one against a fake binding): the
  app id and its placeholder, an inert service with no loader / a `null` loader / a throwing
  loader, idempotent unlocks, unknown ids, a binding that throws, shutdown, the eleven achievement
  rules (including "an assisted run never counts"), Steam Cloud round-trips and restores, a refused
  write, and achievements unlocked from a real save write through a real `FileStore`.
- render-pixi `debug/debug-device.test.ts` (the slot, the cut, the allocation guard); core
  `save/save-replace.test.ts`; web `platform/platform-electron.test.ts`.
- Browser: `test/e2e/platform-polish.spec.ts` — the web build's save export / import and the quota
  adapter (the imported save is what the next launch loads), and the Tizen build via `file://`:
  `webapis.js` never requested outside a TV, the `Shmup Cup device` snapshot after the unlock, no
  console errors.

## Gotchas

| Symptom | Cause / fix |
|---|---|
| The window position is not remembered on Linux / the Steam Deck | Listen to `move`, not `moved` — Electron emits `moved` on macOS and Windows only (review round 1) |
| The position saved on close is lost | The app quit before the write finished: `will-quit` must wait for `windowWrites` (it does); a new write path must go through `remember` so it is counted |
| `pnpm --filter @shmup/electron package` fails on the Electron version | electron-builder cannot read `catalog:`; bump `electronVersion` in `electron-builder.json` with the catalog (the packaging test compares the majors) |
| A storage `invoke` rejects with `IpcRefusedError` in development | The window loads a URL whose origin is not `SHMUP_DEV_URL`'s (or navigated away) — the sender check refuses it |
| Saves from the browser build are not in the desktop app | Expected: Electron stores files (`<userData>/saves/`), the browser `localStorage`; nothing migrates between them |
| A desktop user's settings and high scores are gone after updating to M2-17 | Expected once: before M2-17 the desktop renderer used `localStorage` (the `app://game` origin); `createBridgeStorage` reads only the files — there is no migration from the old `localStorage` save |
| A TV shows a popup about a missing gamepad at launch | The build carries the gamepad metadata (`TIZEN_GAMEPADS` was set) — rebuild without it; never ship it |
| `check-bundle` fails with `config.xml: …` | The built variant does not validate — a hand edit of `public/config.xml`, metadata added twice, or an unknown metadata key |
| The device line shows `? FW ?` on the TV | `webapis.js` did not load within 3 s or the `productinfo` privilege is missing from the installed `config.xml`; the rest of the line is still right |
| A console 404 for `$WEBAPIS/webapis/webapis.js` in a browser | Something called `loadWebapis` with a fake `window.tizen`; the real code never requests it outside a TV |
| The device line allocates | Call `DebugOverlay.setDevice` (it compares its input) — not `setDebugPanelDevice` every frame, which runs `debugDeviceText` each call |
| An imported save's volumes do not change | By design — reload after `__shmupDebug.save.import`; the tables apply at once |
| A browser setting "sticks" only until the page closes | The storage was full (`'quota-exceeded'`) or the value over the app's budget (`'over-budget'`): that one value lives in memory — see the `console.warn` and `__shmupDebug.save.usage()` |
| `atlasResidency.unloads` stays 0 | Before R1-05 that was expected (one page every zone needed). Now it moves at the first zone change; it stays 0 only in a dev scene (showcase, calibration, the fx gallery keep every page) or on stages outside the campaign, which need every page |
| `data-shmup-atlas-pages` lists every page in a campaign zone | `atlas-groups.json` is stale — a content change moved a sprite between zones: re-derive it (`SHMUP_ATLAS_GROUPS_UPDATE=1 pnpm exec vitest run --project integration test/integration/atlas-groups.test.ts`, then `pnpm assets`) |
| The live-reloaded TV lost its remote keys / `tizen` API | The widget navigated to an http page; whether Tizen keeps the widget's APIs there is the open §8.5 question — note it in the plan and reinstall the widget |
| `tizen:watch` builds but the TV never reloads | The TV cannot reach the desktop on the port (firewall, another subnet), or `lanAddress` picked the wrong interface — set `SHMUP_LIVE_RELOAD_HOST` |

## Next steps that build on this page

- **M2-18** (done) — the icon set (electron-builder's icons, the Tizen icon), store-listing
  placeholders, Tizen certification self-checks (Back / exit, visibility, resume), the 30-minute soak
  with the heap stable, and version `1.0.0-rc.1` — released as 1.0.0 on 2026-10-16; `master` carries
  the released `2.0.0` since R6-03.D1 ([release-hardening.md](release-hardening.md#the-version)).
- **§8.5 on device** — the `use.game.mode` A/B latency test (keep the better variant), the heap
  baseline against DevTools (correct `HEAP_BASELINE_BYTES` if it is off), the device line and the
  save export, and whether live reload keeps the widget's APIs.
- **M3-01** (done) — the replay library stores up to four replays beside the save under their own
  keys (`replay.last`, `replay.1`–`3`), sized to this adapter's limits: ≤ 120,000 characters a
  replay (240,042 bytes with its key, under the 256 KiB a value) and ≤ 130,000 for the kept ones
  together, so the library (≤ 500,150 bytes) never crowds `save.v1` and its corrupt copy out of the
  1 MiB budget; an oversize slot left by an older build is cleared on load
  ([extra-modes-and-replays.md](extra-modes-and-replays.md#the-replay-library-createreplaylibrary-replaylibrary)).
- **M3-03** (done) — the **LG webOS host** and **Steamworks**, both below. The webOS adapter does
  reuse `createWebStorage` as planned; the Steam layer wraps the same `FileStore` this page
  describes. Neither has run on real hardware or against a real Steam client.
