/**
 * Edge cases of a boss's **spiral stream** (plan M2-14, `BossScriptApi.spiral`, the `Boss.spiral*`
 * fields) — the engine addition behind IRON SOVEREIGN's overdrive — on a test boss with two cores,
 * a gun and armour, whose first phase's script only hands its API to the test:
 *
 * - the first volley comes `every` ticks after the call, then one every `every` ticks — fired by
 *   the boss system while the script sleeps (no wakes); `ways` / `every` / `step` are floored,
 *   `every` below 1 is one tick, `ways` ≤ 0 (or NaN) stops the stream;
 * - a volley is `ways` evenly spaced bullets of the kind at `speed` × the rank's speed scale from
 *   every standing core that may fire — never from a gun or the armour, never from a destroyed
 *   core —, the first at the stream's heading, which turns `step` units a volley and wraps into
 *   `[0, 1024)` (a negative step turns it counter-clockwise);
 * - a phase change stops it and turns its heading back to 0 (the next phase's script starts its
 *   own stream there), the boss's death stops it; a new boss in the slot starts without one;
 * - `hashWorld` mixes the stream's fields.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createBossBehaviorRegistry, defineBossBehavior } from '../../src/behaviors/index.js';
import { BossState, type BossScriptApi } from '../../src/bosses/index.js';
import { BulletKind } from '../../src/bullets/index.js';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { SLEEP_FOREVER, type Script } from '../../src/patterns/index.js';
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

/** Part indices of the spire. */
const P = { hull: 0, coreA: 1, coreB: 2, gun: 3 } as const;

/**
 * The spire: armour, two cores above and below its middle, a gun; phase 0 hands its API to the test
 * until the gun is shot away, phase 1 idles.
 */
const SPIRE = {
  id: 'spire',
  boss: {
    code: 'SP-01',
    displayName: 'SPIRE',
    introTicks: 10,
    score: 900,
    x: 300,
    y: 100,
    parts: [
      {
        name: 'hull',
        hurtbox: { hw: 10, hh: 10 },
        vulnerable: 'never',
        sprite: 'bosses/hull-block',
      },
      {
        name: 'core-a',
        parent: 'hull',
        x: -8,
        y: -20,
        hp: 40,
        hurtbox: { hw: 4, hh: 4 },
        core: true,
        sprite: 'bosses/core',
      },
      {
        name: 'core-b',
        parent: 'hull',
        x: -8,
        y: 20,
        hp: 40,
        hurtbox: { hw: 4, hh: 4 },
        core: true,
        sprite: 'bosses/core',
      },
      {
        name: 'gun',
        parent: 'hull',
        x: -16,
        hp: 5,
        hurtbox: { hw: 3, hh: 3 },
        gun: true,
        sprite: 'bosses/emitter',
      },
    ],
    phases: [
      { script: 'probe.hand', until: { partsDestroyed: ['gun'] } },
      { script: 'probe.idle' },
    ],
  },
};

/** The KESTREL, Type A and the spire. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      {
        path: 'enemies/spire.enemies.json',
        data: { formatVersion: 1, kind: 'enemies', enemies: [SPIRE] },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

/** The API `probe.hand` received (the boss slot's). */
let handed: BossScriptApi | null = null;

/** Resumes of `probe.hand` (its start, then any wake). */
let handResumes = 0;

/** Starts of `probe.idle`. */
let idleStarts = 0;

/** The test behaviours. */
const BEHAVIORS = createBossBehaviorRegistry([
  defineBossBehavior('probe.hand', {}, function* hand(api): Script {
    handed = api;
    for (;;) {
      handResumes++;
      yield SLEEP_FOREVER;
    }
  }),
  defineBossBehavior('probe.idle', {}, function* idle(): Script {
    idleStarts++;
    yield SLEEP_FOREVER;
  }),
]);

/**
 * Steps a world with no input.
 *
 * @param w - The world.
 * @param ticks - Ticks.
 */
function run(w: World, ticks: number): void {
  const input = createInputSnapshot();
  for (let i = 0; i < ticks; i++) {
    stepWorld(w, input);
    w.events.clear();
  }
}

