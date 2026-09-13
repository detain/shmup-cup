/**
 * Direct mode's items (plan M2-05, shmup_feat.md §6B): the drop resolution per mode (a `powerup` /
 * `capsule` drop is a capsule for the meter, the stage's next planned item for the MANTA — the
 * default plan without one, cycling), every item's effect and its cap (red / green levels, the
 * blue Arm tiers, the orange 1UP, the yellow smart bomb, the octagon's family switch), the pickup
 * feedback events, the drift, bounce and despawn, the Speed toggle, the Direct-mode death penalty,
 * the starting loadouts, the rank's direct power term and determinism.
 */
import { describe, expect, it } from 'vitest';
import { BulletKind, spawnBullet } from '../../src/bullets/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { EnemyState } from '../../src/enemies/index.js';
import { SFX_CUES, SimEventKind, type SimEvent } from '../../src/events/index.js';
import { Action, createInputSnapshot } from '../../src/input/index.js';
import { SpriteFlag } from '../../src/presentation/index.js';
import { DIRECT_ITEMS } from '../../src/data/index.js';
import {
  DEFAULT_DIRECT_ITEM_PLAN,
  DIRECT_ITEM_DRIFT,
  DIRECT_ITEM_KINDS,
  DIRECT_ITEM_SCORE,
  DIRECT_ITEM_TICKS,
  DIRECT_POWER_UP_EVENT_BASE,
  ITEM_EXPIRY_BLINK_TICKS,
  ITEM_KINDS,
  ItemFlag,
  ItemKind,
  MeterSlot,
  applyDirectDeathPenalty,
  directItemKind,
  directMaxLevel,
} from '../../src/powerups/index.js';
import { RANK_ARM_TIER, directPowerRank } from '../../src/rank/index.js';
import { MAX_LIVES } from '../../src/scoring/index.js';
import { ShieldKind, shieldActive } from '../../src/shields/index.js';
import { DIRECT_MAX_LEVEL } from '../../src/weapons/index.js';
import type { World } from '../../src/world/index.js';
import { stepWorld, updateWorldRank } from '../../src/world/index.js';
import { MANTA, aliveWorld, directDb, run } from '../helpers/direct.js';

/** The shared content. */
const DB = directDb();

/**
 * Drains a world's events.
 *
 * @param w - The world.
 * @returns Copies of the events.
 */
function drain(w: World): SimEvent[] {
  const out: SimEvent[] = [];
  w.events.drain((e) => out.push({ ...e }));
  return out;
}

/**
 * Kills a freshly spawned enemy between ticks (its drop is taken at the next phase 3).
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @returns The item slots after the next tick.
 */
function killFor(w: World, id: string): number {
  const e = w.enemies.spawn(DB.enemyIndex.get(id) ?? -1, w.camera.x + 250, w.camera.y + 60);
  expect(e).not.toBeNull();
  w.enemies.kill(e!, 0);
  stepWorld(w, createInputSnapshot());
  return w.powerups.count;
}

