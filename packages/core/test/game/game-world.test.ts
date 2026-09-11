/**
 * The World as hosted by `createGame` (plan M1-06): one `stepWorld` per game tick through
 * `step()` and the fixed-step `frame()` (including the per-frame tick cap), nothing while paused
 * or suspended, input read from the platform's poll, the render frame pointing at the World's
 * live view, sessions reproducible from the seed and inputs (equal `hashWorld` after 5,000
 * ticks), and the whole per-frame path — `frame(now)` → poll → `stepWorld` → `renderFrame()` —
 * inside the allocation budget.
 */
import { describe, expect, it } from 'vitest';
import { hashWorld } from '../../src/debug/index.js';
import { createGame, type Game } from '../../src/game/index.js';
import { Action, commitPlayerInput } from '../../src/input/index.js';
import { createHeadlessPlatform, type HeadlessPlatform } from '../../src/platform/index.js';
import { createRng } from '../../src/rng/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

const STEP = 1000 / 60;

/**
 * A game on a headless platform.
 *
 * @param seed - Config seed.
 * @returns The game and its platform.
 */
function headlessGame(seed = 1): { game: Game; platform: HeadlessPlatform } {
  const platform = createHeadlessPlatform();
  return { game: createGame(platform, { seed }), platform };
}

describe('core/game hosting the World', () => {
  it('frame(now) runs one world tick per elapsed 1/60 s, capped per frame', () => {
    const { game } = headlessGame();
    game.frame(0);
    for (let f = 1; f <= 30; f++) game.frame(f * STEP);
    expect([game.state.tick, game.world.tick]).toEqual([30, 30]);
    // A long stall runs at most maxTicksPerFrame ticks, and the world matches the game.
    const ran = game.frame(30 * STEP + 10_000);
    expect(ran).toBe(game.config.maxTicksPerFrame);
    expect(game.world.tick).toBe(game.state.tick);
  });

  it('does not advance the world while paused or suspended, and resumes without a burst', () => {
    const { game, platform } = headlessGame();
    game.frame(0);
    for (let f = 1; f <= 10; f++) game.frame(f * STEP);
    platform.suspend();
    for (let f = 11; f <= 100; f++) game.frame(f * STEP);
    expect(game.world.tick).toBe(10);
    platform.resume();
    game.frame(101 * STEP);
    game.frame(102 * STEP);
    expect(game.world.tick).toBeLessThanOrEqual(12);
    game.pause();
    const frozen = game.world.tick;
    game.step();
    game.frame(200 * STEP);
    expect(game.world.tick).toBe(frozen);
    game.resume();
    game.step();
    expect(game.world.tick).toBe(frozen + 1);
  });

  it('feeds the polled snapshot to the world (intents follow the platform input)', () => {
    const { game, platform } = headlessGame();
    commitPlayerInput(platform.snapshot.players[0], Action.Up | Action.Left);
    platform.snapshot.players[0].device = 'remote';
    game.step();
    expect(game.state.input).toBe(platform.snapshot);
    expect(game.world.intents[0]).toMatchObject({
      held: Action.Up | Action.Left,
      moveX: -1,
      moveY: -1,
      device: 'remote',
    });
    expect(game.world.players[0].device).toBe('remote');
  });

  it("renders the World's live view, the same object every frame", () => {
    const { game } = headlessGame();
    const first = game.renderFrame();
    for (let i = 0; i < 45; i++) game.step();
    const frame = game.renderFrame();
    expect(frame).toBe(first);
    expect(frame.world).toBe(game.world.view);
    expect(frame.tick).toBe(45);
    expect(frame.world?.camera).toBe(game.world.camera);
  });

  it('reproduces a session from its seed and inputs: equal hashWorld after 5,000 ticks', () => {
    /**
     * Plays a scripted session.
     *
     * @param seed - Game seed.
     * @returns The final world hash.
     */
    const play = (seed: number): number => {
      const { game, platform } = headlessGame(seed);
      const script = createRng(1234);
      let now = 0;
      game.frame(now);
      while (game.state.tick < 5000) {
        commitPlayerInput(platform.snapshot.players[0], script.rangeInt(0, 0xff));
        // Irregular frame times (0–3 ticks per frame): the tick sequence is what matters.
        now += STEP * script.rangeInt(0, 3);
        game.frame(now);
      }
      expect(game.world.tick).toBe(game.state.tick); // the tick counter is part of the hash
      return hashWorld(game.world);
    };
    const a = play(11);
    expect(play(11)).toBe(a);
    expect(play(12)).not.toBe(a);
  });

  it('frame(now) → poll → stepWorld → renderFrame stays within the allocation budget', () => {
    const { game, platform } = headlessGame(5);
    const masks = [Action.Right, Action.Right | Action.Up, 0, Action.Down | Action.Left];
    // The rAF clock lives in a typed array: a fractional number kept in a closure variable
    // would itself allocate on every frame (the test's own cost, not the game's).
    const clock = new Float64Array(1);
    game.frame(0);
    let alpha = 0;
    const growth = measureHeapGrowth(
      (i) => {
        commitPlayerInput(platform.snapshot.players[0], masks[(i >> 4) & 3]);
        clock[0] += STEP;
        game.frame(clock[0]);
        alpha += game.renderFrame().alpha;
      },
      10_000,
      20_000,
    );
    expect(game.state.tick).toBeGreaterThan(29_000);
    expect(alpha).toBeGreaterThanOrEqual(0);
    // Regression: the loop's closure-held accumulator allocated ~32 B per frame (≈ 320 KB here).
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });
});
