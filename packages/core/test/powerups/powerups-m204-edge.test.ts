/**
 * `core/powerups` — edge cases of plan M2-04 (the `?` shields, the blue capsule, freed Options):
 *
 * - the pure meter rules: `meterChoicesOf` for every `?` choice, `?` greyed by any standing shield
 *   but a Free Shield with room or wear, FULL BARRIER greyed only at full strength **of the
 *   session's kind** (another kind at full strength is swapped for a fresh one), `equipSlot`'s
 *   Free Shield heading for `?` and FULL BARRIER;
 * - `regainOption` for bad slots, one more Option with its sounds, none past four;
 * - items: freed Options bounce off the playfield's top and bottom, drift left of the view,
 *   blink (hidden every other 4 ticks) through their last `ITEM_EXPIRY_BLINK_TICKS`, are pulled
 *   by the magnet; the blue capsule scores 300 and a freed Option 0, neither touches the meter; the blue capsule
 *   stays with the terrain (no drift).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PLAYFIELD_H,
  SHIELD_CHOICES,
  resolveGameConfig,
  type GameConfig,
} from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { SFX_CUES, SimEventKind, type SimEvent } from '../../src/events/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { MAX_OPTIONS } from '../../src/options/index.js';
import { createPlayer } from '../../src/player/index.js';
import {
  CAPSULE_SCORE,
  FREE_OPTION_DRIFT,
  FREE_OPTION_TICKS,
  ITEM_EXPIRY_BLINK_TICKS,
  ITEM_KINDS,
  ITEM_RADIUS,
  ItemFlag,
  ItemKind,
  MegaEffect,
  MeterChoices,
  MeterSlot,
  canEquipSlot,
  equipSlot,
  meterChoicesOf,
} from '../../src/powerups/index.js';
import { SpriteFlag } from '../../src/presentation/index.js';
import {
  FORCE_FIELD,
  FREE_SHIELD,
  FRONT_SHIELD,
  REDUCE,
  ROTATE_SHIELD,
  SHIELD_CHOICE_SPECS,
  ShieldKind,
  absorbPodHit,
  grantShield,
  type ShieldSpec,
} from '../../src/shields/index.js';
import { Loadout } from '../../src/weapons/index.js';
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
 * A free-flight world, player 1 alive at view (60, 100) (autofire off).
 *
 * @param config - Config overrides.
 * @returns The world.
 */
function world(config: Partial<GameConfig> = {}): World {
  const w = createWorld(
    resolveGameConfig({ seed: 8, autofire: false, remoteMode: false, ...config }),
    DB,
  );
  const input = createInputSnapshot();
  while (w.players[0].state !== 'alive') stepWorld(w, input);
  w.players[0].x = w.camera.x + 60;
  w.players[0].y = w.camera.y + 100;
  stepWorld(w, input);
  w.events.clear();
  return w;
}

/**
 * Meter choices with a `!` effect and a `?` shield.
 *
 * @param mega - `MegaEffect`.
 * @param shield - The `?` spec.
 * @returns The choices.
 */
function choices(mega: MegaEffect, shield: ShieldSpec): MeterChoices {
  const c = new MeterChoices();
  c.mega = mega;
  c.shield = shield;
  return c;
}

/**
 * A meter ship with a shield granted (or none).
 *
 * @param spec - What it carries (`null` = nothing).
 * @returns The ship.
 */
function shipWith(spec: ShieldSpec | null): ReturnType<typeof createPlayer> {
  const ship = createPlayer(0, 3);
  if (spec !== null) grantShield(ship.shield, spec);
  return ship;
}

