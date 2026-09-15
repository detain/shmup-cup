/**
 * `core/weapons` inside a World (plan M1-10 acceptance): caps per shooter including the Options,
 * the Double's refire rule, laser pierce + hit cooldown, the missile sliding on slopes and dying
 * at walls, Options bunching while idle during scrolling and spreading when moving, grid-based
 * hits equal to a brute-force reference, score / explosion events on kills, armour clinks,
 * autofire timing and buttons, SFX rate limiting, terrain, content checks, the `'full'` loadout
 * and determinism. The allocation guard lives in `weapons-alloc.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import {
  EMPTY_CONTENT_DB,
  loadContent,
  type ContentDb,
  type ContentFile,
} from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { EnemyFlag, EnemyState, MAX_ENEMIES, type Enemy } from '../../src/enemies/index.js';
import { FX_CUES, SFX_CUES, SimEventKind, type SimEvent } from '../../src/events/index.js';
import {
  Action,
  commitPlayerInput,
  createInputSnapshot,
  type InputSnapshot,
} from '../../src/input/index.js';
import { OPTION_SPACING } from '../../src/options/index.js';
import { ENTER_END_X, ENTER_START_X, SPAWN_Y, spawnPlayer } from '../../src/player/index.js';
import { LayerId } from '../../src/presentation/index.js';
import { createRng } from '../../src/rng/index.js';
import {
  FULL_LOADOUT_SPEED_LEVEL,
  MAX_PLAYER_SHOTS,
  MainWeapon,
  PIERCE_TABLES,
  SHOOTERS_PER_PLAYER,
  ShotFlag,
  ShotKind,
  WEAPON_SCRIPT_IDS,
  WeaponRole,
  checkWeaponBehaviors,
  moduleInfo,
} from '../../src/weapons/index.js';
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
 * An enemy entry: a scriptless flying target that stays where it spawns.
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
    hurtbox: { hw: 4, hh: 4 },
    script: 'test.idle',
    sprite: 'enemies/drifter',
    drop: null,
    ...over,
  };
}

/** The test enemies. */
const ENEMIES = [
  enemy('target'),
  enemy('weak', { hp: 1, score: 200 }),
  enemy('wide', { hurtbox: { hw: 100, hh: 8 } }),
  enemy('armor', { hp: 5 }),
];

/**
 * Test content: the KESTREL, Type A weapons (or `weapons`), the shipped tileset, the test enemies
 * and a static stage `t` with a flat 32-px floor.
 *
 * @param weapons - The weapons file (default: the shipped Type A), or `null` for none.
 * @param enterTicks - The KESTREL's fly-in length (default: the shipped one).
 * @returns The DB.
 */
function db(
  weapons: ContentFile | null = shipped('weapons/type-a.weapons.json'),
  enterTicks?: number,
): ContentDb {
  const player = shipped('player/kestrel.player.json');
  if (enterTicks !== undefined) {
    (player.data as { ships: { enterTicks: number }[] }).ships[0].enterTicks = enterTicks;
  }
  const files: ContentFile[] = [
    player,
    shipped('tilesets/terrain-a.tileset.json'),
    {
      path: 'enemies/t.enemies.json',
      data: { formatVersion: 1, kind: 'enemies', enemies: ENEMIES },
    },
    {
      path: 'stages/t.stage.json',
      data: {
        formatVersion: 1,
        kind: 'stage',
        id: 't',
        name: 'T',
        music: { stage: 'Stage', boss: 'Boss' },
        length: 3000,
        camera: [{ x: 0, speed: 0 }],
        checkpoints: [{ x: 0 }],
        parallax: [],
        tilemap: {
          tileSize: 8,
          tileset: 'terrain-a',
          rowsTall: 25,
          generator: {
            type: 'heightfield',
            segments: [{ from: 0, to: 3384, floor: { base: 32, amp: 0, period: 64, seed: 1 } }],
          },
        },
        events: [],
      },
    },
  ];
  if (weapons !== null) files.push(weapons);
  const { db: content, issues } = loadContent(files, { extraSprites: ENGINE_SPRITES });
  expect(issues).toEqual([]);
  return content;
}

/** The shared default DB (content is read-only). */
const DB = db();

