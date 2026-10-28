/**
 * The TV render bench's **per-game-code completion ledger** (plan v20x BENCSKIP — owner
 * 2026-10-28: the suite grows 16 rows at a time on top of a frozen 174, the M7 already gave
 * those rows their timings, and a bench-only rebuild must not throw them away — while the
 * Pixi-bump scar `b42d34f2` and the partition law `898021ee` forbid pooling timings across
 * *game code*). The ledger records which scenario indexes the current game code has measured,
 * keyed by the build-time `__SHMUP_GAME_CODE_HASH__` (the digest of everything that can move a
 * drawn pixel — `scripts/game-code-hash.mjs`), so:
 *
 * - a fresh install of a **rebuilt bench over unchanged game code** (any `buildId`) offers
 *   `ENTER = the new rows only` against `GREEN = the full suite again`;
 * - a rebuild over **changed game code** finds no matching ledger and runs the full suite
 *   exactly as before the ledger existed;
 * - the ledger is *only* the widget's own offer logic — the truth the analyzer pools by rides in
 *   every payload's `env.gameCodeHash` (additive field), keeping the same pool key on both sides.
 *
 * **Row identity is the scenario index** (0…{@link BENCH_RUN_LENGTH} − 1, the specials 190 / 191 /
 * 192 included): the analyzer's rows are keyed by scenario id at the same output, and the id list
 * is frozen for a game-code hash — the matrix lives in `./matrix.ts`, outside the hash, so the
 * indexes a ledger holds are the indexes the same game code's rows carry.
 *
 * **Never trusted, always parsed**: a corrupt, foreign-version, wrong-code or out-of-range ledger
 * reads as an empty one — the bench then behaves as if no run had happened (fail-quiet into the
 * known-good full suite, the same discipline as `parseRunState`).
 *
 * **Public API.** {@link BENCH_LEDGER_KEY}, {@link BENCH_LEDGER_VERSION}, {@link BenchLedger},
 * {@link parseLedger}, {@link serializeLedger}, {@link ledgerWith}, {@link skipPlan},
 * {@link benchSkipNote}.
 *
 * @module
 */
import { BENCH_RUN_LENGTH } from './decode.js';
import { BENCH_SCENARIOS } from './matrix.js';

/** `localStorage` key of the completion ledger (the game's `shmup-cup:` prefix). */
export const BENCH_LEDGER_KEY = 'shmup-cup:render-bench-ledger';

/** Format version of the stored ledger. */
export const BENCH_LEDGER_VERSION = 1;

/** A stored ledger: the game code one build's rows belong to, and the rows measured. */
export interface BenchLedger {
  /** {@link BENCH_LEDGER_VERSION}. */
  readonly version: number;
  /** The {@link BenchLedger} owner's game code hash (`''` = never written). */
  readonly code: string;
  /** Scenario indexes measured for {@link BenchLedger.code}, ascending, unique. */
  readonly done: readonly number[];
}

/**
 * Whether a value is a finite whole number in the scenario-index range.
 *
 * @param value - The value.
 * @returns `true` for an index the ledger may hold.
 */
function isIndex(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < BENCH_RUN_LENGTH
  );
}

/**
 * Reads a stored ledger defensively.
 *
 * @param text - The stored JSON, or `null` when nothing is stored.
 * @param code - The game code hash the current bundle was built with.
 * @returns The state's done set **for that code**, or `[]` — anything else (no key, bad JSON,
 *   another version, a foreign or empty code, a non-array `done`) reads as "nothing measured",
 *   exactly like an absent ledger.
 */
