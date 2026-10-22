/**
 * The permanent byte guard of the playtest bot (R5-P.P12 cure, RT-P12 C1): every golden scenario
 * the **live four-way bot** flies must re-record **byte for byte** into its committed replay.
 *
 * `golden-edge.test.ts` pinned exactly one of these (`zone-a-boss`); the P12 cure review proved
 * the rest could drift silently — the first bot gate changes still moved four recordings
 * (`zone-d-god`, `zone-d-bot`, `zone-f-arcade`, `zone-a-extras`) that no committed-file test
 * checked. This file closes that hole for the whole bot-driven set: a decision change that
 * touches any live-bot run of the shipped content is now a red test, not a surprise re-bless.
 *
 * Which scenarios count as live-bot: `pilotOf` hands `four-way`, `bomber`, `toggler` and
 * `burster` to the live bot — the wrappers only add their own fixed button pattern on top of
 * `fourWayBot().decide` (`fireButtonBot`, `bomberBot`), so every bot decision moves their input
 * streams too. A scenario is guarded on its **own** pilot; only the `weaver` is truly scripted
 * (its `decide` reads the tick and never the World) and is excluded, and a co-op's scripted p2
 * seat cannot drift the live player-1 half — that run is guarded. The weaver's own runs move
 * only when the sim itself moves, which the replay playback already proves.
 *
 * Runtime: every guarded scenario replays its full simulation live (the goldens run to
 * `stageClear` / `gameOver`, the longest ~14k ticks); the whole file takes about 50 seconds at
 * `VITEST_MAX_WORKERS=1` (measured twice at 53 tests, 48.2 s and 50.2 s) — RT-P12b's re-measure.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GOLDEN_SCENARIOS,
  formatGolden,
  goldenPath,
  recordGolden,
  type GoldenScenario,
} from '../golden/golden.js';

/** Per-test wall-clock allowance: the longest scenario flies ~14k live ticks. */
const RECORD_TIMEOUT_MS = 300_000;

/**
 * Whether the scenario's player-1 stream is produced by the live playtest bot — the four-way and
 * its button wrappers, never the tick-only weaver (see the module docs). A scripted p2 seat is
 * irrelevant: player 1's half of the run is still the bot's own.
 *
 * @param scenario - The golden scenario.
 * @returns `true` when a bot decision change must re-record it.
 */
function flownByLiveBot(scenario: GoldenScenario): boolean {
  return (
    scenario.bot === 'four-way' ||
    scenario.bot === 'bomber' ||
    scenario.bot === 'toggler' ||
    scenario.bot === 'burster'
  );
}

/** The guarded set, in file order. */
const LIVE_BOT_SCENARIOS = GOLDEN_SCENARIOS.filter(flownByLiveBot);

describe('playtest bot: every live-bot golden re-records byte for byte (RT-P12 C1)', () => {
  it('covers the four scenarios the P12 cure review caught drifting, the fire-button wrappers and the co-op death run (RT-P12b)', () => {
    const names = LIVE_BOT_SCENARIOS.map((scenario) => scenario.name);
    for (const name of [
      'zone-a-boss',
      'zone-a-extras',
      'zone-d-god',
      'zone-d-bot',
      'zone-f-arcade',
      // RT-P12b: `fireButtonBot` IS the four-way bot with a fire pattern, and a co-op is guarded
      // on its live player 1 whatever seat 2 flies.
      'zone-a-manta-toggle',
      'zone-a-hold',
      'zone-a-coop-deaths',
    ]) {
      expect(names, name).toContain(name);
    }
    // Completeness pin: the whole roster is 62 scenarios, 52 flown by a live pilot. When a lane
    // adds a live-bot golden it lands here — recount the roster and raise the number with it.
    expect(names.length).toBe(52);
  });

  for (const scenario of LIVE_BOT_SCENARIOS) {
    it(`re-records ${scenario.name} unchanged`, { timeout: RECORD_TIMEOUT_MS }, () => {
      const { replay, outcome } = recordGolden(scenario);
      expect(formatGolden(scenario, replay, outcome)).toBe(
        readFileSync(goldenPath(scenario.name), 'utf8'),
      );
    });
  }
});