/**
 * A free-flight world (static camera, the ship invulnerable and holding fire) whose spire fights,
 * and the API its first phase handed over.
 *
 * @param over - Config overrides.
 * @returns The world and the API.
 */
function fighting(over: Partial<GameConfig> = {}): { w: World; api: BossScriptApi } {
  const w = createWorld(
    resolveGameConfig({ seed: 3, autofire: false, remoteMode: false, ...over }),
    DB,
    { bossBehaviors: BEHAVIORS },
  );
  w.debugFlags.godMode = true;
  handed = null;
  handResumes = 0;
  idleStarts = 0;
  expect(w.bosses.startBoss(DB.enemyIndex.get('spire') ?? -1)).toBe(true);
  for (let i = 0; i < 400 && w.bosses.boss.state !== BossState.Fight; i++) run(w, 1);
  run(w, 1);
  expect(w.bosses.boss.state).toBe(BossState.Fight);
  const api = handed as BossScriptApi | null;
  if (api === null) throw new Error('the first phase did not start');
  w.bullets.pool.clear();
  return { w, api };
}

/** One bullet of a volley. */
interface Shot {
  /** X. */
  readonly x: number;
  /** Y. */
  readonly y: number;
  /** Heading (binary units). */
  readonly angle: number;
  /** Speed. */
  readonly speed: number;
  /** `BulletKind`. */
  readonly kind: number;
}

/**
 * Steps one tick from an empty bullet pool and returns the bullets it fired.
 *
 * @param w - The world.
 * @returns The bullets.
 */
function tick(w: World): Shot[] {
  w.bullets.pool.clear();
  run(w, 1);
  const f = w.bullets.pool.fields;
  const out: Shot[] = [];
  for (let i = 0; i < w.bullets.count; i++) {
    out.push({ x: f.x[i], y: f.y[i], angle: f.angle[i], speed: f.speed[i], kind: f.kind[i] });
  }
  return out;
}

/**
 * Steps ticks and records on which (counted from 1) a volley came and what it was.
 *
 * @param w - The world.
 * @param ticks - Ticks.
 * @returns `[tick, bullets]` per tick that fired.
 */
function volleys(w: World, ticks: number): Array<[number, Shot[]]> {
  const out: Array<[number, Shot[]]> = [];
  for (let t = 1; t <= ticks; t++) {
    const shots = tick(w);
    if (shots.length > 0) out.push([t, shots]);
  }
  return out;
}

/**
 * The headings of a volley, sorted.
 *
 * @param shots - Its bullets.
 * @returns Headings.
 */
function headings(shots: readonly Shot[]): number[] {
  return shots.map((s) => s.angle).sort((a, b) => a - b);
}