export function parseLedger(text: string | null, code: string): number[] {
  if (text === null || text === '' || code === '') return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (_error) {
    return [];
  }
  if (raw === null || typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  if (o.version !== BENCH_LEDGER_VERSION || o.code !== code || !Array.isArray(o.done)) return [];
  return dedupe(o.done as readonly unknown[]);
}

/**
 * Serializes a ledger for `localStorage`.
 *
 * @param code - The game code hash the rows belong to.
 * @param done - The measured indexes (any order; duplicates are folded).
 * @returns The stored text.
 */
export function serializeLedger(code: string, done: readonly number[]): string {
  return JSON.stringify({ version: BENCH_LEDGER_VERSION, code, done: dedupe(done) });
}

/**
 * The done set plus one index, ascending and unique (a re-run of a measured row is idempotent;
 * indexes outside 0…{@link BENCH_RUN_LENGTH} − 1 and non-whole values are dropped).
 *
 * @param done - The known measured indexes.
 * @param index - The index just measured (a record's `index`).
 * @returns A new sorted set — the inputs are never mutated.
 */
export function ledgerWith(done: readonly unknown[], index: unknown): number[] {
  if (!isIndex(index)) return dedupe(done);
  return dedupe(done.concat([index]));
}

/**
 * Whether a value is an in-range index (the dedupe rule of {@link ledgerWith}).
 *
 * @param value - The value.
 * @returns `true` when it survives into a stored ledger.
 */
function dedupeKeep(value: unknown): value is number {
  return isIndex(value);
}

/**
 * Sorts, dedupes and range-checks a done set.
 *
 * @param done - The candidate indexes.
 * @returns The valid ones, ascending, unique.
 */
function dedupe(done: readonly unknown[]): number[] {
  const out: number[] = [];
  for (const value of done) {
    if (!dedupeKeep(value)) continue;
    if (out.indexOf(value) < 0) out.push(value);
  }
  out.sort((a, b) => a - b);
  return out;
}

/** What a same-code ledger says is left to measure (see {@link skipPlan}). */
export interface BenchSkipPlan {
  /** Rows the ledger already holds for this game code (what the offer says is skipped). */
  readonly skipped: number;
  /** Rows a skip run would still measure (un-done render scenarios and un-done specials). */
  readonly remaining: number;
  /** The cursor a skip run starts at, or `BENCH_RUN_LENGTH` when nothing remains. */
  readonly firstPending: number;
}

/**
 * Derives the skip plan from a done set.
 *
 * @param done - The ledger's measured indexes (already validated by {@link parseLedger}).
 * @param isSkipped - Whether the render scenario at an index is skipped by this build's output
 *   (`./output.ts` `benchScenarioSetup` — planned skips are never counted as remaining).
 * @returns The plan: `skipped` counts only rows the run would have measured anyway,
 *   `remaining` every un-done row including the un-done specials (the decode, stand-in and rewind
 *   page loads, indexes 190 / 191 / 192) that a skip run must still visit, `firstPending` where to start.
 * @remarks
 * The specials re-run only when un-done (owner amendment 2026-10-28: they are cheap-ish, but a
 * run that already holds them holds the truth). A row the ledger holds but this build plans to
 * skip (an output build that skips a frame the ledger's run measured) is *not* counted skipped —
 * the offer counts the work the skip actually saves.
 */
export function skipPlan(
  done: readonly number[],
  isSkipped: (index: number) => boolean,
): BenchSkipPlan {
  let skipped = 0;
  let remaining = 0;
  let firstPending = BENCH_RUN_LENGTH;
  for (let index = 0; index < BENCH_RUN_LENGTH; index++) {
    if (index < BENCH_SCENARIOS.length && isSkipped(index)) continue;
    if (done.indexOf(index) >= 0) {
      skipped++;
      continue;
    }
    remaining++;
    if (index < firstPending) firstPending = index;
  }
  return { skipped, remaining, firstPending };
}

/**
 * The ` (skipped N same game)` progress note a label or the RUN line carries when a run started
 * from a skip plan (empty string otherwise — every unchanged page reads as before).
 *
 * @param skippedAtStart - The skipped count the run was created with (`./state.ts`).
 * @returns The note text, leading space included.
 */
export function benchSkipNote(skippedAtStart: number): string {
  if (skippedAtStart <= 0) return '';
  return ` (skipped ${skippedAtStart} same game)`;
}