/**
 * A world whose player 1 is alive (fly-in done), parked at (`x`, `y`) in the view.
 *
 * @param config - Config overrides (default: free flight).
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
  w.events.clear();
  return w;
}

/** A world with autofire off (only held buttons fire). */
const MANUAL: Partial<GameConfig> = { autofire: false, remoteMode: false };

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

/**
 * The live shots of a kind, as plain records.
 *
 * @param w - The world.
 * @param kind - `ShotKind`.
 * @returns The shots.
 */
function shots(w: World, kind: number): { x: number; y: number; flags: number; length: number }[] {
  const f = w.weapons.pool.fields;
  const out: { x: number; y: number; flags: number; length: number }[] = [];
  for (let i = 0; i < w.weapons.pool.count; i++) {
    if ((f.flags[i] & ShotFlag.Dead) !== 0 || f.kind[i] !== kind) continue;
    out.push({ x: f.x[i], y: f.y[i], flags: f.flags[i], length: f.length[i] });
  }
  return out;
}

describe('core/weapons', () => {
  it('describes itself and owns the weapon behaviour ids', () => {
    expect(moduleInfo.name).toBe('weapons');
    expect(moduleInfo.status).toBe('implemented');
    // Type A (M1-10), the Types B–D behaviours (M2-03), the Direct-mode ones (M2-05) and the
    // Extra Edit ones (M3-01).
    expect(WEAPON_SCRIPT_IDS).toEqual([
      'direct.bolt',
      'direct.bomb',
      'laser.beam',
      'laser.cyclone',
      'laser.ripple',
      'laser.twin',
      'missile.control',
      'missile.groundSlide',
      'missile.hawkWind',
      'missile.smallSpread',
      'missile.spreadBomb',
      'missile.torpedo',
      'missile.twoWay',
      'missile.twoWayBack',
      'missile.upper',
      'shot.backDouble',
      'shot.double',
      'shot.freeWay',
      'shot.spreadGun',
      'shot.straight',
      'shot.tailGun',
      'shot.vertical',
    ]);
  });

  it('resolves the Type A preset into the four roles', () => {
    const w = world();
    expect(w.weapons.roleWeapons.map((spec) => spec?.id ?? null)).toEqual([
      'shot.basic',
      'shot.double',
      'laser.pierce',
      'missile.ground',
    ]);
    expect(w.pools.entries.map((e) => e.name)).toContain('playerShots');
    expect(w.weapons.pool.capacity).toBe(MAX_PLAYER_SHOTS);
    expect(w.weapons.batch.layer).toBe(LayerId.PlayerShots);
    expect(w.weapons.optionBatch.layer).toBe(LayerId.Player);
  });

  it('never fires without weapons content', () => {
    const w = world({}, db(null));
    run(w, 200);
    expect(w.weapons.pool.count).toBe(0);
    expect(w.weapons.roleWeapons).toEqual([null, null, null, null]);
  });

  it('caps live shots per shooter, the Options included (basic cap 2 × 5 shooters)', () => {
    const w = world({}, DB, 20, 100);
    const loadout = w.weapons.loadouts[0];
    loadout.options = 4;
    let most = 0;
    for (let t = 0; t < 300; t++) {
      run(w, 1);
      let total = 0;
      for (let s = 0; s < SHOOTERS_PER_PLAYER; s++) {
        const n = w.weapons.countShots(s, WeaponRole.Main);
        expect(n).toBeLessThanOrEqual(2);
        total += n;
      }
      // Player 2 is inactive: none of its shooters ever fires.
      for (let s = SHOOTERS_PER_PLAYER; s < 2 * SHOOTERS_PER_PLAYER; s++) {
        expect(w.weapons.countShots(s, WeaponRole.Main)).toBe(0);
      }
      most = Math.max(most, total);
    }
    expect(most).toBe(10);
  });

  it('fires the Double as a pair and never refires until both shots are gone', () => {
    const w = world();
    w.weapons.loadouts[0].main = MainWeapon.Double;
    let previous = 0;
    let volleys = 0;
    let forward = 0;
    for (let t = 0; t < 400; t++) {
      run(w, 1);
      const n = w.weapons.countShots(0, WeaponRole.Double);
      if (n > previous) {
        expect(previous).toBe(0);
        expect(n).toBe(2);
        volleys++;
        const pair = shots(w, ShotKind.Double);
        // One flies level, one climbs.
        expect(pair.filter((s) => s.y === w.players[0].y).length).toBe(1);
        forward++;
      }
      previous = n;
    }
    expect(volleys).toBeGreaterThanOrEqual(3);
    expect(forward).toBe(volleys);
    expect(w.weapons.countShots(0, WeaponRole.Main)).toBe(0);
  });

  it('pierces with the laser and hits each enemy once per cooldown', () => {
    const w = world(MANUAL, DB, 30, 100);
    const wide = spawn(w, 'wide', 250, 100);
    const small = spawn(w, 'target', 120, 100);
    const i = w.weapons.spawnShot(WeaponRole.Laser, 0, w.players[0].x, w.players[0].y);
    expect(i).toBeGreaterThanOrEqual(0);
    const wideHits: number[] = [];
    const smallHits: number[] = [];
    let wideHp = wide.hp;
    let smallHp = small.hp;
    for (let t = 0; t < 60; t++) {
      run(w, 1);
      if (wide.hp < wideHp) wideHits.push(t);
      if (small.hp < smallHp) smallHits.push(t);
      wideHp = wide.hp;
      smallHp = small.hp;
    }
    // The beam went through the small target and kept hitting the wide one every 6 ticks.
    expect(smallHits.length).toBeGreaterThanOrEqual(1);
    expect(wideHits.length).toBeGreaterThanOrEqual(3);
    for (let k = 1; k < wideHits.length; k++) expect(wideHits[k] - wideHits[k - 1]).toBe(6);
    for (let k = 1; k < smallHits.length; k++) expect(smallHits[k] - smallHits[k - 1]).toBe(6);
    expect(wide.hp).toBe(1000 - wideHits.length);
  });

  it('grows the laser to its maximum length and keeps it on the shooter row', () => {
    const w = world(MANUAL, DB, 30, 100);
    w.weapons.spawnShot(WeaponRole.Laser, 0, w.players[0].x, w.players[0].y);
    const lengths: number[] = [];
    const input = createInputSnapshot();
    commitPlayerInput(input.players[0], Action.Down);
    for (let t = 0; t < 12; t++) {
      run(w, 1, input);
      const [laser] = shots(w, ShotKind.Laser);
      lengths.push(laser.length);
      expect(laser.y).toBe(w.players[0].y);
    }
    expect(lengths.slice(0, 7)).toEqual([10, 20, 30, 40, 50, 60, 64]);
    expect(lengths[11]).toBe(64);
  });

  it('slides the missile along the floor, over slopes, and loses it at a wall', () => {
    const w = world({ ...MANUAL, stage: 't' }, DB, 40, 100);
    const map = w.terrain!;
    const cols = map.cols;
    map.tiles.fill(0);
    const set = (col: number, row: number, tile: number): void => {
      map.tiles[row * cols + col] = tile;
    };
    for (let col = 0; col < 60; col++) {
      for (let row = 21; row < 25; row++) set(col, row, 1);
      set(col, 20, 2); // floor surface at y 160
    }
    set(20, 19, 6); // slope up: 160 → 152
    for (let col = 21; col < 25; col++) set(col, 19, 2); // plateau at 152
    set(25, 19, 7); // slope down: 152 → 160
    for (let row = 10; row < 20; row++) set(30, row, 1); // a wall from y 80 at x 240
    w.weapons.spawnShot(WeaponRole.Missile, 0, w.players[0].x, w.players[0].y);
    let landed = -1;
    const path: { x: number; y: number; sliding: boolean }[] = [];
    for (let t = 0; t < 120; t++) {
      run(w, 1);
      const [missile] = shots(w, ShotKind.Missile);
      if (missile === undefined) break;
      const sliding = (missile.flags & ShotFlag.Sliding) !== 0;
      if (sliding && landed < 0) landed = t;
      path.push({ x: missile.x, y: missile.y, sliding });
    }
    expect(landed).toBeGreaterThan(0);
    const slid = path.filter((p) => p.sliding);
    // On the floor its centre rests 2 px above the surface; on the plateau 8 px higher.
    expect(slid.some((p) => p.x < 160 && p.y === 158)).toBe(true);
    expect(slid.some((p) => p.x >= 168 && p.x < 200 && p.y === 150)).toBe(true);
    expect(slid.some((p) => p.x >= 208 && p.x < 240 && p.y === 158)).toBe(true);
    // Up the slope it climbs smoothly (at most a 3-px step per tick).
    for (let k = 1; k < slid.length; k++) {
      expect(Math.abs(slid[k].y - slid[k - 1].y)).toBeLessThanOrEqual(3);
      expect(slid[k].x - slid[k - 1].x).toBeCloseTo(3, 9);
    }
    // The wall destroyed it: it never got past the wall's face.
    const last = path[path.length - 1];
    expect(last.x).toBeLessThan(240);
    expect(last.x).toBeGreaterThan(230);
    expect(path.length).toBeLessThan(120);
  });

  it('bunches the Options while idle during scrolling and spreads them when moving', () => {
    const w = world();
    w.weapons.loadouts[0].options = 4;
    const ship = w.players[0];
    const group = w.weapons.options[0];
    group.reset(ship, w.camera);
    w.camera.vx = 1;
    run(w, 100);
    expect(w.camera.x).toBe(100);
    expect(group.count).toBe(4);
    for (let k = 0; k < 4; k++) {
      expect(group.x[k]).toBeCloseTo(ship.x, 9);
      expect(group.y[k]).toBeCloseTo(ship.y, 9);
    }
    const input = createInputSnapshot();
    commitPlayerInput(input.players[0], Action.Down);
    run(w, 50, input);
    const speed = w.ship.speeds[0];
    for (let k = 0; k < 4; k++) {
      expect(group.x[k]).toBeCloseTo(ship.x, 9);
      expect(ship.y - group.y[k]).toBeCloseTo(speed * OPTION_SPACING * (k + 1), 9);
    }
    // Idle again: they keep their place relative to the ship while the stage scrolls on.
    const offsets = [0, 1, 2, 3].map((k) => [group.x[k] - ship.x, group.y[k] - ship.y]);
    run(w, 60);
    for (let k = 0; k < 4; k++) {
      expect(group.x[k] - ship.x).toBeCloseTo(offsets[k][0], 9);
      expect(group.y[k] - ship.y).toBeCloseTo(offsets[k][1], 9);
    }
    // The options are drawn below the ship.
    expect(w.weapons.optionBatch.count).toBe(4);
  });

  it('starts a fresh trail on the ship however short the fly-in (enterTicks 0, 1, 2, 40)', () => {
    for (const enterTicks of [0, 1, 2, 40]) {
      const label = `enterTicks ${String(enterTicks)}`;
      const w = createWorld(
        resolveGameConfig({ seed: 5, loadout: 'full' }),
        db(undefined, enterTicks),
      );
      const ship = w.players[0];
      const group = w.weapons.options[0];
      /** Every option is on the fly-in path (exactly on the ship when the fly-in is ≤ 1 tick). */
      const onFlyInPath = (): void => {
        expect(ship.state, label).toBe('alive');
        expect(ship.x - w.camera.x, label).toBe(ENTER_END_X);
        expect(ship.y - w.camera.y, label).toBe(SPAWN_Y);
        expect(group.count, label).toBe(4);
        for (let k = 0; k < 4; k++) {
          expect(group.y[k], label).toBe(ship.y);
          if (enterTicks <= 1) expect(group.x[k], label).toBe(ship.x);
          const sx = group.x[k] - w.camera.x;
          expect(sx, label).toBeGreaterThanOrEqual(ENTER_START_X);
          expect(sx, label).toBeLessThanOrEqual(ENTER_END_X);
        }
      };
      stepWorld(w, createInputSnapshot());
      if (enterTicks <= 1) {
        // Alive after the first tick: the options — and every laser they fire — are on the ship.
        onFlyInPath();
        const lasers = shots(w, ShotKind.Laser);
        expect(lasers.length, label).toBe(SHOOTERS_PER_PLAYER);
        for (const laser of lasers) expect(laser.y, label).toBe(ship.y);
      }
      run(w, 59);
      onFlyInPath();
      // The fly-in's last step is recorded: the newest trail entry is the ship.
      expect(group.trailX[group.head], label).toBe(ENTER_END_X);

      // Spread the options out, then respawn: the stale trail is gone.
      const input = createInputSnapshot();
      commitPlayerInput(input.players[0], Action.Down);
      run(w, 20, input);
      expect(group.y[0], label).toBeLessThan(ship.y);
      spawnPlayer(ship, w.camera, 'respawning');
      run(w, enterTicks <= 1 ? 1 : 60);
      onFlyInPath();
    }
  });

  it('finds the same hits through the grid as a brute-force test of every shot × enemy', () => {
    const rng = createRng(77);
    const ids = ['target', 'wide', 'armor', 'weak'];
    let total = 0;
    for (let round = 0; round < 40; round++) {
      const w = world(MANUAL, DB, 40, 100);
      const enemyCount = rng.rangeInt(1, MAX_ENEMIES);
      for (let k = 0; k < enemyCount; k++) {
        const e = spawn(
          w,
          ids[rng.rangeInt(0, 3)],
          rng.rangeInt(-100, 480),
          rng.rangeInt(-80, 280),
        );
        if (rng.rangeInt(0, 5) === 0) e.flags |= EnemyFlag.Invulnerable;
      }
      const shotCount = rng.rangeInt(1, 60);
      for (let k = 0; k < shotCount; k++) {
        const i = w.weapons.spawnShot(
          rng.rangeInt(0, 3),
          rng.rangeInt(0, 9),
          w.camera.x + rng.rangeInt(-40, 420),
          w.camera.y + rng.rangeInt(-20, 220),
        );
        if (i >= 0 && w.weapons.pool.fields.kind[i] === ShotKind.Laser) {
          w.weapons.pool.fields.length[i] = rng.rangeInt(0, 64);
          const table = w.weapons.pool.fields.table[i] - 1;
          for (let e = 0; e < MAX_ENEMIES; e++) {
            w.weapons.cooldowns[table * MAX_ENEMIES + e] = rng.rangeInt(0, 2) === 0 ? 3 : 0;
          }
        }
      }
      const grid = w.grid;
      grid.begin(Math.floor(w.camera.x) - 64, Math.floor(w.camera.y) - 64);
      w.enemies.insertColliders(grid);
      grid.build();
      w.weapons.collide(grid);
      const found: [number, number][] = [];
      for (let k = 0; k < w.weapons.hitCount; k++) {
        found.push([w.weapons.hitShot[k], w.weapons.hitEnemy[k]]);
      }
      expect(found, `round ${round}`).toEqual(bruteForce(w));
      total += found.length;
    }
    expect(total).toBeGreaterThan(100);
  });

  it('kills enemies: explosion events, the kill record with its score and killer', () => {
    const w = world({}, DB, 40, 100);
    const weak = spawn(w, 'weak', 150, 100);
    let kill = -1;
    const events: SimEvent[] = [];
    for (let t = 0; t < 60 && kill < 0; t++) {
      events.push(...run(w, 1));
      if (weak.state !== EnemyState.Live) {
        kill = t;
        const o = w.enemies.outcomes;
        expect(o.killCount).toBe(1);
        expect(o.killScore[0]).toBe(200);
        expect(o.killBy[0]).toBe(0);
      }
    }
    expect(kill).toBeGreaterThan(0);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: SimEventKind.Sfx, id: SFX_CUES.EnemyExplodeSmall }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ kind: SimEventKind.Particles, id: FX_CUES.ExplosionSmall }),
    );
  });

  it('clinks off armour: no damage, the shot dies, the cue is rate-limited', () => {
    const w = world({}, DB, 40, 100);
    const armor = spawn(w, 'armor', 150, 100);
    armor.flags |= EnemyFlag.Invulnerable;
    const events = run(w, 200);
    const clinks = events.filter((e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.Clink);
    expect(armor.hp).toBe(5);
    expect(clinks.length).toBeGreaterThan(3);
    for (let k = 1; k < clinks.length; k++) {
      expect(clinks[k].tick - clinks[k - 1].tick).toBeGreaterThanOrEqual(4);
    }
    // Every shot died at the armour: none flew past it.
    for (const s of shots(w, ShotKind.Straight)) expect(s.x).toBeLessThanOrEqual(armor.x + 12);
  });

  it('rate-limits the shot SFX to one per 4 ticks per cue', () => {
    const w = world({ loadout: 'full' });
    const events = run(w, 200);
    for (const cue of [SFX_CUES.PlayerShot, SFX_CUES.PlayerMissile]) {
      const ticks = events
        .filter((e) => e.kind === SimEventKind.Sfx && e.id === cue)
        .map((e) => e.tick);
      expect(ticks.length).toBeGreaterThan(2);
      for (let k = 1; k < ticks.length; k++)
        expect(ticks[k] - ticks[k - 1]).toBeGreaterThanOrEqual(4);
    }
  });

  it('autofires every autofireInterval ticks when the cap allows (or the weapon refireTicks)', () => {
    const wide = (refire?: number): ContentFile => ({
      path: 'weapons/w.weapons.json',
      data: {
        formatVersion: 1,
        kind: 'weapons',
        weapons: [
          {
            id: 'many',
            slot: 'main',
            behavior: 'shot.straight',
            damage: 1,
            speed: 1,
            cap: 64,
            pierce: false,
            sprite: 'shots/basic',
            ...(refire === undefined ? {} : { refireTicks: refire }),
          },
        ],
      },
    });
    const gaps = (w: World): number[] => {
      const ticks: number[] = [];
      let before = w.weapons.countShots(0, WeaponRole.Main);
      for (let t = 0; t < 40; t++) {
        run(w, 1);
        const n = w.weapons.countShots(0, WeaponRole.Main);
        if (n > before) ticks.push(t);
        before = n;
      }
      return ticks.slice(1).map((t, k) => t - ticks[k]);
    };
    expect(new Set(gaps(world({}, db(wide()))))).toEqual(new Set([4]));
    expect(new Set(gaps(world({ autofireInterval: 6 }, db(wide()))))).toEqual(new Set([6]));
    expect(new Set(gaps(world({ autofireInterval: 6 }, db(wide(3)))))).toEqual(new Set([3]));
  });

  it('fires only with the buttons held when autofire is off (Shot = main, Sub = missiles)', () => {
    const w = world(MANUAL);
    w.weapons.loadouts[0].missile = true;
    run(w, 30);
    expect(w.weapons.pool.count).toBe(0);
    const input = createInputSnapshot();
    commitPlayerInput(input.players[0], Action.Shot);
    run(w, 10, input);
    expect(w.weapons.countShots(0, WeaponRole.Main)).toBeGreaterThan(0);
    expect(w.weapons.countShots(0, WeaponRole.Missile)).toBe(0);
    commitPlayerInput(input.players[0], Action.Sub);
    run(w, 10, input);
    expect(w.weapons.countShots(0, WeaponRole.Missile)).toBe(1);
    // Remote mode forces autofire.
    const remote = world({ autofire: false, remoteMode: true });
    run(remote, 10);
    expect(remote.weapons.pool.count).toBeGreaterThan(0);
  });

  it('kills shots on terrain', () => {
    const w = world({ stage: 't' }, DB, 40, 100);
    const map = w.terrain!;
    for (let row = 0; row < map.rows; row++) map.tiles[row * map.cols + 20] = 1; // wall at x 160
    run(w, 120);
    const straight = shots(w, ShotKind.Straight);
    expect(w.weapons.pool.count).toBeGreaterThan(0);
    for (const s of straight) expect(s.x).toBeLessThan(160);
  });

  it('starts fully powered with loadout "full" and fires lasers and missiles from every shooter', () => {
    const w = world({ loadout: 'full', stage: 't' });
    const l = w.weapons.loadouts[0];
    expect([l.main, l.missile, l.options]).toEqual([MainWeapon.Laser, true, 4]);
    // M1-11: the full loadout also carries a fresh Force Field (on the ship).
    expect(w.players[0].shield.hits).toBe(5);
    expect(w.players[0].speedLevel).toBe(FULL_LOADOUT_SPEED_LEVEL);
    expect(w.weapons.loadouts[1].options).toBe(4); // P2's loadout too (inactive until co-op)
    const input = createInputSnapshot();
    let lasers = 0;
    let missiles = 0;
    for (let t = 0; t < 120; t++) {
      commitPlayerInput(input.players[0], (t >> 4) % 2 === 0 ? Action.Up : Action.Down);
      run(w, 1, input);
      for (let s = 0; s < SHOOTERS_PER_PLAYER; s++) {
        expect(w.weapons.countShots(s, WeaponRole.Laser)).toBeLessThanOrEqual(1);
        expect(w.weapons.countShots(s, WeaponRole.Missile)).toBeLessThanOrEqual(1);
      }
      lasers = Math.max(lasers, shots(w, ShotKind.Laser).length);
      missiles = Math.max(missiles, shots(w, ShotKind.Missile).length);
    }
    expect(lasers).toBe(5);
    expect(missiles).toBe(5);
    expect(w.weapons.batch.count).toBeGreaterThan(5); // lasers draw several segments
  });

  it('drops spawns quietly when the pool or the pierce tables run out', () => {
    const w = world(MANUAL);
    let lasers = 0;
    for (let k = 0; k < PIERCE_TABLES + 5; k++) {
      if (w.weapons.spawnShot(WeaponRole.Laser, 0, 100, 100) >= 0) lasers++;
    }
    expect(lasers).toBe(PIERCE_TABLES);
    let shotsMade = lasers;
    for (let k = 0; k < MAX_PLAYER_SHOTS; k++) {
      if (w.weapons.spawnShot(WeaponRole.Main, 1, 100, 100) >= 0) shotsMade++;
    }
    expect(shotsMade).toBe(MAX_PLAYER_SHOTS);
    expect(w.weapons.spawnShot(WeaponRole.Main, 1, 100, 100)).toBe(-1);
    expect(w.weapons.spawnShot(9, 0, 100, 100)).toBe(-1);
    expect(w.weapons.spawnShot(WeaponRole.Main, 99, 100, 100)).toBe(-1);
    expect(world(MANUAL, db(null)).weapons.spawnShot(WeaponRole.Main, 0, 100, 100)).toBe(-1);
  });

  it('checks weapons against their behaviours', () => {
    expect(checkWeaponBehaviors(DB)).toEqual([]);
    expect(checkWeaponBehaviors(EMPTY_CONTENT_DB)).toEqual([]);
    const bad = loadContent([
      {
        path: 'weapons/b.weapons.json',
        data: {
          formatVersion: 1,
          kind: 'weapons',
          weapons: [
            {
              id: 'a',
              slot: 'main',
              behavior: 'shot.straight',
              damage: 1,
              speed: 1,
              cap: 1,
              pierce: false,
              sprite: 's',
              params: { nope: 1 },
            },
            {
              id: 'b',
              slot: 'main',
              behavior: 'laser.beam',
              damage: 1,
              speed: 1,
              cap: 1,
              pierce: true,
              sprite: 's',
            },
            {
              id: 'c',
              slot: 'main',
              behavior: 'drifter.sine',
              damage: 1,
              speed: 1,
              cap: 1,
              pierce: false,
              sprite: 's',
            },
          ],
        },
      },
    ]).db;
    expect(checkWeaponBehaviors(bad).map((issue) => issue.path)).toEqual([
      'weapons:a.params.nope',
      'weapons:b.slot',
      'weapons:c.behavior',
    ]);
  });

  it('stays deterministic in lockstep (hashWorld) and hashes the weapon state', () => {
    const session = (): number[] => {
      const w = world({ loadout: 'full', stage: 't' });
      spawn(w, 'target', 200, 60);
      spawn(w, 'weak', 300, 150);
      const input = createInputSnapshot();
      const rng = createRng(3);
      const hashes: number[] = [];
      for (let t = 0; t < 400; t++) {
        commitPlayerInput(input.players[0], rng.rangeInt(0, 15) | Action.Shot);
        stepWorld(w, input);
        w.events.clear();
        hashes.push(hashWorld(w));
      }
      return hashes;
    };
    expect(session()).toEqual(session());
    const w = world({ loadout: 'full' });
    run(w, 10);
    const before = hashWorld(w);
    w.weapons.loadouts[0].options = 3;
    expect(hashWorld(w)).not.toBe(before);
    w.weapons.loadouts[0].options = 4;
    w.weapons.timers[3]++;
    expect(hashWorld(w)).not.toBe(before);
    w.weapons.timers[3]--;
    expect(hashWorld(w)).toBe(before);
  });
});

/**
 * The hits `collide` must find, computed by testing every shot against every enemy slot.
 *
 * @param w - The world (shots and enemies as they are).
 * @returns `[shot, enemy]` pairs in shot order, then enemy-slot order.
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
    for (const e of w.enemies.enemies) {
      if (e.state !== EnemyState.Live || (e.flags & EnemyFlag.Ghost) !== 0) continue;
      const hit = e.x + e.hw >= x0 && e.x - e.hw <= x1 && e.y + e.hh >= y0 && e.y - e.hh <= y1;
      if (!hit) continue;
      if (!pierce) {
        out.push([i, e.slot]);
        break;
      }
      const cooldown = w.weapons.cooldowns[(f.table[i] - 1) * MAX_ENEMIES + e.slot];
      if ((e.flags & EnemyFlag.Invulnerable) !== 0 || cooldown === 0) out.push([i, e.slot]);
    }
  }
  return out;
}
