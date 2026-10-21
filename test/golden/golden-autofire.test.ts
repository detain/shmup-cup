/**
 * The autofire modes in golden replays (plan M2-16 tests — "every option reaches its consumer",
 * the sim-affecting controls recorded in the replay header): `zone-a-manta-toggle` (the MANTA in
 * the `'toggle'` mode, `Shot` tapped every {@link TOGGLE_TAP_TICKS} ticks) and `zone-a-hold` (the
 * KESTREL in the `'hold'` mode at the fastest rate, `Shot` / `Sub` held in bursts) record the mode
 * with `remoteMode: false`, clear the stage, and play back only under their own mode: the same
 * inputs under `'always'` desync. The toggle run's per-player firing switch flips on each tap and
 * shots fly only while it is on; the hold run fires only while the button is held.
 */
import { Action, type Replay } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  BURST_CYCLE_TICKS,
  GOLDEN_SCENARIOS,
  GOLDEN_UPDATE_ENV,
  TOGGLE_TAP_TICKS,
  fireButtonBot,
  playGolden,
  readGolden,
} from './golden.js';

/** Whether this run re-blesses the files (the checks here then wait for the next run). */
const updating = process.env[GOLDEN_UPDATE_ENV] === '1';

/**
 * A replay with another autofire mode in its header (the same inputs).
 *
 * @param replay - The replay.
 * @param mode - The mode.
 * @returns The altered replay.
 */
function withMode(replay: Replay, mode: 'always' | 'toggle' | 'hold'): Replay {
  return {
    ...replay,
    header: { ...replay.header, config: { ...replay.header.config, autofireMode: mode } },
  };
}

/**
 * Counts the player shots in play (every role of player 1's shooters).
 *
 * @param world - The World.
 * @param world.weapons - Its weapon system.
 * @param world.weapons.liveCounts - Live shots per shooter and role.
 * @returns Player 1's live shots.
 */
function liveShots(world: { weapons: { liveCounts: Int32Array } }): number {
  let total = 0;
  // Player 1's shooters come first (the ship and its Options); the counts of the other players
  // stay 0 in a one-player run, so the whole array is player 1's.
  for (const count of world.weapons.liveCounts) total += count;
  return total;
}

