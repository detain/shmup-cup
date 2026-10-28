/**
 * The TV render bench's **same-game-code completion ledger** (plan v20x BENCSKIP, its pool split and
 * migration added by plan R-SVG WO-2): stored shape, defensive parsing (a foreign pool or a corrupt
 * text reads as an empty ledger — never a partial truth), idempotent marking, the skip plan's
 * counting rules (planned skips are neither remaining nor skipped; the page loads re-run only when
 * un-done), the version-1 store's migration into the PNG pool, and the ` (skipped N same game)`
 * progress note. The page plumbing that consumes it — the Enter / Green offer, the marking save
 * paths — is in `./bench-run.test.ts`.
 *
 * The ledger's own promise is the slice the owner visits for: **ENTER on the current code-hash
 * ledger yields exactly the rows this build added** — the fixture below walks the store a completed
 * pre-cull, pre-arm run left behind and shows what each arm is offered on top of it.
 */
import { describe, expect, it } from 'vitest';
import {
  BENCH_LEDGER_KEY,
  BENCH_LEDGER_VERSION,
  BENCH_RUN_LENGTH,
  BENCH_SCENARIOS,
  benchLedgerPool,
  benchSkipNote,
  DECODE_SCENARIO_INDEX,
  ledgerWith,
  parseLedger,
  REWIND_SCENARIO_INDEX,
  serializeLedger,
  skipPlan,
  STANDIN_SCENARIO_INDEX,
  STANDIN_SVG_SCENARIO_INDEX,
} from '../../src/bench/index.js';

/** A 10-hex game code, like `scripts/game-code-hash.mjs` prints. */
const CODE = 'abc123def4';

/** The PNG arm's pool key for {@link CODE}. */
const POOL = benchLedgerPool(CODE, 'png');

/** The SVG arm's pool key for {@link CODE}. */
const ARMED_POOL = benchLedgerPool(CODE, 'e3');

/** No planned skips (the backbuffer build measures every row). */
const noneSkipped = (): boolean => false;

/** Every index the full suite measures: all render rows and the four page loads. */
const allRows = (): number[] => {
  const out: number[] = [];
  for (let i = 0; i < BENCH_RUN_LENGTH; i++) out.push(i);
  return out;
};

/**
 * A PNG build's planned skips: the SVG arm's stand-in slot, and nothing else (the backbuffer is the
 * window's). The `run.ts` predicate, without an output knob.
 */
const pngPlannedSkip = (index: number): boolean => index === STANDIN_SVG_SCENARIO_INDEX;

/**
 * The store a completed run left behind before plan R-SVG WO-2 (version 1): every render row of the
 * 190-row matrix it knew and its three page loads, at v1's own indexes.
 */
const V1_RUN_LENGTH = 193;
const v1CompleteStore = (): string => {
  const done: number[] = [];
  for (let i = 0; i < V1_RUN_LENGTH; i++) done.push(i);
  return JSON.stringify({ version: 1, code: CODE, done });
};

