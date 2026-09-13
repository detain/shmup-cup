/**
 * The Option Hunter (plan M2-04, shmup_feat.md §8 / §11) and the blue capsule: a hunter spawns
 * only while some ship owns an Option (with its alarm), is armoured and harmless to the ship, lines
 * up and charges (the three variants), steals the Options it touches (the chain behind the first
 * one it touches), carries them grey; Mega Crash — or the blue capsule — kills it and frees them to
 * drift, re-collectable, until they expire; a hunter that escapes keeps them. The blue capsule
 * clears the enemies on screen (not the meter, not the ones outside the view); `blueCapsule`
 * drops from enemies and formations. Determinism of a full hunter run.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import {
  CARRIED_OPTION_SPACING,
  DropKind,
  EnemyFlag,
  EnemyState,
  MAX_CARRIED_OPTIONS,
  type Enemy,
} from '../../src/enemies/index.js';
import { SFX_CUES, SimEventKind, type SimEvent } from '../../src/events/index.js';
import { createInputSnapshot, type InputSnapshot } from '../../src/input/index.js';
import { KNOWN_SCRIPT_IDS } from '../../src/behaviors/index.js';
import {
  FREE_OPTION_DRIFT,
  FREE_OPTION_TICKS,
  ItemFlag,
  ItemKind,
  MeterSlot,
} from '../../src/powerups/index.js';
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

/**
 * The shipped hunters and test-range roster (the blue carrier), the KESTREL, Type A, the paths the
 * roster needs and the hunter range stage.
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('tilesets/terrain-a.tileset.json'),
      shipped('paths/test-range.paths.json'),
      shipped('enemies/option-hunters.enemies.json'),
      shipped('enemies/test-range.enemies.json'),
      shipped('stages/hunter-range.stage.json'),
    ],
    { extraSprites: ENGINE_SPRITES, knownScripts: KNOWN_SCRIPT_IDS },
  );
  expect(issues).toEqual([]);
  return content;
}

/** The shared DB. */
const DB = db();

/**
 * A free-flight world, player 1 alive at view (`x`, `y`) with `options` Options (autofire off).
 *
 * @param options - Options owned.
 * @param config - Config overrides.
 * @param x - View x of the ship.
 * @param y - View y of the ship.
 * @returns The world.
 */
function world(options: number, config: Partial<GameConfig> = {}, x = 200, y = 100): World {
  const w = createWorld(
    resolveGameConfig({ seed: 9, autofire: false, remoteMode: false, ...config }),
    DB,
  );
  const input = createInputSnapshot();
  while (w.players[0].state !== 'alive') stepWorld(w, input);
  w.players[0].x = w.camera.x + x;
  w.players[0].y = w.camera.y + y;
  w.weapons.loadouts[0].options = options;
  w.weapons.options[0].reset(w.players[0], w.camera);
  stepWorld(w, input);
  w.events.clear();
  return w;
}

/**
 * Steps a world and collects its events.
 *
 * @param w - The world.
 * @param input - The input.
 * @param ticks - Ticks to run.
 * @returns The events.
 */
function run(w: World, input: InputSnapshot, ticks: number): SimEvent[] {
  const out: SimEvent[] = [];
  for (let t = 0; t < ticks; t++) {
    stepWorld(w, input);
    w.events.drain((e) => out.push({ ...e }));
  }
  return out;
}

/**
 * Spawns an enemy by id at a view position.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @param x - View x.
 * @param y - View y.
 * @returns The enemy, or `null`.
 */
function spawn(w: World, id: string, x: number, y: number): Enemy | null {
  return w.enemies.spawn(w.content.enemyIndex.get(id)!, w.camera.x + x, w.camera.y + y);
}

/**
 * The live items of a kind.
 *
 * @param w - The world.
 * @param kind - `ItemKind`.
 * @returns Their slots.
 */
function items(w: World, kind: number): number[] {
  const f = w.powerups.pool.fields;
  const out: number[] = [];
  for (let i = 0; i < w.powerups.pool.count; i++) {
    if ((f.flags[i] & ItemFlag.Dead) === 0 && f.kind[i] === kind) out.push(i);
  }
  return out;
}

