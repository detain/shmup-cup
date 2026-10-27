/**
 * `core/weapons` edge cases (plan M1-10), complementing the acceptance suite `weapons.test.ts`:
 *
 * - **Content → roles.** Preset choice (`type-a`, else the first, else none), role fallbacks, a
 *   non-weapon behaviour leaves its role empty, the loadout's main weapon falls back to the main
 *   shot, a Double without a main shot draws and sizes its forward shot itself; tunables are
 *   clamped / rounded / wrapped (cooldown 1–255, lengths, hit boxes, angles, frames);
 *   `checkWeaponBehaviors` on every wrong slot and on `Object.prototype` names.
 * - **Firing.** Exact spawn geometry and velocities of the four behaviours, the first volley on
 *   the tick the fly-in ends, nothing from a fly-in / dying / inactive ship, a cap-1 weapon
 *   refiring the tick after its shot is freed, Sub without Shot, missile intervals, the Double at
 *   cap 1 and 3, one SFX per cue and tick at whole pixels, silent weapons, player 2's shooters.
 * - **Flight.** Shots ride the camera (both axes), exact culling at the view ± 16 px on every
 *   side (lasers by head and tail), non-finite spawns culled without hitting, the laser stopped
 *   at a wall column (also while the stage scrolls) and following its Option / keeping its row,
 *   the missile on a 12-px step with `slideSpeed` 10.5 (climbs, descends) and 6 (dies / falls over
 *   the cliff), into a wall's side, without terrain, and its animation frames.
 * - **Hits.** Closed box tests, the physical pick (nearest entry edge, exact ties to the lowest
 *   slot), a second shot flying on past an enemy killed this tick, ghosts, damage 0, missile
 *   damage, lasers dying on armour, the hit-list limit, cooldown tables zeroed on reuse, counted
 *   down only while in use and hashed only then, and a grid-vs-brute-force fuzz with fractional
 *   positions, scrolling and enemies off the grid.
 * - **Presentation / restart.** Laser segments, the batch capacity, Option sprites and frames,
 *   options drawn nowhere without the engine sprite (but still firing), a checkpoint restart.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PLAYFIELD_H,
  PLAYFIELD_W,
  resolveGameConfig,
  WORLD_SCALE,
  type GameConfig,
} from '../../src/config/index.js';
import {
  EMPTY_CONTENT_DB,
  loadContent,
  type ContentDb,
  type ContentFile,
} from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { EnemyFlag, EnemyState, MAX_ENEMIES, type Enemy } from '../../src/enemies/index.js';
import { SFX_CUES, SimEventKind, type SimEvent } from '../../src/events/index.js';
import {
  Action,
  commitPlayerInput,
  createInputSnapshot,
  type InputSnapshot,
} from '../../src/input/index.js';
import { SIN_TABLE_Q16, TRIG_SCALE } from '../../src/math/trig-table.js';
import {
  MAX_OPTIONS,
  OPTION_ANIM_TICKS,
  OPTION_FRAMES,
  OPTION_SPACING,
  OPTION_SPRITE,
} from '../../src/options/index.js';
import {
  VERTICAL_RAMP_TICKS,
  createPlayer,
  setPlayerState,
  spawnPlayer,
} from '../../src/player/index.js';
import { createRng } from '../../src/rng/index.js';
import {
  DEFAULT_WEAPON_PRESET,
  FULL_LOADOUT_SPEED_LEVEL,
  LASER_SEGMENT_LENGTH,
  Loadout,
  MAX_PLAYER_SHOTS,
  MAX_SHOOTERS,
  MAX_SHOT_HITS,
  MainWeapon,
  PIERCE_TABLES,
  SFX_RATE_TICKS,
  SHOOTERS_PER_PLAYER,
  SHOT_BATCH_CAPACITY,
  SHOT_CULL_MARGIN,
  SHOT_SCHEMA,
  ShotFlag,
  ShotKind,
  WEAPON_BEHAVIOR_KINDS,
  WEAPON_BEHAVIOR_PARAMS,
  WEAPON_BEHAVIOR_SLOTS,
  WEAPON_ROLE_COUNT,
  WEAPON_SCRIPT_IDS,
  WeaponRole,
  applyLoadoutPreset,
  checkWeaponBehaviors,
  resolveRoleWeapons,
  resolveWeaponPreset,
} from '../../src/weapons/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld, type World } from '../../src/world/index.js';
import { v1rel, v1speed } from '../helpers/v1-port.js';

// ------------------------------------------------------------------------------------ content

/**
 * A shipped content file.
 *
 * @param path - Path below `content/`.
 * @returns The file (a fresh copy every call).
 */
function shipped(path: string): ContentFile {
  return {
    path,
    data: JSON.parse(
      readFileSync(new URL('../../../../content/' + path, import.meta.url), 'utf8'),
    ) as unknown,
  };
}

/** A weapon entry of a weapons file. */
type WeaponEntry = Record<string, unknown>;

/** The shipped Type A weapons, by id. */
const TYPE_A = (shipped('weapons/type-a.weapons.json').data as { weapons: WeaponEntry[] }).weapons;

/**
 * The shipped Type A file with per-weapon overrides (`null` drops that weapon and its preset
 * reference).
 *
 * @param over - Fields to change per weapon id.
 * @returns The file.
 */
function typeA(over: Record<string, WeaponEntry | null> = {}): ContentFile {
  const weapons: WeaponEntry[] = [];
  const preset: Record<string, string | null> = {
    id: 'type-a',
    main: 'shot.basic',
    missile: 'missile.ground',
    double: 'shot.double',
    laser: 'laser.pierce',
  };
  for (const w of TYPE_A) {
    const id = w.id as string;
    const change = over[id];
    if (change === null) {
      for (const key of Object.keys(preset)) if (preset[key] === id) preset[key] = null;
      continue;
    }
    weapons.push({ ...w, ...(change ?? {}) });
  }
  return weaponsFile(weapons, [preset]);
}

/**
 * A weapons file.
 *
 * @param weapons - The weapons.
 * @param presets - The presets (omitted when `undefined`).
 * @returns The file.
 */
function weaponsFile(weapons: WeaponEntry[], presets?: Record<string, unknown>[]): ContentFile {
  return {
    path: 'weapons/w.weapons.json',
    data: {
      formatVersion: 1,
      kind: 'weapons',
      weapons,
      ...(presets === undefined ? {} : { presets }),
    },
  };
}

/**
 * One weapon entry.
 *
 * @param id - Id.
 * @param slot - Slot.
 * @param behavior - Behaviour id.
 * @param over - Other fields.
 * @returns The entry.
 */
function weapon(id: string, slot: string, behavior: string, over: WeaponEntry = {}): WeaponEntry {
  return {
    id,
    slot,
    behavior,
    damage: 1,
    speed: 7,
    cap: 2,
    pierce: behavior === 'laser.beam',
    sprite: 'shots/basic',
    sfx: 'PlayerShot',
    ...over,
  };
}

/**
 * An enemy entry: a scriptless target that stays where it spawns.
 *
 * @param id - Enemy id.
 * @param over - Fields to change.
 * @returns The entry.
 */
function enemy(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    hp: 1000,
    score: 100,
    hurtbox: { hw: v1rel(4), hh: v1rel(4) },
    script: 'test.idle',
    sprite: 'enemies/drifter',
    drop: null,
    ...over,
  };
}

/** The shipped tileset's tile size — 8 px until R2-02's port, 12 px after it. */
const TILE = (shipped('tilesets/terrain-a.tileset.json').data as { tileSize: number }).tileSize;

/** Rows of the test stage's map: one playfield tall (42 at K=1, 28 ported). */
const ROWS = PLAYFIELD_H / TILE;

/**
 * A stage file with a flat 32-px floor.
 *
 * @param id - Stage id.
 * @param speed - Camera scroll speed.
 * @returns The file.
 */
function stageFile(id: string, speed: number): ContentFile {
  return {
    path: 'stages/' + id + '.stage.json',
    data: {
      formatVersion: 1,
      kind: 'stage',
      id,
      name: id,
      music: { stage: 'Stage', boss: 'Boss' },
      length: 3000,
      camera: [{ x: 0, speed }],
      checkpoints: [{ x: 0 }],
      parallax: [],
      tilemap: {
        tileSize: TILE,
        tileset: 'terrain-a',
        rowsTall: ROWS,
        generator: {
          type: 'heightfield',
          segments: [
            {
              from: 0,
              to: 3000 + PLAYFIELD_W,
              floor: { base: 4 * TILE, amp: 0, period: 64, seed: 1 },
            },
          ],
        },
      },
      events: [],
    },
  };
}

/** Options of {@link db}. */
interface DbOptions {
  /** Intern the engine sprites (default `true`; `false` = the Option has no sprite). */
  readonly engineSprites?: boolean;
  /** The KESTREL's fly-in length. */
  readonly enterTicks?: number;
}

/**
 * Test content: the KESTREL, a weapons file, the shipped tileset, the test enemies, a static
 * stage `t` and a scrolling stage `s` (1 px/tick).
 *
 * @param weapons - The weapons file (default: the shipped Type A), or `null` for none.
 * @param options - See {@link DbOptions}.
 * @returns The DB (asserted issue-free).
 */
