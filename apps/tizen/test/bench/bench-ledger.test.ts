/**
 * The TV render bench's **same-game-code completion ledger** (plan v20x BENCSKIP): stored shape,
 * defensive parsing (a foreign code or a corrupt text reads as an empty ledger — never a partial
 * truth), idempotent marking, the skip plan's counting rules (planned output skips are neither
 * remaining nor skipped; the specials re-run only when un-done), and the ` (skipped N same game)`
 * progress note. The page plumbing that consumes it — the Enter / Green offer, the marking save
 * paths — is in `./bench-run.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  BENCH_LEDGER_KEY,
  BENCH_LEDGER_VERSION,
  BENCH_RUN_LENGTH,
  BENCH_SCENARIOS,
  benchSkipNote,
  ledgerWith,
  parseLedger,
  serializeLedger,
  skipPlan,
} from '../../src/bench/index.js';
import { REWIND_SCENARIO_INDEX } from '../../src/bench/index.js';
import { DECODE_SCENARIO_INDEX, STANDIN_SCENARIO_INDEX } from '../../src/bench/index.js';

/** A 10-hex game code, like `scripts/game-code-hash.mjs` prints. */
const CODE = 'abc123def4';

/** No planned skips (the backbuffer build measures every row). */
const noneSkipped = (): boolean => false;

/** Every index the full suite measures: all render rows and the three specials. */
const allRows = (): number[] => {
  const out: number[] = [];
  for (let i = 0; i < BENCH_RUN_LENGTH; i++) out.push(i);
  return out;
};

describe('bench skip ledger', () => {
  it('round-trips the done set under the game’s storage prefix', () => {
    expect(BENCH_LEDGER_KEY).toBe('shmup-cup:render-bench-ledger');
    const text = serializeLedger(CODE, [192, 0, 174]);
    expect(JSON.parse(text)).toEqual({
      version: BENCH_LEDGER_VERSION,
      code: CODE,
      done: [0, 174, 192],
    });
    expect(parseLedger(text, CODE)).toEqual([0, 174, 192]);
  });

  it('reads anything unusable as “nothing measured”', () => {
    expect(parseLedger(null, CODE)).toEqual([]);
    expect(parseLedger('', CODE)).toEqual([]);
    expect(parseLedger('not json', CODE)).toEqual([]);
    expect(parseLedger('{"version":2,"code":"x","done":[1]}', CODE)).toEqual([]);
    expect(parseLedger(serializeLedger(CODE, [1]), 'other-code')).toEqual([]);
    expect(parseLedger(serializeLedger(CODE, [1]), '')).toEqual([]);
    expect(parseLedger('{"version":1,"code":"abc123def4"}', CODE)).toEqual([]);
    expect(parseLedger('{"version":1,"code":"abc123def4","done":"no"}', CODE)).toEqual([]);
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

  it('plans the skip run: done rows skipped, pending rows and un-done specials remaining', () => {
    const empty = skipPlan([], noneSkipped);
    expect(empty).toEqual({ skipped: 0, remaining: BENCH_RUN_LENGTH, firstPending: 0 });

    const first174 = [];
    for (let i = 0; i < 174; i++) first174.push(i);
    const plan = skipPlan(first174, noneSkipped);
    // 16 appended render rows plus the three specials, starting at the first un-done row.
    expect(plan).toEqual({ skipped: 174, remaining: 19, firstPending: 174 });

    const withDecode = skipPlan(first174.concat([DECODE_SCENARIO_INDEX]), noneSkipped);
    expect(withDecode).toEqual({ skipped: 175, remaining: 18, firstPending: 174 });

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

  it('names the three specials by their indexes', () => {
    expect(DECODE_SCENARIO_INDEX).toBe(BENCH_SCENARIOS.length);
    expect(STANDIN_SCENARIO_INDEX).toBe(BENCH_SCENARIOS.length + 1);
    expect(REWIND_SCENARIO_INDEX).toBe(BENCH_SCENARIOS.length + 2);
  });

  it('notes the skipped rows only when a run started from a plan', () => {
    expect(benchSkipNote(0)).toBe('');
    expect(benchSkipNote(-3)).toBe('');
    expect(benchSkipNote(174)).toBe(' (skipped 174 same game)');
  });
});