describe('core/powerups Direct mode — drop resolution per mode', () => {
  it('turns a `powerup` or `capsule` drop into a capsule in meter mode', () => {
    const w = aliveWorld(DB, { shipId: 'kestrel', powerUpMode: 'meter' });
    expect(w.powerups.direct).toBe(false);
    expect(killFor(w, 'lead-carrier')).toBe(1);
    expect(w.powerups.pool.fields.kind[0]).toBe(ItemKind.Capsule);
    expect(killFor(w, 'carrier')).toBe(2);
    expect(w.powerups.pool.fields.kind[1]).toBe(ItemKind.Capsule);
    expect(w.powerups.planCursor).toBe(0);
  });

  it('turns them into the next planned item in Direct mode, drifting alternately up and down', () => {
    const w = aliveWorld(DB);
    expect(w.powerups.direct).toBe(true);
    // The still stage has no plan: the default one.
    expect(Array.from(w.powerups.plan)).toEqual(
      DEFAULT_DIRECT_ITEM_PLAN.map((item) => DIRECT_ITEMS.indexOf(item)),
    );
    expect(killFor(w, 'lead-carrier')).toBe(1);
    expect(killFor(w, 'carrier')).toBe(2); // a `capsule` drop is an item too
    const f = w.powerups.pool.fields;
    expect([f.kind[0], f.kind[1]]).toEqual([
      directItemKind(DEFAULT_DIRECT_ITEM_PLAN[0]),
      directItemKind(DEFAULT_DIRECT_ITEM_PLAN[1]),
    ]);
    expect([f.vx[0], f.vy[0], f.vx[1], f.vy[1]]).toEqual(DIRECT_ITEM_DRIFT);
    expect(w.powerups.planCursor).toBe(2);
  });

  it('keeps the blue capsule a blue capsule in both modes', () => {
    for (const config of [{ shipId: 'kestrel', powerUpMode: 'meter' as const }, MANTA]) {
      const w = aliveWorld(DB, config);
      killFor(w, 'carrier-blue');
      expect(w.powerups.pool.fields.kind[0]).toBe(ItemKind.BlueCapsule);
      expect(w.powerups.planCursor).toBe(0);
    }
  });

  it('follows the stage`s own plan, cycling, and never rewinds on a checkpoint restart', () => {
    const w = aliveWorld(DB, { stage: 'direct-range' });
    const plan = DB.stages[DB.stageIndex.get('direct-range') ?? -1].directItems;
    expect(Array.from(w.powerups.plan)).toEqual(plan.map((item) => DIRECT_ITEMS.indexOf(item)));
    const kinds: number[] = [];
    for (let i = 0; i < plan.length + 2; i++) {
      const slot = w.powerups.dropDirect(w.camera.x + 100, w.camera.y + 100);
      kinds.push(w.powerups.pool.fields.kind[slot]);
      w.pools.clearAll();
    }
    expect(kinds).toEqual([...plan, plan[0], plan[1]].map(directItemKind));
    w.stage!.restartAt(0);
    expect(w.powerups.planCursor).toBe(plan.length + 2);
  });
});