describe.skipIf(updating)('golden replays: the autofire modes (M2-16 tests)', () => {
  it('lists both runs with the fire-button pilots', () => {
    const toggle = GOLDEN_SCENARIOS.find((s) => s.name === 'zone-a-manta-toggle');
    const hold = GOLDEN_SCENARIOS.find((s) => s.name === 'zone-a-hold');
    expect(toggle).toMatchObject({ bot: 'toggler', godMode: true });
    expect(hold).toMatchObject({ bot: 'burster', godMode: true });
    expect([fireButtonBot('tap').name, fireButtonBot('burst').name]).toEqual([
      'toggler',
      'burster',
    ]);
  });

  it('record the mode (and remote mode off) in the header and clear the stage', () => {
    const toggle = readGolden('zone-a-manta-toggle');
    expect(toggle.replay.header.config).toMatchObject({
      autofire: true,
      autofireMode: 'toggle',
      remoteMode: false,
      shipId: 'manta',
      powerUpMode: 'direct',
    });
    expect(toggle.file.expected).toMatchObject({ status: 'stageClear', bossDefeated: true });
    const hold = readGolden('zone-a-hold');
    expect(hold.replay.header.config).toMatchObject({
      autofire: true,
      autofireMode: 'hold',
      autofireInterval: 2,
      remoteMode: false,
    });
    expect(hold.file.expected).toMatchObject({ status: 'stageClear', bossDefeated: true });
    // Every other golden replay plays the default mode.
    for (const scenario of GOLDEN_SCENARIOS) {
      if (scenario.name === 'zone-a-manta-toggle' || scenario.name === 'zone-a-hold') continue;
      expect(readGolden(scenario.name).replay.header.config.autofireMode, scenario.name).toBe(
        'always',
      );
    }
  });

  it('the recorded inputs carry the fire button the way the pilots press it', () => {
    const toggle = readGolden('zone-a-manta-toggle').replay;
    const shotPresses: number[] = [];
    for (let t = 0; t < toggle.ticks; t++) {
      if (((toggle.inputs[0][t] >>> 16) & Action.Shot) !== 0) shotPresses.push(t);
    }
    expect(shotPresses.length).toBeGreaterThanOrEqual(4);
    for (const tick of shotPresses) expect(tick % TOGGLE_TAP_TICKS).toBe(0);
    const hold = readGolden('zone-a-hold').replay;
    for (let t = 0; t < hold.ticks; t++) {
      const held = hold.inputs[0][t] & 0xffff;
      const firing = t % BURST_CYCLE_TICKS < BURST_CYCLE_TICKS / 2;
      expect((held & (Action.Shot | Action.Sub)) !== 0, String(t)).toBe(firing);
    }
  });

  it('the toggle run flips the firing switch on each tap and shoots only while it is on', () => {
    const { replay } = readGolden('zone-a-manta-toggle');
    const switches: number[] = [];
    let offTicks = 0;
    let shotsWhileOff = 0;
    let previous = -1;
    let previousShots = 0;
    playGolden(replay, undefined, (world) => {
      const on = world.weapons.firing[0];
      if (on !== previous) switches.push(on);
      previous = on;
      const shots = liveShots(world);
      // A count that grows while the switch is off would be a shot fired with firing off.
      if (on === 0) {
        offTicks++;
        if (shots > previousShots) shotsWhileOff++;
      }
      previousShots = shots;
    });
    // On at the start, then off / on alternately.
    expect(switches.length).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < switches.length; i++) expect(switches[i]).toBe(i % 2 === 0 ? 1 : 0);
    expect(offTicks).toBeGreaterThan(TOGGLE_TAP_TICKS);
    expect(shotsWhileOff).toBe(0);
  });

  it('the hold run launches shots only while SHOT is held', () => {
    const { replay } = readGolden('zone-a-hold');
    let launchedWhileReleased = 0;
    let launchedWhileHeld = 0;
    let previousShots = 0;
    playGolden(replay, undefined, (world) => {
      const t = world.tick - 1; // the tick just stepped
      const held = (replay.inputs[0][t] & Action.Shot) !== 0;
      const shots = liveShots(world);
      if (shots > previousShots) {
        if (held) launchedWhileHeld++;
        else launchedWhileReleased++;
      }
      previousShots = shots;
    });
    expect(launchedWhileHeld).toBeGreaterThan(10);
    expect(launchedWhileReleased).toBe(0);
  });

  it('play back only under their own mode: the same inputs under ALWAYS desync', () => {
    for (const name of ['zone-a-manta-toggle', 'zone-a-hold']) {
      const { replay } = readGolden(name);
      const own = playGolden(withMode(replay, replay.header.config.autofireMode));
      expect(own.report, name).toMatchObject({ ok: true, finished: true });
      const always = playGolden(withMode(replay, 'always'));
      expect(always.report.ok, name).toBe(false);
      expect(always.report.desyncTick, name).toBeGreaterThan(0);
    }
    // A default golden runs in remote mode, which forces autofire always on: HOLD in its header
    // changes nothing (every hash still matches) and under TOGGLE the run plays the same (its
    // switch, mixed into the hash in that mode, never flips) …
    const plain = readGolden('zone-a-boss');
    expect(plain.replay.header.config.remoteMode).toBe(true);
    expect(playGolden(withMode(plain.replay, 'hold')).report).toMatchObject({
      ok: true,
      finished: true,
    });
    let flipped = false;
    const toggled = playGolden(withMode(plain.replay, 'toggle'), undefined, (world) => {
      if (world.weapons.firing[0] !== 1) flipped = true;
    });
    expect(flipped).toBe(false);
    expect(toggled.outcome).toEqual(plain.file.expected);
    // … while without remote mode HOLD stops the fire of a pilot that never presses SHOT.
    const desk: Replay = {
      ...plain.replay,
      header: {
        ...plain.replay.header,
        config: { ...plain.replay.header.config, remoteMode: false, autofireMode: 'hold' },
      },
    };
    expect(playGolden(desk).report.ok).toBe(false);
  });
});