describe('bench skip ledger', () => {
  it('round-trips one pool’s done set under the game’s storage prefix', () => {
    expect(BENCH_LEDGER_KEY).toBe('shmup-cup:render-bench-ledger');
    const text = serializeLedger(POOL, [192, 0, 174]);
    expect(JSON.parse(text)).toEqual({
      version: BENCH_LEDGER_VERSION,
      pools: { [CODE]: [0, 174, 192] },
    });
    expect(parseLedger(text, POOL)).toEqual([0, 174, 192]);
  });

  it('keys a pool by the arm: the bare code for PNG, the encoding for the SVG arm', () => {
    expect(benchLedgerPool(CODE, 'png')).toBe(CODE);
    expect(benchLedgerPool(CODE, '')).toBe(CODE);
    expect(benchLedgerPool(CODE, 'e3')).toBe(`${CODE}|svg=e3`);
    // A build without the game-code define has no ledger to key.
    expect(benchLedgerPool('', 'e3')).toBe('');
    expect(parseLedger(serializeLedger(POOL, [7]), ARMED_POOL)).toEqual([]);
    expect(parseLedger(serializeLedger(POOL, [7]), '')).toEqual([]);
  });

  it('writes one arm without touching the other arm’s rows', () => {
    const png = serializeLedger(POOL, [0, 1, 2]);
    expect(ARMED_POOL).not.toBe(POOL);
    const both = serializeLedger(ARMED_POOL, [190, BENCH_RUN_LENGTH - 1], png);
    expect(parseLedger(both, ARMED_POOL)).toEqual([190, 197]);
    expect(parseLedger(both, POOL)).toEqual([0, 1, 2]);
    // And the PNG arm's own next write keeps the armed pool it did not measure.
    const again = serializeLedger(POOL, [0, 1], both);
    expect(parseLedger(again, POOL)).toEqual([0, 1]);
    expect(parseLedger(again, ARMED_POOL)).toEqual([190, 197]);
  });

  it('reads anything unusable as "nothing measured"', () => {
    expect(parseLedger(null, POOL)).toEqual([]);
    expect(parseLedger('', POOL)).toEqual([]);
    expect(parseLedger('not json', POOL)).toEqual([]);
    expect(parseLedger('{"version":2,"code":"abc123def4","done":[1]}', POOL)).toEqual([]);
    expect(parseLedger('{"version":2,"pools":"no"}', POOL)).toEqual([]);
    expect(parseLedger('{"version":2,"pools":{"x":1}}', POOL)).toEqual([]);
    expect(parseLedger('{"version":3,"pools":{"abc123def4":[1]}}', POOL)).toEqual([]);
    expect(parseLedger(serializeLedger(POOL, [1]), 'other-code')).toEqual([]);
    expect(parseLedger(serializeLedger(POOL, [1]), '')).toEqual([]);
    expect(parseLedger('{"version":1,"code":"abc123def4"}', POOL)).toEqual([]);
    expect(parseLedger('{"version":1,"code":"abc123def4","done":"no"}', POOL)).toEqual([]);
    expect(parseLedger('{"version":1,"done":[0]}', POOL)).toEqual([]);
  });

  it('migrates a version-1 store into the PNG pool of the code it names', () => {
    // The frozen 190-row prefix means the same row; v1's three page loads (190 / 191 / 192) shift by
    // the matrix rows appended since, so a banked run is never re-offered as a new row — and never
    // read as a page load under a different identity.
    expect(parseLedger(v1CompleteStore(), POOL)).toEqual(
      allRows()
        .slice(0, 190)
        .concat([DECODE_SCENARIO_INDEX, STANDIN_SCENARIO_INDEX, REWIND_SCENARIO_INDEX]),
    );
    // It belongs to the PNG arm only: the arm never inherits a pre-arm run's rows (§C.4's partition
    // law, which the analyzer's `benchPoolOf` enforces on the server's side).
    expect(parseLedger(v1CompleteStore(), ARMED_POOL)).toEqual([]);
    // Indexes past v1's run length could not have been measured by it, and are dropped; the store's
    // own out-of-range and repeated values are folded like a version-2 one's.
    expect(
      parseLedger(
        JSON.stringify({ version: 1, code: CODE, done: [5, 5, 193, 195, 2.5, -1] }),
        POOL,
      ),
    ).toEqual([5]);
    // A migration is a read: the next write stores version 2 and leaves nothing to migrate.
    const rewritten = serializeLedger(POOL, parseLedger(v1CompleteStore(), POOL));
    expect(JSON.parse(rewritten)).toEqual({
      version: BENCH_LEDGER_VERSION,
      pools: { [POOL]: parseLedger(v1CompleteStore(), POOL) },
    });
  });

  it('offers a completed pre-arm run exactly the rows this build added', () => {
    const banked = parseLedger(v1CompleteStore(), POOL);
    // The PNG arm: the four cull rows, and nothing else — the reserved SVG slot is a planned skip and
    // the three page loads it already holds are not re-offered.
    const png = skipPlan(banked, pngPlannedSkip);
    expect(png).toEqual({ skipped: 193, remaining: 4, firstPending: 190 });
    expect(
      allRows().filter((i) => i >= 190 && banked.indexOf(i) < 0 && !pngPlannedSkip(i)),
    ).toEqual([190, 191, 192, 193]);
    // The SVG arm on the same code: a pool of its own, so its first visit is the whole run — the
    // A/B is that re-measurement, and an inherited skip would answer nothing.
    expect(skipPlan(parseLedger(v1CompleteStore(), ARMED_POOL), noneSkipped)).toEqual({
      skipped: 0,
      remaining: BENCH_RUN_LENGTH,
      firstPending: 0,
    });
    // Once the armed run has measured everything, a bench-only rebuild is offered nothing but the
    // rows a later matrix append brings.
    const armedDone = allRows();
    expect(skipPlan(armedDone, noneSkipped)).toEqual({
      skipped: BENCH_RUN_LENGTH,
      remaining: 0,
      firstPending: BENCH_RUN_LENGTH,
    });
  });

  it('drops out-of-range and repeated indexes when marking (a Red re-run is idempotent)', () => {
    let done = ledgerWith([], BENCH_RUN_LENGTH);
    done = ledgerWith(done, -1);
    done = ledgerWith(done, 2.5);
    done = ledgerWith(done, undefined);
    expect(done).toEqual([]);
    done = ledgerWith(done, 5);
    done = ledgerWith(done, 5);
    expect(done).toEqual([5]);
    expect(ledgerWith(allRows(), 190).length).toBe(BENCH_RUN_LENGTH);
  });

  it('plans the skip run: done rows skipped, pending rows and un-done page loads remaining', () => {
    const empty = skipPlan([], noneSkipped);
    expect(empty).toEqual({ skipped: 0, remaining: BENCH_RUN_LENGTH, firstPending: 0 });

    const first174 = [];
    for (let i = 0; i < 174; i++) first174.push(i);
    const plan = skipPlan(first174, noneSkipped);
    // 16 appended render rows (the video pairs' tail and the cull pair) plus the four page loads,
    // starting at the first un-done row.
    expect(plan).toEqual({ skipped: 174, remaining: 24, firstPending: 174 });

    const withDecode = skipPlan(first174.concat([DECODE_SCENARIO_INDEX]), noneSkipped);
    expect(withDecode).toEqual({ skipped: 175, remaining: 23, firstPending: 174 });

    const everything = skipPlan(allRows(), noneSkipped);
    expect(everything).toEqual({
      skipped: BENCH_RUN_LENGTH,
      remaining: 0,
      firstPending: BENCH_RUN_LENGTH,
    });
  });

  it('never counts a row the build plans to skip as remaining', () => {
    // A hypothetical output build that skips render row 0 and the very last render row.
    const isSkipped = (index: number): boolean =>
      index === 0 || index === BENCH_SCENARIOS.length - 1;
    const plan = skipPlan([], isSkipped);
    expect(plan.remaining).toBe(BENCH_RUN_LENGTH - 2);
    expect(plan.firstPending).toBe(1);
    // A ledger row the build now plans to skip reads as skipped: the run would not measure it.
    const doneFirst = skipPlan([0], isSkipped);
    expect(doneFirst.skipped).toBe(0);
    // The predicate is asked for every index of the run now, the page loads and the reserved slot
    // included (it is `run.ts`'s arm-aware one, not a matrix lookup — so it may not index off the end).
    const skipTheTail = (index: number): boolean => index >= DECODE_SCENARIO_INDEX;
    expect(skipPlan([], skipTheTail)).toEqual({
      skipped: 0,
      remaining: BENCH_SCENARIOS.length,
      firstPending: 0,
    });
  });

  it('the rewind page alone being pending starts the skip run at its index', () => {
    const done = allRows().filter((i) => i !== REWIND_SCENARIO_INDEX);
    const plan = skipPlan(done, noneSkipped);
    expect(plan).toEqual({
      skipped: BENCH_RUN_LENGTH - 1,
      remaining: 1,
      firstPending: REWIND_SCENARIO_INDEX,
    });
  });

  it('names the four page loads by their indexes', () => {
    expect(DECODE_SCENARIO_INDEX).toBe(BENCH_SCENARIOS.length);
    expect(STANDIN_SCENARIO_INDEX).toBe(BENCH_SCENARIOS.length + 1);
    expect(STANDIN_SVG_SCENARIO_INDEX).toBe(BENCH_SCENARIOS.length + 2);
    expect(REWIND_SCENARIO_INDEX).toBe(BENCH_SCENARIOS.length + 3);
  });

  it('notes the skipped rows only when a run started from a plan', () => {
    expect(benchSkipNote(0)).toBe('');
    expect(benchSkipNote(-3)).toBe('');
    expect(benchSkipNote(174)).toBe(' (skipped 174 same game)');
  });
});