describe('core/powerups M2-04 edges: the pure meter rules', () => {
  it('meterChoicesOf maps every `?` choice to its spec', () => {
    for (const choice of SHIELD_CHOICES) {
      const c = meterChoicesOf(resolveGameConfig({ shieldChoice: choice }));
      expect(c.shield).toBe(SHIELD_CHOICE_SPECS[choice]);
    }
  });

  it('`?` is greyed by any standing shield but a Free Shield with room or wear', () => {
    const specs = [FORCE_FIELD, FRONT_SHIELD, FREE_SHIELD, ROTATE_SHIELD, REDUCE];
    const loadout = new Loadout();
    for (const standing of [null, ...specs]) {
      for (const choice of specs) {
        const ship = shipWith(standing);
        const c = choices(MegaEffect.MegaCrash, choice);
        const want = standing === null || (standing === FREE_SHIELD && choice === FREE_SHIELD);
        expect(canEquipSlot(MeterSlot.Shield, ship, loadout, 4, c)).toBe(want);
      }
    }
  });

  it('FULL BARRIER: greyed only at full strength of the session`s kind', () => {
    const loadout = new Loadout();
    const rotate = choices(MegaEffect.FullBarrier, ROTATE_SHIELD);
    // A full Force Field is not the session's Rotate Shield: FULL BARRIER swaps it.
    const ship = shipWith(FORCE_FIELD);
    expect(canEquipSlot(MeterSlot.Mega, ship, loadout, 4, rotate)).toBe(true);
    expect(equipSlot(MeterSlot.Mega, ship, loadout, 4, rotate)).toBe(true);
    expect([ship.shield.kind, ship.shield.podCount, ship.shield.hits]).toEqual([
      ShieldKind.RotateShield,
      2,
      28,
    ]);
    expect(canEquipSlot(MeterSlot.Mega, ship, loadout, 4, rotate)).toBe(false);
    absorbPodHit(ship.shield, 1, 3);
    expect(canEquipSlot(MeterSlot.Mega, ship, loadout, 4, rotate)).toBe(true);
    // Reduce at full strength with a Reduce session: greyed; one hit down: not.
    const reduced = shipWith(REDUCE);
    const r = choices(MegaEffect.FullBarrier, REDUCE);
    expect(canEquipSlot(MeterSlot.Mega, reduced, loadout, 4, r)).toBe(false);
    reduced.shield.hits = 1;
    expect(canEquipSlot(MeterSlot.Mega, reduced, loadout, 4, r)).toBe(true);
    expect(canEquipSlot(MeterSlot.Mega, shipWith(null), loadout, 4, r)).toBe(true);
  });

  it('equipSlot hands the heading to a Free Shield pair, for `?` and for FULL BARRIER', () => {
    const loadout = new Loadout();
    const free = choices(MegaEffect.FullBarrier, FREE_SHIELD);
    const ship = shipWith(null);
    expect(equipSlot(MeterSlot.Shield, ship, loadout, 4, free, 256)).toBe(true);
    expect([ship.shield.podAngle[0], ship.shield.podAngle[1]]).toEqual([208, 304]);
    expect(equipSlot(MeterSlot.Shield, ship, loadout, 4, free, 768)).toBe(true);
    expect([ship.shield.podAngle[2], ship.shield.podAngle[3]]).toEqual([720, 816]);
    // FULL BARRIER over none: one fresh pair at the heading.
    const bare = shipWith(null);
    expect(equipSlot(MeterSlot.Mega, bare, loadout, 4, free, 512)).toBe(true);
    expect([bare.shield.podCount, bare.shield.podAngle[0], bare.shield.podAngle[1]]).toEqual([
      2, 464, 560,
    ]);
    // The default heading is ahead.
    const ahead = shipWith(null);
    equipSlot(MeterSlot.Shield, ahead, loadout, 4, free);
    expect([ahead.shield.podAngle[0], ahead.shield.podAngle[1]]).toEqual([976, 48]);
  });
});

