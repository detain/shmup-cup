/**
 * The power meter end to end (plan M1-11): headless games on the shipped `test-range` stage, built
 * from the real `content/` files with the engine's script registry and sprites (the way the shell
 * loads them), driven only through the platform's input snapshot.
 *
 * - The acceptance run: the autofiring KESTREL steers into the first drifter formation, wipes it
 *   out (formation bonus), flies to the capsule it dropped, and one OK press equips Speed.
 * - The red capsule carrier drops a capsule where it dies; capsules are drawn with the shipped
 *   `items/capsule` sprite on the `Items` layer.
 * - Auto Power-Up: a session with `autoPowerUp` that only collects capsules grows its loadout in
 *   the default order without any button.
 * - Mega Crash in the middle of the stage clears the view of enemies and bullets.
 */
import {
  Action,
  ENGINE_SPRITES,
  EnemyFlag,
  EnemyState,
  ItemFlag,
  KNOWN_SCRIPT_IDS,
  LayerId,
  MainWeapon,
  MeterSlot,
  SimEventKind,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  loadContent,
  type ContentDb,
  type Game,
  type GameConfig,
  type HeadlessPlatform,
  type World,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';

/**
 * The shipped content with the engine sprites, validated like the shell does.
 *
 * @returns The DB (asserted issue-free).
 */
function shipped(): ContentDb {
  const { db, issues } = loadContent(readContentFiles(), {
    knownScripts: KNOWN_SCRIPT_IDS,
    extraSprites: ENGINE_SPRITES,
  });
  expect(issues).toEqual([]);
  return db;
}

const DB = shipped();

/**
 * A headless game on the test range.
 *
 * @param config - Config overrides.
 * @returns The game and its platform (tests write its input snapshot).
 */
function game(config: Partial<GameConfig> = {}): { g: Game; platform: HeadlessPlatform } {
  const platform = createHeadlessPlatform();
  const g = createGame(platform, { seed: 17, stage: 'test-range', ...config }, DB);
  return { g, platform };
}

/**
 * The first live item, or `null`.
 *
 * @param w - The world.
 * @returns Its position.
 */
function firstItem(w: World): { x: number; y: number } | null {
  const f = w.powerups.pool.fields;
  for (let i = 0; i < w.powerups.pool.count; i++) {
    if ((f.flags[i] & ItemFlag.Dead) === 0) return { x: f.x[i], y: f.y[i] };
  }
  return null;
}

/**
 * The nearest live, non-ghost enemy of a spec to the ship, or `null`.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @returns It.
 */
function nearest(w: World, id: string): { x: number; y: number } | null {
  const spec = DB.enemyIndex.get(id)!;
  const ship = w.players[0];
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const e of w.enemies.enemies) {
    if (e.state !== EnemyState.Live || (e.flags & EnemyFlag.Ghost) !== 0) continue;
    if (e.specIndex !== spec) continue;
    const d = Math.abs(e.x - ship.x) + Math.abs(e.y - ship.y);
    if (d < bestD) {
      best = { x: e.x, y: e.y };
      bestD = d;
    }
  }
  return best;
}

/**
 * Arrow keys that steer the ship towards a point (2-px dead zone, 4-way friendly: vertical first).
 *
 * @param w - The world.
 * @param x - Target world x (NaN = keep).
 * @param y - Target world y.
 * @returns The held mask.
 */
function steer(w: World, x: number, y: number): number {
  const ship = w.players[0];
  let held = 0;
  if (y < ship.y - 2) held |= Action.Up;
  else if (y > ship.y + 2) held |= Action.Down;
  if (x === x) {
    if (x < ship.x - 2) held |= Action.Left;
    else if (x > ship.x + 2) held |= Action.Right;
  }
  return held;
}

