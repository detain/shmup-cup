/**
 * Edge cases of createGame: polling discipline, render-frame reuse, pause/suspend
 * interplay, config validation and determinism of the (still empty) simulation.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONFIG } from '../../src/config/index.js';
import { DEFAULT_EVENT_QUEUE_CAPACITY, SimEventKind } from '../../src/events/index.js';
import { createGame } from '../../src/game/index.js';
import { Action, commitPlayerInput } from '../../src/input/index.js';
import { createHeadlessPlatform, type HeadlessPlatform } from '../../src/platform/index.js';

const STEP = 1000 / 60;

/**
 * Wraps a headless platform so every `input.poll()` is counted.
 *
 * @returns The platform and a poll counter.
 */
function countingPlatform(): { platform: HeadlessPlatform; polls: () => number } {
  const base = createHeadlessPlatform();
  let polls = 0;
  const platform: HeadlessPlatform = {
    ...base,
    input: {
      poll: () => {
        polls++;
        return base.input.poll();
      },
    },
  };
  return { platform, polls: () => polls };
}

describe('core/game edge cases', () => {
  it('starts idle: tick 0, no input yet, not paused or suspended, default config', () => {
    const game = createGame(createHeadlessPlatform());
    expect(game.state).toEqual({ tick: 0, paused: false, suspended: false, input: null });
    expect(game.config).toEqual(DEFAULT_GAME_CONFIG);
    const frame = game.renderFrame();
    expect([frame.tick, frame.alpha, frame.world]).toEqual([0, 0, game.world.view]);
    expect(frame.world).toBe(game.world.view);
    expect(game.events).toBe(game.world.events);
    expect(frame.screen).toEqual({ shakeX: 0, shakeY: 0, flash: 0, dim: 0 });
    expect([frame.hud.count, frame.ui.count]).toEqual([0, 0]);
    expect(frame.hud).not.toBe(frame.ui);
  });

  it('polls input exactly once per tick — never while frozen', () => {
    const { platform, polls } = countingPlatform();
    const game = createGame(platform);
    game.frame(0);
    expect(polls()).toBe(0);
    game.frame(3 * STEP); // one frame, three due ticks
    expect(game.state.tick).toBe(3);
    expect(polls()).toBe(3);
    game.pause();
    game.step();
    game.frame(10 * STEP);
    expect(polls()).toBe(3);
  });

  it('caps catch-up at maxTicksPerFrame', () => {
    const game = createGame(createHeadlessPlatform(), { maxTicksPerFrame: 2 });
    game.frame(0);
    expect(game.frame(1000)).toBe(2);
    expect(game.state.tick).toBe(2);
  });

  it('step() advances exactly one tick regardless of wall time', () => {
    const game = createGame(createHeadlessPlatform());
    for (let i = 0; i < 5; i++) game.step();
    expect(game.state.tick).toBe(5);
  });

  it('renderFrame() reuses one object and reports alpha 0 while frozen', () => {
    const game = createGame(createHeadlessPlatform());
    game.frame(0);
    game.frame(STEP * 1.5 + 3); // leaves a partial step for interpolation
    const first = game.renderFrame();
    expect(first.alpha).toBeGreaterThan(0);
    expect(first.alpha).toBeLessThan(1);
    game.pause();
    const second = game.renderFrame();
    expect(second).toBe(first);
    expect(second.alpha).toBe(0);
    expect(second.tick).toBe(game.state.tick);
    expect(second.hud).toBe(first.hud);
  });

  it('owns an event queue for presentation events; ticking does not touch it yet', () => {
    const game = createGame(createHeadlessPlatform());
    expect(game.events.capacity).toBe(DEFAULT_EVENT_QUEUE_CAPACITY);
    for (let i = 0; i < 10; i++) game.step();
    expect(game.events.length).toBe(0);
    game.events.push(SimEventKind.Shake, 0, 0, 0, 2);
    const seen: number[] = [];
    game.events.drain((event) => seen.push(event.param));
    expect(seen).toEqual([2]);
  });

  it('resume() after a user pause re-anchors time (no catch-up burst)', () => {
    const game = createGame(createHeadlessPlatform());
    game.frame(0);
    game.frame(STEP);
    game.pause();
    expect(game.frame(60_000)).toBe(0);
    game.resume();
    expect(game.frame(120_000)).toBe(0);
    expect(game.frame(120_000 + STEP)).toBe(1);
    expect(game.state.tick).toBe(2);
  });

  it('stays frozen while suspended even if the user un-pauses meanwhile', () => {
    const platform = createHeadlessPlatform();
    const game = createGame(platform);
    game.pause();
    platform.suspend();
    game.resume();
    game.step();
    expect(game.state.tick).toBe(0);
    expect(game.state.suspended).toBe(true);
    platform.resume();
    game.step();
    expect(game.state.tick).toBe(1);
  });

  it('exposes the input of the latest tick', () => {
    const platform = createHeadlessPlatform();
    const game = createGame(platform);
    commitPlayerInput(platform.snapshot.players[0], Action.Up | Action.Shot);
    game.step();
    expect(game.state.input?.players[0]?.held).toBe(Action.Up | Action.Shot);
  });

  it('rejects an invalid config before touching the platform', () => {
    const platform = createHeadlessPlatform();
    let registered = 0;
    const spy = {
      ...platform,
      lifecycle: {
        onSuspend: () => {
          registered++;
        },
        onResume: () => {
          registered++;
        },
      },
    };
    expect(() => createGame(spy, { tickRate: 0 })).toThrow(RangeError);
    expect(registered).toBe(0);
  });

  it('registers exactly one suspend and one resume callback per game', () => {
    const platform = createHeadlessPlatform();
    const kinds: string[] = [];
    createGame({
      ...platform,
      lifecycle: {
        onSuspend: () => kinds.push('suspend'),
        onResume: () => kinds.push('resume'),
      },
    });
    expect(kinds.sort()).toEqual(['resume', 'suspend']);
  });

  it('is deterministic: identical frame timestamps give identical tick counts', () => {
    const run = (): number[] => {
      const game = createGame(createHeadlessPlatform());
      const ticks: number[] = [];
      let t = 0;
      game.frame(t);
      for (let i = 0; i < 500; i++) {
        t += 16 + ((i * 7) % 5) * 0.3; // deterministic jitter
        game.frame(t);
        ticks.push(game.state.tick);
      }
      return ticks;
    };
    expect(run()).toEqual(run());
  });

  it('runs at a custom tick rate', () => {
    const game = createGame(createHeadlessPlatform(), { tickRate: 30 });
    game.frame(0);
    for (let i = 1; i <= 30; i++) game.frame(i * (1000 / 30));
    expect(game.state.tick).toBe(30);
  });
});
