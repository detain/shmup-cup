/**
 * Edge cases of continues in the World (plan M2-01, shmup_feat.md §10) beyond
 * `world-continue.test.ts`:
 *
 * - a continue before the second checkpoint restarts at the first one (camera at 0);
 * - an inactive player 2 is left alone (lives, score, no continue digit); an active one continues
 *   too, each score with its own digit;
 * - whatever the session's death penalty (`casual` on Easy), a continue takes all power, then gives
 *   the starting loadout;
 * - the hit-stop ends, the enemy bullets and enemies are gone, the rank follows the new loadout;
 * - an extend threshold reached while the game was over waits and is given right after the
 *   continue (on top of the fresh lives);
 * - `canContinue` for each status and for every continue count; a failed continue changes nothing
 *   (same hash).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BulletKind } from '../../src/bullets/index.js';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { EnemyState } from '../../src/enemies/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { addScore } from '../../src/scoring/index.js';
import { grantShield } from '../../src/shields/index.js';
import { MainWeapon } from '../../src/weapons/index.js';
import {
  ENGINE_SPRITES,
  WORLD_STATUSES,
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
 * A World on the test range whose game is over (every active ship out of lives).
 *
 * @param overrides - Config overrides.
 * @param twoPlayers - Player 2 plays too.
 * @returns The World.
 */
function overWorld(overrides: Partial<GameConfig> = {}, twoPlayers = false): World {
  const w = createWorld(resolveGameConfig({ seed: 11, stage: 'test-range', ...overrides }), DB);
  if (twoPlayers) w.players[1].active = true;
  run(w, 45);
  for (const ship of w.players) {
    if (!ship.active) continue;
    ship.state = 'dead';
    ship.stateTicks = 1000;
    ship.lives = 0;
  }
  run(w, 1);
  expect(w.status).toBe('gameOver');
  return w;
}

describe('core/world continue edges (M2-01)', () => {
  it('restarts at the first checkpoint when the second was not reached', () => {
    const w = overWorld();
    expect(w.stage!.checkpoint).toBe(0);
    expect(continueWorld(w)).toBe(true);
    expect(w.camera.x).toBe(0);
    expect(w.stage!.checkpoint).toBe(0);
  });

  it('leaves an inactive player 2 alone', () => {
    const w = overWorld();
    const p2 = w.players[1];
    const lives = p2.lives;
    w.scoring.board.scores[1].score = 500;
    continueWorld(w);
    expect(p2.active).toBe(false);
    expect(p2.lives).toBe(lives);
    expect(w.scoring.board.scores[1]).toMatchObject({ score: 500, continues: 0 });
  });

  it('continues both active players, each score with its own digit', () => {
    const w = overWorld({}, true);
    w.scoring.board.scores[0].score = 1_000;
    w.scoring.board.scores[1].score = 2_000;
    continueWorld(w);
    expect(w.players.map((p) => [p.lives, p.state])).toEqual([
      [3, 'respawning'],
      [3, 'respawning'],
    ]);
    expect(w.scoring.board.scores.map((s) => s.score)).toEqual([1_001, 2_001]);
    expect(w.continuesUsed).toBe(1); // one continue for the game, not per player
  });

  it('takes all power whatever the death penalty, then gives the starting loadout', () => {
    const w = overWorld({ difficulty: 'easy' }); // casual penalty, 5 lives, default loadout
    expect(w.config.deathPenalty).toBe('casual');
    const loadout = w.weapons.loadouts[0];
    loadout.main = MainWeapon.Double;
    loadout.missile = true;
    loadout.options = 2;
    w.players[0].speedLevel = 3;
    grantShield(w.players[0].shield);
    continueWorld(w);
    expect([loadout.main, loadout.missile, loadout.options]).toEqual([MainWeapon.Basic, false, 0]);
    expect(w.players[0].speedLevel).toBe(0);
    expect(w.players[0].shield.hits).toBe(0);
    expect(w.players[0].lives).toBe(5);
    expect(w.rank).toBe(0);
  });

  it('ends the hit-stop and empties the bullets and enemies', () => {
    const w = overWorld();
    w.hitStop = 6;
    w.bullets.spawn(w.camera.x + 100, 100, 0, 1, BulletKind.RoundRed);
    const drifter = DB.enemyIndex.get('drifter') ?? -1;
    expect(w.enemies.spawn(drifter, w.camera.x + 200, 100)).not.toBeNull();
    expect(w.bullets.pool.count).toBeGreaterThan(0);
    continueWorld(w);
    expect(w.hitStop).toBe(0);
    expect(w.bullets.pool.count).toBe(0);
    expect(w.enemies.enemies.filter((e) => e.state !== EnemyState.Free)).toEqual([]);
  });

  it('gives an extend reached during the game over right after the continue', () => {
    const w = overWorld();
    addScore(w, 0, 20_000);
    run(w, 1); // game over: the threshold waits
    expect(w.scoring.board.scores[0].nextExtend).toBe(20_000);
    continueWorld(w);
    expect(w.players[0].lives).toBe(3);
    run(w, 1);
    expect(w.players[0].lives).toBe(4);
    expect(w.scoring.board.scores[0].nextExtend).toBe(90_000);
  });
});

describe('core/world canContinue (M2-01)', () => {
  it('is false for every status but gameOver', () => {
    const w = overWorld();
    for (const status of WORLD_STATUSES) {
      w.status = status;
      expect(canContinue(w), status).toBe(status === 'gameOver');
    }
  });

  it('allows exactly config.continues continues', () => {
    for (const continues of [0, 1, 3, 9]) {
      const w = overWorld({ continues });
      let used = 0;
      while (continueWorld(w)) {
        used++;
        w.status = 'gameOver';
      }
      expect(used).toBe(continues);
      expect(w.continuesUsed).toBe(continues);
      expect(w.scoring.board.scores[0].continues).toBe(continues);
    }
  });

  it('changes nothing when it cannot continue', () => {
    const w = overWorld({ continues: 0 });
    const hash = hashWorld(w);
    expect(continueWorld(w)).toBe(false);
    expect(hashWorld(w)).toBe(hash);
    expect(w.continuesUsed).toBe(0);
  });
});
