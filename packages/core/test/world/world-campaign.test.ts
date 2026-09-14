/**
 * The World's M2-10 pieces: the stage-clear **fly-out** (every ship in control leaves once the
 * stage is cleared — uncontrollable, accelerating right, out of view, never hit, never firing,
 * its Options trailing), the enemy totals the zone tally reads (`EnemySystem.stats`), and the
 * bonus stages' items — the 1UP and the 1,000-point bonus capsule — from their drops to their
 * effects.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { DropKind } from '../../src/enemies/index.js';
import { SFX_CUES, SimEventKind } from '../../src/events/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import {
  LEAVE_ACCELERATION,
  LEAVE_END_X,
  LEAVE_MAX_SPEED,
  PlayerHitCause,
  flyOutPlayer,
  playerHit,
} from '../../src/player/index.js';
import {
  BONUS_CAPSULE_SCORE,
  BONUS_CAPSULE_SPRITE,
  ITEM_KINDS,
  ItemKind,
  ONE_UP_SPRITE,
} from '../../src/powerups/index.js';
import { MAX_LIVES } from '../../src/scoring/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld, type World } from '../../src/world/index.js';

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

/** The KESTREL, Type A, the bonus enemies and a short open stage that ends at x 200. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('enemies/bonus.enemies.json'),
      {
        path: 'stages/short.stage.json',
        data: {
          formatVersion: 1,
          kind: 'stage',
          id: 'short',
          name: 'SHORT',
          music: { stage: 'Stage', boss: 'Boss' },
          length: 2000,
          camera: [{ x: 0, speed: 1 }],
          checkpoints: [{ x: 0 }],
          parallax: [],
          tilemap: null,
          events: [{ x: 200, type: 'end' }],
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

/**
 * A World on the short stage.
 *
 * @param loadout - Starting loadout.
 * @returns The World.
 */
function world(loadout: 'default' | 'full' = 'default'): World {
  return createWorld(resolveGameConfig({ seed: 3, stage: 'short', loadout }), DB);
}

/**
 * Steps a World with player 1 holding a mask.
 *
 * @param w - The World.
 * @param ticks - Ticks.
 * @param held - Actions held.
 */
function run(w: World, ticks: number, held = 0): void {
  const input = createInputSnapshot();
  for (let i = 0; i < ticks; i++) {
    commitPlayerInput(input.players[0], held);
    stepWorld(w, input);
  }
}

describe('core/world stage-clear fly-out (M2-10)', () => {
  it('sends the ship off to the right once the stage is cleared, out of control', () => {
    const w = world('full');
    for (let i = 0; i < 400 && w.status !== 'stageClear'; i++) run(w, 1, Action.Up);
    expect(w.status).toBe('stageClear');
    const ship = w.players[0];
    // The clear's own tick still flew the ship; the next one starts the fly-out.
    expect(ship.state).toBe('alive');
    run(w, 1, Action.Up);
    expect(ship.state).toBe('leaving');
    const xs: number[] = [];
    for (let i = 0; i < 120; i++) {
      run(w, 1, Action.Left | Action.Down);
      xs.push(ship.x - w.camera.x);
    }
    // Faster and faster (the input does nothing), never above the top speed, then parked out of
    // view.
    const steps = xs.slice(1).map((x, i) => x - xs[i]);
    for (let i = 1; i < 30; i++) expect(steps[i]).toBeGreaterThanOrEqual(steps[i - 1] - 1e-9);
    expect(steps[29]).toBeGreaterThan(steps[0]);
    for (const step of steps) expect(step).toBeLessThanOrEqual(LEAVE_MAX_SPEED + 1e-9);
    // Parked at LEAVE_END_X past the view's left edge (measured after the tick's scroll step).
    expect(xs[xs.length - 1]).toBeGreaterThan(384 + 16);
    expect(xs[xs.length - 1]).toBeLessThanOrEqual(LEAVE_END_X);
    expect(xs[xs.length - 1]).toBe(xs[xs.length - 2]);
    expect(LEAVE_ACCELERATION).toBeGreaterThan(0);
    // Leaving ships cannot be hit and do not fire.
    expect(playerHit(ship, PlayerHitCause.Bullet, w.tick, w.debugFlags)).toBe(false);
    const shots = w.weapons.pool.count;
    run(w, 30);
    expect(w.weapons.pool.count).toBeLessThanOrEqual(shots);
    expect(w.status).toBe('stageClear');
  });

  it('lets a ship flying in finish its fly-in, then leave', () => {
    const w = world();
    run(w, 250);
    expect(w.status).toBe('stageClear');
    expect(w.players[0].state).toBe('leaving');
    const late = world();
    // The stage clears while the ship is still flying in (a teleported camera — tests only).
    late.stage?.jumpTo(199);
    late.players[0].state = 'entering';
    late.players[0].stateTicks = 0;
    run(late, 2);
    expect(late.status).toBe('stageClear');
    expect(late.players[0].state).toBe('entering');
    run(late, 60);
    expect(late.players[0].state).toBe('leaving');
  });

  it('flyOutPlayer ignores an inactive ship and clears the blink', () => {
    const w = world();
    const p2 = w.players[1];
    flyOutPlayer(p2);
    expect(p2.state).not.toBe('leaving');
    const p1 = w.players[0];
    p1.invulnTicks = 50;
    flyOutPlayer(p1);
    expect([p1.state, p1.invulnTicks, p1.stateTicks]).toEqual(['leaving', 0, 0]);
  });
});