/**
 * Counts the SFX of a cue.
 *
 * @param events - Events.
 * @param cue - `SFX_CUES` id.
 * @returns How many.
 */
function sfx(events: readonly SimEvent[], cue: number): number {
  return events.filter((e) => e.kind === SimEventKind.Sfx && e.id === cue).length;
}

describe('M2-04 Option Hunter: appearance', () => {
  it('spawns only while some ship owns an Option, with its alarm', () => {
    const none = world(0);
    expect(spawn(none, 'option-hunter-rear', -24, 100)).toBeNull();
    const events: SimEvent[] = [];
    none.events.drain((e) => events.push({ ...e }));
    expect(sfx(events, SFX_CUES.OptionHunter)).toBe(0);
    const w = world(1);
    const hunter = spawn(w, 'option-hunter-rear', -24, 100);
    expect(hunter).not.toBeNull();
    const pushed: SimEvent[] = [];
    w.events.drain((e) => pushed.push({ ...e }));
    expect(sfx(pushed, SFX_CUES.OptionHunter)).toBe(1);
    expect(hunter!.flags & EnemyFlag.Invulnerable).toBe(EnemyFlag.Invulnerable);
    expect(hunter!.carried).toBe(0);
  });

  it('is armoured against shots and never hurts the ship by contact', () => {
    const w = world(2);
    const hunter = spawn(w, 'option-hunter-front', 200, 100)!;
    hunter.x = w.players[0].x;
    hunter.y = w.players[0].y;
    expect(w.enemies.damage(hunter, 50, 0)).toBe(false);
    run(w, createInputSnapshot(), 3);
    expect(w.players[0].hitTick).toBe(-1);
    expect(w.players[0].state).toBe('alive');
  });

  it('the stage refuses its scripted hunters without Options', () => {
    const w = createWorld(
      resolveGameConfig({ seed: 1, stage: 'hunter-range', autofire: false, remoteMode: false }),
      DB,
    );
    // Straight to the first hunter event (camera x 700) with no Options.
    const input = createInputSnapshot();
    w.debugFlags.godMode = true;
    let spawned = 0;
    for (let t = 0; t < 760; t++) {
      stepWorld(w, input);
      w.weapons.loadouts[0].options = 0;
      for (const e of w.enemies.enemies) {
        if (e.state === EnemyState.Live && w.content.enemies[e.specIndex].optionHunter) spawned++;
      }
    }
    expect(w.camera.x).toBeGreaterThan(700);
    expect(spawned).toBe(0);
  });
});

describe('M2-04 Option Hunter: line up, charge, steal', () => {
  it('rear variant: lines up on the ship`s row behind it, charges and takes every Option', () => {
    const w = world(4, {}, 220, 130);
    const ship = w.players[0];
    const hunter = spawn(w, 'option-hunter-rear', -24, 40)!;
    const input = createInputSnapshot();
    const events = run(w, input, 100);
    // Lined up on the ship's row at view x 48, holding before the charge.
    expect(hunter.y - w.camera.y).toBeCloseTo(130, 0);
    expect(hunter.x - w.camera.x).toBeCloseTo(48, 0);
    expect(sfx(events, SFX_CUES.OptionStolen)).toBe(0);
    const stolen = run(w, input, 80);
    expect(sfx(stolen, SFX_CUES.OptionStolen)).toBe(1);
    expect(hunter.vx).toBeCloseTo(4.5, 9);
    expect(w.weapons.loadouts[0].options).toBe(0);
    expect(hunter.carried).toBe(4);
    expect(w.weapons.options[0].stolen).toBe(4);
    expect(w.weapons.options[0].count).toBe(0);
    expect(ship.state).toBe('alive');
    // Drawn grey behind it, away from where it flies.
    expect(w.enemies.carriedBatch.count).toBe(4);
    expect(w.enemies.carriedBatch.x[0]).toBeCloseTo(hunter.x - CARRIED_OPTION_SPACING, 6);
    expect(w.content.sprites.names[w.enemies.carriedBatch.spriteId[0]]).toBe('options/stolen');
  });

  it('front variant charges left along the row; dive variant drops down the column', () => {
    const front = world(1, {}, 150, 60);
    const h1 = spawn(front, 'option-hunter-front', 400, 170)!;
    run(front, createInputSnapshot(), 120);
    expect(h1.y - front.camera.y).toBeCloseTo(60, 0);
    run(front, createInputSnapshot(), 30);
    expect(h1.vx).toBeLessThan(0);
    expect(h1.vy).toBe(0);
    const dive = world(1, {}, 250, 150);
    const h2 = spawn(dive, 'option-hunter-dive', 60, -24)!;
    run(dive, createInputSnapshot(), 110);
    expect(h2.x - dive.camera.x).toBeCloseTo(250, 0);
    expect(h2.y - dive.camera.y).toBeCloseTo(24, 0);
    run(dive, createInputSnapshot(), 30);
    expect(h2.vy).toBeGreaterThan(0);
    expect(h2.vx).toBe(0);
  });

  it('cuts the chain: the first Option it touches and every one behind it', () => {
    const w = world(4, { optionChoice: 'formation' });
    const group = w.weapons.options[0];
    expect(group.count).toBe(4);
    const hunter = spawn(w, 'option-hunter-front', 300, 20)!;
    // Park it on Option 3 (index 2): Options 3 and 4 go, 1 and 2 stay.
    hunter.x = group.x[2];
    hunter.y = group.y[2];
    hunter.hw = 1;
    hunter.hh = 1;
    expect(w.enemies.huntOptions()).toBe(2);
    expect([w.weapons.loadouts[0].options, group.count, hunter.carried]).toEqual([2, 2, 2]);
    // A carrier full to MAX_CARRIED_OPTIONS takes nothing more.
    hunter.carried = MAX_CARRIED_OPTIONS;
    hunter.x = group.x[0];
    hunter.y = group.y[0];
    expect(w.enemies.huntOptions()).toBe(0);
  });
});

