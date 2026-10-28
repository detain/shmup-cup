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
 * **Row identity is the scenario index** (0…{@link BENCH_RUN_LENGTH} − 1, the four page loads
 * included): the analyzer's rows are keyed by scenario id at the same output, and the id list is
 * frozen for a game-code hash — the matrix lives in `./matrix.ts`, outside the hash, so the indexes
 * a ledger holds are the indexes the same game code's rows carry. Because the list is only frozen
 * *for one shape of matrix*, a store written by an older matrix is **migrated, not trusted**: see
 * {@link parseLedger}.
 *
 * **One store, one pool per arm** (plan R-SVG WO-2). The bench's `localStorage` key is shared by the
 * PNG bundle and the SVG arm's, and their timings may never join one sample pool (§C.4's partition
 * law, the same one `tools/input-probe/results/analyze-bench.mjs` `benchPoolOf` enforces on the
 * server's side). So a version-2 store keeps a **done set per pool key** — the game code for a PNG
 * build, `code|svg=<enc>` for an armed one ({@link benchLedgerPool}) — and writing one arm's rows
 * leaves the other's intact. A version-1 store held a single code and its 190-row matrix; reading it
 * migrates it into the PNG pool, the frozen row prefix unchanged and its three page loads shifted by
 * the matrix rows appended since (which is why ENTER on a run the M7 already finished still yields
 * exactly the new rows, and never a page load under a different identity).
 *
 * **Never trusted, always parsed**: a corrupt, foreign-version, wrong-code or out-of-range ledger
 * reads as an empty one — the bench then behaves as if no run had happened (fail-quiet into the
 * known-good full suite, the same discipline as `parseRunState`).
 *
 * **Public API.** {@link BENCH_LEDGER_KEY}, {@link BENCH_LEDGER_VERSION}, {@link BenchLedger},
 * {@link benchLedgerPool}, {@link parseLedger}, {@link serializeLedger}, {@link ledgerWith},
 * {@link skipPlan}, {@link benchSkipNote}.
 *
 * @module
 */
import { BENCH_RUN_LENGTH, DECODE_SCENARIO_INDEX, STANDIN_SCENARIO_INDEX } from './decode.js';
import { REWIND_SCENARIO_INDEX } from './rewind.js';

/** `localStorage` key of the completion ledger (the game's `shmup-cup:` prefix). */
export const BENCH_LEDGER_KEY = 'shmup-cup:render-bench-ledger';

/**
 * Format version of the stored ledger: 1 held one game code and one done set (plan v20x BENCSKIP),
 * 2 holds a done set per bench pool ({@link benchLedgerPool}). A version-1 store still reads.
 */
export const BENCH_LEDGER_VERSION = 2;

/**
 * How many render scenarios the version-1 matrix had — the frozen prefix whose indexes mean the same
 * row in every store, and the offset its three page loads (190 / 191 / 192) sit behind. The matrix
 * only ever grows at its tail (`./matrix.ts`'s append law), so this number is a fact about the past,
 * not a copy of the present.
 */
const V1_SCENARIO_COUNT = 190;

/**
 * The page loads a version-1 store's tail indexes, in its own order (decode, stand-in, rewind) mapped
 * to this build's indexes: the matrix rows appended since shift the first two by their count, and the
 * rewind page now closes the run *after* the SVG arm's reserved slot (`./decode.ts`). Anything past
 * v1's tail could not have been measured by it.
 */
const V1_SPECIAL_INDEXES = Object.freeze([
  DECODE_SCENARIO_INDEX,
  STANDIN_SCENARIO_INDEX,
  REWIND_SCENARIO_INDEX,
]);

/** The index from which a version-1 store's done set is page loads rather than matrix rows. */
const V1_FIRST_SPECIAL = V1_SCENARIO_COUNT;

/** The done sets of one stored ledger, by pool key (see {@link benchLedgerPool}). */
export interface BenchLedgerPools {
  /** The pool's measured indexes, ascending and unique. */
  readonly [pool: string]: readonly number[];
}

/** A stored ledger: the pool keys it holds and the rows measured for each. */
export interface BenchLedger {
  /** {@link BENCH_LEDGER_VERSION}. */
  readonly version: number;
  /** The done sets, by pool key (a version-1 store's shape is migrated out of {@link parseLedger}). */
  readonly pools: BenchLedgerPools;
}

/**
 * The pool key a bench's rows belong to — the widget's twin of the analyzer's `benchPoolOf`: the bare
 * game code for a PNG build, the code with the encoding for an armed one, so an SVG sample never
 * inherits a PNG row's done mark (or the other way round) across a shared `localStorage`.
 *
 * @param code - The build's game code hash (`''` for a build without the define).
 * @param svgEnc - The build's density-page encoding (`'png'` or `'e3'`).
 * @returns The pool key, or `''` when there is no game code (an unusable ledger either way).
 */
