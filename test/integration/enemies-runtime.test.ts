/**
 * The enemies of the shipped content end to end (plan M1-08): the `test-range` timeline played
 * by headless games built from the real `content/` files, validated with the engine's script
 * registry.
 *
 * - The whole timeline runs: every enemy of the test-range roster (all eight M1 behaviours,
 *   the hatch's children included) spawns, the 64-slot pool is never exceeded, every formation
 *   spawns all its members and resolves; with nobody shooting nothing is killed, so no
 *   formation bonus is awarded and every member counts as escaped.
 * - With the default always-on autofire the KESTREL's Type A main shot (M1-10) kills enemies:
 *   kills credited to player 1, and formations shot down completely award their bonus.
 * - Ground enemies stand on (or hang from) the generated terrain when they appear, and the
 *   walkers stay on the surface over the rolling slopes for their whole lives.
 * - Killing every enemy on its first on-screen tick (perfect play through the public damage
 *   API) completes every formation: one `FormationBonus` event per timeline formation with
 *   the stage file's bonus, a capsule for each formation without `drop: null` and for every
 *   capsule carrier.
 * - Two sessions fed the same input hash equal all the way (`hashWorld` covers the enemies
 *   and the formation table).
 */
import {
  Action,
  BodyAnchor,
  EnemyFlag,
  EnemyState,
  KNOWN_SCRIPT_IDS,
  MAX_ENEMIES,
  MoverKind,
  SimEventKind,
  checkEnemyBehaviors,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  hashWorld,
  loadContent,
  terrainSolidAt,
  type ContentDb,
  type Game,
  type StageFormationEvent,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';

/**
 * The shipped content, validated like the shell does.
 *
 * @returns The DB (asserted issue-free).
 */
function shipped(): ContentDb {
  const { db, issues } = loadContent(readContentFiles(), { knownScripts: KNOWN_SCRIPT_IDS });
  expect(issues).toEqual([]);
  expect(checkEnemyBehaviors(db)).toEqual([]);
  return db;
}

const DB = shipped();

/** The test-range stage. */
const STAGE = DB.stages[DB.stageIndex.get('test-range') ?? -1];

/**
 * A headless game on the test range whose ship does not shoot (autofire off, no button held —
 * the player weapons of M1-10 would kill the enemies these tests watch).
 *
 * @param seed - Seed.
 * @param shoot - Let the ship autofire (the default config) instead.
 * @returns The game.
 */
function game(seed = 21, shoot = false): Game {
  return createGame(
    createHeadlessPlatform(),
    shoot
      ? { seed, stage: 'test-range' }
      : { seed, stage: 'test-range', autofire: false, remoteMode: false },
    DB,
  );
}

/**
 * Steps a game until the stage is clear (plus some ticks), calling a hook after every tick.
 *
 * @param g - The game.
 * @param after - Called after each tick.
 * @param extra - Ticks to run on after `stageClear`.
 */
function playThrough(g: Game, after: (tick: number) => void, extra = 0): void {
  let left = extra;
  for (let t = 0; t < 20000; t++) {
    g.step();
    after(t);
    if (g.world.status !== 'playing' && left-- <= 0) break;
  }
  expect(g.world.status).toBe('stageClear');
}

describe('integration: the test-range timeline', () => {
  it('lets the autofiring KESTREL shoot enemies down (kills, formation bonuses — M1-10)', () => {
    const g = game(21, true);
    const w = g.world;
    let kills = 0;
    let bonuses = 0;
    playThrough(g, () => {
      const o = w.enemies.outcomes;
      for (let k = 0; k < o.killCount; k++) {
        expect(o.killBy[k]).toBe(0);
        kills++;
      }
      w.events.drain((event) => {
        if (event.kind === SimEventKind.FormationBonus) bonuses++;
      });
    });
    expect(w.weapons.roleWeapons[0]?.id).toBe('shot.basic');
    expect(kills).toBeGreaterThan(10);
    expect(bonuses).toBeGreaterThan(0);
  });

  it('spawns every roster enemy, stays within the pool and resolves every formation', () => {
    const g = game();
    const w = g.world;
    const seen = new Set<string>();
    const scripts = new Set<string>();
    let started = 0;
    let peak = 0;
    const wasActive = new Uint8Array(w.enemies.formations.active.length);
    let bonuses = 0;
    playThrough(
      g,
      () => {
        const e = w.enemies;
        peak = Math.max(peak, e.count);
        expect(e.count).toBeLessThanOrEqual(MAX_ENEMIES);
        for (const enemy of e.enemies) {
          if (enemy.state !== EnemyState.Live) continue;
          const spec = DB.enemies[enemy.specIndex];
          seen.add(spec.id);
          scripts.add(spec.script);
        }
        const f = e.formations;
        for (let slot = 0; slot < f.active.length; slot++) {
          if (f.active[slot] === 1 && wasActive[slot] === 0) started++;
          if (f.active[slot] === 1) {
            expect(f.spawned[slot]).toBeLessThanOrEqual(f.total[slot]);
            expect(f.killed[slot] + f.escaped[slot]).toBeLessThanOrEqual(f.spawned[slot]);
          }
          wasActive[slot] = f.active[slot];
        }
        w.events.drain((event) => {
          if (event.kind === SimEventKind.FormationBonus) bonuses++;
        });
      },
      900,
    );
    const formations = STAGE.events.filter((e) => e.type === 'formation').length;
    expect(started).toBe(formations);
    expect(Array.from(w.enemies.formations.active).every((a) => a === 0)).toBe(true);
    expect(bonuses).toBe(0); // nothing shoots yet: every member escaped
    expect([...seen].sort()).toEqual(DB.enemies.map((e) => e.id).sort());
    expect([...scripts].sort()).toEqual(
      [
        'carrier.straight',
        'drifter.sine',
        'fan.loop',
        'hatch.spawner',
        'orbiter.loop',
        'rammer.aimed',
        'turret.floor',
        'walker.floor',
      ].sort(),
    );
    expect(peak).toBeGreaterThan(5);
  });

  it('stands ground enemies on the terrain; walkers keep to the surface over the slopes', () => {
    const g = game(4);
    const w = g.world;
    const map = w.terrain;
    if (map === null) throw new Error('no terrain');
    let grounded = 0;
    let walkerTicks = 0;
    const walker = DB.enemyIndex.get('walker');
    playThrough(g, () => {
      for (const e of w.enemies.enemies) {
        if (e.state !== EnemyState.Live || e.anchor === BodyAnchor.Air) continue;
        const onSurface =
          e.anchor === BodyAnchor.Floor
            ? terrainSolidAt(map, e.x, e.y + e.hh) && !terrainSolidAt(map, e.x, e.y + e.hh - 1)
            : terrainSolidAt(map, e.x, e.y - e.hh - 1) && !terrainSolidAt(map, e.x, e.y - e.hh);
        if (e.age === 1) {
          expect(onSurface, DB.enemies[e.specIndex].id + ' at ' + String(e.x)).toBe(true);
          grounded++;
        }
        if (e.specIndex === walker && e.mover === MoverKind.GroundCrawl) {
          expect(onSurface, 'walker at ' + String(e.x)).toBe(true);
          walkerTicks++;
        }
      }
      w.events.clear();
    });
    // turret ×2, turret-ceiling ×2, walker ×2, hatch ×2 in the timeline.
    expect(grounded).toBe(8);
    expect(walkerTicks).toBeGreaterThan(100);
  });

  it('awards every formation bonus and drops every capsule under perfect play', () => {
    const g = game(8);
    const w = g.world;
    let bonus = 0;
    const bonusEvents: number[] = [];
    let capsules = 0;
    let kills = 0;
    playThrough(g, () => {
      const e = w.enemies;
      for (const enemy of e.enemies) {
        if (enemy.state !== EnemyState.Live) continue;
        if ((enemy.flags & EnemyFlag.OnScreen) !== 0) expect(e.kill(enemy)).toBe(true);
      }
      kills += e.outcomes.killCount;
      bonus += e.outcomes.bonusPoints;
      capsules += e.outcomes.dropCount;
      w.events.drain((event) => {
        if (event.kind === SimEventKind.FormationBonus) bonusEvents.push(event.param);
      });
    });
    const formations = STAGE.events.filter((e): e is StageFormationEvent => e.type === 'formation');
    expect(bonusEvents).toEqual(formations.map((f) => f.bonus ?? 0));
    expect(bonus).toBe(formations.reduce((sum, f) => sum + (f.bonus ?? 0), 0));
    const carriers = STAGE.events.filter((e) => e.type === 'spawn' && e.enemy === 'carrier');
    const capsuleFormations = formations.filter((f) => f.drop !== null);
    expect(capsules).toBe(carriers.length + capsuleFormations.length);
    const members = formations.reduce((sum, f) => sum + f.count, 0);
    const singles = STAGE.events.filter((e) => e.type === 'spawn').length;
    expect(kills).toBe(members + singles); // the hatches die before releasing anything
  });

  it('hashes equal for two sessions fed the same input, tick after tick', () => {
    const pa = createHeadlessPlatform();
    const pb = createHeadlessPlatform();
    const a = createGame(pa, { seed: 33, stage: 'test-range' }, DB);
    const b = createGame(pb, { seed: 33, stage: 'test-range' }, DB);
    const masks = [Action.Up, Action.Right, Action.Down, Action.Left, 0];
    let checks = 0;
    for (let t = 0; t < 20000 && a.world.status === 'playing'; t++) {
      const held = masks[(t >> 5) % masks.length];
      commitPlayerInput(pa.snapshot.players[0], held);
      commitPlayerInput(pb.snapshot.players[0], held);
      a.step();
      b.step();
      a.world.events.clear();
      b.world.events.clear();
      if (t % 250 === 0) {
        expect(hashWorld(a.world), `tick ${t}`).toBe(hashWorld(b.world));
        checks++;
      }
    }
    expect(checks).toBeGreaterThan(15); // the stage lasts ≈ 4,500 ticks
    expect(a.world.status).toBe('stageClear');
    expect(hashWorld(a.world)).toBe(hashWorld(b.world));
  });
});
