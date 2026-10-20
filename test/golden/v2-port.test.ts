/**
 * The v2 port acceptance (plan_resolution.md R2-02.T3): every non-zone scenario of the v1 baseline
 * is flown again on the ported world and compared against its committed v1 record through the
 * mapping rules of `test/fixtures/v1-baseline/README.md` § "Comparing a v2 run" — camera travel,
 * event pairing (derived from the two timelines by `deriveEventMap`, which also absorbs the
 * port's re-sort and the loop-2 remix order), spawn and entry, the first-visible ±1-tick rule,
 * the §2.6 landing proof (`T` entries lining up at `K·y + PAD ±2 px`), the spec table, bosses,
 * bullet speed — while the durations and observations the 4-way bot decides (its pace sets the
 * run end, the locks, the warnings, the kills, the branches and through them the children) are
 * compared within the cross-explaining windows of `v2-port.ts` or exempted there with the reason
 * of their class, always reporting the strict delta where a line remains. The zones run in
 * `v2-port-zones.test.ts` and `v2-port-loop2.test.ts`.
 *
 * While the world is ×1 the comparisons skip (their meaning is the ported world's). The meta
 * checks run on every tree; the identity self-comparison of the committed files runs only where
 * the mappers of `v1-port.ts` are the identity — a tree still at the recorded v1 frame (`K` = 1
 * and `atRecordedFrame`; on master's flipped frame the ground and right-edge rows legitimately
 * read the new frame, and in the kit the ×1.5 mapping does its job, so there the check skips).
 *
 * Both scales, kit and plain:
 *
 * ```sh
 * bash test/port-v2/two-scale.sh --keep -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run \
 *   --project integration test/golden/v2-port.test.ts test/golden/v2-port-zones.test.ts \
 *   test/golden/v2-port-loop2.test.ts
 * env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration \
 *   test/golden/v2-port.test.ts test/golden/v2-port-zones.test.ts test/golden/v2-port-loop2.test.ts
 * ```
 */
import { describe, expect, it } from 'vitest';
import { BASELINE_GROUPS, BASELINE_SCENARIOS, readBaseline } from './v1-baseline.js';
import { atRecordedFrame } from './v1-baseline-suite.js';
import {
  compareScenario,
  deriveEventMap,
  K,
  LEAD_PX,
  MAP_PX,
  SNAP_PX,
  type EventRow,
} from './v2-port.js';
import { describeV2PortComparisons } from './v2-port-suite.js';

describe('v2 port: the comparison machinery (R2-02.T3)', () => {
  it('deriveEventMap pairs plain ports, world-sum leads and transpositions', () => {
    const rows1: EventRow[] = [
      ['spawn', 1000, 100],
      ['block', 2000, 200],
      ['spawn', 3000, 300],
      ['formation', 4000, 400],
      ['end', 9000, 900],
    ];
    const rows2: EventRow[] = [
      ['spawn', K * 1000, 100], // plain
      ['block', K * 2000 - LEAD_PX, 188], // the lead, crossing nothing
      ['formation', K * 4000, 400],
      ['spawn', K * 3000 - LEAD_PX, 288], // the lead crossing the formation → 2↔3, 3↔2
      ['end', K * 9000, 900],
    ];
    const map = deriveEventMap(rows1, rows2);
    expect([...map.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [0, 0],
      [1, 1],
      [2, 3],
      [3, 2],
      [4, 4],
    ]);
  });

  it('deriveEventMap leaves an unportable event unmapped', () => {
    const map = deriveEventMap([['spawn', 1000, 10]], [['boss', 1000, 10]]);
    expect(map.size).toBe(0);
  });

  it('a plain port and a led pair both sit in the acceptance window', () => {
    // the window's own edges (RTL7 F1): deriveEventMap pairs a v1 x whose port sits at most the
    // tool's whole shift `LEAD + SNAP + MAP` below K·x and at most MAP above it — inside that
    // span, the recorded early fire of a world-sum pair is exactly the lead identity
    // compareScenario checks per paired row (`K·x1 − x2 ∈ [−MAP, LEAD+SNAP+MAP]`); one pixel
    // beyond an edge the row is simply unportable and must fail to pair:
    const lo = K * 400 - (LEAD_PX + SNAP_PX + MAP_PX);
    expect(deriveEventMap([['spawn', 400, 10]], [['spawn', lo, 10]]).size).toBe(1);
    expect(deriveEventMap([['spawn', 400, 10]], [['spawn', lo - 1, 10]]).size).toBe(0);
    expect(deriveEventMap([['spawn', 400, 10]], [['spawn', K * 400 + MAP_PX, 10]]).size).toBe(1);
    expect(deriveEventMap([['spawn', 400, 10]], [['spawn', K * 400 + MAP_PX + 1, 10]]).size).toBe(
      0,
    );
    expect(Math.abs(LEAD_PX)).toBeLessThanOrEqual(256);
  });

  describe.runIf(atRecordedFrame && K === 1)(
    'at the recorded v1 frame the comparison is the identity',
    () => {
      it.each(BASELINE_SCENARIOS.map((s) => s.id))('%s matches its own file', (id) => {
        const v1 = readBaseline(id);
        expect(compareScenario(v1, v1).join('\n')).toBe('');
      });
    },
  );
});

describeV2PortComparisons(
  'v2 port: the stages other than the zones (R2-02.T3)',
  BASELINE_GROUPS.stages,
);
