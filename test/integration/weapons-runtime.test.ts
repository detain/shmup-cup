/**
 * The player weapons end to end (plan M1-10): headless games on the shipped `test-range` stage,
 * built from the real `content/` files with the engine's script registry and sprites (the way the
 * shell loads them).
 *
 * - The shipped Type A arsenal passes `checkWeaponBehaviors`, resolves to the `type-a` preset in
 *   role order and draws with `shots/*` sprites and the `PlayerShot` / `PlayerMissile` cues.
 * - The `'full'` loadout (Laser, Missile, four Options) plays the whole stage; after every tick:
 *   at most 96 shots, per-shooter caps (one laser and one missile per ship / Option), every shot
 *   inside the view ± 16 px (a laser by its head and tail), straight / Double shots never inside
 *   rock, a sliding missile resting exactly on the floor it follows, the shot batch within its
 *   capacity and drawn with `shots/*` sprites, the four Options drawn while the ship is alive.
 *   It kills enemies (credited to player 1), completes formations and clinks nothing unarmoured.
 * - The Double plays the stage too: volleys are pairs, never more than two shots per shooter.
 * - Remote mode fires without any button (shmup_feat.md §4 rule 1): a session whose config turns
 *   autofire off but runs in remote mode kills enemies with nothing ever held.
 * - Two sessions fed the same wandering input keep equal shot pools, option trails and
 *   `hashWorld`s; the autofire interval is sim-affecting (a different one diverges).
 */
