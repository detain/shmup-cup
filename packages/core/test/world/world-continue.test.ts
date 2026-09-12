/**
 * Continues in the World (plan M2-01, shmup_feat.md §10): `canContinue` only once the game is over
 * with continues left; `continueWorld` gives every active ship its starting lives back, takes its
 * power (then the starting loadout), writes the continue into the score's last digit, restarts the
 * stage at its last checkpoint (stage theme queued again) or clears free flight, flies the ships
 * in and resumes play — deterministically: two sessions fed the same input and continued on the
 * same tick stay in lockstep.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { SimEventKind } from '../../src/events/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { grantShield } from '../../src/shields/index.js';
import { MainWeapon } from '../../src/weapons/index.js';
import {
  ENGINE_SPRITES,
  canContinue,
  continueWorld,
  createWorld,
  stepWorld,
  type World,
} from '../../src/world/index.js';

/**
 * A shipped content file.
 *
 * @param path - Path below `content/`.
 * @returns The file.
 */
function shipped(path: string): ContentFile {
  return {
    path,
    data: JSON.parse(
      readFileSync(new URL('../../../../content/' + path, import.meta.url), 'utf8'),
    ) as unknown,
  };
}

const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      'player/kestrel.player.json',
      'weapons/type-a.weapons.json',
      'tilesets/terrain-a.tileset.json',
      'enemies/test-range.enemies.json',
      'paths/test-range.paths.json',
      'stages/test-range.stage.json',
    ].map(shipped),
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

/**
 * Steps a World with no input.
 *
 * @param w - The World.
 * @param ticks - Ticks.
 */
function run(w: World, ticks: number): void {
  const input = createInputSnapshot();
  for (let i = 0; i < ticks; i++) stepWorld(w, input);
}

/**
 * A World whose game is over: every life lost (the ship out), status `gameOver`.
 *
 * @param overrides - Config overrides.
 * @returns The World.
 */
function overWorld(overrides: Partial<GameConfig> = {}): World {
  const w = createWorld(resolveGameConfig({ seed: 3, stage: 'test-range', ...overrides }), DB);
  run(w, 45);
  const ship = w.players[0];
  ship.state = 'dead';
  ship.stateTicks = 1000;
  ship.lives = 0;
  run(w, 1);
  expect(w.status).toBe('gameOver');
  return w;
}

describe('core/world continues (M2-01)', () => {
  it('can continue only after a game over with continues left', () => {
    const playing = createWorld(resolveGameConfig({ stage: 'test-range' }), DB);
    expect(canContinue(playing)).toBe(false);
    expect(continueWorld(playing)).toBe(false);
    const w = overWorld(); // Normal: 3 continues
    expect(canContinue(w)).toBe(true);
    const none = overWorld({ continues: 0 });
    expect(canContinue(none)).toBe(false);
    expect(continueWorld(none)).toBe(false);
    expect(none.status).toBe('gameOver');
  });

  it('restarts at the last checkpoint with fresh lives, no power and the continue digit', () => {
    const w = overWorld();
    const stage = w.stage!;
    stage.jumpTo(1600); // past the checkpoint at 1500
    expect(stage.checkpoint).toBe(1);
    w.status = 'gameOver';
    const ship = w.players[0];
    const loadout = w.weapons.loadouts[0];
    loadout.main = MainWeapon.Laser;
    loadout.options = 3;
    ship.speedLevel = 2;
    grantShield(ship.shield);
    w.powerups.meters[0].cursor = 4;
    w.scoring.board.scores[0].score = 12_340;
    w.events.clear();
    expect(continueWorld(w)).toBe(true);
    expect(w.status).toBe('playing');
    expect(w.continuesUsed).toBe(1);
    expect(ship.lives).toBe(3);
    expect(ship.state).toBe('respawning');
    expect([loadout.main, loadout.missile, loadout.options, ship.speedLevel]).toEqual([
      MainWeapon.Basic,
      false,
      0,
      0,
    ]);
    expect(ship.shield.hits).toBe(0);
    expect(w.powerups.meters[0].cursor).toBe(-1);
    expect(w.scoring.board.scores[0].score).toBe(12_341);
    expect(w.camera.x).toBe(1500);
    expect(w.rank).toBe(2);
    const music: number[] = [];
    w.events.drain((e) => {
      if (e.kind === SimEventKind.Music) music.push(e.id);
    });
    expect(music).toEqual([DB.stages[DB.stageIndex.get('test-range')!].music.stageId]);
    // The game goes on: the ship flies in and plays.
    run(w, 60);
    expect([w.status, ship.state]).toEqual(['playing', 'alive']);
  });

  it('counts every continue until none are left; the full loadout comes back', () => {
    const w = overWorld({ continues: 2, loadout: 'full' });
    expect(continueWorld(w)).toBe(true);
    expect(w.weapons.loadouts[0].options).toBe(4);
    expect(w.rank).toBe(14);
    w.status = 'gameOver';
    expect(continueWorld(w)).toBe(true);
    expect(w.scoring.board.scores[0].score % 10).toBe(2);
    w.status = 'gameOver';
    expect(canContinue(w)).toBe(false);
    expect(continueWorld(w)).toBe(false);
  });

  it('clears free flight (no stage) and flies the ship in', () => {
    const w = createWorld(resolveGameConfig({ seed: 3 }), DB);
    run(w, 45);
    w.players[0].state = 'dead';
    w.players[0].stateTicks = 1000;
    w.players[0].lives = 0;
    run(w, 1);
    expect(continueWorld(w)).toBe(true);
    expect([w.status, w.players[0].state, w.players[0].lives]).toEqual([
      'playing',
      'respawning',
      3,
    ]);
  });

  it('stays in lockstep: the same input and a continue on the same tick', () => {
    const play = (): number => {
      const w = overWorld();
      continueWorld(w);
      const input = createInputSnapshot();
      for (let t = 0; t < 300; t++) {
        commitPlayerInput(input.players[0], t % 60 < 30 ? Action.Up : Action.Down);
        stepWorld(w, input);
      }
      return hashWorld(w);
    };
    expect(play()).toBe(play());
    // The continue is part of the hashed state.
    const a = overWorld();
    const b = overWorld();
    continueWorld(a);
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});
