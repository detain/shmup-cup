/**
 * Root Vitest config: every workspace package/app plus the repo-level
 * integration suite in `test/` is a Vitest project, and one Vitest process runs them all
 * with one shared worker pool.
 *
 * - `pnpm test` / `pnpm test:all` → `vitest run`: every project in this process.
 * - `pnpm test:integration`       → only the `integration` project.
 * - `pnpm --filter <pkg> test`    → that package's own `vitest.config.ts` alone.
 *
 * Concurrency: one pool of {@link MAX_WORKERS} forked workers shared by every project (Vitest's
 * own `VITEST_MAX_WORKERS=<n>` overrides it — lower it to share a busy machine), fed longest file
 * first across the projects by {@link LongestFirstSequencer}. `pnpm test` used to be Turborepo
 * running every package's `vitest run` at once: nine processes, each with a worker per core —
 * about nine busy workers per core, which starved V8's background compiler threads and made the
 * allocation guards flaky. One pool keeps the machine at about one worker per core and needs
 * ~40 % less CPU for the same wall time. The allocation guards share the pool: with it they
 * passed 21 full runs in a row, while a separate low-parallelism group for them (tried too)
 * added 8–12 s a run and was no steadier.
 *
 * `tools/*` is intentionally not listed: tools are standalone npm projects.
 *
 * @module
 */
import { availableParallelism } from 'node:os';
import { relative } from 'node:path';
import { defineConfig } from 'vitest/config';
import { BaseSequencer, type TestSpecification } from 'vitest/node';

/**
 * Workers of the shared pool: every core but one (Vitest's own default for `vitest run`),
 * stated here so the choice is visible. Measured on 48 cores (M2-14 suite, 531 files): 47
 * workers ran the whole suite in 53–56 s, 32 and 24 workers in 60 s — the machine's throughput
 * and the longest files bound the run. On a 4-vCPU CI runner this is 3.
 */
const MAX_WORKERS = Math.max(1, availableParallelism() - 1);

/**
 * Orders the test files longest first across all projects, from the durations Vitest cached
 * on the last run (`node_modules/.vite/vitest/…/results.json`).
 *
 * @remarks
 * Vitest's {@link BaseSequencer} sorts by project first (alphabetically) and only then by
 * duration, so the repo-level `integration` project — which holds the longest files, the
 * whole-campaign playtests at 25 s each — started only after `audio-web`, `core`, `electron`
 * and `input-web` had been handed out, and ended the run alone. Longest first over the whole
 * suite starts them at once. Files that failed last time still come first; files without a
 * cached duration (new, or a fresh checkout such as CI) come before the known ones, the larger
 * file first — Vitest's own rules for them. `sequence.groupOrder` still wins over everything.
 * Sharding (`--shard`) is Vitest's own.
 */
class LongestFirstSequencer extends BaseSequencer {
  /**
   * Sorts the files to run.
   *
   * @param files - The test files of every project.
   * @returns The files in the order the pool should start them.
   */
  override sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const { cache, config } = this.ctx;
    const key = (spec: TestSpecification): string =>
      `${spec.project.name}:${relative(config.root, spec.moduleId)}`;
    const sorted = [...files].sort((a, b) => {
      const order = a.project.config.sequence.groupOrder - b.project.config.sequence.groupOrder;
      if (order !== 0) return order;
      const aResult = cache.getFileTestResults(key(a));
      const bResult = cache.getFileTestResults(key(b));
      if (aResult === undefined || bResult === undefined) {
        if (aResult !== bResult) return aResult === undefined ? -1 : 1;
        return (cache.getFileStats(key(b))?.size ?? 0) - (cache.getFileStats(key(a))?.size ?? 0);
      }
      if (aResult.failed !== bResult.failed) return aResult.failed ? -1 : 1;
      return bResult.duration - aResult.duration;
    });
    return Promise.resolve(sorted);
  }
}

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*', 'test'],
    maxWorkers: MAX_WORKERS,
    sequence: { sequencer: LongestFirstSequencer },
  },
});
