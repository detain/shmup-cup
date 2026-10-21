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
 * Since R5-P.P3 the re-bless can be filtered to its own zones:
 * `node scripts/golden-update.mjs --only zone-b[,zone-c,…]` passes the comma list through as
 * `SHMUP_GOLDEN_ONLY`, and only the goldens and demos of those stage ids re-record — the run still
 * **verifies** every other golden and demo, which is a LAND's proof that only its zone moved.
 * Without `--only` every file re-records, as before. `pnpm golden:update -- --only zone-b` works
 * too: pnpm 12 passes the leading `--` through to the script, and `parseOnly` skips it.
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

/**
 * The stage ids of a `--only <id,…>` filter, `[]` when the argument is absent (re-record all).
 * A leading `--` — what `pnpm golden:update -- --only zone-b` passes through — is skipped.
 *
 * @param {string[]} argv - The script's command arguments (`process.argv.slice(2)`).
 * @returns {string[]} The stage ids, trimmed, empty strings dropped.
 * @throws {Error} When `--only` carries no list.
 */
export function parseOnly(argv) {
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  const at = args.indexOf('--only');
  if (at === -1) return [];
  const value = args[at + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error('--only needs a comma-separated list of stage ids');
  }
  return value
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '');
}

/**
 * The run itself: Vitest over the whole `test/golden` folder in update mode, with
 * `SHMUP_GOLDEN_ONLY` set to the `--only` list (empty = re-record every scenario).
 */
function main() {
  const only = parseOnly(process.argv.slice(2));
  const result = spawnSync(
    process.execPath,
    [vitest, 'run', '--project', 'integration', 'test/golden'],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        SHMUP_GOLDEN_UPDATE: '1',
        SHMUP_GOLDEN_ONLY: only.join(','),
      },
    },
  );
  process.exit(result.status ?? 1);
}

// Only as an entry point: `golden-edge.test.ts` imports `parseOnly`, and an import must not
// start the re-bless (the script runs `test/golden` again, in update mode, recursively).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
