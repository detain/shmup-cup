/**
 * The pattern DSL, bullet cancel into points and the shipped pattern library end to end (plan
 * M2-02) through the public API of `@shmup/core` and the real `content/` files, validated the way
 * the shell loads them:
 *
 * - every shipped `content/patterns/` action runs on a `pattern.loop` enemy in two sessions that
 *   stay in lockstep (`hashWorld`), fires, keeps its bullets finite and in bounds, and frees every
 *   bullet program once the enemies are gone;
 * - the shipped `sentry` spirals (`common.spiral`): two needles 512 units apart every 8 ticks, the
 *   pair turning 44 units a volley, 24 volleys, then its `restTicks` of 45 and an aimed restart;
 * - the shipped `example.burst` (an `actionRef` with constant params) fires exactly what the TS
 *   primitive `fireStack` fires;
 * - a boss's death turns its bullets into point items for its killer (a kill by nobody only
 *   sparkles), each worth the shipped `bulletCancel`, all credited to that player's score.
 */
import {
  BULLET_CULL_MARGIN,
  BossState,
  BulletFlag,
  BulletKind,
  BulletOrigin,
  DEFAULT_SCORING_RULES,
  ENGINE_SPRITES,
  EnemyFlag,
  KNOWN_SCRIPT_IDS,
  PLAYFIELD_H,
  PLAYFIELD_W,
  POINT_ITEM_LIFETIME,
  checkEnemyBehaviors,
  createGame,
  createHeadlessPlatform,
  createInputSnapshot,
  createWorld,
  fireStack,
  hashWorld,
  loadContent,
  resolveGameConfig,
  stepWorld,
  type ContentDb,
  type Game,
  type World,
} from '@shmup/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';

/** Shipped pattern action ids (read from the files, so a new pattern is covered at once). */
const SHIPPED_PATTERNS: readonly string[] = (() => {
  const ids: string[] = [];
  for (const file of readContentFiles()) {
    if (!file.path.startsWith('patterns/')) continue;
    const data = file.data as { actions?: { id: string }[] };
    for (const a of data.actions ?? []) ids.push(a.id);
  }
  return ids;
})();

/**
 * The shipped content plus one `pattern.loop` probe enemy per shipped pattern (`probe-<k>`),
 * validated like the shell does (behaviours included).
 *
 * @returns The DB.
 */