import {
  Action,
  KNOWN_SCRIPT_IDS,
  ENGINE_SPRITES,
  MAX_PLAYER_SHOTS,
  MainWeapon,
  SHOOTERS_PER_PLAYER,
  SHOT_BATCH_CAPACITY,
  SHOT_CULL_MARGIN,
  PLAYFIELD_H,
  PLAYFIELD_W,
  SFX_CUES,
  ShotFlag,
  ShotKind,
  SimEventKind,
  WEAPON_ROLE_COUNT,
  WeaponRole,
  checkWeaponBehaviors,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  hashWorld,
  loadContent,
  resolveWeaponPreset,
  terrainSolidAt,
  type ContentDb,
  type Game,
  type GameConfig,
  type World,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';

/**
 * The shipped content with the engine sprites, validated like the shell does.
 *
 * @returns The DB (asserted issue-free, weapons included).
 */
function shipped(): ContentDb {
  const { db, issues } = loadContent(readContentFiles(), {
    knownScripts: KNOWN_SCRIPT_IDS,
    extraSprites: ENGINE_SPRITES,
  });
  expect(issues).toEqual([]);
  expect(checkWeaponBehaviors(db)).toEqual([]);
  return db;
}

const DB = shipped();

/**
 * A headless game on the test range.
 *
 * @param config - Config overrides.
 * @returns The game.
 */
function game(config: Partial<GameConfig> = {}): Game {
  return createGame(createHeadlessPlatform(), { seed: 21, stage: 'test-range', ...config }, DB);
}

/**
 * Plays the stage to `stageClear`, calling a hook after every tick (events are drained into it).
 *
 * @param g - The game.
 * @param after - Called after each tick with the events of that tick.
 */
function playThrough(g: Game, after: (events: { kind: number; id: number }[]) => void): void {
  const w = g.world;
  const events: { kind: number; id: number }[] = [];
  for (let t = 0; t < 20000 && w.status === 'playing'; t++) {
    g.step();
    events.length = 0;
    w.events.drain((e) => events.push({ kind: e.kind, id: e.id }));
    after(events);
  }
  expect(w.status).toBe('stageClear');
}

/**
 * Live shots per shooter and role, counted from the pool.
 *
 * @param w - The world.
 * @returns `counts[shooter × WEAPON_ROLE_COUNT + role]`.
 */
function liveCounts(w: World): number[] {
  const counts = new Array<number>(2 * SHOOTERS_PER_PLAYER * WEAPON_ROLE_COUNT).fill(0);
  const f = w.weapons.pool.fields;
  for (let i = 0; i < w.weapons.pool.count; i++) {
    if ((f.flags[i] & ShotFlag.Dead) !== 0) continue;
    counts[f.shooter[i] * WEAPON_ROLE_COUNT + f.role[i]]++;
  }
  return counts;
}

/**
 * Collects invariant violations (an `expect` per shot per tick would make the whole-stage runs
 * slow; the list is asserted empty once at the end).
 */
class Violations {
  /** The first violations found (at most 10). */
  readonly list: string[] = [];

  /**
   * Records a violation unless `ok`.
   *
   * @param ok - Whether the invariant holds.
   * @param what - Describes the violation (called only when it does not hold).
   */
  check(ok: boolean, what: () => string): void {
    if (!ok && this.list.length < 10) this.list.push(what());
  }
}

/**
 * Checks the per-tick invariants of the shot pool and batch.
 *
 * @param w - The world.
 * @param v - Where violations go.
 */
function checkShots(w: World, v: Violations): void {
  const map = w.terrain;
  if (map === null) throw new Error('no terrain');
  const pool = w.weapons.pool;
  const f = pool.fields;
  const tick = w.tick - 1;
  v.check(pool.count <= MAX_PLAYER_SHOTS, () => `tick ${tick}: ${pool.count} shots`);
  const left = w.camera.x - SHOT_CULL_MARGIN;
  const right = w.camera.x + PLAYFIELD_W + SHOT_CULL_MARGIN;
  const top = w.camera.y - SHOT_CULL_MARGIN;
  const bottom = w.camera.y + PLAYFIELD_H + SHOT_CULL_MARGIN;
  for (let i = 0; i < pool.count; i++) {
    if ((f.flags[i] & ShotFlag.Dead) !== 0) continue;
    const x = f.x[i];
    const y = f.y[i];
    const kind = f.kind[i];
    const at = (): string => `tick ${tick}: kind ${kind} shot at ${x}, ${y}`;
    v.check(y >= top && y <= bottom, () => at() + ' outside the view vertically');
    if (kind === ShotKind.Laser) {
      const length = f.length[i];
      v.check(x >= left && x - length <= right, () => at() + ` (length ${length}) outside`);
      v.check(length >= 0 && length <= 64, () => at() + ` has length ${length}`);
      continue;
    }
    v.check(x >= left && x <= right, () => at() + ' outside the view horizontally');
    if (kind === ShotKind.Straight || kind === ShotKind.Double) {
      v.check(!terrainSolidAt(map, Math.floor(x), Math.floor(y)), () => at() + ' inside rock');
    } else if ((f.flags[i] & ShotFlag.Sliding) !== 0) {
      // Centre (hh + 0.5) = 2 px above the surface: the surface pixel is rock, the one above not.
      const surface = y + f.hh[i] + 0.5;
      const px = Math.floor(x);
      v.check(
        Number.isInteger(surface) &&
          terrainSolidAt(map, px, surface) &&
          !terrainSolidAt(map, px, surface - 1),
        () => at() + ' is not resting on the floor',
      );
    }
  }
  const batch = w.weapons.batch;
  v.check(batch.count <= SHOT_BATCH_CAPACITY, () => `tick ${tick}: batch ${batch.count}`);
  for (let k = 0; k < batch.count; k++) {
    const name = DB.sprites.names[batch.spriteId[k]];
    v.check(name.startsWith('shots/'), () => `tick ${tick}: draws ${name}`);
  }
}

describe('integration: player weapons on the test range', () => {
  it('loads the shipped Type A arsenal into the four roles', () => {
    expect(resolveWeaponPreset(DB)?.id).toBe('type-a');
    const g = game();
    const roles = g.world.weapons.roleWeapons;
    expect(roles.map((spec) => spec?.behavior)).toEqual([
      'shot.straight',
      'shot.double',
      'laser.beam',
      'missile.groundSlide',
    ]);
    expect(roles.map((spec) => spec?.sprite)).toEqual([
      'shots/basic',
      'shots/double',
      'shots/laser',
      'shots/missile',
    ]);
    expect(roles.map((spec) => spec?.sfxId)).toEqual([
      SFX_CUES.PlayerShot,
      SFX_CUES.PlayerShot,
      SFX_CUES.PlayerShot,
      SFX_CUES.PlayerMissile,
    ]);
    // Autofire intervals come from the config (Type A has no refireTicks of its own).
    expect(roles.every((spec) => spec?.refireTicks === undefined)).toBe(true);
    expect([g.config.autofireInterval, g.config.missileInterval]).toEqual([4, 10]);
  });

  it('plays the stage with the full loadout within every cap, bound and surface', () => {
    const g = game({ loadout: 'full' });
    const w = g.world;
    w.debugFlags.godMode = true;
    const v = new Violations();
    let peak = 0;
    let lasers = 0;
    let slid = 0;
    let kills = 0;
    let bonuses = 0;
    let clinks = 0;
    let aliveTicks = 0;
    playThrough(g, (events) => {
      checkShots(w, v);
      const tick = w.tick - 1;
      const counts = liveCounts(w);
      for (let s = 0; s < SHOOTERS_PER_PLAYER; s++) {
        const base = s * WEAPON_ROLE_COUNT;
        v.check(
          counts[base + WeaponRole.Laser] <= 1 &&
            counts[base + WeaponRole.Missile] <= 1 &&
            counts[base + WeaponRole.Main] === 0 &&
            counts[base + WeaponRole.Double] === 0,
          () => `tick ${tick}: shooter ${s} has ${counts.slice(base, base + 4).join('/')}`,
        );
      }
      // Player 2 is not in the game: its shooters never fire.
      v.check(
        counts.slice(SHOOTERS_PER_PLAYER * WEAPON_ROLE_COUNT).every((n) => n === 0),
        () => `tick ${tick}: player 2 fired`,
      );
      peak = Math.max(peak, w.weapons.pool.count);
      const f = w.weapons.pool.fields;
      let live = 0;
      for (let i = 0; i < w.weapons.pool.count; i++) {
        if (f.kind[i] === ShotKind.Laser) live++;
        if ((f.flags[i] & ShotFlag.Sliding) !== 0) slid++;
      }
      lasers = Math.max(lasers, live);
      if (w.players[0].state === 'alive') {
        aliveTicks++;
        v.check(
          w.weapons.options[0].count === 4 && w.weapons.optionBatch.count === 4,
          () => `tick ${tick}: ${w.weapons.options[0].count} Options`,
        );
      }
      const o = w.enemies.outcomes;
      for (let k = 0; k < o.killCount; k++) {
        v.check(o.killBy[k] === 0, () => `tick ${tick}: kill credited to ${o.killBy[k]}`);
        kills++;
      }
      for (const e of events) {
        if (e.kind === SimEventKind.FormationBonus) bonuses++;
        if (e.kind === SimEventKind.Sfx && e.id === SFX_CUES.Clink) clinks++;
      }
    });
    expect(v.list).toEqual([]);
    expect(aliveTicks).toBeGreaterThan(1000);
    expect(peak).toBeGreaterThanOrEqual(8);
    expect(lasers).toBe(5);
    expect(slid).toBeGreaterThan(100); // missiles found the floor and slid along it
    expect(kills).toBeGreaterThan(20);
    expect(bonuses).toBeGreaterThan(0);
    // The shipped roster has no armour yet.
    expect(clinks).toBe(0);
  }, 60_000);

  it('plays the stage with the Double: pairs only, never more than two per shooter', () => {
    const g = game();
    const w = g.world;
    w.debugFlags.godMode = true;
    w.weapons.loadouts[0].main = MainWeapon.Double;
    w.weapons.loadouts[0].options = 2;
    const v = new Violations();
    let previous = new Array<number>(SHOOTERS_PER_PLAYER).fill(0);
    let pairs = 0;
    let kills = 0;
    playThrough(g, () => {
      checkShots(w, v);
      const tick = w.tick - 1;
      const counts = liveCounts(w);
      const now = previous.map((_, s) => counts[s * WEAPON_ROLE_COUNT + WeaponRole.Double]);
      // A new volley (age 1) never flies next to an older shot of the same shooter.
      const f = w.weapons.pool.fields;
      const fresh = new Array<number>(SHOOTERS_PER_PLAYER).fill(0);
      const old = new Array<number>(SHOOTERS_PER_PLAYER).fill(0);
      for (let i = 0; i < w.weapons.pool.count; i++) {
        if (f.kind[i] !== ShotKind.Double || f.shooter[i] >= SHOOTERS_PER_PLAYER) continue;
        if (f.age[i] === 1) fresh[f.shooter[i]]++;
        else old[f.shooter[i]]++;
      }
      for (let s = 0; s < SHOOTERS_PER_PLAYER; s++) {
        v.check(now[s] <= 2, () => `tick ${tick}: shooter ${s} has ${now[s]} Double shots`);
        v.check(counts[s * WEAPON_ROLE_COUNT + WeaponRole.Main] === 0, () => `tick ${tick}: main`);
        v.check(fresh[s] === 0 || old[s] === 0, () => `tick ${tick}: shooter ${s} refired early`);
        // No refire until both are gone (one of a pair may die in its first tick, on rock).
        if (now[s] > previous[s]) {
          v.check(previous[s] === 0, () => `tick ${tick}: shooter ${s} refired early`);
          if (now[s] === 2) pairs++;
        }
      }
      if (w.players[0].state === 'alive') {
        // Options 3 and 4 are not owned: shooters 3 and 4 never fire.
        v.check(now[3] + now[4] === 0, () => `tick ${tick}: unowned Options fired`);
      }
      previous = now;
      kills += w.enemies.outcomes.killCount;
    });
    expect(v.list).toEqual([]);
    expect(pairs).toBeGreaterThan(100);
    expect(kills).toBeGreaterThan(10);
  }, 60_000);

  it('fires in remote mode with no button ever held (autofire forced, feat §4 rule 1)', () => {
    const g = game({ autofire: false, remoteMode: true });
    const w = g.world;
    w.debugFlags.godMode = true;
    let fired = 0;
    let kills = 0;
    let held = 0;
    playThrough(g, () => {
      held |= w.intents[0].held;
      fired = Math.max(fired, w.weapons.pool.count);
      kills += w.enemies.outcomes.killCount;
    });
    expect(held).toBe(0);
    expect(fired).toBeGreaterThan(0);
    expect(kills).toBeGreaterThan(10);
    // Without remote mode the same config never fires.
    const silent = game({ autofire: false, remoteMode: false });
    silent.world.debugFlags.godMode = true;
    let silentShots = 0;
    for (let t = 0; t < 600; t++) {
      silent.step();
      silent.world.events.clear();
      silentShots += silent.world.weapons.pool.count;
    }
    expect(silentShots).toBe(0);
  }, 60_000);

  it('keeps two sessions fed the same wandering input in lockstep, shots and Options too', () => {
    const run = (config: Partial<GameConfig>): number[] => {
      const platform = createHeadlessPlatform();
      const g = createGame(
        platform,
        { seed: 33, stage: 'test-range', loadout: 'full', ...config },
        DB,
      );
      g.world.debugFlags.godMode = true;
      const masks = [Action.Up, Action.Right | Action.Down, Action.Down, Action.Left, 0];
      const hashes: number[] = [];
      for (let t = 0; t < 3000 && g.world.status === 'playing'; t++) {
        commitPlayerInput(platform.snapshot.players[0], masks[(t >> 4) % masks.length]);
        g.step();
        g.world.events.clear();
        if (t % 100 === 0) {
          const pool = g.world.weapons.pool;
          const f = pool.fields;
          let fold = pool.count;
          for (let i = 0; i < pool.count; i++) fold = (fold * 31 + f.x[i] * 7 + f.y[i]) % 1e9;
          hashes.push(hashWorld(g.world), fold, g.world.weapons.options[0].head);
        }
      }
      return hashes;
    };
    const a = run({});
    expect(a.length).toBeGreaterThan(80);
    expect(run({})).toEqual(a);
    // The autofire interval is replay-recorded because it changes the simulation.
    expect(run({ autofireInterval: 5 })).not.toEqual(a);
  }, 60_000);
});
