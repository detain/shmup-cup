# @shmup/electron

Minimal **Electron** desktop shell (Windows / macOS / Linux / Steam Deck —
`shmup_tech.md` §4.8). It loads the `apps/web` build; there is no separate renderer code.

- `src/main/main.ts` (ESM main process): registers a privileged `app://` scheme and serves
  `dist/renderer/` (the copied web build) through it — safer and more reliable than
  `file://`; opens one window; handles the renderer's quit request.
- `src/main/window-options.ts`: context isolation + sandbox + no Node integration,
  **`backgroundThrottling: false`** (steady fixed-step cadence), 1152×648 (= 384×216 ×3),
  optional fullscreen.
- `src/main/app-protocol.ts`: URL → file mapping with path-traversal protection.
- `src/preload/preload.cts`: sandboxed CommonJS preload exposing `window.shmupElectron`
  (`platform`, `quit()`); channel names shared with `src/shared/ipc.ts`.
- Placeholders: `src/main/saves.ts` (file-based storage), `src/main/steam.ts` (Steamworks).

```sh
pnpm --filter @shmup/electron build   # tsc → dist/main/*.js, dist/preload/preload.cjs + copy apps/web/dist → dist/renderer
pnpm --filter @shmup/electron start   # needs the Electron binary (normal `pnpm install` downloads it)
SHMUP_DEV_URL=http://localhost:5173 pnpm --filter @shmup/electron start   # against `pnpm dev`
```

Environment: `SHMUP_DEV_URL`, `SHMUP_RENDERER_DIR`, `SHMUP_FULLSCREEN=1`.

**CI** only type-checks, tests and compiles this app, with
`ELECTRON_SKIP_BINARY_DOWNLOAD=1` (no binary download). Packaging (electron-builder /
Steam depots) is a later step.
