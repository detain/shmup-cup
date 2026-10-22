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
 * Which scenarios count as live-bot: `pilotOf` hands `four-way` and `bomber` (the four-way bot
 * throwing bombs on a fixed cadence) to `fourWayBot`, and co-op runs fly
 * `fourWayBot(1)` for player 2 — so a scenario is guarded when its own pilot is `four-way` or
 * `bomber` (a `weaver`, `toggler` or `burster` pilot is a scripted mask, not the bot) and its
 * `p2`, when present, is the four-way too. The scripted pilots and the weaver seats move only
 * when the sim itself moves, which the replay playback already proves.
 *
 * Runtime: every guarded scenario replays its full simulation live (the goldens run to
 * `stageClear` / `gameOver`, the longest ~14k ticks); the whole file is about a minute at
 * `VITEST_MAX_WORKERS=1` — the numbers ride in the cure's report.
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
 * Whether the scenario's input stream is produced by the live playtest bot (see the module docs).
 *
 * @param scenario - The golden scenario.
 * @returns `true` when a bot decision change must re-record it.
 */
function flownByLiveBot(scenario: GoldenScenario): boolean {
  if (scenario.bot !== 'four-way' && scenario.bot !== 'bomber') return false;
  return scenario.p2 === undefined || scenario.p2.bot === 'four-way';
}

/** The guarded set, in file order. */
const LIVE_BOT_SCENARIOS = GOLDEN_SCENARIOS.filter(flownByLiveBot);

describe('playtest bot: every live-bot golden re-records byte for byte (RT-P12 C1)', () => {
  it('covers the four scenarios the P12 cure review caught drifting, plus zone-a-boss', () => {
    const names = LIVE_BOT_SCENARIOS.map((scenario) => scenario.name);
    for (const name of [
      'zone-a-boss',
      'zone-a-extras',
      'zone-d-god',
      'zone-d-bot',
      'zone-f-arcade',
    ]) {
      expect(names, name).toContain(name);
    }
    // The guard is general: it holds far more than those five.
    expect(names.length).toBeGreaterThan(30);
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