describe('core/world enemy totals (M2-10)', () => {
  it('counts spawns and the kills credited to a player, ground enemies apart', () => {
    const w = world();
    const carrier = DB.enemyIndex.get('vault-carrier') ?? -1;
    const a = w.enemies.spawn(carrier, w.camera.x + 200, 80);
    const b = w.enemies.spawn(carrier, w.camera.x + 220, 120);
    const c = w.enemies.spawn(carrier, w.camera.x + 240, 160);
    expect(a && b && c).toBeTruthy();
    expect(w.enemies.stats).toEqual({ spawned: 3, killed: 0, groundSpawned: 0, groundKilled: 0 });
    if (a !== null) w.enemies.kill(a, 0);
    if (b !== null) w.enemies.kill(b, -1);
    expect(w.enemies.stats.killed).toBe(1);
    // A checkpoint restart keeps counting.
    w.stage?.restartAt(0);
    expect(w.enemies.stats.spawned).toBe(3);
  });
});

describe('core/powerups bonus-stage items (M2-10)', () => {
  it('registers the 1UP and the bonus capsule as world-space engine items', () => {
    expect(ITEM_KINDS[ItemKind.OneUp]).toEqual({ sprite: ONE_UP_SPRITE, frames: 2, score: 0 });
    expect(ITEM_KINDS[ItemKind.BonusCapsule]).toEqual({
      sprite: BONUS_CAPSULE_SPRITE,
      frames: 2,
      score: BONUS_CAPSULE_SCORE,
    });
    expect(ENGINE_SPRITES).toContain(ONE_UP_SPRITE);
    expect(ENGINE_SPRITES).toContain(BONUS_CAPSULE_SPRITE);
    expect([DropKind.OneUp, DropKind.BonusCapsule, DropKind.FreeOption]).toEqual([4, 5, 6]);
  });

  it('turns the drops into items and pays them: 1,000 points, one more life', () => {
    const w = world();
    run(w, 60);
    const ship = w.players[0];
    const carrier = DB.enemyIndex.get('vault-carrier') ?? -1;
    const oneUp = DB.enemyIndex.get('vault-carrier-1up') ?? -1;
    const bonus = w.enemies.spawn(carrier, ship.x + 60, ship.y);
    const life = w.enemies.spawn(oneUp, ship.x + 90, ship.y);
    if (bonus === null || life === null) throw new Error('no spawn');
    w.enemies.kill(bonus, 0);
    w.enemies.kill(life, 0);
    run(w, 1);
    const kinds = Array.from(w.powerups.pool.fields.kind.subarray(0, w.powerups.pool.count));
    expect(kinds.sort()).toEqual([ItemKind.OneUp, ItemKind.BonusCapsule].sort());
    const score = w.scoring.board.scores[0].score;
    const lives = ship.lives;
    const events: number[] = [];
    // Fly into both (they are world-space: they stay where they dropped).
    for (let i = 0; i < 120 && w.powerups.pool.count > 0; i++) {
      run(w, 1, Action.Right);
      w.events.drain((e) => {
        if (e.kind === SimEventKind.Sfx) events.push(e.id);
      });
    }
    expect(w.powerups.pool.count).toBe(0);
    expect(ship.lives).toBe(lives + 1);
    expect(w.scoring.board.scores[0].score).toBeGreaterThanOrEqual(score + BONUS_CAPSULE_SCORE);
    expect(events).toContain(SFX_CUES.ExtraLife);
    expect(events).toContain(SFX_CUES.CapsulePickup);
  });

  it('gives no life past the cap (only the pickup sound)', () => {
    const w = world();
    run(w, 60);
    const ship = w.players[0];
    ship.lives = MAX_LIVES;
    w.powerups.spawnItem(ItemKind.OneUp, ship.x + 2, ship.y);
    const events: number[] = [];
    run(w, 3);
    w.events.drain((e) => {
      if (e.kind === SimEventKind.Sfx) events.push(e.id);
    });
    expect(ship.lives).toBe(MAX_LIVES);
    expect(events).toContain(SFX_CUES.CapsulePickup);
    expect(events).not.toContain(SFX_CUES.ExtraLife);
  });
});
