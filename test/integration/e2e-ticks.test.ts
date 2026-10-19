/**
 * `test/e2e/ticks.ts` (plan_resolution.md R2-01, C5 review 3): the browser tests' tick
 * budgets are core's scene-flow delays and the ships' fly-in plus slack, and the specs cannot
 * import core, so `ticks.ts` keeps pinned mirrors of them. This test keeps each mirror equal to
 * `@shmup/core`'s constant or to the shipped content, and fails on a new numeric constant there
 * that nobody pinned. Without it a delay changed in core or the content would show only as an e2e
 * flake: a wait whose budget no longer covers the delay.
 */
import { readFileSync, readdirSync } from 'node:fs';
import * as core from '@shmup/core';
import { describe, expect, it } from 'vitest';
import * as ticks from '../e2e/ticks.js';

/** The shipped player files (`content/player/*.player.json`, the `example.*` sample left out). */
const PLAYER_DIR = new URL('../../content/player/', import.meta.url);

/**
 * Reads every shipped ship's `enterTicks`.
 *
 * @returns One fly-in length per ship, in file order.
 */
function shippedEnterTicks(): number[] {
  const out: number[] = [];
  for (const name of readdirSync(PLAYER_DIR).sort()) {
    if (!name.endsWith('.player.json') || name.startsWith('example.')) continue;
    const file = JSON.parse(readFileSync(new URL(name, PLAYER_DIR), 'utf8')) as {
      ships: { enterTicks: number }[];
    };
    for (const ship of file.ships) out.push(ship.enterTicks);
  }
  return out;
}

/** Mirror export → the `@shmup/core` constant it must equal. */
const MIRRORED = {
  STAGE_CLEAR_DELAY_TICKS: core.STAGE_CLEAR_DELAY_TICKS,
  GAME_OVER_DELAY_TICKS: core.GAME_OVER_DELAY_TICKS,
  MAP_LAUNCH_TICKS: core.MAP_LAUNCH_TICKS,
  BONUS_WARP_TICKS: core.BONUS_WARP_TICKS,
  ENDING_LOCK_TICKS: core.ENDING_LOCK_TICKS,
  CREDITS_LOCK_TICKS: core.CREDITS_LOCK_TICKS,
  HI_SCORE_LOCK_TICKS: core.HI_SCORE_LOCK_TICKS,
  INPUT_TEST_EXIT_TICKS: core.INPUT_TEST_EXIT_TICKS,
  REPLAY_END_TICKS: core.REPLAY_END_TICKS,
} as const;

/** Mirrors of the shipped content rather than of a core constant (pinned below, one test each). */
const FROM_CONTENT = ['SHIP_ENTER_TICKS'] as const;

/** The module's own numbers: no core constant to mirror. */
const OWN = ['SCENE_SLACK_TICKS', 'BOOT_TIMEOUT_MS'] as const;

describe('the e2e tick mirrors (test/e2e/ticks.ts)', () => {
  it.each(Object.entries(MIRRORED))('%s equals @shmup/core', (name, value) => {
    expect((ticks as Record<string, unknown>)[name]).toBe(value);
  });

  it('SHIP_ENTER_TICKS is the longest fly-in of the shipped ships (content/player)', () => {
    const enter = shippedEnterTicks();
    expect(enter.length).toBeGreaterThanOrEqual(2); // the KESTREL and the MANTA
    expect(ticks.SHIP_ENTER_TICKS).toBe(Math.max(...enter));
  });

  it('pins every numeric constant it exports, or knows it as its own', () => {
    const numeric = Object.entries(ticks)
      .filter(([, value]) => typeof value === 'number')
      .map(([name]) => name)
      .sort();
    expect(numeric).toEqual([...Object.keys(MIRRORED), ...FROM_CONTENT, ...OWN].sort());
  });

  it('gives a scene wait slack beyond the frame loop’s catch-up', () => {
    // A delayed push lands a tick after its count, and the spec reads the scene once per frame, up
    // to `maxTicksPerFrame` ticks late: the slack must cover both.
    expect(ticks.SCENE_SLACK_TICKS).toBeGreaterThan(core.DEFAULT_GAME_CONFIG.maxTicksPerFrame + 1);
  });
});