export function benchLedgerPool(code: string, svgEnc: string): string {
  if (code === '') return '';
  return svgEnc === 'png' || svgEnc === '' ? code : `${code}|svg=${svgEnc}`;
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
 * Maps one of the three page-load indexes of a version-1 store onto this build's, through
 * {@link V1_SPECIAL_INDEXES} (the matrix rows appended since {@link V1_SCENARIO_COUNT} pushed the
 * loads down, and the arm's reserved slot now sits among them). Anything past v1's tail is dropped.
 *
 * @param value - A candidate index.
 * @returns The index in this build's identity, or `-1` to drop it.
 */
function migrateV1Index(value: number): number {
  if (value < V1_FIRST_SPECIAL) return value;
  const special = value - V1_FIRST_SPECIAL;
  return special < V1_SPECIAL_INDEXES.length ? V1_SPECIAL_INDEXES[special] : -1;
}

/**
 * Reads a stored ledger's pools defensively (see {@link parseLedger}, which is what callers use).
 *
 * @param text - The stored JSON, or `null` when nothing is stored.
 * @returns The pools by key, each validated and migrated; `{}` for anything unreadable.
 */
function parsePools(text: string | null): BenchLedgerPools {
  if (text === null || text === '') return {};
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (_error) {
    return {};
  }
  if (raw === null || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  if (o.version === BENCH_LEDGER_VERSION) {
    const pools = o.pools;
    if (pools === null || typeof pools !== 'object') return {};
    const out: Record<string, readonly number[]> = {};
    const entries = pools as Record<string, unknown>;
    for (const key of Object.keys(entries)) {
      const done = entries[key];
      out[key] = Array.isArray(done) ? dedupe(done as readonly unknown[]) : [];
    }
    return out;
  }
  // Version 1: one code, one done set, a shorter matrix. It belongs to the PNG pool of its code —
  // the arm did not exist when it was written.
  if (o.version === 1) {
    const code = o.code;
    const done = o.done;
    if (typeof code !== 'string' || code === '' || !Array.isArray(done)) return {};
    const migrated: number[] = [];
    for (const value of done as readonly unknown[]) {
      if (!isIndex(value)) continue;
      const index = migrateV1Index(value);
      if (index >= 0 && migrated.indexOf(index) < 0) migrated.push(index);
    }
    migrated.sort((a, b) => a - b);
    return { [code]: migrated };
  }
  return {};
}

/**
 * Reads a stored ledger defensively.
 *
 * @param text - The stored JSON, or `null` when nothing is stored.
 * @param pool - The pool key the current bundle's rows belong to ({@link benchLedgerPool}).
 * @returns The done set **for that pool**, or `[]` — anything else (no key, bad JSON, another
 *   version, an unknown pool, a non-array `done`) reads as "nothing measured", exactly like an
 *   absent ledger. A version-1 store is migrated into the PNG pool of the code it names.
 */
export function parseLedger(text: string | null, pool: string): number[] {
  if (pool === '') return [];
  const pools = parsePools(text);
  const done = pools[pool];
  return done === undefined ? [] : dedupe(done);
}

/**
 * Serializes a ledger for `localStorage`, replacing one pool of the stored document and keeping every
 * other pool as it stands (the arm that did not run this time must not lose its rows).
 *
 * @param pool - The pool key whose rows are written.
 * @param done - Its measured indexes (any order; duplicates are folded).
 * @param stored - The text already stored, merged in (or kept as-is when it is unreadable).
 * @returns The stored text. An empty pool key writes nothing for it: a build without a game code has
 *   no ledger to keep.
 */
export function serializeLedger(
  pool: string,
  done: readonly number[],
  stored: string | null = null,
): string {
  const pools: Record<string, readonly number[]> = { ...parsePools(stored) };
  if (pool !== '') pools[pool] = dedupe(done);
  return JSON.stringify({ version: BENCH_LEDGER_VERSION, pools });
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
 * @param isSkipped - Whether the row at an index is out of this build's run by design: a render
 *   scenario its output skips (`./output.ts` `benchScenarioSetup`) or a page load only the other arm
 *   measures (`run.ts`'s arm-aware predicate). Planned skips are never counted as remaining.
 * @returns The plan: `skipped` counts only rows the run would have measured anyway,
 *   `remaining` every un-done row including the un-done page loads (the decode, stand-in, rewind and
 *   — on an armed build — stand-in-SVG loads) that a skip run must still visit, `firstPending` where
 *   to start.
 * @remarks
 * The page loads re-run only when un-done (owner amendment 2026-10-28: they are cheap-ish, but a
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
    if (isSkipped(index)) continue;
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
