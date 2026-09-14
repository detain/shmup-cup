/**
 * Allocation guard of the M2-14 ending screens and credits (definition of done: zero allocations
 * per tick and per frame), in its own file: once a campaign run reaches its ending, the citadel's
 * scene (the dawn, the chained blasts, the ship) and then the deep's (the surface, the bubbles, the
 * flagship sinking) play with their epilogue — the UI list rebuilt every other tick — and then the
 * credits scroll, with the render frame composed every tick. The scenes are held in place by
 * rewinding their clocks now and then (plain number writes), so nothing moves on to the title.
 */
import { describe, expect, it } from 'vitest';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { createGame, type Game } from '../../src/game/index.js';
import { Action, commitPlayerInput } from '../../src/input/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';
import { RunFlag, type SceneFlow } from '../../src/scenes/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';
import { shipped, stage } from '../helpers/campaign.js';

/** S → U (the citadel's ending) | L (the deep's), with epilogues and credits. */
const CAMPAIGN: ContentFile = {
  path: 'campaign/test.campaign.json',
  data: {
    formatVersion: 1,
    kind: 'campaign',
    id: 'test',
    start: 's',
    zones: [
      { id: 's', label: 'S', name: 'START ZONE', stage: 't-s' },
      { id: 'u', label: 'U', name: 'UPPER ZONE', stage: 't-u' },
      { id: 'l', label: 'L', name: 'LOWER ZONE', stage: 't-l' },
    ],
    edges: [
      { from: 's', to: 'u' },
      { from: 's', to: 'l' },
    ],
    endings: [
      { id: 'u', name: 'UPPER', zone: 'u', scene: 'citadel', text: ['ONE.', 'TWO.', 'THREE.'] },
      { id: 'l', name: 'LOWER', zone: 'l', scene: 'abyss', text: ['DEEP.', 'DOWN.'] },
    ],
    credits: [
      { title: 'A', lines: ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'] },
      { title: 'N', lines: ['O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'] },
    ],
  },
};

/**
 * The content.
 *
 * @returns The DB.
 */
function content(): ContentDb {
  const music = { stage: 'Stage', boss: 'Boss', ending: 'Ending', credits: 'Credits' };
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      CAMPAIGN,
      stage('t-s'),
      stage('t-u', { music }),
      stage('t-l', { music }),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
}

/**
 * Plays a run to a final zone's ending.
 *
 * @param down - Take the lower exit (the deep's ending).
 * @returns The game, on its ending.
 */
function toEnding(down: boolean): Game {
  const platform = createHeadlessPlatform();
  const game = createGame(platform, { seed: 1, stage: 't-s' }, content(), { scenes: 'game' });
  game.debug.godMode = true;
  const flow = game.scenes as SceneFlow;
  const player = platform.snapshot.players[0];
  const step = (held: number): void => {
    commitPlayerInput(player, held);
    game.step();
    game.events.clear();
  };
  const until = (id: string): void => {
    for (let i = 0; i < 3000 && flow.stack.top?.id !== id; i++) step(0);
    expect(flow.stack.top?.id).toBe(id);
  };
  until('stageClear');
  step(Action.Confirm);
  until('map');
  for (let i = 0; i < 3; i++) step(0);
  if (down) {
    step(Action.Down);
    step(0);
  }
  step(Action.Confirm);
  until('game');
  until('stageClear');
  step(Action.Confirm);
  step(0);
  expect(flow.stack.top?.id).toBe('ending');
  return game;
}

describe('core/scenes ending and credits allocation (M2-14)', () => {
  it.each([false, true])('plays an ending scene without allocating (the deep: %s)', (down) => {
    const game = toEnding(down);
    const flow = game.scenes as SceneFlow;
    const ending = flow.ending;
    expect(flow.run.endingFlags & RunFlag.NoDeath).toBe(RunFlag.NoDeath); // the dawn too
    let t = 0;
    const growth = measureHeapGrowth(
      () => {
        t++;
        // Rewind the story now and then: the scene plays, the lines come, nothing moves on.
        if (ending.phaseTicks > 500) {
          ending.phaseTicks = 0;
          ending.shown = 0;
          ending.ticks = 70 + (t % 400);
        }
        game.step();
        game.renderFrame();
        game.events.clear();
      },
      20_000,
      20_000,
    );
    expect(flow.stack.top?.id).toBe('ending');
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });

  it('scrolls the credits without allocating', () => {
    const game = toEnding(false);
    const flow = game.scenes as SceneFlow;
    flow.stack.reset(flow.credits);
    game.step();
    const credits = flow.credits;
    const growth = measureHeapGrowth(
      () => {
        if (credits.stopped) credits.ticks = 0;
        game.step();
        game.renderFrame();
        game.events.clear();
      },
      20_000,
      20_000,
    );
    expect(flow.stack.top?.id).toBe('credits');
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });
});
