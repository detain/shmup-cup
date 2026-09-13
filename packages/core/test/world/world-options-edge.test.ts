/**
 * The M2-04 Option types inside a World (edge cases; the per-type movement itself is
 * `core/options`' suites):
 *
 * - the World creates every group with the config's `optionChoice` (both players), and
 *   `hashWorld` tells the types apart;
 * - steering through real input: a `Special` press toggles the Formation out and back (holding it
 *   changes nothing more), holding `PowerUp` extends the Rotate orbit after 15 ticks while the meter
 *   equips once, on the press edge;
 * - a death hides the Options, the respawn's fly-in retracts them (toggle cleared);
 * - every Option fires from where its type puts it (Formation rows, the Snake's chain) and is
 *   drawn there (`optionBatch`).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BulletKind, spawnBullet } from '../../src/bullets/index.js';
import { OPTION_CHOICES, resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import {
  Action,
  commitPlayerInput,
  createInputSnapshot,
  type InputSnapshot,
} from '../../src/input/index.js';
import {
  FORMATION_RETRACTED,
  OPTION_HOLD_TICKS,
  OPTION_SPREAD_TICKS,
  ROTATE_RADIUS,
  ROTATE_RADIUS_EXTENDED,
  SNAKE_LINK,
} from '../../src/options/index.js';
import { MeterSlot } from '../../src/powerups/index.js';
import { SHOOTERS_PER_PLAYER, ShotFlag } from '../../src/weapons/index.js';
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

/** The KESTREL and Type A. */
const DB: ContentDb = ((): ContentDb => {
  const { db, issues } = loadContent(
    [shipped('player/kestrel.player.json'), shipped('weapons/type-a.weapons.json')],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

/**
 * A free-flight world, player 1 alive at view (150, 100) with four Options.
 *
 * @param config - Config overrides.
 * @returns The world.
 */
function world(config: Partial<GameConfig> = {}): World {
  const w = createWorld(resolveGameConfig({ seed: 21, remoteMode: false, ...config }), DB);
  const input = createInputSnapshot();
  while (w.players[0].state !== 'alive') stepWorld(w, input);
  w.players[0].x = w.camera.x + 150;
  w.players[0].y = w.camera.y + 100;
  w.weapons.loadouts[0].options = 4;
  stepWorld(w, input);
  w.events.clear();
  return w;
}

/**
 * Distance between two points.
 *
 * @param ax - A x.
 * @param ay - A y.
 * @param bx - B x.
 * @param by - B y.
 * @returns The distance.
 */
function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
}

/**
 * Holds actions for some ticks (committed every tick, like a platform's poll).
 *
 * @param w - The world.
 * @param input - The snapshot.
 * @param mask - Actions held.
 * @param ticks - Ticks.
 */
function hold(w: World, input: InputSnapshot, mask: number, ticks: number): void {
  for (let t = 0; t < ticks; t++) {
    commitPlayerInput(input.players[0], mask);
    stepWorld(w, input);
  }
}

describe('M2-04 Option types in the World: creation and hashing', () => {
  it('both players` groups fly the config`s type', () => {
    for (const choice of OPTION_CHOICES) {
      const w = createWorld(resolveGameConfig({ optionChoice: choice }), DB);
      expect(w.weapons.options.map((g) => g.formation)).toEqual([choice, choice]);
    }
  });

  it('hashWorld tells the types apart (and the spread state within one type)', () => {
    const hashes = OPTION_CHOICES.map((choice) => {
      const w = world({ optionChoice: choice, autofire: false });
      for (let t = 0; t < 30; t++) stepWorld(w, createInputSnapshot());
      return hashWorld(w);
    });
    expect(new Set(hashes).size).toBe(OPTION_CHOICES.length);
    const a = world({ optionChoice: 'formation', autofire: false });
    const b = world({ optionChoice: 'formation', autofire: false });
    expect(hashWorld(a)).toBe(hashWorld(b));
    b.weapons.options[0].toggled = true;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});

describe('M2-04 Option types in the World: steering with real input', () => {
  it('a Special press toggles the Formation out; holding Special changes nothing more', () => {
    const w = world({ optionChoice: 'formation', autofire: false });
    const group = w.weapons.options[0];
    const input = createInputSnapshot();
    hold(w, input, Action.Special, 1);
    expect([group.toggled, group.spreadTicks]).toEqual([true, 1]);
    hold(w, input, Action.Special, 30); // held: no new press
    expect([group.toggled, group.spreadTicks]).toEqual([true, OPTION_SPREAD_TICKS]);
    hold(w, input, 0, 1);
    hold(w, input, Action.Special, 1);
    expect(group.toggled).toBe(false);
    hold(w, input, 0, OPTION_SPREAD_TICKS);
    expect(group.spreadTicks).toBe(0);
    const ship = w.players[0];
    expect(group.x[0]).toBe(ship.x + FORMATION_RETRACTED[0]);
  });

  it('holding PowerUp equips once on the press and extends the Rotate orbit after 15 ticks', () => {
    const w = world({ optionChoice: 'rotate', autofire: false });
    const group = w.weapons.options[0];
    const ship = w.players[0];
    w.powerups.meters[0].cursor = MeterSlot.Speed;
    const speed = ship.speedLevel;
    const input = createInputSnapshot();
    // The cursor comes back to Speed: a new press would equip again — a hold never does.
    for (let t = 0; t < OPTION_HOLD_TICKS - 1; t++) {
      hold(w, input, Action.PowerUp, 1);
      w.powerups.meters[0].cursor = MeterSlot.Speed;
    }
    expect(ship.speedLevel).toBe(speed + 1);
    expect(group.spreadTicks).toBe(0);
    for (let t = 0; t < OPTION_SPREAD_TICKS + 1; t++) {
      hold(w, input, Action.PowerUp, 1);
      w.powerups.meters[0].cursor = MeterSlot.Speed;
    }
    expect(group.spreadTicks).toBe(OPTION_SPREAD_TICKS);
    expect(ship.speedLevel).toBe(speed + 1); // still one equip
    for (let k = 0; k < 4; k++) {
      expect(dist(group.x[k], group.y[k], ship.x, ship.y)).toBeCloseTo(ROTATE_RADIUS_EXTENDED, 2);
    }
    hold(w, input, 0, OPTION_SPREAD_TICKS);
    expect(dist(group.x[0], group.y[0], ship.x, ship.y)).toBeCloseTo(ROTATE_RADIUS, 2);
  });
});

describe('M2-04 Option types in the World: death and respawn', () => {
  it('a death hides the Options; the respawn`s fly-in retracts them', () => {
    const w = world({ optionChoice: 'formation', autofire: false, deathPenalty: 'casual' });
    const group = w.weapons.options[0];
    const ship = w.players[0];
    const input = createInputSnapshot();
    hold(w, input, Action.Special, 1);
    hold(w, input, 0, OPTION_SPREAD_TICKS);
    expect([group.toggled, group.spreadTicks]).toEqual([true, OPTION_SPREAD_TICKS]);
    spawnBullet(w, ship.x, ship.y, 0, 0, BulletKind.RoundPink);
    stepWorld(w, input);
    expect(ship.state).toBe('dying');
    // The death's hit-stop freezes the sim for a few ticks; then the Options are hidden.
    for (let t = 0; t < 30 && group.count > 0; t++) stepWorld(w, input);
    expect(ship.state).toBe('dying');
    expect(group.count).toBe(0);
    expect(w.weapons.optionBatch.count).toBe(0);
    let guard = 0;
    while (ship.state !== 'alive' && guard++ < 600) stepWorld(w, input);
    expect(ship.state).toBe('alive');
    stepWorld(w, input);
    expect([group.toggled, group.spreadTicks, group.holdTicks]).toEqual([false, 0, 0]);
    expect(group.count).toBe(w.weapons.loadouts[0].options);
  });
});

describe('M2-04 Option types in the World: firing and drawing', () => {
  it('the Formation`s Options fire along their own rows', () => {
    const w = world({ optionChoice: 'formation', autofire: true });
    const ship = w.players[0];
    for (let t = 0; t < 12; t++) stepWorld(w, createInputSnapshot());
    const f = w.weapons.pool.fields;
    const rows = new Map<number, Set<number>>();
    for (let i = 0; i < w.weapons.pool.count; i++) {
      if ((f.flags[i] & ShotFlag.Dead) !== 0) continue;
      const shooter = f.shooter[i] % SHOOTERS_PER_PLAYER;
      if (!rows.has(shooter)) rows.set(shooter, new Set());
      rows.get(shooter)!.add(f.y[i] - ship.y);
    }
    expect([...rows.keys()].sort()).toEqual([0, 1, 2, 3, 4]);
    for (let k = 0; k < 4; k++) {
      expect(rows.get(k + 1)!.has(FORMATION_RETRACTED[k * 2 + 1])).toBe(true);
    }
  });

  it.each(OPTION_CHOICES.map((c) => [c]))('%s: the Options are drawn where they fly', (choice) => {
    const w = world({ optionChoice: choice, autofire: false });
    hold(w, createInputSnapshot(), Action.Up | Action.Right, 25);
    const group = w.weapons.options[0];
    const batch = w.weapons.optionBatch;
    expect(batch.count).toBe(4);
    for (let k = 0; k < 4; k++) {
      expect([batch.x[k], batch.y[k]]).toEqual([group.x[k], group.y[k]]);
    }
    if (choice === 'snake') {
      // Flying up-right: the chain hangs down-left, SNAKE_LINK apart.
      const ship = w.players[0];
      expect(group.x[0]).toBeLessThan(ship.x);
      expect(group.y[0]).toBeGreaterThan(ship.y);
      expect(dist(group.x[0], group.y[0], ship.x, ship.y)).toBeCloseTo(SNAKE_LINK, 6);
    }
  });
});
