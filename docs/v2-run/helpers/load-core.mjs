/**
 * Shared loader of the v2 run helpers (`docs/v2-run/helpers/README.md`): loads `@shmup/core`'s
 * barrel from the sources of any checkout through a Vite SSR server, so a helper can read the
 * values a commit's core exports without building anything.
 *
 * - **The tools** (Vite) come from the checkout that holds this file — its `node_modules`.
 * - **The sources** come from `root`: this checkout by default, or any other tree that holds
 *   `packages/core/src/` and `tsconfig.base.json`. Core imports nothing outside its own `src/`,
 *   so a bare `git archive` of an old commit is enough — no `pnpm install` there:
 *
 *   ```bash
 *   V1=$(mktemp -d) && git archive d4de048 packages/core tsconfig.base.json | tar -x -C "$V1"
 *   ```
 *
 * Used by `w5pre/exports.mjs` and `w5/defaults.mjs`; delete it with the last of them.
 *
 * @module
 */
/* global URL */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The checkout that holds the helpers (three folders up from `docs/v2-run/helpers/`). */
export const CHECKOUT = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * Picks the source tree a helper reads: its first command-line argument, else this checkout.
 *
 * @param {string | undefined} arg - The argument (a path, absolute or relative to the cwd).
 * @returns {string} The absolute root.
 * @throws {Error} When the root holds no `packages/core/src/index.ts`.
 */
export function sourceRoot(arg) {
  const root = resolve(arg ?? CHECKOUT);
  if (!existsSync(join(root, 'packages/core/src/index.ts'))) {
    throw new Error(`${root}: no packages/core/src/index.ts — pass a checkout or a git archive`);
  }
  return root;
}

/**
 * Loads `packages/core/src/index.ts` of `root` and hands it to `use`, then closes the server.
 *
 * @template T
 * @param {string} root - The source tree (see {@link sourceRoot}).
 * @param {(core: Record<string, unknown>) => T | Promise<T>} use - Reads the barrel.
 * @returns {Promise<T>} What `use` returned, once the server is closed.
 */
export async function withCore(root, use) {
  const req = createRequire(join(CHECKOUT, 'package.json'));
  const vite = await import(pathToFileURL(req.resolve('vite')).href);
  const server = await vite.createServer({
    configFile: false,
    root,
    // Keep Vite's cache out of the source tree (a git archive has no node_modules/).
    cacheDir: join(CHECKOUT, 'node_modules/.vite-v2-run-helpers'),
    logLevel: 'error',
    appType: 'custom',
    resolve: { conditions: ['@shmup/source', ...vite.defaultClientConditions] },
    ssr: { resolve: { conditions: ['@shmup/source', ...vite.defaultServerConditions] } },
    server: { middlewareMode: true, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    return await use(await server.ssrLoadModule('/packages/core/src/index.ts'));
  } finally {
    await server.close();
  }
}