describe('core/powerups M2-04 edges: regainOption', () => {
  it('ignores bad slots; adds one Option with the equip sounds; only dings at four', () => {
    const w = world();
    for (const bad of [-1, 2, 9, 0.5, NaN]) expect(w.powerups.regainOption(bad)).toBe(false);
    expect(w.weapons.loadouts[0].options).toBe(0);
    expect(w.powerups.regainOption(0)).toBe(true);
    const events: SimEvent[] = [];
    w.events.drain((e) => events.push({ ...e }));
    expect(w.weapons.loadouts[0].options).toBe(1);
    expect(events.some((e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.PowerUpEquip)).toBe(
      true,
    );
    expect(
      events.some(
        (e) => e.kind === SimEventKind.PowerUp && e.id === MeterSlot.Option && e.param === 0,
      ),
    ).toBe(true);
    w.weapons.loadouts[0].options = MAX_OPTIONS;
    expect(w.powerups.regainOption(0)).toBe(false);
    const ding: SimEvent[] = [];
    w.events.drain((e) => ding.push({ ...e }));
    expect(ding.map((e) => [e.kind, e.id])).toEqual([[SimEventKind.Sfx, SFX_CUES.MeterAdvance]]);
    expect(w.weapons.loadouts[0].options).toBe(MAX_OPTIONS);
  });
});

describe('core/powerups M2-04 edges: blue capsules and freed Options as items', () => {
  it('the item kinds: blue capsule 300 points, freed Option 0, both two frames', () => {
    expect(ITEM_KINDS[ItemKind.BlueCapsule]).toMatchObject({
      sprite: 'items/capsule-blue',
      score: CAPSULE_SCORE,
      frames: 2,
    });
    expect(ITEM_KINDS[ItemKind.FreeOption]).toMatchObject({
      sprite: 'options/stolen',
      score: 0,
      frames: 2,
    });
    expect(FREE_OPTION_DRIFT).toHaveLength(16);
    for (let k = 0; k < 8; k++) expect(FREE_OPTION_DRIFT[k * 2]).toBeLessThan(0); // drift left
    expect([FREE_OPTION_TICKS, ITEM_EXPIRY_BLINK_TICKS]).toEqual([600, 120]);
  });

  it('pickups score 300 (blue) and 0 (freed Option) and never move the meter cursor', () => {
    const w = world();
    const ship = w.players[0];
    w.powerups.meters[0].cursor = MeterSlot.Double;
    w.powerups.spawnItem(ItemKind.BlueCapsule, ship.x, ship.y);
    stepWorld(w, createInputSnapshot());
    const o = w.powerups.outcomes;
    expect([o.pickupCount, o.pickupKind[0], o.pickupScore[0]]).toEqual([
      1,
      ItemKind.BlueCapsule,
      CAPSULE_SCORE,
    ]);
    expect(w.powerups.meters[0].cursor).toBe(MeterSlot.Double);
    w.powerups.spawnItem(ItemKind.FreeOption, ship.x, ship.y);
    stepWorld(w, createInputSnapshot());
    expect([o.pickupCount, o.pickupKind[0], o.pickupScore[0]]).toEqual([1, ItemKind.FreeOption, 0]);
    expect(w.powerups.meters[0].cursor).toBe(MeterSlot.Double);
    expect(w.weapons.loadouts[0].options).toBe(1);
  });

  it('a freed Option bounces off the playfield`s top and bottom', () => {
    const w = world({ pickupMagnet: false });
    const f = w.powerups.pool.fields;
    const up = w.powerups.spawnItem(ItemKind.FreeOption, w.camera.x + 300, w.camera.y + 8);
    f.vy[up] = -1;
    const down = w.powerups.spawnItem(
      ItemKind.FreeOption,
      w.camera.x + 300,
      w.camera.y + PLAYFIELD_H - 8,
    );
    f.vy[down] = 1;
    for (let t = 0; t < 6; t++) stepWorld(w, createInputSnapshot());
    expect(f.vy[up]).toBe(1);
    expect(f.vy[down]).toBe(-1);
    for (let t = 0; t < 60; t++) stepWorld(w, createInputSnapshot());
    const top = w.camera.y + ITEM_RADIUS - 2;
    const bottom = w.camera.y + PLAYFIELD_H - ITEM_RADIUS + 2;
    expect(f.y[up]).toBeGreaterThan(top);
    expect(f.y[down]).toBeLessThan(bottom);
    expect(f.flags[up] & ItemFlag.Dead).toBe(0);
    expect(f.flags[down] & ItemFlag.Dead).toBe(0);
  });

  it('a blue capsule stays with the terrain; a freed Option drifts left of the view', () => {
    const w = world({ pickupMagnet: false });
    const f = w.powerups.pool.fields;
    const blue = w.powerups.spawnItem(ItemKind.BlueCapsule, w.camera.x + 300, w.camera.y + 50);
    const freed = w.powerups.spawnItem(ItemKind.FreeOption, w.camera.x + 300, w.camera.y + 150);
    f.vx[freed] = -0.5;
    const bx = f.x[blue];
    w.camera.vx = 1;
    for (let t = 0; t < 20; t++) stepWorld(w, createInputSnapshot());
    expect(f.x[blue]).toBe(bx);
    expect(f.x[freed] - w.camera.x).toBeCloseTo(300 - 20 * 0.5, 6);
  });

  it('blinks through its last ITEM_EXPIRY_BLINK_TICKS ticks, hidden every other 4', () => {
    const w = world({ pickupMagnet: false });
    const f = w.powerups.pool.fields;
    const i = w.powerups.spawnItem(ItemKind.FreeOption, w.camera.x + 300, w.camera.y + 100);
    f.vx[i] = 0;
    f.vy[i] = 0;
    const batch = w.powerups.itemBatch;
    const hiddenAt: number[] = [];
    for (let t = 0; t < FREE_OPTION_TICKS - 1; t++) {
      stepWorld(w, createInputSnapshot());
      expect(batch.count).toBe(1);
      if ((batch.flags[0] & SpriteFlag.Hidden) !== 0) hiddenAt.push(f.age[i]);
    }
    expect(hiddenAt.length).toBeGreaterThan(0);
    expect(Math.min(...hiddenAt)).toBeGreaterThanOrEqual(
      FREE_OPTION_TICKS - ITEM_EXPIRY_BLINK_TICKS,
    );
    for (const age of hiddenAt) expect(age & 4).toBe(4);
    // Half its last 120 ticks hidden.
    expect(hiddenAt.length).toBe(ITEM_EXPIRY_BLINK_TICKS / 2);
    stepWorld(w, createInputSnapshot());
    expect(batch.count).toBe(0);
    // A blue capsule never blinks out.
    const blue = w.powerups.spawnItem(ItemKind.BlueCapsule, w.camera.x + 300, w.camera.y + 60);
    for (let t = 0; t < 700; t++) {
      stepWorld(w, createInputSnapshot());
      expect(batch.flags[0] & SpriteFlag.Hidden).toBe(0);
    }
    expect(f.flags[blue] & ItemFlag.Dead).toBe(0);
  });

  it('the magnet pulls a freed Option in', () => {
    const w = world({ pickupMagnet: true });
    const ship = w.players[0];
    const f = w.powerups.pool.fields;
    const i = w.powerups.spawnItem(ItemKind.FreeOption, ship.x + 22, ship.y);
    f.vx[i] = 0;
    f.vy[i] = 0;
    let got = false;
    for (let t = 0; t < 30 && !got; t++) {
      stepWorld(w, createInputSnapshot());
      got = w.weapons.loadouts[0].options === 1;
    }
    expect(got).toBe(true);
  });
});
