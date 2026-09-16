/**
 * `Game.setVsyncLock` (plan M3-02b): the host asks for the loop's vsync lock once its refresh probe
 * reads a fixed ~60 Hz display, and the game suspends it while a debug timing switch feeds the loop
 * a slowed clock (frame advance, slow motion, the game-speed assist) — those need the free-running
 * accumulator.
 */
import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/game/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';

/** One 60 Hz step in ms. */
const STEP = 1000 / 60;

describe('core/game vsync lock', () => {
  it('is off until the host asks, then runs one tick per frame through rAF jitter', () => {
    const game = createGame(createHeadlessPlatform());
    expect(game.vsyncLock).toBe(false);
    game.setVsyncLock(true);
    expect(game.vsyncLock).toBe(true);
    let t = 5000;
    game.frame(t);
    const deltas = [12, 21.3, 12.4, 20.9, 16.7, 13.1, 20.2];
    for (const delta of deltas) {
      t += delta;
      expect(game.frame(t)).toBe(1);
    }
    expect(game.state.tick).toBe(deltas.length);
    expect(game.renderFrame().alpha).toBe(0);
  });

  it('is suspended while slow motion runs, and restored when it ends', () => {
    const game = createGame(createHeadlessPlatform());
    game.setVsyncLock(true);
    let t = 0;
    game.frame(t);
    t += STEP;
    game.frame(t);
    const locked = game.state.tick;
    game.debug.slowMo = 4;
    // A quarter-speed clock: four frames per tick, which the lock would have run as four ticks.
    // The switch resets the loop, so the first frame of the new mode only records the clock.
    for (let i = 0; i < 17; i++) {
      t += STEP;
      game.frame(t);
    }
    // Roughly four frames per tick, not one tick per frame: the lock is suspended.
    expect(game.state.tick - locked).toBe(3);
    expect(game.vsyncLock).toBe(true); // still asked for
    game.debug.slowMo = 1;
    const slowed = game.state.tick;
    for (let i = 0; i < 4; i++) {
      t += STEP;
      game.frame(t);
    }
    // Back on the lock: one tick per frame (the first frame after the switch resets the clock).
    expect(game.state.tick - slowed).toBe(3);
  });

  it('runs nothing while suspended and never bursts on resume', () => {
    const platform = createHeadlessPlatform();
    const game = createGame(platform);
    game.setVsyncLock(true);
    game.frame(0);
    game.frame(STEP);
    expect(game.state.tick).toBe(1);
    platform.suspend();
    expect(game.frame(10_000)).toBe(0);
    platform.resume();
    expect(game.frame(20_000)).toBe(0); // the first frame after the reset only records the clock
    expect(game.frame(20_000 + STEP)).toBe(1);
    expect(game.state.tick).toBe(2);
  });
});