describe('M2-04 Option Hunter: freed Options', () => {
  it('Mega Crash kills it and frees its Options: grey, drifting, re-collectable', () => {
    const w = world(3);
    const hunter = spawn(w, 'option-hunter-front', 300, 50)!;
    hunter.carried = 3;
    w.weapons.loadouts[0].options = 0;
    stepWorld(w, createInputSnapshot());
    const killed = w.powerups.detonateMegaCrash(0);
    expect(killed).toBe(1);
    expect(hunter.state).toBe(EnemyState.Removed);
    expect(hunter.carried).toBe(0);
    const o = w.enemies.outcomes;
    const drops = [...o.dropKind.slice(0, o.dropCount)];
    expect(drops).toEqual([DropKind.FreeOption, DropKind.FreeOption, DropKind.FreeOption]);
    // They become FreeOption items at the end of the damage phase.
    w.powerups.resolve();
    const freed = items(w, ItemKind.FreeOption);
    expect(freed).toHaveLength(3);
    const f = w.powerups.pool.fields;
    expect([f.vx[freed[0]], f.vy[freed[0]]]).toEqual([FREE_OPTION_DRIFT[0], FREE_OPTION_DRIFT[1]]);
    expect([f.vx[freed[1]], f.vy[freed[1]]]).toEqual([FREE_OPTION_DRIFT[2], FREE_OPTION_DRIFT[3]]);
    // They drift with the view.
    const x0 = f.x[freed[0]];
    w.camera.vx = 1;
    run(w, createInputSnapshot(), 10);
    expect(f.x[freed[0]]).toBeCloseTo(x0 + 10 * (1 + FREE_OPTION_DRIFT[0]), 6);
    // Fly through them: each gives an Option back.
    const ship = w.players[0];
    let back = 0;
    for (let t = 0; t < 60 && back < 3; t++) {
      const live = items(w, ItemKind.FreeOption);
      if (live.length > 0) {
        ship.x = f.x[live[0]];
        ship.y = f.y[live[0]];
      }
      const events = run(w, createInputSnapshot(), 1);
      back += events.filter(
        (e) => e.kind === SimEventKind.PowerUp && e.id === MeterSlot.Option,
      ).length;
    }
    expect(back).toBe(3);
    expect(w.weapons.loadouts[0].options).toBe(3);
  });

  it('the blue capsule frees them too; with four Options a freed one only dings', () => {
    const w = world(4);
    const hunter = spawn(w, 'option-hunter-front', 300, 50)!;
    hunter.carried = 1;
    stepWorld(w, createInputSnapshot());
    expect(w.powerups.clearScreen(0)).toBe(1);
    w.powerups.resolve();
    expect(items(w, ItemKind.FreeOption)).toHaveLength(1);
    expect(w.powerups.regainOption(0)).toBe(false);
    expect(w.weapons.loadouts[0].options).toBe(4);
  });

  it('freed Options expire after FREE_OPTION_TICKS; an escaping hunter keeps its haul', () => {
    const w = world(2);
    const i = w.powerups.spawnItem(ItemKind.FreeOption, w.camera.x + 300, w.camera.y + 40);
    expect(i).toBeGreaterThanOrEqual(0);
    run(w, createInputSnapshot(), FREE_OPTION_TICKS - 2);
    expect(items(w, ItemKind.FreeOption)).toHaveLength(1);
    run(w, createInputSnapshot(), 3);
    expect(items(w, ItemKind.FreeOption)).toHaveLength(0);
    const hunter = spawn(w, 'option-hunter-front', 300, 20)!;
    hunter.carried = 2;
    hunter.x = w.camera.x + 700; // far outside the view: it escapes
    run(w, createInputSnapshot(), 3);
    expect(hunter.state).toBe(EnemyState.Free);
    expect(items(w, ItemKind.FreeOption)).toHaveLength(0);
  });
});

