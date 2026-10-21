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
 * @module
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root (this file lives in `scripts/`). */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

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