describe('integration: the power meter on the test range', () => {
  it('formation kill → capsule → OK press equips Speed (headless, input only)', () => {
    const { g, platform } = game();
    const w = g.world;
    const input = platform.snapshot.players[0];
    let bonusTick = -1;
    let collectedTick = -1;
    for (let t = 0; t < 3000 && collectedTick < 0; t++) {
      let held = 0;
      if (bonusTick < 0) {
        const target = nearest(w, 'drifter');
        if (target !== null) held = steer(w, NaN, target.y);
      } else {
        const item = firstItem(w);
        if (item !== null) held = steer(w, item.x, item.y);
      }
      commitPlayerInput(input, held);
      g.step();
      w.events.drain((e) => {
        if (e.kind === SimEventKind.FormationBonus && bonusTick < 0) bonusTick = w.tick;
      });
      if (bonusTick >= 0 && w.powerups.meters[0].cursor >= 0) collectedTick = w.tick;
    }
    expect(bonusTick).toBeGreaterThan(0);
    expect(collectedTick).toBeGreaterThan(bonusTick);
    expect(w.powerups.meters[0].cursor).toBe(MeterSlot.Speed);
    expect(w.players[0].speedLevel).toBe(0);
    // One OK press (remote OK = PowerUp in the game context), then release.
    commitPlayerInput(input, Action.PowerUp);
    g.step();
    commitPlayerInput(input, 0);
    g.step();
    expect(w.players[0].speedLevel).toBe(1);
    expect(w.powerups.meters[0].cursor).toBe(-1);
  });

  it('drops a capsule from the red carrier and draws it with the capsule sprite', () => {
    const { g, platform } = game();
    const w = g.world;
    const input = platform.snapshot.players[0];
    let dropped = false;
    for (let t = 0; t < 2000 && !dropped; t++) {
      const carrier = nearest(w, 'carrier');
      commitPlayerInput(input, carrier === null ? 0 : steer(w, NaN, carrier.y));
      g.step();
      dropped = w.powerups.itemBatch.count > 0 && nearest(w, 'carrier') === null && t > 300;
    }
    expect(dropped).toBe(true);
    const batch = w.powerups.itemBatch;
    expect(batch.layer).toBe(LayerId.Items);
    expect(DB.sprites.names[batch.spriteId[0]]).toBe('items/capsule');
    expect(g.renderFrame().world?.batches).toContain(batch);
  });

  it('Auto Power-Up grows the loadout from capsules alone, in the default order', () => {
    const { g } = game({ autoPowerUp: true });
    const w = g.world;
    const ship = w.players[0];
    const loadout = w.weapons.loadouts[0];
    for (let t = 0; t < 60; t++) g.step();
    // Hand the ship 7 capsules, one every 10 ticks, right on it.
    for (let k = 0; k < 7; k++) {
      w.powerups.spawnItem(0, ship.x, ship.y);
      for (let t = 0; t < 10; t++) g.step();
    }
    expect([ship.speedLevel, loadout.missile, loadout.main]).toEqual([1, true, MainWeapon.Laser]);
  });

  it('Mega Crash clears the view of enemies and bullets mid-stage', () => {
    const { g, platform } = game({ loadout: 'full' });
    const w = g.world;
    const input = platform.snapshot.players[0];
    w.players[0].invulnTicks = 1e9;
    let before = 0;
    for (let t = 0; t < 4000; t++) {
      g.step();
      let live = 0;
      for (const e of w.enemies.enemies) {
        if (e.state === EnemyState.Live && (e.flags & EnemyFlag.Ghost) === 0) live++;
      }
      if (live >= 3 && w.bullets.count > 0) {
        before = live;
        break;
      }
    }
    expect(before).toBeGreaterThanOrEqual(3);
    w.powerups.meters[0].cursor = MeterSlot.Mega;
    commitPlayerInput(input, Action.PowerUp);
    g.step();
    let live = 0;
    for (const e of w.enemies.enemies) {
      if (e.state === EnemyState.Live && (e.flags & EnemyFlag.Ghost) === 0) live++;
    }
    expect(live).toBe(0);
    expect(w.bullets.count).toBe(0);
    expect(w.enemies.outcomes.killCount).toBeGreaterThanOrEqual(before);
  });
});