describe('M2-04 blue capsule', () => {
  it('drops from its carrier and clears the enemies on screen — not the meter, not off screen', () => {
    const w = world(0);
    const carrier = spawn(w, 'carrier-blue', 300, 60)!;
    stepWorld(w, createInputSnapshot());
    w.enemies.kill(carrier, 0);
    w.powerups.resolve();
    const blue = items(w, ItemKind.BlueCapsule);
    expect(blue).toHaveLength(1);
    const a = spawn(w, 'drifter', 250, 150)!;
    const b = spawn(w, 'turret', 330, 100)!;
    const far = spawn(w, 'drifter', 460, 100)!;
    stepWorld(w, createInputSnapshot()); // on-screen flags
    const cursor = w.powerups.meters[0].cursor;
    const ship = w.players[0];
    const f = w.powerups.pool.fields;
    ship.x = f.x[blue[0]];
    ship.y = f.y[blue[0]];
    const events = run(w, createInputSnapshot(), 1);
    expect(a.state).not.toBe(EnemyState.Live);
    expect(b.state).not.toBe(EnemyState.Live);
    expect(far.state).toBe(EnemyState.Live);
    expect(w.powerups.meters[0].cursor).toBe(cursor);
    expect(sfx(events, SFX_CUES.MegaCrash)).toBe(1);
    expect(events.some((e) => e.kind === SimEventKind.Flash)).toBe(true);
  });

  it('a `blueCapsule` formation drops it when completed', () => {
    const w = world(0);
    const index = w.content.enemyIndex.get('drifter')!;
    const slot = w.enemies.startFormation(index, 2, 1, 300, 60, -1, DropKind.BlueCapsule, 0);
    run(w, createInputSnapshot(), 2);
    for (const e of w.enemies.enemies) {
      if (e.state === EnemyState.Live && e.formation === slot) w.enemies.kill(e, 0);
    }
    w.powerups.resolve();
    expect(items(w, ItemKind.BlueCapsule)).toHaveLength(1);
  });
});

describe('M2-04 hunter range determinism', () => {
  it('two runs of the hunter range with a full loadout hash equal', () => {
    const hashes: number[] = [];
    let stole = 0;
    for (let r = 0; r < 2; r++) {
      const w = createWorld(
        resolveGameConfig({ seed: 4, stage: 'hunter-range', loadout: 'full', autofire: true }),
        DB,
      );
      w.debugFlags.godMode = true;
      const input = createInputSnapshot();
      for (let t = 0; t < 1700; t++) {
        stepWorld(w, input);
        w.events.drain((e) => {
          if (e.kind === SimEventKind.Sfx && e.id === SFX_CUES.OptionStolen) stole++;
        });
      }
      hashes.push(hashWorld(w));
    }
    expect(hashes[0]).toBe(hashes[1]);
    expect(stole).toBeGreaterThan(0);
  });
});
