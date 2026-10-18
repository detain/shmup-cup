/**
 * Lists the **behaviour tunables' defaults** of `@shmup/core` with their units, as
 * `<behaviour>.<param>=<value> [<unit>]`: a header line (the behaviour count and how many
 * tunables each unit has), then every tunable of `DEFAULT_BEHAVIOR_DEFS` +
 * `DEFAULT_BOSS_BEHAVIOR_DEFS` whose unit is a length or a speed (the units R2-02 scales — ticks,
 * angles, counts, ratios, scores, indices, seeds and switches are left out), then a `--- weapons`
 * block with every `WEAPON_BEHAVIOR_PARAMS` tunable (all units). A unit `??` means
 * `BEHAVIOR_PARAM_UNITS` has no row for it.
 *
 * **Run** (from the repository root; the tree argument is optional and defaults to this checkout):
 *
 * ```bash
 * V1=$(mktemp -d) && git archive 2c865b6 packages/core tsconfig.base.json | tar -x -C "$V1"
 * node docs/v2-run/helpers/w5/defaults.mjs "$V1"      # the v1 values (any commit ≤ d4de048)
 * ```
 *
 * `defaults-all.txt` next to this file is its output at **`2c865b6`** (pre-flip, so v1 values;
 * re-run there it is the same byte for byte), weapons block included. At `bc8e05d` only the
 * frame-anchored rows differ (the `laserLength`s 384 → 640, `captain.circler` and `boss.steed`'s
 * `cx` / `cy`): they derive from the frame, which R2-01 flipped.
 *
 * **Used by** R2-02 prep subtask **A1** (`packages/core/test/behaviors/fixtures/
 * v1-behavior-defaults.json`, generated at a pre-flip commit and extended to
 * `WEAPON_BEHAVIOR_PARAMS`, and `behavior-defaults-port.test.ts`) and by the W lanes that turn
 * the world-unit defaults into `v1 * WORLD_SCALE` (reviewers diff against `defaults-all.txt`).
 *
 * **Delete** when A1's `v1-behavior-defaults.json` is on master (at the latest with R2-02's port
 * commit S). Was scratchpad `w5/defaults.mjs` (it hard-coded the root; now an argument).
 *
 * @module
 */
/* global process, console */
import { sourceRoot, withCore } from '../load-core.mjs';

/** Units that never scale: their tunables are counted in the header but not listed. */
const UNSCALED = ['ticks', 'angle', 'count', 'ratio', 'score', 'index', 'seed', 'switch'];

await withCore(sourceRoot(process.argv[2]), (core) => {
  const units = /** @type {Record<string, Record<string, string>>} */ (core.BEHAVIOR_PARAM_UNITS);
  const defs = /** @type {{ id: string, params: Record<string, unknown> }[]} */ ([
    .../** @type {unknown[]} */ (core.DEFAULT_BEHAVIOR_DEFS),
    .../** @type {unknown[]} */ (core.DEFAULT_BOSS_BEHAVIOR_DEFS),
  ]);
  const rows = [];
  /** @type {Record<string, number>} */
  const counts = {};
  for (const def of defs) {
    for (const [k, v] of Object.entries(def.params)) {
      const u = units[def.id]?.[k] ?? '??';
      counts[u] = (counts[u] ?? 0) + 1;
      if (!UNSCALED.includes(u)) rows.push(`${def.id}.${k}=${String(v)} [${u}]`);
    }
  }
  console.log('behaviours', defs.length, 'counts', JSON.stringify(counts));
  console.log(rows.join('\n'));
  const wp = /** @type {Record<string, Record<string, unknown>> | undefined} */ (
    core.WEAPON_BEHAVIOR_PARAMS
  );
  if (wp) {
    console.log('--- weapons');
    for (const [id, p] of Object.entries(wp)) {
      for (const [k, v] of Object.entries(p)) {
        console.log(`${id}.${k}=${String(v)} [${units[id]?.[k] ?? '??'}]`);
      }
    }
  } else {
    console.log('no WEAPON_BEHAVIOR_PARAMS export');
  }
});