function content(): ContentDb {
  const probes = SHIPPED_PATTERNS.map((pattern, k) => ({
    id: 'probe-' + String(k),
    hp: 1000,
    score: 0,
    hurtbox: { hw: 5, hh: 5 },
    script: 'pattern.loop',
    sprite: 'enemies/spinner',
    pattern,
    params: { restTicks: 30 },
    settleTicks: 0,
    drop: null,
  }));
  const { db, issues } = loadContent(
    [
      ...readContentFiles(),
      {
        path: 'enemies/zz-probes.enemies.json',
        data: { formatVersion: 1, kind: 'enemies', enemies: probes },
      },
    ],
    { knownScripts: KNOWN_SCRIPT_IDS, extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  expect(checkEnemyBehaviors(db)).toEqual([]);
  return db;
}

const DB = content();

/**
 * A free-flight world, the ship alive at (60, 100), invulnerable, not firing.
 *
 * @param seed - Seed.
 * @param db - Content.
 * @returns The world.
 */
function arena(seed = 17, db: ContentDb = DB): World {
  // No (forced) autofire: the ship would shoot an enemy in its row.
  const w = createWorld(resolveGameConfig({ seed, autofire: false, remoteMode: false }), db);
  run(w, 50);
  w.players[0].x = 60;
  w.players[0].y = 100;
  w.players[0].invulnTicks = 1e9;
  return w;
}

/**
 * Steps a world.
 *
 * @param w - The world.
 * @param ticks - Ticks.
 */
function run(w: World, ticks: number): void {
  const input = createInputSnapshot();
  for (let t = 0; t < ticks; t++) stepWorld(w, input);
}

/**
 * Spawns an enemy that may fire at once.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @param x - Playfield x.
 * @param y - World y.
 */
function spawn(w: World, id: string, x: number, y: number): void {
  const e = w.enemies.spawn(DB.enemyIndex.get(id) ?? -1, w.camera.x + x, y);
  expect(e, id).not.toBeNull();
  if (e !== null) e.flags |= EnemyFlag.OnScreen | EnemyFlag.WasOnScreen | EnemyFlag.Settled;
}

describe('integration: the shipped pattern library (M2-02)', () => {
  it('ships patterns, all of them compiled', () => {
    expect(SHIPPED_PATTERNS.length).toBeGreaterThanOrEqual(5);
    for (const id of SHIPPED_PATTERNS) {
      expect(DB.patterns.entries[DB.patterns.actionIndex.get(id) ?? -1], id).toBeGreaterThan(0);
    }
  });

  it.each(SHIPPED_PATTERNS.map((id, k) => [id, k] as const))(
    '%s runs deterministically, fires, keeps its bullets sane and frees its programs',
    (_id, k) => {
      const make = (): World => {
        const w = arena();
        spawn(w, 'probe-' + String(k), 260, 80);
        spawn(w, 'probe-' + String(k), 300, 140);
        return w;
      };
      const a = make();
      const b = make();
      let fired = 0;
      const f = a.bullets.pool.fields;
      for (let t = 0; t < 400; t++) {
        run(a, 1);
        run(b, 1);
        expect(hashWorld(b), `tick ${t}`).toBe(hashWorld(a));
        for (let i = 0; i < a.bullets.count; i++) {
          if (f.age[i] === 1) fired++;
          const x = f.x[i] - a.camera.x;
          const y = f.y[i] - a.camera.y;
          expect(x >= -BULLET_CULL_MARGIN && x <= PLAYFIELD_W + BULLET_CULL_MARGIN).toBe(true);
          expect(y >= -BULLET_CULL_MARGIN && y <= PLAYFIELD_H + BULLET_CULL_MARGIN).toBe(true);
        }
      }
      expect(fired).toBeGreaterThan(0);
      // The enemies go; every bullet leaves the screen and every bullet program is freed.
      for (const e of a.enemies.enemies) if (e.state !== 0) a.enemies.kill(e);
      run(a, 1200);
      expect(a.bullets.count).toBe(0);
      expect(a.patterns.bulletPrograms).toBe(0);
    },
  );

  it('the sentry spirals: a 512-apart pair every 8 ticks turning 44 a volley, 24 volleys, a rest', () => {
    const w = arena();
    spawn(w, 'sentry', 300, 100);
    const f = w.bullets.pool.fields;
    const volleys: { tick: number; angles: number[] }[] = [];
    for (let t = 0; t < 240; t++) {
      run(w, 1);
      const angles: number[] = [];
      for (let i = 0; i < w.bullets.count; i++) if (f.age[i] === 1) angles.push(f.angle[i]);
      if (angles.length > 0) volleys.push({ tick: t, angles: angles.sort((p, q) => p - q) });
    }
    const ticks = volleys.map((v) => v.tick);
    expect(ticks).toEqual([...Array.from({ length: 24 }, (_v, k) => k * 8), 184 + 8 + 45]);
    for (const v of volleys) {
      expect(v.angles).toHaveLength(2);
      expect(v.angles[1] - v.angles[0]).toBe(512);
    }
    // Aimed first (the ship is straight left: 512) + 44, then 44 more every volley.
    expect(volleys[0].angles).toEqual([44, 556]);
    for (let k = 1; k < 24; k++) {
      expect(volleys[k].angles[0], `volley ${k}`).toBe((44 + k * 44) % 512);
    }
    // The restart aims again.
    expect(volleys[24].angles).toEqual([44, 556]);
  });

  it('example.burst (actionRef with constant params) fires exactly what fireStack fires', () => {
    // The format samples are not shipped content: load the sample on its own.
    const path = 'patterns/example.patterns.json';
    const sample = loadContent([
      {
        path,
        data: JSON.parse(
          readFileSync(new URL('../../content/' + path, import.meta.url), 'utf8'),
        ) as unknown,
      },
    ]);
    expect(sample.issues).toEqual([]);
    const a = arena(17, sample.db);
    const b = arena(17, sample.db);
    const origin = new BulletOrigin();
    origin.x = a.camera.x + 250;
    origin.y = 60;
    expect(fireStack(a.bullets, origin, 4, 1, 0.25, BulletKind.NeedleRed)).toBe(4);
    const index = sample.db.patterns.actionIndex.get('example.burst') ?? -1;
    expect(b.patterns.startEmitter(0, index)).toBe(true);
    expect(b.patterns.stepEmitter(0, origin, true)).toBe(-1);
    const fa = a.bullets.pool.fields;
    const fb = b.bullets.pool.fields;
    expect(b.bullets.count).toBe(4);
    for (let i = 0; i < 4; i++) {
      for (const name of ['x', 'y', 'vx', 'vy', 'speed', 'angle', 'kind'] as const) {
        expect(fb[name][i], `${name}[${i}]`).toBe(fa[name][i]);
      }
    }
  });
});

describe('integration: bullet cancel into points on a boss’s death (M2-02)', () => {
  /**
   * A game on the boss range, stepped until the boss fights and has bullets in the air.
   *
   * @returns The game.
   */
  function fighting(): Game {
    const g = createGame(
      createHeadlessPlatform(),
      { seed: 4, stage: 'test-boss', autofire: false },
      DB,
    );
    const w = g.world;
    w.debugFlags.godMode = true;
    for (let t = 0; t < 6000; t++) {
      g.step();
      w.events.clear();
      if (w.bosses.boss.state === BossState.Fight && w.bullets.count >= 3) return g;
    }
    throw new Error('the boss never fired');
  }

  /**
   * Cancelable live enemy bullets.
   *
   * @param w - The world.
   * @returns Their count.
   */
  function cancelable(w: World): number {
    const f = w.bullets.pool.fields;
    let n = 0;
    for (let i = 0; i < w.bullets.count; i++) {
      const bits = f.flags[i];
      if ((bits & BulletFlag.Dead) === 0 && (bits & BulletFlag.Cancelable) !== 0) n++;
    }
    return n;
  }

  it('credits the killer with a point item per cancelled bullet, worth the shipped value', () => {
    const g = fighting();
    const w = g.world;
    const n = cancelable(w);
    expect(n).toBeGreaterThan(0);
    const before = w.scoring.board.scores[0].score;
    expect(w.bosses.defeat(0)).toBe(true);
    const points = w.bullets.points;
    expect(points.count).toBe(n);
    for (let i = 0; i < points.count; i++) {
      expect(points.fields.player[i]).toBe(0);
      expect(points.fields.value[i]).toBe(DEFAULT_SCORING_RULES.bulletCancel);
    }
    expect(DB.scoring?.bulletCancel).toBe(DEFAULT_SCORING_RULES.bulletCancel);
    // Every item reaches the score within its lifetime (the boss tally comes on top).
    let credited = 0;
    let last = before;
    for (let t = 0; t < POINT_ITEM_LIFETIME + 2; t++) {
      const itemsBefore = points.count;
      g.step();
      w.events.clear();
      const gained = w.scoring.board.scores[0].score - last;
      last = w.scoring.board.scores[0].score;
      const reached = itemsBefore - points.count;
      if (reached > 0) credited += reached;
      expect(gained).toBeGreaterThanOrEqual(reached * DEFAULT_SCORING_RULES.bulletCancel);
    }
    expect(points.count).toBe(0);
    expect(credited).toBe(n);
  });

  it('a boss defeated by nobody only sparkles', () => {
    const g = fighting();
    const w = g.world;
    expect(cancelable(w)).toBeGreaterThan(0);
    expect(w.bosses.defeat()).toBe(true);
    expect(w.bullets.points.count).toBe(0);
  });
});
