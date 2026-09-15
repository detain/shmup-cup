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
- Placeholder: `src/main/steam.ts` (Steamworks).

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
dmg; `--publish never`) into `release/` (git-ignored). Steam depots come with M3.