describe('core/bosses — the spiral stream (M2-14 BossScriptApi.spiral)', () => {
  it('fires the first volley `every` ticks after the call, then every `every` ticks, without waking the script', () => {
    const { w, api } = fighting();
    const boss = w.bosses.boss;
    const resumes = handResumes;
    const wake = boss.wakeTick;
    api.spiral(3, 5, 0, 1, BulletKind.OvalPurple);
    expect([boss.spiralWays, boss.spiralEvery, boss.spiralClock]).toEqual([3, 5, 5]);
    const got = volleys(w, 21);
    expect(got.map(([t]) => t)).toEqual([5, 10, 15, 20]);
    // Three bullets from each core, purple ovals at speed 1 (Normal: speed scale 1).
    for (const [, shots] of got) {
      expect(shots).toHaveLength(6);
      for (const s of shots) expect([s.kind, s.speed]).toEqual([BulletKind.OvalPurple, 1]);
    }
    // The script slept through all of it.
    expect(handResumes).toBe(resumes);
    expect(boss.wakeTick).toBe(wake);
  });

  it('spaces a volley evenly from each standing core, turning `step` a volley, wrapping into [0, 1024)', () => {
    const { w, api } = fighting();
    const boss = w.bosses.boss;
    api.spiral(4, 2, 100, 1.5, BulletKind.RoundRed);
    const got = volleys(w, 20);
    expect(got).toHaveLength(10);
    const coreA = boss.parts[P.coreA];
    const coreB = boss.parts[P.coreB];
    for (let v = 0; v < got.length; v++) {
      const shots = got[v][1];
      expect(shots).toHaveLength(8);
      // Four from each core (bullets leave from the cores — they have moved one step since).
      const fromA = shots.filter((s) => Math.abs(s.y - coreA.y) < 3);
      const fromB = shots.filter((s) => Math.abs(s.y - coreB.y) < 3);
      expect([fromA.length, fromB.length]).toEqual([4, 4]);
      for (const s of shots) expect(Math.abs(s.x - coreA.x)).toBeLessThan(3);
      const first = (v * 100) % 1024;
      const want = [0, 256, 512, 768].map((k) => (first + k) % 1024).sort((a, b) => a - b);
      expect(headings(fromA), 'volley ' + String(v)).toEqual(want);
      expect(headings(fromB), 'volley ' + String(v)).toEqual(want);
    }
    // After ten volleys of 100 units the heading wrapped: 1000 → 1100 − 1024 = 76.
    expect(boss.spiralAngle).toBe(1000 % 1024);
    run(w, 2);
    expect(boss.spiralAngle).toBe(76);
  });

  it('turns counter-clockwise with a negative step (the heading wraps below 0)', () => {
    const { w, api } = fighting();
    const boss = w.bosses.boss;
    api.spiral(1, 1, -24, 1, BulletKind.NeedlePink);
    const got = volleys(w, 3);
    expect(got.map(([, shots]) => headings(shots))).toEqual([
      [0, 0],
      [1000, 1000],
      [976, 976],
    ]);
    expect(boss.spiralAngle).toBe(952);
  });

  it('floors ways, every and step; every below 1 is one tick; ways ≤ 0 or NaN stops the stream', () => {
    const { w, api } = fighting();
    const boss = w.bosses.boss;
    api.spiral(2.9, 3.7, 10.6, 1, BulletKind.OvalRed);
    expect([boss.spiralWays, boss.spiralEvery, boss.spiralStep]).toEqual([2, 3, 10]);
    expect(volleys(w, 9).map(([t, shots]) => [t, shots.length])).toEqual([
      [3, 4],
      [6, 4],
      [9, 4],
    ]);
    api.spiral(1, 0.5, 0, 1, BulletKind.OvalRed);
    expect(boss.spiralEvery).toBe(1);
    expect(volleys(w, 4).map(([t]) => t)).toEqual([1, 2, 3, 4]);
    api.spiral(1, -5, -3.5, 1, BulletKind.OvalRed);
    expect([boss.spiralEvery, boss.spiralStep]).toEqual([1, -4]);
    // Stop: 0, a negative count and NaN switch it off; nothing more fires.
    for (const ways of [0, -2, 0.5, Number.NaN]) {
      api.spiral(1, 1, 0, 1, BulletKind.OvalRed);
      expect(boss.spiralWays).toBe(1);
      api.spiral(ways, 1, 0, 1, BulletKind.OvalRed);
      expect(boss.spiralWays, String(ways)).toBe(0);
      expect(volleys(w, 5), String(ways)).toEqual([]);
    }
  });

  it('scales the speed with the rank: Arcade difficulty fires faster spiral bullets', () => {
    const normal = fighting();
    normal.api.spiral(1, 1, 0, 1.25, BulletKind.OvalPurple);
    const slow = volleys(normal.w, 1)[0][1];
    const arcade = fighting({ difficulty: 'arcade' });
    expect(arcade.w.bullets.speedScale).toBeGreaterThan(1);
    arcade.api.spiral(1, 1, 0, 1.25, BulletKind.OvalPurple);
    const fast = volleys(arcade.w, 1)[0][1];
    expect(slow[0].speed).toBeCloseTo(1.25 * normal.w.bullets.speedScale, 9);
    expect(fast[0].speed).toBeCloseTo(1.25 * arcade.w.bullets.speedScale, 9);
    expect(fast[0].speed).toBeGreaterThan(slow[0].speed);
  });

  it('fires only from standing cores: a destroyed core stops, the gun and the armour never fire', () => {
    const { w, api } = fighting();
    const boss = w.bosses.boss;
    api.spiral(2, 1, 0, 1, BulletKind.OvalPurple);
    expect(tick(w)).toHaveLength(4);
    w.bosses.damagePart(P.coreA, 999, 0);
    expect(boss.parts[P.coreA].destroyed).toBe(true);
    expect(boss.state).toBe(BossState.Fight); // the other core stands
    expect(boss.phase).toBe(0);
    const shots = tick(w);
    expect(shots).toHaveLength(2);
    for (const s of shots) expect(Math.abs(s.y - boss.parts[P.coreB].y)).toBeLessThan(3);
    // The last core down: the boss dies and the stream with it.
    w.bosses.damagePart(P.coreB, 999, 0);
    run(w, 1);
    expect(boss.state).not.toBe(BossState.Fight);
    expect(volleys(w, 30)).toEqual([]);
  });

  it('stops at a phase change: the next phase starts without a stream', () => {
    const { w, api } = fighting();
    const boss = w.bosses.boss;
    api.spiral(3, 2, 8, 1, BulletKind.OvalPurple);
    expect(volleys(w, 4)).toHaveLength(2);
    w.bosses.damagePart(P.gun, 999, 0); // phase 0's `until`
    run(w, 2);
    expect(boss.phase).toBe(1);
    expect(idleStarts).toBe(1);
    expect(boss.spiralWays).toBe(0);
    expect(volleys(w, 40)).toEqual([]);
    // The heading is back at 0: the next phase's stream starts there (M2-14 tests fix — it used
    // to go on from the last phase's heading, against `boss.sovereign`'s "the spiral restarts
    // from heading 0 each phase").
    expect(boss.spiralAngle).toBe(0);
    // (The slot's script API is one object for every phase: the idle phase's stream through it.)
    api.spiral(1, 1, 8, 1, BulletKind.OvalPurple);
    expect(volleys(w, 2).map(([, shots]) => headings(shots))).toEqual([
      [0, 0],
      [8, 8],
    ]);
  });

  it('starts a new boss in the slot without a stream, its heading back at 0', () => {
    const { w, api } = fighting();
    const boss = w.bosses.boss;
    api.spiral(2, 1, 50, 1, BulletKind.OvalPurple);
    run(w, 3);
    expect(boss.spiralAngle).toBe(150);
    w.bosses.damagePart(P.coreA, 999, 0);
    w.bosses.damagePart(P.coreB, 999, 0);
    for (let t = 0; t < 2000 && boss.state !== BossState.Dead; t++) run(w, 1);
    expect(boss.state).toBe(BossState.Dead);
    expect(w.bosses.startBoss(DB.enemyIndex.get('spire') ?? -1)).toBe(true);
    expect([boss.spiralWays, boss.spiralClock, boss.spiralAngle]).toEqual([0, 0, 0]);
  });

  it('is part of the state hash', () => {
    const a = fighting();
    const b = fighting();
    expect(hashWorld(a.w)).toBe(hashWorld(b.w));
    a.api.spiral(3, 10, 24, 1.1, BulletKind.OvalPurple);
    b.api.spiral(3, 10, 24, 1.1, BulletKind.OvalPurple);
    expect(hashWorld(a.w)).toBe(hashWorld(b.w));
    b.api.spiral(3, 10, 25, 1.1, BulletKind.OvalPurple); // one unit more a turn
    expect(hashWorld(a.w)).not.toBe(hashWorld(b.w));
    b.api.spiral(3, 10, 24, 1.1, BulletKind.OvalPurple);
    expect(hashWorld(a.w)).toBe(hashWorld(b.w));
    b.api.spiral(3, 10, 24, 1.2, BulletKind.OvalPurple); // another speed
    expect(hashWorld(a.w)).not.toBe(hashWorld(b.w));
  });
});
