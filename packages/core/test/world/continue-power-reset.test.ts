/**
 * R2 (v20x-TL TL-2): `applyContinuePowerReset` — the game's own continue rule for a World that was
 * never played to a game over (the checkpoint resume's R1 start). Lives, power and the continue
 * digit go exactly as `continueWorld` does them; the stage does NOT restart (the resumed World is
 * already born at its checkpoint) and the ships do not respawn twice (they are flying in already).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { grantShield } from '../../src/shields/index.js';
import { MainWeapon } from '../../src/weapons/index.js';
import {
  ENGINE_SPRITES,
  applyContinuePowerReset,
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

describe('core/world applyContinuePowerReset (R2 TL-2)', () => {
  it('takes the continue on a live World: lives, power, digit, count — stage and ship untouched', () => {
    const w = createWorld(resolveGameConfig({ seed: 3, stage: 'test-range' }), DB);
    run(w, 45);
    const ship = w.players[0];
    const loadout = w.weapons.loadouts[0];
    // A powered-up, partly spent ship in play (what a kill mid-zone looks like).
    ship.lives = 2;
    loadout.main = MainWeapon.Laser;
    loadout.options = 3;
    ship.speedLevel = 2;
    grantShield(ship.shield);
    w.powerups.meters[0].cursor = 4;
    w.scoring.board.scores[0].score = 12_340;
    const cameraX = w.camera.x;
    expect(applyContinuePowerReset(w)).toBe(true);
    // The continue rule, exactly as `continueWorld` spends it on its chosen players.
    expect(w.continuesUsed).toBe(1);
    expect(ship.lives).toBe(w.config.startingLives);
    expect([loadout.main, loadout.missile, loadout.options, ship.speedLevel]).toEqual([
      MainWeapon.Basic,
      false,
      0,
      0,
    ]);
    expect(ship.shield.hits).toBe(0);
    expect(w.powerups.meters[0].cursor).toBe(-1);
    expect(w.scoring.board.scores[0].score).toBe(12_341);
    // But no stage restart and no second fly-in: the World keeps running where it was.
    expect(ship.state).toBe('alive');
    expect(w.camera.x).toBe(cameraX);
    expect(w.status).toBe('playing');
    // The game goes on deterministically (rank re-derived, pools alive).
    run(w, 30);
    expect(w.status).toBe('playing');
  });

  it('does nothing to a World whose players are all out', () => {
    const w = createWorld(resolveGameConfig({ seed: 3, stage: 'test-range' }), DB);
    run(w, 10);
    w.players[0].active = false;
    expect(applyContinuePowerReset(w)).toBe(false);
    expect(w.continuesUsed).toBe(0);
  });

  it('a config starting loadout comes back as the config gives it (the full-loadout arm)', () => {
    const w = createWorld(resolveGameConfig({ seed: 3, stage: 'test-range', loadout: 'full' }), DB);
    run(w, 45);
    const ship = w.players[0];
    ship.lives = 1;
    w.scoring.board.scores[0].score = 500;
    expect(applyContinuePowerReset(w)).toBe(true);
    // The starting loadout is the config's — 'full' powers up again, the digit is written once.
    expect(w.weapons.loadouts[0].options).toBe(4);
    expect(w.scoring.board.scores[0].score).toBe(501);
  });
});
