# Platform polish: Electron, Tizen extras, storage and memory

How plan step **M2-17** made the desktop build first-class and added the TV's extras. The
**Electron** app gained **file saves** through IPC (JSON in the user-data folder, atomic write +
backup, a quota), a **remembered window** (fullscreen, the scale of the 384×216 frame, the
position, keyboard shortcuts), a locked-down window and a **packaging config**; the web build it
loads now knows it runs inside Electron (platform `'electron'`, EXIT quits, sound from the start).
The **Tizen** app gained opt-in **`config.xml` variants** (Samsung's game-mode and gamepad
metadata), **`device-info`** (the TV's model and firmware in the debug overlay), a dev-only **live
reload** to the TV (`tizen:watch`) and the `productinfo` privilege. Both browser hosts share one
**`localStorage` adapter with quota checks** and a **debug save export / import**, and the shell
got a **memory budget**: an estimator that keeps every campaign zone under 100 MB and the atlas-page
residency that unloads pages between zones.

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

`window.json` (`WINDOW_STATE_KEY`, through the same `FileStore`) holds `WindowState { version: 1,
fullscreen, scale, x, y }`:

- **Scale.** The window's **content** is `384 × scale` by `216 × scale` (`windowContentSize`,
  `useContentSize: true`) — ×1 … ×`MAX_WINDOW_SCALE` (10), default `DEFAULT_WINDOW_SCALE` (3,
  1152×648) — so the game's INTEGER scale mode fills it without borders. `fitWindowScale(scale,
  workArea)` lowers a scale that does not fit the screen's work area (at least ×1; a fraction rounds
  down, `NaN` counts as ×1).
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
screen the window is on; ignored in fullscreen), **Ctrl+0** resets it to ×3 — Cmd instead of Ctrl
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
`BrowserWindowConstructorOptions`: the content size, `x` / `y` or `center`, minimum 384×216, hidden
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
pinned in the config and `test/main/packaging.test.ts` keeps its major equal to the catalog's. No
icons yet (M2-18's icon set); nothing is signed; CI never packages (no binary is downloaded there).

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

**The estimator.** `estimateMemory(inputs)` adds up what stays resident: the atlas pages (`w × h ×
4`, `pageBytes`) plus their decoded images (Pixi keeps the `HTMLImageElement` for a context loss),
the SFX bank (`sfxBankBytes` — synthesized cues at the synth rate, mono float), the music set
(`trackBytes`: chip songs from their rows — `songFrameBound`, `renderSong`'s length without
rendering —, recorded tracks up to their loop end, else `FILE_TRACK_FALLBACK_SECONDS` of stereo),
the render targets and a
**24 MiB heap baseline** (`HEAP_BASELINE_BYTES` — an assumption, not a measurement: the §8.5
on-device check compares it with DevTools' heap). `withinBudget` also needs the atlas within
`TEXTURE_BUDGET_BYTES` (32 MiB) and the audio within `AUDIO_BUDGET_BYTES` (32 MiB).
`estimateStageMemory({ content, manifest, sfx, music, stageIndex })` estimates one stage: its pages
(`stagePages`) and its music set (`stageMusicTracks`: the title theme plus every cue the stage can
ask for). Today every campaign zone passes: A–G ≈ 67.0 MiB, H ≈ 74.0, I ≈ 74.7 (4 MiB atlas + 4 MiB
image, 0.8 MiB SFX, 9–17 MiB music, 25.05 MiB targets, 24 MiB heap).

**The render-target term, corrected by M3-02d** (the render review's **F3** — it used to model
`frame × (1 + FILTER_TARGETS)` flat and miss the CRT's target entirely):

| Term | Bytes at the defaults | Why |
|---|---|---|
| The 384×216 frame | `384 × 216 × 4` = 331,776 | Created directly by `RenderTexture.create`, so it is **exactly** its own size |
| `filterTargets` (default `FILTER_TARGETS` = 2) filter passes | `potBytes(384, 216) × 2` = 1,048,576 | Pooled by Pixi's `TexturePool`, which rounds each axis up to a power of two: a 384×216 pass is really a 512×256 texture. `FILTER_TARGETS` is the **nesting depth** (one texture per size class, handed back when a filter pops), not the number of filtered layers |
| The canvas | `1920 × 1080 × 4 × 3` = 24,883,200 | Front, back and depth / stencil |
| The CRT | **0** | Since M3-02d it is the pass-2 blit's own shader and pools nothing, at any setting |

The one exception is `crtAsFilter: true` — the renderer's `screenPass: 'filter'` escape hatch —
which adds `potBytes(display)` (16.8 MiB at 1080p). **That term is deliberately conservative and
should stay that way:** it ignores `crtResolution`'s `CRT_MAX_HEIGHT` cap (so a 4K display is
charged four times the target the capped pass would really pool) and it charges the whole display
even when an aspect mode pillarboxes the picture into part of it. The estimator exists to defend a
budget, so over-charging a path nothing ships on is the safe direction; `memory-edge.test.ts` pins
both behaviours on purpose so that nobody "fixes" them into an exact model.

**Atlas unloading between zones.** At boot (load time, once):

1. `stageSpriteSets(content)` walks each campaign zone's stage spec and everything it names — enemy
   references (`enemyId`, `bossId`, `innerId`, `doubleId`, `partnerId`, `minionId`, `childId`),
   `tilesetId`, linked `stageId`s (a bonus stage) — collecting every `sprite…Id`; a sprite no zone
   names (ships, shots, bullets, items, particles, the UI, the dev ranges' enemies) is **global**;
2. `atlasPageNeeds(manifest, spriteNames, sets)` maps that onto the pages: a page is global when it
   holds a global sprite (a content sprite covers its `name@…` siblings — hit flash, player 2,
   palettes), a font glyph or a frame of no sprite;
3. `createAtlasResidency(atlas.pages, needs)` starts with every page resident;
   `connectAtlasResidency(events, residency)` calls `prepare(event.id)` on each `PrepareStage` (the
   zone map's launch, a run or practice start, the title's return): pages the next stage does not
   need are `unload()`ed (Pixi `TextureSource.unload` — the page re-uploads on its next draw, during
   the loading / fly-in). A stage outside the campaign needs every page.

`Shell.atlasResidency` exposes it. **Today's atlas is one 1024² page every zone needs, so nothing is
unloaded yet**; the mechanism is tested on a synthetic three-page atlas and starts to matter when
real art adds pages (≤ 2048² each). Music was already one set resident (M1-15 / M2-10); the SFX
bank is pre-rendered once.

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
- **More atlas pages**: nothing to do — `atlasPageNeeds` follows the manifest. Keep zone-specific
  sprites on pages of their own (the packer's order decides) so a zone's pages can leave; check a
  zone with `estimateStageMemory`.
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
  atlas), `debug/debug-save.test.ts`, `debug/debug-device-alloc.test.ts`.
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
| `atlasResidency.unloads` stays 0 | Expected with today's single atlas page every zone needs |
| The live-reloaded TV lost its remote keys / `tizen` API | The widget navigated to an http page; whether Tizen keeps the widget's APIs there is the open §8.5 question — note it in the plan and reinstall the widget |
| `tizen:watch` builds but the TV never reloads | The TV cannot reach the desktop on the port (firewall, another subnet), or `lanAddress` picked the wrong interface — set `SHMUP_LIVE_RELOAD_HOST` |

## Next steps that build on this page

- **M2-18** — the icon set (electron-builder's icons, the Tizen icon), store-listing placeholders,
  Tizen certification self-checks (Back / exit, visibility, resume), the 30-minute soak with the heap
  stable, and version `1.0.0-rc.1`.
- **§8.5 on device** — the `use.game.mode` A/B latency test (keep the better variant), the heap
  baseline against DevTools (correct `HEAP_BASELINE_BYTES` if it is off), the device line and the
  save export, and whether live reload keeps the widget's APIs.
- **M3-01** (done) — the replay library stores up to four replays beside the save under their own
  keys (`replay.last`, `replay.1`–`3`), sized to this adapter's limits: ≤ 120,000 characters a
  replay (240,042 bytes with its key, under the 256 KiB a value) and ≤ 130,000 for the kept ones
  together, so the library (≤ 500,150 bytes) never crowds `save.v1` and its corrupt copy out of the
  1 MiB budget; an oversize slot left by an older build is cleared on load
  ([extra-modes-and-replays.md](extra-modes-and-replays.md#the-replay-library-createreplaylibrary-replaylibrary)).
- **M3-03** — Steamworks (`main/steam.ts`: achievements, Steam Cloud sync of the same save files) and
  the Steam Deck verification; the webOS adapter reuses `createWebStorage`.
