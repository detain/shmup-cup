# @shmup/electron

Minimal **Electron** desktop shell (Windows / macOS / Linux / Steam Deck —
`shmup_tech.md` §4.8). It loads the `apps/web` build; there is no separate renderer code.
Developer guide: [`docs/dev/platform-polish.md`](../../docs/dev/platform-polish.md) (M2-17); for
players: [`docs/client/desktop-app.md`](../../docs/client/desktop-app.md).

- `src/main/main.ts` (ESM main process): registers a privileged `app://` scheme and serves
  `dist/renderer/` (the copied web build) through it — safer and more reliable than
  `file://`; opens one window (restored from `window.json`, shortcuts, no navigation away, no
  pop-ups — M2-17); registers the IPC handlers (quit, the file saves).
- `src/main/window-options.ts`: context isolation + sandbox + no Node integration,
  **`backgroundThrottling: false`** (steady fixed-step cadence), content 384×216 × the remembered
  scale (default ×3 = 1152×648, `useContentSize`), the remembered position, optional fullscreen,
  `autoplayPolicy: 'no-user-gesture-required'` (M2-17 — sound from boot).
- `src/main/app-protocol.ts`: URL → file mapping with path-traversal protection.
- `src/preload/preload.cts`: sandboxed CommonJS preload exposing `window.shmupElectron`
  (`platform`, `quit()`, `storage.get` / `storage.set`); channel names shared with
  `src/shared/ipc.ts`.
- `src/main/saves.ts` (M2-17): the file saves — one JSON file per key in
  `<userData>/saves/` (`save.v1.json`, `window.json`), atomic write (temp file + fsync + rename),
  the previous text kept as `<key>.json.bak` and read when the file is missing or corrupt, a 1 MiB
  per-value and 8 MiB folder quota.
- `src/main/ipc-handlers.ts` (M2-17): the main side of the IPC contract — quit and the storage
  channels, refused for any page but the game's (`app://game/`, or `SHMUP_DEV_URL`'s origin) and for
  invalid keys / values.
- `src/main/window-state.ts` (M2-17): the remembered window — fullscreen, the scale of the 384×216
  frame (×1 … ×10, lowered to fit the screen), the position (saved once a `move` settles and on
  `close` — Linux emits no `moved`; the app quits after that write) — and the shortcuts **F11** /
  **Alt+Enter** (fullscreen), **Ctrl+=** / **Ctrl+-** / **Ctrl+0** (scale; Cmd on macOS).
- The web build it loads detects the bridge (`apps/web` `getElectronBridge`): platform
  `'electron'`, file saves, EXIT on the title quits, audio unlocked at boot. Gamepads, the 60 Hz
  fixed step with its accumulator and render interpolation on 120 / 144 Hz monitors come from the
  web build's shell (M2-08).
- `src/main/steam.ts` (**M3-03**, implemented but **never run against a real Steam client**): the
  optional Steamworks layer — `initSteam` (a `load` callback supplies the binding;
  `steamworks-ffi-node` is deliberately **not** a dependency, so every build this repo produces
  reports `available: false` and both wrappers below are the identity), the **11
  `STEAM_ACHIEVEMENTS`** and `achievementsFor(save)` — achievements are **derived from the save
  document** after each write, so no game code knows about Steam and an assisted run never earns
  one —, `createAchievementStore` / `createCloudStore` (disk first, then the cloud; a read that
  finds nothing locally restores the cloud copy) and `steamAppId` (falls back to Valve's *Spacewar*
  test id **480** — a placeholder, not an allocation). There is no partner account and no app id:
  the owner's side is [`docs/client/steam.md`](../../docs/client/steam.md), the design is
  [`docs/dev/platform-polish.md`](../../docs/dev/platform-polish.md).

```sh
pnpm --filter @shmup/electron build   # tsc → dist/main/*.js, dist/preload/preload.cjs + copy apps/web/dist → dist/renderer
pnpm --filter @shmup/electron start   # needs the Electron binary (normal `pnpm install` downloads it)
SHMUP_DEV_URL=http://localhost:5173 pnpm --filter @shmup/electron start   # against `pnpm dev`
```

Environment: `SHMUP_DEV_URL`, `SHMUP_RENDERER_DIR`, `SHMUP_FULLSCREEN=1`.

**CI** only type-checks, tests and compiles this app, with
`ELECTRON_SKIP_BINARY_DOWNLOAD=1` (no binary download).

**Packaging (M2-17, never in CI):** `pnpm --filter @shmup/electron build` then
`pnpm --filter @shmup/electron package` runs a pinned `electron-builder` through `pnpm dlx` with
`electron-builder.json` (Windows NSIS + portable, Linux AppImage + tar.gz for the Steam Deck, macOS
dmg; `--publish never`) into `release/` (git-ignored). Since M2-18 every target takes
`build/icon.png` (512 × 512, electron-builder's `buildResources`), drawn by `pnpm store:assets` (repo
root) from the placeholder art — commit it again after changing the logo or the ships. **Nothing here
has been packaged for Steam**: the SteamPipe upload, the app id and the achievements are the
account-only work of plan §8.8 ([`docs/client/steam.md`](../../docs/client/steam.md)), and the
Steam Deck has never run the build.