describe('core/powerups Direct mode — item effects and caps', () => {
  it('red raises the main shot one level up to its family`s top, then gives points only', () => {
    const w = aliveWorld(DB);
    const loadout = w.weapons.loadouts[0];
    const top = directMaxLevel(w.weapons.mainFamilies[0]);
    expect(top).toBe(DIRECT_MAX_LEVEL);
    for (let level = 1; level <= top; level++) {
      expect(w.powerups.collectDirect(0, 0)).toBe(true);
      expect(loadout.shot).toBe(level);
    }
    expect(w.powerups.collectDirect(0, 0)).toBe(false);
    expect(loadout.shot).toBe(top);
  });

  it('green raises the sub-weapon one level up to its top', () => {
    const w = aliveWorld(DB);
    const loadout = w.weapons.loadouts[0];
    for (let i = 0; i < 20; i++) w.powerups.collectDirect(0, 1);
    expect(loadout.sub).toBe(directMaxLevel(w.weapons.subFamily));
    expect(w.powerups.collectDirect(0, 1)).toBe(false);
  });

  it('blue grants the green Arm, then repairs it; the 4th makes it silver, the 9th gold', () => {
    const w = aliveWorld(DB);
    const shield = w.players[0].shield;
    const tiers: number[] = [];
    const hits: number[] = [];
    for (let i = 0; i < 10; i++) {
      w.powerups.collectDirect(0, 2);
      tiers.push(shield.tier);
      hits.push(shield.maxHits);
    }
    expect(tiers).toEqual([1, 1, 1, 2, 2, 2, 2, 2, 3, 3]);
    expect(hits).toEqual([3, 3, 3, 4, 4, 4, 4, 4, 5, 5]);
    expect(shield.kind).toBe(ShieldKind.Arm);
    expect(shield.absorbsTerrain).toBe(true);
    // A worn Arm is repaired by the next one.
    shield.hits = 1;
    w.powerups.collectDirect(0, 2);
    expect(shield.hits).toBe(5);
  });

  it('orange gives a life (the ExtraLife cue), at most 9', () => {
    const w = aliveWorld(DB);
    const ship = w.players[0];
    const lives = ship.lives;
    drain(w);
    expect(w.powerups.collectDirect(0, 3)).toBe(true);
    expect(ship.lives).toBe(lives + 1);
    expect(drain(w).some((e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.ExtraLife)).toBe(
      true,
    );
    ship.lives = MAX_LIVES;
    expect(w.powerups.collectDirect(0, 3)).toBe(false);
    expect(ship.lives).toBe(MAX_LIVES);
  });

  it('yellow is the smart bomb: enemies destroyed, bullets cancelled, the screen flashes', () => {
    const w = aliveWorld(DB);
    const a = w.enemies.spawn(
      DB.enemyIndex.get('drifter') ?? -1,
      w.camera.x + 200,
      w.camera.y + 40,
    );
    const b = w.enemies.spawn(DB.enemyIndex.get('cube') ?? -1, w.camera.x + 260, w.camera.y + 90);
    spawnBullet(w, w.camera.x + 150, w.camera.y + 150, 512, 0, BulletKind.RoundPink);
    drain(w);
    expect(w.powerups.collectDirect(0, 4)).toBe(true);
    expect(a!.state).toBe(EnemyState.Removed);
    expect(b!.state).toBe(EnemyState.Removed);
    const events = drain(w);
    expect(events.some((e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.MegaCrash)).toBe(
      true,
    );
    expect(w.fx.flashTicks).toBeGreaterThan(0);
  });

  it('the octagon switches the main-shot family (Beam → Disc ↔ Laser → Wave), the level kept', () => {
    const w = aliveWorld(DB);
    const loadout = w.weapons.loadouts[0];
    expect(w.weapons.mainFamilies.map((f) => f.id)).toEqual(['beam-disc', 'laser-wave']);
    loadout.shot = 5;
    expect(w.powerups.collectDirect(0, 5)).toBe(true);
    expect([loadout.family, loadout.shot]).toEqual([1, 5]);
    expect(w.powerups.collectDirect(0, 5)).toBe(true);
    expect([loadout.family, loadout.shot]).toEqual([0, 5]);
  });

  it('pushes the pickup cue for every item and PowerUp events for effects', () => {
    const w = aliveWorld(DB);
    drain(w);
    w.powerups.collectDirect(0, 0);
    const events = drain(w);
    expect(events.map((e) => [e.kind, e.id])).toEqual([
      [SimEventKind.Sfx, SFX_CUES.CapsulePickup],
      [SimEventKind.Sfx, SFX_CUES.PowerUpEquip],
      [SimEventKind.PowerUp, DIRECT_POWER_UP_EVENT_BASE + 0],
    ]);
    expect(events[2].param).toBe(0);
    // A bad player or item changes nothing.
    expect(w.powerups.collectDirect(5, 0)).toBe(false);
    expect(w.powerups.collectDirect(0, 9)).toBe(false);
  });

  it('collects an item the ship touches: the effect and the item`s points in the same tick', () => {
    const w = aliveWorld(DB);
    const ship = w.players[0];
    const slot = w.powerups.spawnItem(ItemKind.DirectGreen, ship.x + 2, ship.y);
    expect(slot).toBe(0);
    stepWorld(w, createInputSnapshot());
    expect(w.weapons.loadouts[0].sub).toBe(1);
    expect(w.powerups.outcomes.pickupCount).toBe(1);
    expect(w.powerups.outcomes.pickupScore[0]).toBe(DIRECT_ITEM_SCORE);
    expect(ITEM_KINDS[ItemKind.DirectOctagon].score).toBe(DIRECT_ITEM_SCORE);
    expect(DIRECT_ITEM_KINDS).toHaveLength(DIRECT_ITEMS.length);
  });
});

describe('core/powerups Direct mode — drift, bounce, despawn', () => {
  it('drifts with the view, bounces off the playfield`s bottom, blinks and vanishes at 600 ticks', () => {
    const w = aliveWorld(DB);
    w.players[0].active = false; // nobody picks it up
    const slot = w.powerups.spawnItem(ItemKind.DirectBlue, w.camera.x + 300, w.camera.y + 190);
    const f = w.powerups.pool.fields;
    f.vx[slot] = -0.2;
    f.vy[slot] = 0.5;
    const input = createInputSnapshot();
    let bounced = false;
    let hidden = 0;
    for (let t = 1; t <= DIRECT_ITEM_TICKS + 1; t++) {
      stepWorld(w, input);
      if (w.powerups.count === 0) break;
      if (f.vy[0] < 0) bounced = true;
      if (t > DIRECT_ITEM_TICKS - ITEM_EXPIRY_BLINK_TICKS) {
        if ((w.powerups.itemBatch.flags[0] & SpriteFlag.Hidden) !== 0) hidden++;
      } else {
        expect(w.powerups.itemBatch.flags[0] & SpriteFlag.Hidden).toBe(0);
      }
    }
    expect(bounced).toBe(true);
    expect(hidden).toBeGreaterThan(20);
    expect(w.powerups.count).toBe(0);
    expect(f.flags[0] & ItemFlag.Dead).toBe(ItemFlag.Dead);
  });
});

describe('core/powerups Direct mode — the Speed toggle and the PowerUp press', () => {
  it('cycles the MANTA`s three speeds on the Speed press edge (holding it does not repeat)', () => {
    const w = aliveWorld(DB);
    const ship = w.players[0];
    expect(w.ship.speeds).toEqual([1.75, 2.25, 2.75]);
    expect(ship.speedLevel).toBe(1); // the MANTA's startSpeedLevel: 2.25 px/tick (D3)
    const input = createInputSnapshot();
    const levels: number[] = [];
    for (let i = 0; i < 4; i++) {
      run(w, input, Action.Speed, 3);
      levels.push(ship.speedLevel);
      run(w, input, 0);
    }
    expect(levels).toEqual([2, 0, 1, 2]);
  });

  it('ignores the PowerUp press in Direct mode and the Speed press in meter mode', () => {
    const w = aliveWorld(DB);
    const input = createInputSnapshot();
    w.powerups.meters[0].cursor = MeterSlot.Speed;
    drain(w);
    run(w, input, Action.PowerUp);
    expect(w.powerups.meters[0].cursor).toBe(MeterSlot.Speed);
    expect(
      drain(w).some((e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.PowerUpDenied),
    ).toBe(false);
    const meter = aliveWorld(DB, { shipId: 'kestrel', powerUpMode: 'meter' });
    run(meter, input, 0);
    run(meter, input, Action.Speed);
    expect(meter.players[0].speedLevel).toBe(0);
  });
});

describe('core/powerups Direct mode — death penalty and starting loadouts', () => {
  it('takes the Arm in every preset; classic one level, arcade everything, casual nothing more', () => {
    const w = aliveWorld(DB, { loadout: 'full' });
    const ship = w.players[0];
    const loadout = w.weapons.loadouts[0];
    expect([loadout.shot, loadout.sub, ship.shield.tier, ship.shield.hits]).toEqual([8, 8, 3, 5]);
    loadout.family = 1;
    expect(applyDirectDeathPenalty('casual', ship, loadout)).toBe(-1);
    expect(shieldActive(ship.shield)).toBe(false);
    expect([ship.shield.tier, ship.shield.charge]).toEqual([0, 0]);
    expect([loadout.shot, loadout.sub, loadout.family]).toEqual([8, 8, 1]);
    expect(applyDirectDeathPenalty('classic', ship, loadout)).toBe(0);
    expect(loadout.shot).toBe(7);
    loadout.shot = 0;
    expect(applyDirectDeathPenalty('classic', ship, loadout)).toBe(1);
    expect(loadout.sub).toBe(7);
    loadout.sub = 0;
    expect(applyDirectDeathPenalty('classic', ship, loadout)).toBe(-1);
    loadout.shot = 4;
    loadout.sub = 3;
    expect(applyDirectDeathPenalty('arcade', ship, loadout)).toBe(-1);
    expect([loadout.shot, loadout.sub, loadout.family]).toEqual([0, 0, 0]);
  });

  it('a death in a Direct-mode World costs the Classic level and the Arm; the speed stays', () => {
    const w = aliveWorld(DB, { loadout: 'full' });
    const ship = w.players[0];
    ship.speedLevel = 2;
    ship.shield.hits = 0;
    ship.shield.kind = ShieldKind.None;
    const e = w.enemies.spawn(DB.enemyIndex.get('drifter') ?? -1, ship.x, ship.y);
    expect(e).not.toBeNull();
    stepWorld(w, createInputSnapshot());
    expect(ship.state).toBe('dying');
    expect(w.weapons.loadouts[0].shot).toBe(7);
    expect(ship.shield.tier).toBe(0);
    expect(ship.speedLevel).toBe(2);
  });

  it('starts the MANTA at level 0 in the middle speed, without an Arm, and never fires the meter', () => {
    const w = aliveWorld(DB);
    const loadout = w.weapons.loadouts[0];
    expect([loadout.shot, loadout.sub, loadout.family, loadout.options]).toEqual([0, 0, 0, 0]);
    expect(w.players[0].speedLevel).toBe(1);
    expect(shieldActive(w.players[0].shield)).toBe(false);
  });

  it('counts half the levels and the Arm tier towards the rank (12 at full power)', () => {
    expect(directPowerRank(0, 0, 0)).toBe(0);
    expect(directPowerRank(3, 2, 0)).toBe(2);
    expect(directPowerRank(8, 8, 3)).toBe(12);
    expect(directPowerRank(-1, 1.9, 7)).toBe(RANK_ARM_TIER[3]);
    expect(RANK_ARM_TIER).toEqual([0, 2, 3, 4]);
    const w = aliveWorld(DB, { loadout: 'full' });
    expect(updateWorldRank(w)).toBe(w.config.rankBase + 12);
    w.weapons.loadouts[0].shot = 2;
    w.weapons.loadouts[0].sub = 1;
    w.players[0].shield.kind = ShieldKind.None;
    w.players[0].shield.hits = 0;
    expect(updateWorldRank(w)).toBe(w.config.rankBase + 1);
  });
});

describe('core/powerups Direct mode — determinism', () => {
  it('two MANTA worlds on the direct range with the same input hash alike, tick after tick', () => {
    const a = aliveWorld(DB, { stage: 'direct-range' });
    const b = aliveWorld(DB, { stage: 'direct-range' });
    const inputA = createInputSnapshot();
    const inputB = createInputSnapshot();
    for (let t = 0; t < 2400; t++) {
      const held = (t / 50) % 2 < 1 ? Action.Up : Action.Down;
      run(a, inputA, held | (t % 400 === 0 ? Action.Speed : 0));
      run(b, inputB, held | (t % 400 === 0 ? Action.Speed : 0));
      a.events.clear();
      b.events.clear();
      expect(hashWorld(a)).toBe(hashWorld(b));
    }
    const drops = a.powerups.planCursor;
    // The pincer waves and lead carriers of the range handed out items.
    expect(drops).toBeGreaterThanOrEqual(3);
  });
});
