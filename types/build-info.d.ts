/**
 * Build-info globals the `shmupBuildInfo()` Vite plugin defines (see `vite.shared.ts`, plan
 * M1-19). Apps include this file from their `tsconfig.json`; only the apps' entry points
 * (`src/main.ts`) read them, so unit tests never need them defined.
 *
 * @module
 */

/**
 * `true` in a dev / test build — the dev server, `vite build --mode development` (`build:dev`) or
 * `--mode test` (`build:test`, what `pnpm test:e2e` builds): the debug tools are created. `false`
 * in a release build (`pnpm build`), where the tools are left out of the bundle.
 */
declare const __SHMUP_DEV__: boolean;

/** The build id: the short git SHA of the build (`+` when the work tree had changes). */
declare const __SHMUP_BUILD__: string;

/**
 * The live-reload WebSocket URL of a `tizen:watch` dev build (`ws://<desktop>:<port>`, M2-17 —
 * `apps/tizen/scripts/tizen-watch.mjs` sets `SHMUP_LIVE_RELOAD_URL`); `''` in every other build.
 * Defined by `apps/tizen/vite.config.ts` only — the Tizen entry point reads it.
 */
declare const __SHMUP_LIVE_RELOAD__: string;
