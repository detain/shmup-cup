import { describe, expect, it } from 'vitest';
import { Action, commitPlayerInput } from '../../src/input/index.js';
import { createGame, moduleInfo } from '../../src/game/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';

const STEP = 1000 / 60;

describe('core/game createGame', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('game');
  });

  it('runs one tick per 60 Hz frame and polls input each tick', () => {
    const platform = createHeadlessPlatform();
    commitPlayerInput(platform.snapshot.players[0], Action.Shot);
    const game = createGame(platform);
    game.frame(0);
    for (let i = 1; i <= 60; i++) game.frame(i * STEP);
    expect(game.state.tick).toBe(60);
    expect(game.state.input).toBe(platform.snapshot);
    expect(game.renderFrame().tick).toBe(60);
  });

  it('freezes while suspended and does not catch up after resume', () => {
    const platform = createHeadlessPlatform();
    const game = createGame(platform);
    game.frame(0);
    game.frame(STEP);
    expect(game.state.tick).toBe(1);

    platform.suspend();
    expect(game.frame(10 * STEP)).toBe(0);
    game.step();
    expect(game.state.tick).toBe(1);

    platform.resume();
    expect(game.frame(5000)).toBe(0); // first frame after resume only re-anchors time
    expect(game.frame(5000 + STEP)).toBe(1);
    expect(game.state.tick).toBe(2);
  });

  it('a user pause survives suspend/resume', () => {
    const platform = createHeadlessPlatform();
    const game = createGame(platform);
    game.pause();
    platform.suspend();
    platform.resume();
    game.step();
    expect(game.state.paused).toBe(true);
    expect(game.state.tick).toBe(0);
    game.resume();
    game.step();
    expect(game.state.tick).toBe(1);
  });

  it('applies config overrides', () => {
    const game = createGame(createHeadlessPlatform(), { tickRate: 30 });
    expect(game.config.tickRate).toBe(30);
  });
});
