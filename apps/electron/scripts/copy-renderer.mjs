#!/usr/bin/env node
/**
 * Copies the web build (apps/web/dist) into apps/electron/dist/renderer so the compiled
 * main process can serve it through `app://game/`. Run by `pnpm build` after `tsc`;
 * Turborepo builds @shmup/web first (it is a workspace dependency).
 */
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** apps/electron (this script lives in apps/electron/scripts). */
const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
/** The browser build produced by `pnpm --filter @shmup/web build`. */
const source = join(appDir, '..', 'web', 'dist');
/** Where the compiled main process expects the renderer (`dist/main/../renderer`). */
const target = join(appDir, 'dist', 'renderer');

if (!existsSync(join(source, 'index.html'))) {
  console.error(`Web build not found at ${source} — run \`pnpm --filter @shmup/web build\` first.`);
  process.exit(1);
}
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log(`Copied web build → ${target}`);
