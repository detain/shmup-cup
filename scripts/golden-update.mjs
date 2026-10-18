#!/usr/bin/env node
/**
 * `pnpm golden:update` — re-blesses the golden replays (plan M1-19): runs
 * `test/golden/golden.test.ts` with `SHMUP_GOLDEN_UPDATE=1`, which re-records every scenario of
 * `test/golden/golden.ts` from the 4-way playtest bot, rewrites its `test/golden/<name>.replay.json`
 * and then checks the new files like `pnpm test` does — and, since M2-15, `demos.test.ts`, which
 * re-records the attract loop's demos (`content/demos/<id>.replay.json`, `test/golden/demos.ts`)
 * the same way. Run it only when a simulation change is intended, and say why in the commit
 * message.
 *
 * Cross-platform: sets the variable itself (no `VAR=1 cmd` shell syntax, which cmd.exe lacks) and
 * starts Vitest with the running Node. Exits with Vitest's exit code.
 *
 * v2's R2-01 (owner decision W4-1): refuses to run while R2-02's content port is pending — a
 * shipped tileset not at the build's `TILE_SIZE` (`scripts/frame.mjs`) — because re-blessing then
 * would record v1-scale content at v2's frame. R2-03 re-blesses once R2-02 has ported it.
 *
 * @module
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE_SIZE } from './frame.mjs';

/** Repository root (this file lives in `scripts/`). */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The shipped tilesets whose `tileSize` is not the build's (R2-01 → R2-02: the content is still
 * v1's 8-px while the build's tiles are 12).
 *
 * @returns {string[]} Their file names (empty once the content is ported).
 */
function pendingTilesets() {
  const dir = join(repoRoot, 'content', 'tilesets');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.tileset.json'))
    .filter((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')).tileSize !== TILE_SIZE);
}

const pending = pendingTilesets();
if (pending.length > 0) {
  console.error(
    `golden:update refused: ${pending.length} shipped tileset(s) are not at TILE_SIZE ${TILE_SIZE} ` +
      `(${pending.join(', ')}) — R2-02 ports the content first, then R2-03 re-blesses.`,
  );
  process.exit(1);
}

/** Vitest's command-line entry (`vitest.mjs` next to its `package.json`). */
const vitest = join(
  dirname(createRequire(import.meta.url).resolve('vitest/package.json')),
  'vitest.mjs',
);

const result = spawnSync(
  process.execPath,
  [vitest, 'run', '--project', 'integration', 'test/golden'],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, SHMUP_GOLDEN_UPDATE: '1' },
  },
);
process.exit(result.status ?? 1);
