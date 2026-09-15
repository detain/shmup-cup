/**
 * Allocation guard of the M2-15 mode-select screens (definition of done: zero allocations per
 * tick and per frame), in its own file: the practice select answering the four directions (ZONE,
 * CHECKPOINT and LOADOUT stepping, CHECKPOINT kept within the zone's), and the sound test choosing
 * and playing tracks and sounds (its `SoundTest` / `Sfx` events pushed, the OK mask applied) — the
 * frame composed every tick. Neither screen is left inside a window (a transition may allocate).
 */
import { describe, expect, it } from 'vitest';
import { createGame, type Game } from '../../src/game/index.js';
import { Action, commitPlayerInput } from '../../src/input/index.js';
import { createHeadlessPlatform, type HeadlessPlatform } from '../../src/platform/index.js';
import { SoundTestItem, type SceneFlow } from '../../src/scenes/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';
import { frontEndContent } from '../helpers/front-end.js';

/** Iterations of every window (and the warm-up). */
const ITERATIONS = 20_000;

/**
 * A session on the title, the mode select open.
 *
 * @returns The game, its flow and platform.
 */
function session(): { game: Game; flow: SceneFlow; platform: HeadlessPlatform } {
  const platform = createHeadlessPlatform();
  const db = frontEndContent({
    demos: false,
    checkpoints: { 't-s': [0, 50, 100], 't-u': [0, 40, 80, 120], 't-l': [0] },
  }).db;
  const game = createGame(platform, { seed: 5, stage: 't-s' }, db, {
    scenes: 'title',
    soundTest: { music: ['ONE', 'TWO', 'THREE'] },
  });
  return { game, flow: game.scenes!, platform };
}

/**
 * Taps an action (a tick down, a tick up), then two idle ticks.
 *
 * @param game - The game.
 * @param platform - Its platform.
 * @param action - The action.
 */
function tap(game: Game, platform: HeadlessPlatform, action: number): void {
  const player = platform.snapshot.players[0];
  commitPlayerInput(player, action);
  game.step();
  for (let t = 0; t < 3; t++) {
    commitPlayerInput(player, 0);
    game.step();
  }
  game.events.clear();
}

describe('core/scenes mode-select screens allocation (M2-15)', () => {
  it('steps the practice select`s rows without allocating', () => {
    const { game, flow, platform } = session();
    tap(game, platform, Action.Confirm); // PRESS OK
    tap(game, platform, Action.Down);
    tap(game, platform, Action.Down); // PRACTICE
    tap(game, platform, Action.Confirm);
    expect(flow.stack.top?.id).toBe('practice');
    const practice = flow.practiceSelect;
    const player = platform.snapshot.players[0];
    // Right / Left on ZONE, CHECKPOINT and LOADOUT; Down / Up between them (never START's OK).
    const keys = [
      Action.Right,
      Action.Down,
      Action.Left,
      Action.Left,
      Action.Down,
      Action.Right,
      Action.Up,
      Action.Right,
      Action.Up,
      Action.Left,
    ];
    const growth = measureHeapGrowth(
      (i) => {
        const phase = i % 20;
        commitPlayerInput(player, phase === 0 ? keys[Math.floor(i / 20) % keys.length] : 0);
        game.step();
        game.renderFrame();
        game.events.clear();
      },
      ITERATIONS,
      ITERATIONS,
    );
    expect(flow.stack.top?.id).toBe('practice');
    expect(practice.checkpoint.index).toBeLessThanOrEqual(
      practice.checkpoints[practice.zone.index].length,
    );
    expect(growth.bytes).toBeLessThan(32 * 1024);
  }, 60_000);

  it('chooses and plays the sound test`s tracks and sounds without allocating', () => {
    const { game, flow, platform } = session();
    tap(game, platform, Action.Confirm); // PRESS OK
    for (let i = 0; i < 4; i++) tap(game, platform, Action.Down); // SOUND TEST
    tap(game, platform, Action.Confirm);
    expect(flow.stack.top?.id).toBe('soundTest');
    const test = flow.soundTest;
    expect(test.menu.focus).toBe(SoundTestItem.Music);
    const player = platform.snapshot.players[0];
    // Always back on MUSIC or SFX: OK there plays (STOP / BACK would act or close).
    const keys = [
      Action.Right,
      Action.Confirm,
      Action.Down,
      Action.Right,
      Action.Confirm,
      Action.Up,
      Action.Left,
      Action.Confirm,
    ];
    let played = 0;
    const growth = measureHeapGrowth(
      (i) => {
        const phase = i % 20;
        commitPlayerInput(player, phase === 0 ? keys[Math.floor(i / 20) % keys.length] : 0);
        game.step();
        game.renderFrame();
        played += game.events.length;
        game.events.clear();
      },
      ITERATIONS,
      ITERATIONS,
    );
    expect(flow.stack.top?.id).toBe('soundTest');
    expect(played).toBeGreaterThan(0);
    expect(growth.bytes).toBeLessThan(32 * 1024);
  }, 60_000);
});