function db(weapons: ContentFile | null = typeA(), options: DbOptions = {}): ContentDb {
  const player = shipped('player/kestrel.player.json');
  if (options.enterTicks !== undefined) {
    (player.data as { ships: { enterTicks: number }[] }).ships[0].enterTicks = options.enterTicks;
  }
  const files: ContentFile[] = [
    player,
    shipped('tilesets/terrain-a.tileset.json'),
    {
      path: 'enemies/t.enemies.json',
      data: {
        formatVersion: 1,
        kind: 'enemies',
        enemies: [
          enemy('target'),
          enemy('weak', { hp: 1, score: 200 }),
          enemy('wide', { hurtbox: { hw: 100, hh: 8 } }),
          enemy('armor', { hp: 5 }),
          enemy('odd', { hurtbox: { hw: 3, hh: 1 } }),
        ],
      },
    },
    stageFile('t', 0),
    stageFile('s', 1),
  ];
  if (weapons !== null) files.push(weapons);
  const { db: content, issues } = loadContent(
    files,
    options.engineSprites === false ? {} : { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

/** The shared default DB (content is read-only). */
const DB = db();

/** A world with autofire off (only held buttons fire). */
const MANUAL: Partial<GameConfig> = { autofire: false, remoteMode: false };

/**
 * A world whose player 1 is alive (fly-in done), parked at (`x`, `y`) in the view, with an empty
 * shot pool and no events.
 *
 * @param config - Config overrides.
 * @param content - Content (default {@link DB}).
 * @param x - Ship x relative to the camera.
 * @param y - Ship y relative to the camera.
 * @returns The world.
 */
function world(config: Partial<GameConfig> = {}, content: ContentDb = DB, x = 40, y = 100): World {
  const w = createWorld(resolveGameConfig({ seed: 5, ...config }), content);
  const input = createInputSnapshot();
  while (w.players[0].state !== 'alive') stepWorld(w, input);
  w.players[0].x = w.camera.x + x;
  w.players[0].y = w.camera.y + y;
  w.players[0].invulnTicks = 1e9;
  w.weapons.pool.clear();
  w.weapons.timers.fill(0);
  w.events.clear();
  // One idle manual tick so the tables and counts start clean.
  if (config.autofire === false && config.remoteMode === false) {
    stepWorld(w, input);
    w.events.clear();
  }
  return w;
}

/**
 * Steps a world and collects its events.
 *
 * @param w - The world.
 * @param ticks - Ticks to run.
 * @param input - Input (default idle).
 * @returns Every event pushed, with the tick it was drained after.
 */
function run(
  w: World,
  ticks: number,
  input: InputSnapshot = createInputSnapshot(),
): (SimEvent & { tick: number })[] {
  const out: (SimEvent & { tick: number })[] = [];
  for (let i = 0; i < ticks; i++) {
    stepWorld(w, input);
    w.events.drain((e) => out.push({ ...e, tick: w.tick - 1 }));
  }
  return out;
}

/**
 * Input holding some actions for player 1.
 *
 * @param held - Action bits.
 * @returns The snapshot.
 */
function holding(held: number): InputSnapshot {
  const input = createInputSnapshot();
  commitPlayerInput(input.players[0], held);
  return input;
}

/**
 * Spawns a test enemy at a view position.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @param x - X relative to the camera.
 * @param y - Y relative to the camera.
 * @returns The enemy.
 */
function spawn(w: World, id: string, x: number, y: number): Enemy {
  const e = w.enemies.spawn(w.content.enemyIndex.get(id)!, w.camera.x + x, w.camera.y + y);
  expect(e).not.toBeNull();
  return e!;
}

/** A shot as a plain record. */
interface ShotView {
  /** Slot. */
  readonly i: number;
  /** Fields. */
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly hw: number;
  readonly hh: number;
  readonly length: number;
  readonly damage: number;
  readonly role: number;
  readonly kind: number;
  readonly shooter: number;
  readonly flags: number;
  readonly sprite: string;
  readonly frame: number;
  readonly age: number;
  readonly table: number;
}

/**
 * The live shots, optionally of one kind.
 *
 * @param w - The world.
 * @param kind - `ShotKind` filter.
 * @returns The shots in slot order.
 */
function shots(w: World, kind?: number): ShotView[] {
  const f = w.weapons.pool.fields;
  const out: ShotView[] = [];
  for (let i = 0; i < w.weapons.pool.count; i++) {
    if ((f.flags[i] & ShotFlag.Dead) !== 0) continue;
    if (kind !== undefined && f.kind[i] !== kind) continue;
    out.push({
      i,
      x: f.x[i],
      y: f.y[i],
      vx: f.vx[i],
      vy: f.vy[i],
      hw: f.hw[i],
      hh: f.hh[i],
      length: f.length[i],
      damage: f.damage[i],
      role: f.role[i],
      kind: f.kind[i],
      shooter: f.shooter[i],
      flags: f.flags[i],
      sprite: w.content.sprites.names[f.sprite[i]],
      frame: f.frame[i],
      age: f.age[i],
      table: f.table[i],
    });
  }
  return out;
}

/**
 * `sin` of a binary angle as the weapons compute it.
 *
 * @param a - Binary angle (0–1023).
 * @returns The sine.
 */
const sinB = (a: number): number => SIN_TABLE_Q16[a & 1023] / TRIG_SCALE;
/**
 * `cos` of a binary angle as the weapons compute it.
 *
 * @param a - Binary angle (0–1023).
 * @returns The cosine.
 */
const cosB = (a: number): number => SIN_TABLE_Q16[(a & 1023) + 256] / TRIG_SCALE;

/**
 * Builds the World's grid with the enemies' hurtboxes, then runs `collide`.
 *
 * @param w - The world.
 */
function collideNow(w: World): void {
  const grid = w.grid;
  grid.begin(Math.floor(w.camera.x) - 64, Math.floor(w.camera.y) - 64);
  w.enemies.insertColliders(grid);
  grid.build();
  w.weapons.collide(grid);
}

/**
 * The hits of the last `collide`.
 *
 * @param w - The world.
 * @returns `[shot, enemy]` pairs.
 */
function hitList(w: World): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k < w.weapons.hitCount; k++) {
    out.push([w.weapons.hitShot[k], w.weapons.hitEnemy[k]]);
  }
  return out;
}

/**
 * Clears the terrain of a world and lays a flat floor (surface row 20) out to 96 px (at K=1) past
 * the view's right edge.
 *
 * @param w - The world (with a stage).
 * @returns A tile setter `(col, row, tile)`.
 */
function flatFloor(w: World): (col: number, row: number, tile: number) => void {
  const map = w.terrain!;
  map.tiles.fill(0);
  const set = (col: number, row: number, tile: number): void => {
    map.tiles[row * map.cols + col] = tile;
  };
  // Out to one tile past the view's right edge.
  for (let col = 0; col < (PLAYFIELD_W + v1rel(96)) / TILE; col++) {
    for (let row = 21; row < map.rows; row++) set(col, row, 1);
    set(col, 20, 2);
  }
  return set;
}

// -------------------------------------------------------------------------------------- tests

describe('core/weapons edge cases — tables, content and roles', () => {
  it('keeps its constant tables consistent', () => {
    expect(MAX_PLAYER_SHOTS).toBe(96);
    expect(SHOOTERS_PER_PLAYER).toBe(1 + MAX_OPTIONS);
    expect(MAX_SHOOTERS).toBe(2 * SHOOTERS_PER_PLAYER);
    expect(SHOT_CULL_MARGIN).toBe(16 * WORLD_SCALE);
    expect(SFX_RATE_TICKS).toBe(4);
    expect(PIERCE_TABLES).toBe(32);
    expect(MAX_SHOT_HITS).toBe(1024);
    expect(SHOT_BATCH_CAPACITY).toBe(192);
    expect(LASER_SEGMENT_LENGTH).toBe(8 * WORLD_SCALE);
    expect(DEFAULT_WEAPON_PRESET).toBe('type-a');
    expect(WEAPON_ROLE_COUNT).toBe(Object.keys(WeaponRole).length);
    const ids = Object.keys(WEAPON_BEHAVIOR_KINDS).sort();
    expect(WEAPON_SCRIPT_IDS).toEqual(ids);
    expect(Object.keys(WEAPON_BEHAVIOR_PARAMS).sort()).toEqual(ids);
    expect(Object.keys(WEAPON_BEHAVIOR_SLOTS).sort()).toEqual(ids);
    expect(Object.isFrozen(WEAPON_BEHAVIOR_KINDS)).toBe(true);
    expect(Object.isFrozen(WEAPON_SCRIPT_IDS)).toBe(true);
    for (const id of ids) {
      expect(Object.isFrozen(WEAPON_BEHAVIOR_PARAMS[id]), id).toBe(true);
      expect(Object.isFrozen(WEAPON_BEHAVIOR_SLOTS[id]), id).toBe(true);
    }
    // Every shot kind is used by a behaviour (the Tail Gun and the Vertical share the Double's,
    // the Cyclone Laser the Laser's — M2-03).
    expect([...new Set(Object.values(WEAPON_BEHAVIOR_KINDS))].sort((a, b) => a - b)).toEqual(
      Object.values(ShotKind)
        .slice()
        .sort((a, b) => a - b),
    );
    expect(Object.isFrozen(SHOT_SCHEMA)).toBe(true);
    // The Double's and the missile's climb / fall default to 45°.
    expect(WEAPON_BEHAVIOR_PARAMS['shot.double'].angle).toBe(128);
    expect(WEAPON_BEHAVIOR_PARAMS['missile.groundSlide'].angle).toBe(128);
  });

  it('defaults a Loadout to the basic shot and resets it with the default preset', () => {
    const l = new Loadout();
    expect([l.main, l.missile, l.options]).toEqual([MainWeapon.Basic, false, 0]);
    const ship = createPlayer(0, 3);
    applyLoadoutPreset(l, ship, 'full');
    expect([l.main, l.missile, l.options, ship.speedLevel]).toEqual([
      MainWeapon.Laser,
      true,
      MAX_OPTIONS,
      FULL_LOADOUT_SPEED_LEVEL,
    ]);
    // M1-11: 'full' puts up a Force Field on the ship; 'default' clears it.
    expect(ship.shield.hits).toBe(5);
    applyLoadoutPreset(l, ship, 'default');
    expect([l.main, l.missile, l.options, ship.shield.hits, ship.speedLevel]).toEqual([
      MainWeapon.Basic,
      false,
      0,
      0,
      0,
    ]);
    // The config's loadout reaches both players at creation.
    const w = createWorld(resolveGameConfig({ loadout: 'full' }), DB);
    expect(w.weapons.loadouts.map((x) => x.options)).toEqual([4, 4]);
    expect(w.players.map((p) => p.speedLevel)).toEqual([2, 2]);
    expect(w.weapons.loadouts[0]).not.toBe(w.weapons.loadouts[1]);
    expect(w.weapons.options[0]).not.toBe(w.weapons.options[1]);
  });

  it('picks the preset: the named one, else type-a, else the first, else none', () => {
    const b = { id: 'b', main: 'm2', missile: null, double: null, laser: null };
    const a = {
      id: 'type-a',
      main: 'm1',
      missile: 'mis',
      double: null,
      laser: null,
    };
    const weapons = [
      weapon('m1', 'main', 'shot.straight'),
      weapon('m2', 'main', 'shot.straight', { speed: 3 }),
      weapon('mis', 'missile', 'missile.groundSlide'),
    ];
    const both = db(weaponsFile(weapons, [b, a]));
    expect(resolveWeaponPreset(both)?.id).toBe('type-a');
    expect(resolveWeaponPreset(both, 'b')?.id).toBe('b');
    expect(resolveWeaponPreset(both, 'nope')?.id).toBe('b');
    const onlyB = db(weaponsFile(weapons, [b]));
    expect(resolveWeaponPreset(onlyB)?.id).toBe('b');
    expect(resolveRoleWeapons(onlyB, resolveWeaponPreset(onlyB)).map((x) => x?.id ?? null)).toEqual(
      ['m2', null, null, null],
    );
    const none = db(weaponsFile(weapons));
    expect(resolveWeaponPreset(none)).toBeNull();
    // Without a preset: the first weapon of each slot.
    expect(resolveRoleWeapons(none, null).map((x) => x?.id ?? null)).toEqual([
      'm1',
      null,
      null,
      'mis',
    ]);
    expect(resolveWeaponPreset(EMPTY_CONTENT_DB)).toBeNull();
    expect(resolveRoleWeapons(EMPTY_CONTENT_DB, null)).toEqual([null, null, null, null]);
    // A preset with `main: null` (or without `main`) falls back to the first main weapon.
    const noMain = db(
      weaponsFile(weapons, [
        { id: 'type-a', main: null, missile: null, double: null, laser: null },
      ]),
    );
    expect(resolveRoleWeapons(noMain, resolveWeaponPreset(noMain))[0]?.id).toBe('m1');
    const omitted = db(
      weaponsFile(weapons, [{ id: 'type-a', missile: 'mis', double: null, laser: null }]),
    );
    expect(
      resolveRoleWeapons(omitted, resolveWeaponPreset(omitted)).map((x) => x?.id ?? null),
    ).toEqual(['m1', null, null, 'mis']);
    // The World uses what the resolution picked.
    const w = world(MANUAL, both);
    expect(w.weapons.roleWeapons.map((x) => x?.id ?? null)).toEqual(['m1', null, null, 'mis']);
    // `setArsenal` (M2-03) rewrites the list in place.
    expect(w.weapons.roleWeapons).toHaveLength(4);
  });

  it('leaves a role empty when its weapon has no weapon behaviour', () => {
    const content = db(
      weaponsFile([
        weapon('odd', 'main', 'drifter.sine'),
        weapon('mis', 'missile', 'missile.groundSlide', { cap: 1, speed: 2.5 }),
      ]),
    );
    const w = world({}, content);
    w.weapons.loadouts[0].missile = true;
    expect(w.weapons.roleWeapons[0]?.id).toBe('odd'); // resolved, but not a weapon behaviour
    expect(w.weapons.spawnShot(WeaponRole.Main, 0, 100, 100)).toBe(-1);
    run(w, 30);
    expect(w.weapons.countShots(0, WeaponRole.Main)).toBe(0);
    expect(w.weapons.countShots(0, WeaponRole.Missile)).toBe(1);
  });

  it('flags every behaviour in a wrong slot, and prototype names as params or behaviours', () => {
    const entries: WeaponEntry[] = [];
    const expected: string[] = [];
    for (const behavior of WEAPON_SCRIPT_IDS) {
      for (const slot of ['main', 'double', 'laser', 'missile', 'sub']) {
        const id = behavior + '@' + slot;
        entries.push(weapon(id, slot, behavior));
        if (!WEAPON_BEHAVIOR_SLOTS[behavior].includes(slot as never)) {
          expected.push('weapons:' + id + '.slot');
        }
      }
    }
    entries.push(
      weapon('proto', 'main', 'shot.straight', { params: { constructor: 1, toString: 2, ox: 1 } }),
      weapon('protoBehavior', 'main', 'toString'),
      weapon('manyParams', 'laser', 'laser.beam', {
        params: { maxLength: 1, slideSpeed: 2, hitCooldownTicks: 3 },
      }),
      weapon('both', 'main', 'missile.groundSlide', { params: { angle: 1, maxLength: 1 } }),
    );
    expected.push(
      'weapons:proto.params.constructor',
      'weapons:proto.params.toString',
      'weapons:protoBehavior.behavior',
      'weapons:manyParams.params.slideSpeed',
      // Params first, then the slot.
      'weapons:both.params.maxLength',
      'weapons:both.slot',
    );
    const { db: content } = loadContent([weaponsFile(entries)]);
    expect(content.weapons.length).toBe(entries.length);
    const issues = checkWeaponBehaviors(content);
    expect(issues.map((issue) => issue.path)).toEqual(expected);
    const slotIssue = issues.find((issue) => issue.path === 'weapons:shot.double@main.slot');
    expect(slotIssue?.message).toBe('behaviour "shot.double" belongs in slot double');
    const param = issues.find((issue) => issue.path === 'weapons:proto.params.constructor');
    expect(param?.message).toBe(
      'unknown param for behaviour "shot.straight" (known: ox, oy, hw, hh)',
    );
    const behaviour = issues.find((issue) => issue.path === 'weapons:protoBehavior.behavior');
    expect(behaviour?.message).toBe(
      '"toString" is not a weapon behaviour (known: ' + WEAPON_SCRIPT_IDS.join(', ') + ')',
    );
    // Every documented tunable is accepted.
    const all = WEAPON_SCRIPT_IDS.map((b) =>
      weapon('ok.' + b, WEAPON_BEHAVIOR_SLOTS[b][0], b, {
        params: { ...WEAPON_BEHAVIOR_PARAMS[b] },
      }),
    );
    expect(checkWeaponBehaviors(loadContent([weaponsFile(all)]).db)).toEqual([]);
  });
});

describe('core/weapons edge cases — firing', () => {
  it('spawns each behaviour at its offsets with its velocity, box, damage and sprite', () => {
    const w = world(MANUAL, DB, 40.25, 100.5);
    const ship = w.players[0];
    const sx = ship.x;
    const sy = ship.y;
    const loadout = w.weapons.loadouts[0];
    const shotTick = (main: MainWeapon, held: number): ShotView[] => {
      w.weapons.pool.clear();
      loadout.main = main;
      stepWorld(w, holding(held));
      return shots(w);
    };
    // Basic: (8, 0) ahead, 7 px/tick, 4 × 2 box, damage 1 — it moved once this tick.
    const [basic] = shotTick(MainWeapon.Basic, Action.Shot);
    expect(basic).toMatchObject({
      x: sx + v1rel(8) + v1speed(7),
      y: sy,
      vx: v1speed(7),
      vy: 0,
      hw: v1rel(4),
      hh: v1rel(2),
      damage: 1,
      role: WeaponRole.Main,
      kind: ShotKind.Straight,
      shooter: 0,
      flags: 0,
      sprite: 'shots/basic',
      age: 1,
      table: 0,
      length: 0,
    });
    run(w, 60); // let it leave, and the timers run out
    // Double: the forward shot like the main shot, the other 45° up from (4, -2), 3 × 3.
    const pair = shotTick(MainWeapon.Double, Action.Shot);
    expect(pair.length).toBe(2);
    const up = 1024 - 128;
    expect(pair[0]).toMatchObject({
      x: sx + v1rel(8) + v1speed(7),
      y: sy,
      vx: v1speed(7),
      vy: 0,
      hw: v1rel(4),
      hh: v1rel(2),
      role: WeaponRole.Double,
      kind: ShotKind.Double,
      sprite: 'shots/basic',
    });
    expect(pair[1]).toMatchObject({
      x: sx + v1rel(4) + cosB(up) * v1speed(7),
      y: sy - v1rel(2) + sinB(up) * v1speed(7),
      vx: cosB(up) * v1speed(7),
      vy: sinB(up) * v1speed(7),
      hw: v1rel(3),
      hh: v1rel(3),
      role: WeaponRole.Double,
      kind: ShotKind.Double,
      sprite: 'shots/double',
    });
    expect(pair[1].vx).toBeCloseTo(v1speed(4.95), 2);
    expect(pair[1].vy).toBeCloseTo(-v1speed(4.95), 2);
    run(w, 60);
    // Laser: head (8, 0) ahead, 10 px in its first tick, piercing with a table, 2 px half-height.
    const [laser] = shotTick(MainWeapon.Laser, Action.Shot);
    expect(laser).toMatchObject({
      x: sx + v1rel(8) + v1speed(10),
      y: sy,
      vx: v1speed(10),
      vy: 0,
      length: v1speed(10),
      hh: v1rel(2),
      damage: 1,
      role: WeaponRole.Laser,
      kind: ShotKind.Laser,
      flags: ShotFlag.Pierce,
      sprite: 'shots/laser',
    });
    expect(laser.table).toBeGreaterThanOrEqual(1);
    expect(laser.table).toBeLessThanOrEqual(PIERCE_TABLES);
    run(w, 60);
    // Missile: (0, 4) below, 45° down at 2.5 px/tick, 4 × 1.5 box, damage 2.
    loadout.missile = true;
    const [missile] = shotTick(MainWeapon.Basic, Action.Sub);
    expect(missile).toMatchObject({
      x: sx + cosB(128) * v1speed(2.5),
      y: sy + v1rel(4) + sinB(128) * v1speed(2.5),
      vx: cosB(128) * v1speed(2.5),
      vy: sinB(128) * v1speed(2.5),
      hw: v1rel(4),
      hh: v1rel(1.5),
      damage: 2,
      role: WeaponRole.Missile,
      kind: ShotKind.Missile,
      flags: 0,
      sprite: 'shots/missile',
      frame: 0,
    });
    expect(missile.vx).toBe(missile.vy);
  });

  it('fires the first volley on the tick the fly-in ends — never during it', () => {
    const w = createWorld(resolveGameConfig({ seed: 1, loadout: 'full' }), DB);
    const input = createInputSnapshot();
    let ticks = 0;
    const alive = (): boolean => w.players[0].state === 'alive';
    while (!alive()) {
      expect(w.weapons.pool.count).toBe(0);
      stepWorld(w, input);
      ticks++;
      // From its second tick the Options fly in along the ship's path (drawn, not firing).
      if (ticks > 1 && !alive()) {
        expect(w.weapons.optionBatch.count).toBe(4);
      }
    }
    expect(ticks).toBe(w.ship.enterTicks);
    // On that very tick: a laser and a missile from the ship and each of its four Options.
    expect(shots(w, ShotKind.Laser).map((s) => s.shooter)).toEqual([0, 1, 2, 3, 4]);
    expect(shots(w, ShotKind.Missile).map((s) => s.shooter)).toEqual([0, 1, 2, 3, 4]);
    expect(w.weapons.options[0].count).toBe(4);
    expect(w.weapons.optionBatch.count).toBe(4);
    // Player 2 is not in the game: none of its shooters fired.
    for (let s = SHOOTERS_PER_PLAYER; s < MAX_SHOOTERS; s++) {
      for (let r = 0; r < WEAPON_ROLE_COUNT; r++) expect(w.weapons.countShots(s, r)).toBe(0);
    }
  });

  it('neither fires nor shows Options while dying, dead or inactive; lasers keep their row', () => {
    const w = world({ loadout: 'full' });
    run(w, 3);
    expect(w.weapons.options[0].count).toBe(4);
    const ship = w.players[0];
    for (const state of ['dying', 'dead'] as const) {
      setPlayerState(ship, state);
      w.weapons.pool.clear();
      const laser = w.weapons.spawnShot(WeaponRole.Laser, 0, ship.x, ship.y);
      expect(laser).toBeGreaterThanOrEqual(0);
      const row = ship.y;
      ship.y += 30; // the wreck moves; the beam must not follow
      run(w, 5);
      expect(w.weapons.options[0].count, state).toBe(0);
      expect(w.weapons.optionBatch.count, state).toBe(0);
      expect(shots(w).length, state).toBe(1);
      expect(shots(w)[0].y, state).toBe(row);
      ship.y -= 30;
    }
    setPlayerState(ship, 'alive');
    ship.stateTicks = 5;
    ship.active = false;
    w.weapons.pool.clear();
    run(w, 10);
    expect(w.weapons.pool.count).toBe(0);
    expect(w.weapons.options[0].count).toBe(0);
    ship.active = true;
    run(w, 1);
    expect(w.weapons.pool.count).toBeGreaterThan(0);
    expect(w.weapons.options[0].count).toBe(4);
  });

  it('refires a cap-1 weapon the tick after its shot is freed (the timer ran out long ago)', () => {
    const content = db(typeA({ 'shot.basic': { cap: 1 } }));
    // The ship sits 344 px left of the view's right edge (x 40 at 384×216).
    const shipX = PLAYFIELD_W - 344;
    const gapsFor = (config: Partial<GameConfig>): number[] => {
      const w = world(config, content, shipX, 100);
      const fired: number[] = [];
      for (let t = 0; t < 200; t++) {
        run(w, 1);
        const s = shots(w, ShotKind.Straight);
        expect(s.length).toBeLessThanOrEqual(1);
        if (s.length === 1 && s[0].age === 1) fired.push(t);
      }
      return fired.slice(1).map((t, k) => t - fired[k]);
    };
    // Its shot spawns v1rel(8) px ahead, moves v1speed(7) px/tick and is culled once past the
    // right edge + SHOT_CULL_MARGIN.
    const spawnX = shipX + v1rel(8);
    let moves = 1;
    while (spawnX + v1speed(7) * moves <= PLAYFIELD_W + SHOT_CULL_MARGIN) moves++;
    expect(moves).toBeGreaterThan(10);
    expect(new Set(gapsFor({}))).toEqual(new Set([moves]));
    // A longer interval wins over the cap.
    expect(new Set(gapsFor({ autofireInterval: 60 }))).toEqual(new Set([60]));
  });

  it('fires missiles with Sub alone and paces them by missileInterval or refireTicks', () => {
    const w = world(MANUAL);
    w.weapons.loadouts[0].missile = true;
    run(w, 20, holding(Action.Sub));
    expect(w.weapons.countShots(0, WeaponRole.Missile)).toBe(1);
    expect(w.weapons.countShots(0, WeaponRole.Main)).toBe(0);
    // Without the missile equipped Sub does nothing.
    w.weapons.loadouts[0].missile = false;
    w.weapons.pool.clear();
    run(w, 20, holding(Action.Sub));
    expect(w.weapons.pool.count).toBe(0);

    const gaps = (config: Partial<GameConfig>, refire?: number): number[] => {
      const content = db(
        typeA({
          'missile.ground': {
            cap: 64,
            speed: 0.25,
            ...(refire === undefined ? {} : { refireTicks: refire }),
          },
        }),
      );
      const v = world(config, content);
      v.weapons.loadouts[0].missile = true;
      const ticks: number[] = [];
      for (let t = 0; t < 60; t++) {
        run(v, 1);
        if (shots(v, ShotKind.Missile).some((s) => s.age === 1)) ticks.push(t);
      }
      return ticks.slice(1).map((t, k) => t - ticks[k]);
    };
    expect(new Set(gaps({}))).toEqual(new Set([10]));
    expect(new Set(gaps({ missileInterval: 7 }))).toEqual(new Set([7]));
    expect(new Set(gaps({ missileInterval: 1 }))).toEqual(new Set([1]));
    expect(new Set(gaps({ missileInterval: 7 }, 3))).toEqual(new Set([3]));
    // The main shot's interval does not touch the missile's.
    expect(new Set(gaps({ autofireInterval: 1 }))).toEqual(new Set([10]));
  });

  it('falls back to the main shot when the loadout names an empty Double / Laser role', () => {
    const content = db(typeA({ 'shot.double': null, 'laser.pierce': null }));
    const w = world({}, content);
    expect(w.weapons.roleWeapons.map((x) => x?.id ?? null)).toEqual([
      'shot.basic',
      null,
      null,
      'missile.ground',
    ]);
    for (const main of [MainWeapon.Laser, MainWeapon.Double]) {
      w.weapons.pool.clear();
      w.weapons.loadouts[0].main = main;
      run(w, 10);
      expect(w.weapons.countShots(0, WeaponRole.Main)).toBe(2);
      expect(shots(w).every((s) => s.kind === ShotKind.Straight)).toBe(true);
    }
    expect(w.weapons.spawnShot(WeaponRole.Laser, 0, 100, 100)).toBe(-1);
    expect(w.weapons.spawnShot(WeaponRole.Double, 0, 100, 100)).toBe(-1);
  });

  it('draws and sizes the forward Double shot itself when there is no main shot', () => {
    const content = db(
      weaponsFile([weapon('dbl', 'double', 'shot.double', { sprite: 'shots/double' })]),
    );
    const w = world(MANUAL, content, 40, 100);
    expect(w.weapons.roleWeapons.map((x) => x?.id ?? null)).toEqual([null, 'dbl', null, null]);
    // The basic main weapon has nothing to fire.
    run(w, 10, holding(Action.Shot));
    expect(w.weapons.pool.count).toBe(0);
    w.weapons.loadouts[0].main = MainWeapon.Double;
    run(w, 1, holding(Action.Shot));
    const [forward, angled] = shots(w);
    const ship = w.players[0];
    expect(forward).toMatchObject({
      x: ship.x + v1rel(4) + 7,
      y: ship.y - v1rel(2),
      hw: v1rel(3),
      hh: v1rel(3),
      vx: 7,
      vy: 0,
      sprite: 'shots/double',
    });
    expect(angled.vy).toBeLessThan(0);
  });

  it('fires only the forward shot of a cap-1 Double and never more than a pair at cap 3', () => {
    for (const cap of [1, 3]) {
      const w = world({}, db(typeA({ 'shot.double': { cap } })));
      w.weapons.loadouts[0].main = MainWeapon.Double;
      let previous = 0;
      let volleys = 0;
      for (let t = 0; t < 300; t++) {
        run(w, 1);
        const now = shots(w, ShotKind.Double);
        if (now.length > previous) {
          expect(previous, `cap ${cap}`).toBe(0);
          expect(now.length, `cap ${cap}`).toBe(Math.min(cap, 2));
          expect(now[0].vy).toBe(0);
          expect(now[0].sprite).toBe('shots/basic');
          volleys++;
        }
        previous = now.length;
      }
      expect(volleys, `cap ${cap}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('pushes one SFX per cue and tick at the shooter in whole pixels; silent weapons none', () => {
    const w = world({ loadout: 'full' }, DB, 40.75, 99.5);
    // Let the cues of the fly-in's last tick age past the rate limit, then fire everything.
    run(w, SFX_RATE_TICKS * 2);
    w.weapons.pool.clear();
    w.weapons.timers.fill(0);
    const events = run(w, 1);
    // Five lasers and five missiles fired this tick: one sound each.
    expect(shots(w, ShotKind.Laser).length).toBe(5);
    const sfx = events.filter((e) => e.kind === SimEventKind.Sfx);
    expect(sfx.map((e) => e.id).sort()).toEqual(
      [SFX_CUES.PlayerShot, SFX_CUES.PlayerMissile].sort(),
    );
    for (const e of sfx) {
      expect(e.x).toBe(40);
      expect(e.y).toBe(99);
    }
    // A weapon with `sfx: null` fires silently.
    const quiet = world({}, db(typeA({ 'shot.basic': { sfx: null } })));
    const none = run(quiet, 40);
    expect(quiet.weapons.countShots(0, WeaponRole.Main)).toBeGreaterThan(0);
    expect(none.filter((e) => e.kind === SimEventKind.Sfx)).toEqual([]);
  });

  it("fires player 2's ship and Options as shooters 5–9 and credits its kills to player 2", () => {
    const w = world({ stage: 't' });
    const p1 = w.players[0];
    const p2 = w.players[1];
    p2.active = true;
    spawnPlayer(p2, w.camera);
    w.weapons.loadouts[1].options = 2;
    while (p2.state !== 'alive') run(w, 1);
    p2.invulnTicks = 1e9;
    p1.y = w.camera.y + 30; // out of player 2's row
    w.weapons.pool.clear();
    run(w, 5);
    const byShooter = new Set(shots(w).map((s) => s.shooter));
    expect([...byShooter].sort()).toEqual([0, 5, 6, 7]);
    expect(w.weapons.options[1].count).toBe(2);
    expect(w.weapons.optionBatch.count).toBe(2);
    const weak = spawn(w, 'weak', 200, p2.y - w.camera.y);
    let credited = -2;
    for (let t = 0; t < 60 && credited === -2; t++) {
      run(w, 1);
      const o = w.enemies.outcomes;
      if (o.killCount > 0) credited = o.killBy[0];
    }
    expect(weak.state).not.toBe(EnemyState.Live);
    expect(credited).toBe(1);
  });
});

describe('core/weapons edge cases — flight, culling and terrain', () => {
  it('rides the camera on both axes: on-screen speed does not depend on the scroll', () => {
    const w = world(MANUAL);
    w.camera.vx = 2.5;
    w.camera.vy = -1;
    const ship = w.players[0];
    const straight = w.weapons.spawnShot(WeaponRole.Main, 0, ship.x, ship.y);
    const missile = w.weapons.spawnShot(WeaponRole.Missile, 0, ship.x, ship.y);
    expect([straight, missile]).toEqual([0, 1]);
    const f = w.weapons.pool.fields;
    const screen = (i: number): [number, number] => [f.x[i] - w.camera.x, f.y[i] - w.camera.y];
    let [sx, sy] = screen(0);
    let [mx, my] = screen(1);
    for (let t = 0; t < 20; t++) {
      run(w, 1);
      const [nsx, nsy] = screen(0);
      const [nmx, nmy] = screen(1);
      expect(nsx - sx).toBeCloseTo(v1speed(7), 9);
      expect(nsy - sy).toBeCloseTo(0, 9);
      expect(nmx - mx).toBeCloseTo(cosB(128) * v1speed(2.5), 9);
      expect(nmy - my).toBeCloseTo(sinB(128) * v1speed(2.5), 9);
      [sx, sy, mx, my] = [nsx, nsy, nmx, nmy];
    }
  });

  it('culls straight shots exactly at the view ± SHOT_CULL_MARGIN on every side', () => {
    // Free flight: the camera sits at (0, 0), so the kept area is x −16·K…right,
    // y −16·K…bottom (400 and 216 at 384×216 — at K=1).
    const right = PLAYFIELD_W + SHOT_CULL_MARGIN;
    const bottom = PLAYFIELD_H + SHOT_CULL_MARGIN;
    // A straight shot's first tick carries it the muzzle offset plus one advance.
    const adv = v1rel(8) + v1speed(7);
    const cases: [string, number, number, boolean][] = [
      ['right edge', right - adv, 100, true],
      ['past the right edge', right - adv + 0.5, 100, false],
      ['left edge', -SHOT_CULL_MARGIN - adv, 100, true],
      ['past the left edge', -SHOT_CULL_MARGIN - adv - 0.5, 100, false],
      ['top edge', 100, -SHOT_CULL_MARGIN, true],
      ['past the top edge', 100, -SHOT_CULL_MARGIN - 0.25, false],
      ['bottom edge', 100, bottom, true],
      ['past the bottom edge', 100, bottom + 0.25, false],
    ];
    for (const [label, x, y, kept] of cases) {
      const w = world(MANUAL);
      expect(w.weapons.spawnShot(WeaponRole.Main, 0, x, y)).toBe(0);
      run(w, 1);
      expect(shots(w).length, label).toBe(kept ? 1 : 0);
    }
  });

  it('culls a laser by its head on the left and by its tail on the right', () => {
    const right = PLAYFIELD_W + SHOT_CULL_MARGIN; // 400 at 384×216 (at K=1)
    // The laser advances — and grows, up to its cap — by its speed once per tick.
    const advL = v1speed(10);
    const cases: [string, number, number, boolean][] = [
      // [label, head before the tick, length before the tick, kept]
      ['head at the left edge', -SHOT_CULL_MARGIN - advL, 0, true],
      ['head past the left edge', -SHOT_CULL_MARGIN - advL - 0.5, 0, false],
      ['tail at the right edge', right + v1rel(64) - advL, v1rel(54), true],
      ['tail past the right edge', right + v1rel(64) - advL + 0.5, v1rel(54), false],
      ['head past the right edge, tail inside', right + v1rel(100), v1rel(64), false],
      ['head far right, tail inside', right + v1rel(50), v1rel(60), true],
    ];
    for (const [label, head, length, kept] of cases) {
      const w = world(MANUAL);
      w.players[0].active = false; // nobody to follow: the beam keeps its row
      const i = w.weapons.spawnShot(WeaponRole.Laser, 0, 0, 100);
      w.weapons.pool.fields.x[i] = head;
      w.weapons.pool.fields.length[i] = length;
      run(w, 1);
      expect(shots(w).length, label).toBe(kept ? 1 : 0);
    }
  });

  it('culls shots spawned at non-finite positions at once, and they never hit', () => {
    for (const [x, y] of [
      [NaN, 100],
      [100, NaN],
      [Infinity, 100],
      [100, -Infinity],
    ]) {
      for (const role of [
        WeaponRole.Main,
        WeaponRole.Double,
        WeaponRole.Laser,
        WeaponRole.Missile,
      ]) {
        const label = `role ${role} at ${x}, ${y}`;
        const w = world({ ...MANUAL, stage: 't' });
        // Ceiling rock along the map's top row and a floor: nothing may rescue the shot.
        const map = w.terrain!;
        for (let col = 0; col < map.cols; col++) map.tiles[col] = 3;
        const wide = spawn(w, 'wide', 100, 100);
        // Shooter 9 (player 2's last Option) is not in play: a laser has nobody to follow.
        expect(w.weapons.spawnShot(role, MAX_SHOOTERS - 1, x, y), label).toBe(0);
        collideNow(w);
        expect(w.weapons.hitCount, label).toBe(0);
        run(w, 1);
        expect(shots(w), label).toEqual([]);
        expect(wide.hp, label).toBe(1000);
      }
    }
  });

  it('stops the laser head at the first solid column and lets the beam shrink away', () => {
    const w = world({ ...MANUAL, stage: 't' }, DB, 40, 100);
    const map = w.terrain!;
    for (let row = 0; row < map.rows; row++) map.tiles[row * map.cols + 25] = 1; // x 200…207
    const i = w.weapons.spawnShot(WeaponRole.Laser, 0, w.players[0].x, w.players[0].y);
    const f = w.weapons.pool.fields;
    const heads: number[] = [];
    const lengths: number[] = [];
    let blockedAt = -1;
    for (let t = 0; t < 40 && shots(w).length > 0; t++) {
      run(w, 1);
      if (shots(w).length === 0) break;
      heads.push(f.x[i]);
      lengths.push(f.length[i]);
      if (blockedAt < 0 && (f.flags[i] & ShotFlag.Blocked) !== 0) blockedAt = t;
    }
    // The head rides the beam speed from the muzzle until the wall stops it; the tail then
    // catches up one advance per tick. (58, 68, … 198 and the wall at 200 — at K=1.)
    const wall = 25 * TILE;
    const muzzle = 40 + v1rel(8);
    const adv = v1speed(10);
    expect(heads).toEqual(
      Array.from({ length: heads.length }, (_, k) => Math.min(muzzle + adv * (k + 1), wall)),
    );
    expect(blockedAt).toBe(Math.ceil((wall - muzzle) / adv) - 1);
    expect(lengths.slice(blockedAt)).toEqual(
      Array.from({ length: 7 }, (_, k) => v1rel(64) - adv * k),
    );
    expect(shots(w)).toEqual([]);
  });

  it('keeps a blocked laser head on its wall while the stage scrolls', () => {
    const w = world({ ...MANUAL, stage: 's' }, DB, 40, 100);
    const map = w.terrain!;
    const col = Math.floor((w.camera.x + v1rel(200)) / TILE) + 1;
    const wall = col * TILE;
    for (let row = 0; row < map.rows - 5; row++) map.tiles[row * map.cols + col] = 1;
    const i = w.weapons.spawnShot(WeaponRole.Laser, 0, w.players[0].x, w.players[0].y);
    const f = w.weapons.pool.fields;
    let blocked = 0;
    let previous = -1;
    for (let t = 0; t < 60; t++) {
      run(w, 1);
      if (shots(w).length === 0) break;
      if ((f.flags[i] & ShotFlag.Blocked) === 0) continue;
      blocked++;
      expect(f.x[i]).toBe(wall);
      // The tail rides the scroll (1 px) and advances at the beam's speed (10 px — at K=1).
      if (previous >= 0) expect(previous - f.length[i]).toBe(v1speed(10) + 1);
      previous = f.length[i];
    }
    expect(blocked).toBeGreaterThan(3);
    expect(shots(w)).toEqual([]);
  });

  it("follows its Option's row while that Option flies, then keeps its row", () => {
    const w = world(MANUAL, DB, 60, 60);
    const loadout = w.weapons.loadouts[0];
    loadout.options = 4;
    const group = w.weapons.options[0];
    // Spread the Options out moving down.
    run(w, 30, holding(Action.Down));
    const i = w.weapons.spawnShot(WeaponRole.Laser, 2, group.x[1], group.y[1]);
    const f = w.weapons.pool.fields;
    for (let t = 0; t < 10; t++) {
      run(w, 1, holding(Action.Down));
      expect(f.y[i]).toBe(group.y[1]);
      expect(f.shooter[i]).toBe(2);
    }
    // Option 2 leaves (the loadout drops to one Option): the beam stays on its last row.
    loadout.options = 1;
    const row = f.y[i];
    run(w, 5, holding(Action.Up));
    expect(group.count).toBe(1);
    expect(f.y[i]).toBe(row);
    expect(group.y[0]).not.toBe(row);
  });

  it('climbs and descends a 12-px step when the slide may climb 12 px (slideSpeed 10.5)', () => {
    const w = world(
      { ...MANUAL, stage: 't' },
      db(typeA({ 'missile.ground': { params: { slideSpeed: v1speed(7) } } })),
    );
    const set = flatFloor(w);
    // Plateau over tile columns 20…24: surface one tile above the floor (x 240…299, surface
    // 228). The climb window is ceil(slideSpeed) + 1 = ceil(10.5) + 1 = 12 px — the step.
    for (let col = 20; col < 25; col++) set(col, 19, 2);
    const FLOOR_RIDE = 20 * TILE - v1rel(2);
    const PLAT_RIDE = 19 * TILE - v1rel(2);
    w.weapons.spawnShot(WeaponRole.Missile, 0, w.players[0].x, w.players[0].y);
    const path: { x: number; y: number; sliding: boolean }[] = [];
    for (let t = 0; t < 200; t++) {
      run(w, 1);
      const [m] = shots(w, ShotKind.Missile);
      if (m === undefined) break;
      path.push({ x: m.x, y: m.y, sliding: (m.flags & ShotFlag.Sliding) !== 0 });
    }
    const first = path.findIndex((p) => p.sliding);
    expect(first).toBeGreaterThan(0);
    const slid = path.slice(first);
    // It never left the ground: up onto the plateau and down again, one slide step a tick.
    expect(slid.every((p) => p.sliding)).toBe(true);
    for (let k = 1; k < slid.length; k++)
      expect(slid[k].x - slid[k - 1].x).toBeCloseTo(v1speed(7), 9);
    expect(
      slid.some((p) => p.x >= 20 * TILE && p.x < 25 * TILE && Math.abs(p.y - PLAT_RIDE) < 1),
    ).toBe(true);
    expect(slid.some((p) => p.x >= 25 * TILE && Math.abs(p.y - FLOOR_RIDE) < 1)).toBe(true);
    for (const p of slid)
      expect(Math.min(Math.abs(p.y - PLAT_RIDE), Math.abs(p.y - FLOOR_RIDE))).toBeLessThan(1);
    // It left the view on the right (no wall ahead).
    expect(path[path.length - 1].x).toBeGreaterThan(PLAYFIELD_W + 6);
  });

  it('dies at a 12-px step, falls off the far side when it may climb 7 px (slideSpeed 6)', () => {
    const content = db(typeA({ 'missile.ground': { params: { slideSpeed: 6 } } }));
    // Into the step's face.
    const w = world({ ...MANUAL, stage: 't' }, content);
    const set = flatFloor(w);
    for (let col = 20; col < 25; col++) set(col, 19, 2); // plateau, one tile above the floor
    const FLOOR_RIDE = 20 * TILE - v1rel(2);
    const PLAT_RIDE = 19 * TILE - v1rel(2);
    w.weapons.spawnShot(WeaponRole.Missile, 0, w.players[0].x, w.players[0].y);
    let last = { x: 0, y: 0, flags: 0 };
    let ticks = 0;
    for (; ticks < 200; ticks++) {
      run(w, 1);
      const [m] = shots(w, ShotKind.Missile);
      if (m === undefined) break;
      last = m;
    }
    expect(ticks).toBeLessThan(200);
    expect(last.flags & ShotFlag.Sliding).toBe(ShotFlag.Sliding);
    expect(Math.abs(last.y - FLOOR_RIDE)).toBeLessThanOrEqual(1);
    expect(last.x).toBeLessThan(20 * TILE);
    expect(last.x).toBeGreaterThan(20 * TILE - v1rel(7));

    // Landed on the plateau, it drops off its far end (12 px > 7) and lands on the floor below.
    const v = world({ ...MANUAL, stage: 't' }, content);
    const setV = flatFloor(v);
    for (let col = 20; col < 25; col++) setV(col, 19, 2);
    v.weapons.spawnShot(WeaponRole.Missile, 0, v1rel(120), v1rel(100));
    const states: { x: number; y: number; sliding: boolean }[] = [];
    for (let t = 0; t < 120; t++) {
      run(v, 1);
      const [m] = shots(v, ShotKind.Missile);
      if (m === undefined) break;
      states.push({ x: m.x, y: m.y, sliding: (m.flags & ShotFlag.Sliding) !== 0 });
    }
    const onPlateau = states.findIndex((s) => s.sliding && Math.abs(s.y - PLAT_RIDE) < 1);
    expect(onPlateau).toBeGreaterThan(0);
    const fall = states.findIndex((s, k) => k > onPlateau && !s.sliding);
    expect(fall).toBeGreaterThan(onPlateau);
    expect(states[fall].x).toBeGreaterThanOrEqual(25 * TILE);
    const relanded = states.findIndex((s, k) => k > fall && s.sliding);
    expect(relanded).toBeGreaterThan(fall);
    expect(Math.abs(states[relanded].y - FLOOR_RIDE)).toBeLessThan(1);
    // Falling again it follows its launch heading (45° down).
    if (relanded - fall >= 3) {
      expect(states[fall + 2].x - states[fall + 1].x).toBeCloseTo(cosB(128) * v1speed(2.5), 9);
      expect(states[fall + 2].y - states[fall + 1].y).toBeCloseTo(sinB(128) * v1speed(2.5), 9);
    }
  });

  it("dies falling into a wall's side, and just falls out of the view without terrain", () => {
    const w = world({ ...MANUAL, stage: 't' });
    const set = flatFloor(w);
    for (let row = 0; row < 20; row++) set(12, row, 1); // a wall at tile column 12, top to floor
    w.weapons.spawnShot(WeaponRole.Missile, 0, v1rel(60), v1rel(40));
    let last = { x: 0, y: 0, flags: 0 };
    let alive = 0;
    for (; alive < 100; alive++) {
      run(w, 1);
      const [m] = shots(w, ShotKind.Missile);
      if (m === undefined) break;
      last = m;
    }
    expect(last.flags & ShotFlag.Sliding).toBe(0);
    expect(last.x).toBeLessThan(12 * TILE);
    expect(last.x).toBeGreaterThan(12 * TILE - v1rel(6));
    expect(last.y).toBeLessThan(20 * TILE - v1rel(30)); // mid-air, far above the floor

    const free = world(MANUAL); // free flight: no terrain
    free.weapons.spawnShot(WeaponRole.Missile, 0, 40, 100);
    let ticks = 0;
    let sliding = false;
    while (shots(free).length > 0 && ticks < 200) {
      run(free, 1);
      ticks++;
      for (const m of shots(free)) if ((m.flags & ShotFlag.Sliding) !== 0) sliding = true;
    }
    // From y 104 at 2.5·sin 45° per tick until past the view's bottom edge + 16 (216 and 16
    // at 384×216 — at K=1).
    let moves = 1;
    const y0 = 100 + v1rel(4);
    while (y0 + sinB(128) * v1speed(2.5) * moves <= PLAYFIELD_H + SHOT_CULL_MARGIN) moves++;
    expect(ticks).toBe(moves);
    expect(sliding).toBe(false);
  });

  it('animates the missile every 4 ticks through its frames (frames param, at least 1)', () => {
    for (const [frames, expected] of [
      [2, [0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1]],
      [3, [0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 0, 0]],
      [0, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
      [1, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ] as [number, number[]][]) {
      const w = world(MANUAL, db(typeA({ 'missile.ground': { params: { frames } } })));
      w.weapons.spawnShot(WeaponRole.Missile, 0, 40, 20);
      const seen: number[] = [];
      for (let t = 0; t < expected.length; t++) {
        run(w, 1);
        seen.push(shots(w)[0].frame);
        // The batch draws the same frame.
        expect(w.weapons.batch.frame[0]).toBe(shots(w)[0].frame);
      }
      expect(seen, `frames ${frames}`).toEqual(expected);
    }
  });

  it('kills shots fired from inside rock at once (Options pass through rock, shots do not)', () => {
    const w = world({ ...MANUAL, stage: 't' });
    const map = w.terrain!;
    // Rock at tile columns 12…16, rows 5…9 (x 96…135, y 40…79 — at K=1).
    for (let col = 12; col < 17; col++)
      for (let row = 5; row < 10; row++) map.tiles[row * map.cols + col] = 1;
    // Spawn so the muzzle (offset 8·K px on) lands inside the rock at both scales.
    const rockX = 13 * TILE - v1rel(8);
    const rockY = 6 * TILE;
    expect(w.weapons.spawnShot(WeaponRole.Main, 1, rockX, rockY)).toBeGreaterThanOrEqual(0);
    expect(w.weapons.spawnShot(WeaponRole.Double, 2, rockX, rockY)).toBeGreaterThanOrEqual(0);
    const laser = w.weapons.spawnShot(WeaponRole.Laser, 3, rockX, rockY);
    run(w, 1);
    // The straight and Double shots died in the rock; the laser is stopped one pixel on.
    const left = shots(w);
    expect(left.map((s) => s.kind)).toEqual([ShotKind.Laser]);
    expect(left[0].flags & ShotFlag.Blocked).toBe(ShotFlag.Blocked);
    expect(w.weapons.pool.fields.x[laser]).toBe(rockX + v1rel(8) + 1);
    run(w, 1);
    expect(shots(w)).toEqual([]);
  });
});

describe('core/weapons edge cases — hits', () => {
  it('hits on touching boxes (closed test) and misses by a fraction', () => {
    // A straight shot is 4 × 2, the target 4 × 4 (× K): they touch at 8 px apart horizontally
    // and 6 px apart vertically (at K=1).
    const cases: [number, number, boolean][] = [
      [-v1rel(8), 0, true],
      [-v1rel(8.001), 0, false],
      [v1rel(8), 0, true],
      [v1rel(8.001), 0, false],
      [0, v1rel(6), true],
      [0, v1rel(6.001), false],
      [0, -v1rel(6), true],
      [-v1rel(8), -v1rel(6), true],
      [-v1rel(8), -v1rel(6.001), false],
    ];
    for (const [dx, dy, hit] of cases) {
      const w = world(MANUAL);
      const target = spawn(w, 'target', 200, 100);
      const i = w.weapons.spawnShot(WeaponRole.Main, 0, 0, 0);
      w.weapons.pool.fields.x[i] = target.x + dx;
      w.weapons.pool.fields.y[i] = target.y + dy;
      collideNow(w);
      expect(hitList(w), `${dx}, ${dy}`).toEqual(hit ? [[i, target.slot]] : []);
    }
  });

  it('hits the lowest overlapping slot only; a second shot flies on past a fresh kill', () => {
    const w = world(MANUAL);
    const a = spawn(w, 'target', 200, 100);
    const b = spawn(w, 'target', 200, 100);
    expect(a.slot).toBeLessThan(b.slot);
    w.weapons.spawnShot(WeaponRole.Main, 0, 200 - 15, 100);
    run(w, 1);
    expect([a.hp, b.hp]).toEqual([999, 1000]);
    expect(shots(w)).toEqual([]);

    // Two shots on one 1-hp enemy in the same tick: the first kills it, the second flies on.
    const v = world(MANUAL);
    const weak = spawn(v, 'weak', 200, 100);
    const first = v.weapons.spawnShot(WeaponRole.Main, 0, 200 - 15, 100);
    const second = v.weapons.spawnShot(WeaponRole.Main, 1, 200 - 15, 100);
    expect([first, second]).toEqual([0, 1]);
    run(v, 1);
    expect(weak.state).not.toBe(EnemyState.Live);
    expect(v.enemies.outcomes.killCount).toBe(1);
    const left = shots(v);
    expect(left.map((s) => s.shooter)).toEqual([1]);
    run(v, 1);
    expect(shots(v)[0].x).toBe(200 - 15 + v1rel(8) + 2 * v1speed(7)); // still flying
  });

  it('never hits ghosts or removed enemies', () => {
    const w = world(MANUAL);
    const ghost = spawn(w, 'target', 200, 100);
    ghost.flags |= EnemyFlag.Ghost;
    w.weapons.spawnShot(WeaponRole.Main, 0, 200 - 8, 100);
    w.weapons.spawnShot(WeaponRole.Laser, 0, 150, 100);
    w.weapons.pool.fields.length[1] = 64;
    collideNow(w);
    expect(w.weapons.hitCount).toBe(0);
    ghost.flags &= ~EnemyFlag.Ghost;
    w.enemies.kill(ghost);
    collideNow(w);
    expect(w.weapons.hitCount).toBe(0);
  });

  it('flashes without killing at damage 0, and missiles deal their own damage', () => {
    const w = world({}, db(typeA({ 'shot.basic': { damage: 0 } })));
    const weak = spawn(w, 'weak', 200, 100);
    const events = run(w, 60);
    expect(weak.state).toBe(EnemyState.Live);
    expect(weak.hp).toBe(1);
    const hits = events.filter((e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.EnemyHit);
    expect(hits.length).toBeGreaterThan(3);

    const v = world(MANUAL);
    const target = spawn(v, 'target', 130, 130);
    v.weapons.spawnShot(WeaponRole.Missile, 0, v.camera.x + 100, v.camera.y + 96);
    run(v, 30);
    expect(target.hp).toBe(998);
    expect(shots(v)).toEqual([]);
  });

  it('kills a laser on armour with a clink, after it has hit what was in front', () => {
    const w = world(MANUAL);
    const soft = spawn(w, 'target', 120, 100);
    const armor = spawn(w, 'armor', 200, 100);
    armor.flags |= EnemyFlag.Invulnerable;
    w.weapons.spawnShot(WeaponRole.Laser, 0, w.players[0].x, w.players[0].y);
    const events = run(w, 30);
    expect(soft.hp).toBeLessThan(1000);
    expect(armor.hp).toBe(5);
    expect(shots(w)).toEqual([]);
    const clinks = events.filter((e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.Clink);
    expect(clinks.length).toBe(1);
    expect(Number.isInteger(clinks[0].x) && Number.isInteger(clinks[0].y)).toBe(true);
  });

  it('records at most MAX_SHOT_HITS hits a tick and counts the rest as dropped', () => {
    const w = world(MANUAL);
    const wide: Enemy[] = [];
    for (let k = 0; k < MAX_ENEMIES; k++) wide.push(spawn(w, 'wide', 200, 100));
    expect(w.enemies.spawn(w.content.enemyIndex.get('wide')!, 200, 100)).toBeNull();
    for (let k = 0; k < PIERCE_TABLES; k++) {
      const i = w.weapons.spawnShot(WeaponRole.Laser, k % MAX_SHOOTERS, 0, 0);
      expect(i).toBe(k);
      w.weapons.pool.fields.x[i] = w.camera.x + 230;
      w.weapons.pool.fields.y[i] = w.camera.y + 100;
      w.weapons.pool.fields.length[i] = 64;
    }
    collideNow(w);
    expect(w.weapons.hitCount).toBe(MAX_SHOT_HITS);
    expect(w.weapons.hitsDropped).toBe(PIERCE_TABLES * MAX_ENEMIES - MAX_SHOT_HITS);
    // The first 16 beams got every enemy, in slot order.
    const hits = hitList(w);
    const perShot = MAX_SHOT_HITS / MAX_ENEMIES;
    for (let k = 0; k < MAX_SHOT_HITS; k++) {
      expect(hits[k]).toEqual([Math.floor(k / MAX_ENEMIES), wide[k % MAX_ENEMIES].slot]);
    }
    expect(perShot).toBe(16);
    // Dropped hits add up since creation.
    collideNow(w);
    expect(w.weapons.hitsDropped).toBe(2 * (PIERCE_TABLES * MAX_ENEMIES - MAX_SHOT_HITS));
    w.weapons.applyHits();
    for (const e of wide) expect(e.hp).toBe(1000 - perShot);
  });

  it('zeroes a reused cooldown table, counts it down while in use only, hashes live ones', () => {
    const w = world(MANUAL);
    const table = (i: number): number => w.weapons.pool.fields.table[i] - 1;
    const first = w.weapons.spawnShot(WeaponRole.Laser, 0, 100, 100);
    const t0 = table(first);
    expect(t0).toBe(0);
    const cool = w.weapons.cooldowns;
    cool.fill(9, t0 * MAX_ENEMIES, (t0 + 1) * MAX_ENEMIES);
    run(w, 1);
    expect(cool[t0 * MAX_ENEMIES]).toBe(8);
    // Changing the live table's entries changes the hash; an unused table's does not.
    const before = hashWorld(w);
    cool[5 * MAX_ENEMIES + 3] = 77;
    expect(hashWorld(w)).toBe(before);
    cool[t0 * MAX_ENEMIES + 3]++;
    expect(hashWorld(w)).not.toBe(before);
    cool[t0 * MAX_ENEMIES + 3]--;
    expect(hashWorld(w)).toBe(before);
    // Remove the beam: its table stops counting and is free again after the next recount.
    w.weapons.pool.fields.x[first] = 1e6;
    run(w, 1);
    expect(shots(w)).toEqual([]);
    const frozen = cool[t0 * MAX_ENEMIES];
    run(w, 3);
    expect(cool[t0 * MAX_ENEMIES]).toBe(frozen);
    const second = w.weapons.spawnShot(WeaponRole.Laser, 0, 100, 100);
    expect(table(second)).toBe(t0);
    for (let e = 0; e < MAX_ENEMIES; e++) expect(cool[t0 * MAX_ENEMIES + e]).toBe(0);
  });

  it('applies tunable clamps: cooldown 0 → every tick, 2.6 → every 3, 1000 → every 255', () => {
    const gaps = (hitCooldownTicks: number, speed: number, ticks: number): number[] => {
      const w = world(
        MANUAL,
        db(typeA({ 'laser.pierce': { speed, params: { maxLength: 64, hitCooldownTicks } } })),
        30,
        100,
      );
      const wide = spawn(w, 'wide', 250, 100);
      w.weapons.spawnShot(WeaponRole.Laser, 0, w.players[0].x, w.players[0].y);
      const at: number[] = [];
      let hp = wide.hp;
      for (let t = 0; t < ticks; t++) {
        run(w, 1);
        if (wide.hp < hp) at.push(t);
        hp = wide.hp;
      }
      return at.slice(1).map((t, k) => t - at[k]);
    };
    const every = gaps(0, 10, 40);
    expect(every.length).toBeGreaterThan(10);
    expect(new Set(every)).toEqual(new Set([1]));
    expect(new Set(gaps(2.6, 10, 40))).toEqual(new Set([3]));
    expect(gaps(1000, 1, 420)).toEqual([255]);
  });

  it('keeps a laser with a negative maxLength at length 0: it hits along its head line', () => {
    const w = world(MANUAL, db(typeA({ 'laser.pierce': { params: { maxLength: -5 } } })), 30, 100);
    const target = spawn(w, 'target', 120, 100);
    const i = w.weapons.spawnShot(WeaponRole.Laser, 0, w.players[0].x, w.players[0].y);
    for (let t = 0; t < 12; t++) {
      run(w, 1);
      expect(w.weapons.pool.fields.length[i]).toBe(0);
    }
    expect(target.hp).toBeLessThan(1000);
    expect(w.weapons.batch.count).toBe(0); // nothing to draw
  });

  it('takes the absolute value of negative hit boxes and wraps angles to one turn', () => {
    const content = db(
      typeA({
        'shot.basic': { params: { hw: -10, hh: -3 } },
        'shot.double': { params: { angle: 1024 + 256 } },
        'missile.ground': { params: { angle: 0 } },
      }),
    );
    const w = world(MANUAL, content);
    const basic = w.weapons.spawnShot(WeaponRole.Main, 0, 100, 100);
    const f = w.weapons.pool.fields;
    expect([f.hw[basic], f.hh[basic]]).toEqual([10, 3]);
    // The Double's angle 1280 ≡ 256: its angled shot climbs straight up.
    const up = w.weapons.spawnShot(WeaponRole.Double, 0, 100, 100);
    expect(f.vx[up]).toBeCloseTo(0, 12);
    expect(f.vy[up]).toBe(-v1speed(7));
    // A missile with angle 0 flies level.
    const level = w.weapons.spawnShot(WeaponRole.Missile, 0, 100, 100);
    expect([f.vx[level], f.vy[level]]).toEqual([v1speed(2.5), 0]);
  });

  it('finds the brute-force hits through the grid with fractional positions and scrolling', () => {
    const rng = createRng(2026);
    const ids = ['target', 'wide', 'armor', 'weak', 'odd'];
    let total = 0;
    for (let round = 0; round < 40; round++) {
      const w = world(MANUAL, DB, 40, 100);
      w.camera.x = rng.rangeInt(0, 5000) + rng.rangeInt(0, 3) / 4;
      w.camera.y = rng.rangeInt(-50, 50) + rng.rangeInt(0, 7) / 8;
      const enemyCount = rng.rangeInt(1, MAX_ENEMIES);
      for (let k = 0; k < enemyCount; k++) {
        // Some far outside the grid (clamped into its edge cells).
        const e = spawn(
          w,
          ids[rng.rangeInt(0, ids.length - 1)],
          rng.rangeInt(-300, 700) + rng.rangeInt(0, 7) / 8,
          rng.rangeInt(-200, 400) + rng.rangeInt(0, 3) / 4,
        );
        if (rng.rangeInt(0, 6) === 0) e.flags |= EnemyFlag.Invulnerable;
        if (rng.rangeInt(0, 9) === 0) e.flags |= EnemyFlag.Ghost;
      }
      const shotCount = rng.rangeInt(1, MAX_PLAYER_SHOTS);
      for (let k = 0; k < shotCount; k++) {
        const i = w.weapons.spawnShot(
          rng.rangeInt(0, WEAPON_ROLE_COUNT - 1),
          rng.rangeInt(0, MAX_SHOOTERS - 1),
          w.camera.x + rng.rangeInt(-16, 400) + rng.rangeInt(0, 15) / 16,
          w.camera.y + rng.rangeInt(-16, 216) + rng.rangeInt(0, 15) / 16,
        );
        if (i >= 0 && w.weapons.pool.fields.kind[i] === ShotKind.Laser) {
          w.weapons.pool.fields.length[i] = rng.rangeInt(0, 64) + rng.rangeInt(0, 3) / 4;
          const table = w.weapons.pool.fields.table[i] - 1;
          for (let e = 0; e < MAX_ENEMIES; e++) {
            w.weapons.cooldowns[table * MAX_ENEMIES + e] = rng.rangeInt(0, 2) === 0 ? 2 : 0;
          }
        }
      }
      collideNow(w);
      expect(hitList(w), `round ${round}`).toEqual(bruteForce(w));
      total += w.weapons.hitCount;
    }
    expect(total).toBeGreaterThan(50);
  });
});

describe('core/weapons edge cases — presentation and restart', () => {
  // A segment is LASER_SEGMENT_LENGTH: 8 * WORLD_SCALE, 12 px at v2's world scale. A
  // v1rel(64) beam lays eight quads back from its head, the last clamped to the tail.
  it('draws a laser as 12-px segments back from its head, the last one clamped to the tail', () => {
    const w = world(MANUAL);
    w.players[0].active = false;
    const i = w.weapons.spawnShot(WeaponRole.Laser, 0, 0, 0);
    const f = w.weapons.pool.fields;
    f.x[i] = 100;
    f.y[i] = 50;
    const segments = (length: number): number[] => {
      f.length[i] = length;
      w.weapons.sync();
      const batch = w.weapons.batch;
      const xs: number[] = [];
      for (let k = 0; k < batch.count; k++) {
        expect(batch.y[k]).toBe(50);
        expect(w.content.sprites.names[batch.spriteId[k]]).toBe('shots/laser');
        expect(batch.frame[k]).toBe(0);
        xs.push(batch.x[k]);
      }
      return xs;
    };
    const SEG = LASER_SEGMENT_LENGTH;
    expect(segments(0)).toEqual([]);
    expect(segments(v1rel(8))).toEqual([100 - SEG]);
    expect(segments(v1rel(8) + 0.5)).toEqual([100 - SEG, 100 - v1rel(8) - 0.5]);
    expect(segments(v1rel(10))).toEqual([100 - SEG, 100 - v1rel(10)]);
    expect(segments(v1rel(64))).toEqual(Array.from({ length: 8 }, (_, k) => 100 - SEG * (k + 1)));
  });

  it('never overfills the shot batch (lasers first take the room, later shots are dropped)', () => {
    const w = world(MANUAL);
    w.players[0].active = false;
    for (let k = 0; k < PIERCE_TABLES; k++) {
      const i = w.weapons.spawnShot(WeaponRole.Laser, 0, 0, 0);
      w.weapons.pool.fields.x[i] = 300;
      w.weapons.pool.fields.y[i] = 10 + k;
      w.weapons.pool.fields.length[i] = v1rel(64);
    }
    for (let k = 0; k < 20; k++) w.weapons.spawnShot(WeaponRole.Main, 1, 100, 100);
    w.weapons.sync();
    expect(w.weapons.batch.count).toBe(SHOT_BATCH_CAPACITY);
    // 24 full beams fit (8 segments each at K=1); nothing after them.
    expect(w.weapons.batch.y[SHOT_BATCH_CAPACITY - 1]).toBe(
      10 + SHOT_BATCH_CAPACITY / Math.ceil(v1rel(64) / LASER_SEGMENT_LENGTH) - 1,
    );
  });

  it('draws the Options as pulsing orbs (8 ticks a frame), and nothing without the sprite', () => {
    const w = world({ loadout: 'full' });
    const batch = w.weapons.optionBatch;
    const orb = w.content.sprites.index.get(OPTION_SPRITE);
    expect(orb).toBeDefined();
    for (let t = 0; t < 5 * OPTION_ANIM_TICKS; t++) {
      run(w, 1, holding(t % 20 < 10 ? Action.Up : Action.Down));
      const group = w.weapons.options[0];
      expect(batch.count).toBe(4);
      for (let k = 0; k < 4; k++) {
        expect(batch.spriteId[k]).toBe(orb);
        expect(batch.x[k]).toBe(group.x[k]);
        expect(batch.y[k]).toBe(group.y[k]);
        expect(batch.flags[k]).toBe(0);
        expect(batch.frame[k]).toBe(
          Math.floor((w.tick - 1) / OPTION_ANIM_TICKS) & (OPTION_FRAMES - 1),
        );
      }
    }
    // Content without the engine sprites: the Options fly and fire, but are not drawn.
    const bare = world({ loadout: 'full' }, db(typeA(), { engineSprites: false }));
    run(bare, 3);
    expect(bare.weapons.options[0].count).toBe(4);
    expect(bare.weapons.optionBatch.count).toBe(0);
    expect(new Set(shots(bare, ShotKind.Laser).map((s) => s.shooter))).toEqual(
      new Set([0, 1, 2, 3, 4]),
    );
  });

  it('empties the shots and batches on a checkpoint restart and fires again afterwards', () => {
    const w = world({ loadout: 'full', stage: 't' });
    run(w, 5);
    expect(w.weapons.pool.count).toBeGreaterThan(0);
    expect(w.weapons.batch.count).toBeGreaterThan(0);
    w.stage!.restartAt(0);
    expect(w.weapons.pool.count).toBe(0);
    expect(w.weapons.batch.count).toBe(0);
    expect(w.weapons.optionBatch.count).toBe(0);
    expect(w.weapons.hitCount).toBe(0);
    expect(Array.from(w.weapons.liveCounts).every((n) => n === 0)).toBe(true);
    w.weapons.clear(); // idempotent
    expect(w.weapons.pool.count).toBe(0);
    run(w, 12);
    expect(shots(w, ShotKind.Laser).length).toBe(5);
  });

  it('answers countShots with 0 for bad shooters and roles, and refuses bad spawns', () => {
    const w = world(MANUAL);
    for (const role of [-1, 4, 1.5, NaN, Infinity]) {
      expect(w.weapons.spawnShot(role, 0, 100, 100), String(role)).toBe(-1);
    }
    for (const shooter of [-1, MAX_SHOOTERS, 0.5, NaN, -Infinity]) {
      expect(w.weapons.spawnShot(WeaponRole.Main, shooter, 100, 100), String(shooter)).toBe(-1);
    }
    expect(w.weapons.spawnShot(WeaponRole.Main, MAX_SHOOTERS - 1, 100, 100)).toBe(0);
    expect(w.weapons.countShots(MAX_SHOOTERS - 1, WeaponRole.Main)).toBe(1);
    expect(w.weapons.countShots(99, WeaponRole.Main)).toBe(0);
    expect(w.weapons.countShots(0, 99)).toBe(0);
    expect(w.weapons.count).toBe(1);
  });

  it('hashes the option trail, head, loadout fields and shield', () => {
    const w = world({ loadout: 'full' });
    run(w, 30, holding(Action.Down));
    const base = hashWorld(w);
    const g = w.weapons.options[0];
    const l = w.weapons.loadouts[0];
    const probes: [string, () => void, () => void][] = [
      ['trail x', () => g.trailX[7]++, () => g.trailX[7]--],
      ['trail y', () => g.trailY[48]++, () => g.trailY[48]--],
      ['head', () => g.head++, () => g.head--],
      ['option x', () => g.x[3]++, () => g.x[3]--],
      ['count', () => g.count--, () => g.count++],
      ['main', () => (l.main = MainWeapon.Double), () => (l.main = MainWeapon.Laser)],
      ['missile', () => (l.missile = false), () => (l.missile = true)],
      ['shield', () => (w.players[0].shield.hits = 1), () => (w.players[0].shield.hits = 5)],
      [
        'player 2 loadout',
        () => w.weapons.loadouts[1].options--,
        () => w.weapons.loadouts[1].options++,
      ],
    ];
    for (const [label, change, undo] of probes) {
      change();
      expect(hashWorld(w), label).not.toBe(base);
      undo();
      expect(hashWorld(w), label).toBe(base);
    }
  });
});

describe('core/weapons edge cases — Options in the World', () => {
  it('converges the Options on the ship while it pushes against the edge of the view', () => {
    const w = world({ ...MANUAL, loadout: 'full' }, DB, 100, 100);
    const ship = w.players[0];
    const group = w.weapons.options[0];
    run(w, 40, holding(Action.Right));
    expect(new Set(Array.from(group.x)).size).toBe(4); // spread out behind the ship
    // Up into the top margin, then keep pushing: 4 × 12 more records of the same spot.
    run(w, 200, holding(Action.Up));
    expect(ship.y - w.camera.y).toBe(w.ship.margins.top);
    for (let k = 0; k < 4; k++) {
      expect(group.x[k]).toBe(ship.x);
      expect(group.y[k]).toBe(ship.y);
    }
  });

  it('spreads Options by 12 recorded steps whatever the speed level', () => {
    for (const level of [0, 3, 5]) {
      const w = world({ ...MANUAL, loadout: 'full' }, DB, 60, 20);
      w.players[0].speedLevel = level;
      const group = w.weapons.options[0];
      group.reset(w.players[0], w.camera);
      const speed = w.ship.speeds[level];
      // As many moving ticks as fit above the bottom margin (at most 60).
      const n = Math.min(60, Math.floor(170 / speed));
      // The ramp charged (w15-MOVE): this test pins the recorded-step spacing at the exact
      // full-speed step, and the ease-in of the vertical axis is the player suite's subject.
      w.players[0].verticalTicks = VERTICAL_RAMP_TICKS;
      run(w, n, holding(Action.Down));
      for (let k = 0; k < 4; k++) {
        // Reached options are 12 steps apart; the others still sit on the reset entry.
        const back = Math.min(OPTION_SPACING * (k + 1), n);
        expect(w.players[0].y - group.y[k], `level ${level}`).toBeCloseTo(speed * back, 9);
      }
    }
  });
});

/**
 * The hits `collide` must find, by testing every shot against every enemy slot. A
 * non-piercing shot mirrors the physical pick of the engine's `offerHit` (prepB.FIX2): the
 * target whose box the shot's leading edge entered first — the smallest entry gap
 * `cx · qVx + cy · qVy − hw · |qVx| − hh · |qVy|` on the shot's travel vector (a beam's
 * `qVy` is 0, as `collide` sets it); on an exact tie the damageable target wins over the
 * armoured one, a further tie the lower slot, and a non-finite gap never steals the pick.
 *
 * @param w - The world.
 * @returns `[shot, enemy]` pairs in shot order, each shot's piercing hits in enemy-slot order.
 */
function bruteForce(w: World): [number, number][] {
  const out: [number, number][] = [];
  const f = w.weapons.pool.fields;
  for (let i = 0; i < w.weapons.pool.count; i++) {
    if ((f.flags[i] & ShotFlag.Dead) !== 0) continue;
    const laser = f.kind[i] === ShotKind.Laser;
    const x0 = laser ? f.x[i] - f.length[i] : f.x[i] - f.hw[i];
    const x1 = laser ? f.x[i] : f.x[i] + f.hw[i];
    const y0 = f.y[i] - f.hh[i];
    const y1 = f.y[i] + f.hh[i];
    const pierce = (f.flags[i] & ShotFlag.Pierce) !== 0;
    // The non-piercing pick mirrors `collide`'s published vectors and `offerHit`, line for line.
    const qVx = f.vx[i];
    const qVy = laser || f.kind[i] === ShotKind.Twin ? 0 : f.vy[i];
    const qAx = Math.abs(qVx);
    const qAy = Math.abs(qVy);
    let best = -1;
    let bestGap = 0;
    let bestArm = false;
    for (const e of w.enemies.enemies) {
      if (e.state !== EnemyState.Live || (e.flags & EnemyFlag.Ghost) !== 0) continue;
      const hit = e.x + e.hw >= x0 && e.x - e.hw <= x1 && e.y + e.hh >= y0 && e.y - e.hh <= y1;
      if (!hit) continue;
      if (!pierce) {
        const armoured = (e.flags & EnemyFlag.Invulnerable) !== 0;
        const gap = e.x * qVx + e.y * qVy - e.hw * qAx - e.hh * qAy;
        if (best >= 0) {
          if (!(gap < bestGap)) {
            if (gap === bestGap) {
              if (armoured !== bestArm) {
                if (armoured) continue;
              } else if (e.slot >= best) continue;
            } else {
              continue; // farther along the travel — or a non-finite gap never steals the pick
            }
          }
        }
        best = e.slot;
        bestGap = gap;
        bestArm = armoured;
        continue;
      }
      const cooldown = w.weapons.cooldowns[(f.table[i] - 1) * MAX_ENEMIES + e.slot];
      if ((e.flags & EnemyFlag.Invulnerable) !== 0 || cooldown === 0) out.push([i, e.slot]);
    }
    if (best >= 0) out.push([i, best]);
  }
  return out;
}
