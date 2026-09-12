/**
 * Edge cases of `core/bosses` (plan M1-13), beyond the acceptance suite `bosses.test.ts`:
 *
 * - the {@link BossScriptApi}: part lookup, guards against bad indices, open / close, part
 *   offsets, `track` (bounds swapped, speed ≤ 0 holds, no living player), eased `moveTo` (and
 *   its at-once forms), `canFire` in every state and the fire primitives from a part;
 * - phase tunables (the behaviour's defaults merged with a phase's `params`), a phase whose script
 *   the lookup does not know (no script, the phase still ends), part conditions met through a
 *   cascade;
 * - several cores (the boss dies with the last one only), a destroyed parent taking a core child —
 *   and the boss — with it;
 * - the WARNING without a stage (no brake, the default boss music) and from a status other than
 *   `playing`; a hit-stop pausing the WARNING and the death sequence; the death chain drawing
 *   only the cosmetic RNG inside the parts' boxes; the parts blinking until the blast; a
 *   `stageClear` / `gameOver` status kept at the end;
 * - hit flash and animation frames, contact (the intro, one accepted hit per tick, the closed
 *   test, parts without a hurtbox), `damagePart` / `isArmoured` outside the fight;
 * - a second boss after the first, a checkpoint restart during the death sequence, `clear()`
 *   without a music change, the state hash following the boss.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createBossBehaviorRegistry, defineBossBehavior } from '../../src/behaviors/index.js';
import {
  BOSS_CHAIN_TICKS,
  BOSS_CLEAR_TICKS,
  BOSS_ENTRY_MARGIN,
  BOSS_BLAST_HIT_STOP_TICKS,
  BossHit,
  BossMotion,
  BossState,
  WARNING_TICKS,
  type BossScriptApi,
} from '../../src/bosses/index.js';
import { BulletKind } from '../../src/bullets/index.js';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { HIT_FLASH_TICKS } from '../../src/enemies/index.js';
import { FX_CUES, MUSIC_CUES, SFX_CUES, SimEventKind } from '../../src/events/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { SLEEP_FOREVER, type Script } from '../../src/patterns/index.js';
import { SpriteFlag } from '../../src/presentation/index.js';
import { SHOOTERS_PER_PLAYER, WeaponRole } from '../../src/weapons/index.js';
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

/** Part indices of the edge boss. */
const E = {
  hull: 0,
  arm: 1,
  gun: 2,
  tip: 3,
  coreA: 4,
  coreB: 5,
  lid: 6,
  pod: 7,
  ghost: 8,
} as const;

/**
 * The edge boss: armour, a three-level branch (arm → gun → tip), two cores (one behind a lid), a
 * `whenOpen` pod open from the data, a drawn part without a hurtbox; four phases (a cascade
 * condition, the cores' hp, an unknown script on a timer, the defaults).
 */
const EDGE = {
  id: 'edge',
  boss: {
    code: 'EG-01',
    displayName: 'EDGE CASE',
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
        name: 'arm',
        parent: 'hull',
        y: -30,
        hp: 5,
        hurtbox: { hw: 4, hh: 4 },
        sprite: 'bosses/emitter',
        score: 100,
      },
      {
        name: 'gun',
        parent: 'arm',
        x: -10,
        hp: 5,
        hurtbox: { hw: 3, hh: 3 },
        gun: true,
        sprite: 'bosses/emitter',
        score: 50,
      },
      { name: 'tip', parent: 'gun', x: -6, hp: 2, hurtbox: { hw: 2, hh: 2 }, score: 10 },
      {
        name: 'core-a',
        parent: 'hull',
        x: -12,
        y: -8,
        hp: 6,
        hurtbox: { hw: 4, hh: 4 },
        core: true,
        sprite: 'bosses/core',
        anim: { frames: 3, ticks: 5 },
        score: 1000,
      },
      {
        name: 'core-b',
        parent: 'hull',
        x: -12,
        y: 8,
        hp: 4,
        hurtbox: { hw: 4, hh: 4 },
        core: true,
        vulnerable: 'afterParts',
        requires: ['lid'],
        sprite: 'bosses/core',
        score: 2000,
      },
      { name: 'lid', parent: 'hull', x: -20, y: 8, hp: 3, hurtbox: { hw: 2, hh: 2 }, score: 30 },
      {
        name: 'pod',
        parent: 'hull',
        x: 20,
        hp: 2,
        hurtbox: { hw: 3, hh: 3 },
        vulnerable: 'whenOpen',
        open: true,
      },
      { name: 'ghost', parent: 'hull', y: 30, sprite: 'bosses/emitter' },
    ],
    phases: [
      {
        script: 'probe.call',
        params: { b: 5 },
        until: { partsDestroyed: ['arm', 'tip'], count: 2 },
      },
      { script: 'probe.call', until: { hpBelow: 5 } },
      { script: 'probe.unknown', until: { ticks: 5 } },
      { script: 'probe.call' },
    ],
  },
};

/** A boss whose only core hangs below a fragile shell. */
const NEST = {
  id: 'nest',
  boss: {
    code: 'NS-02',
    displayName: 'NEST',
    introTicks: 0,
    score: 500,
    parts: [
      { name: 'shell', hp: 3, hurtbox: { hw: 6, hh: 6 }, score: 40 },
      { name: 'yolk', parent: 'shell', hp: 50, hurtbox: { hw: 2, hh: 2 }, core: true, score: 60 },
      { name: 'rim', hp: 9, hurtbox: { hw: 2, hh: 2 }, x: 30 },
    ],
    phases: [{ script: 'probe.call' }],
  },
};

/**
 * An open stage scrolling at 1 px/tick.
 *
 * @param id - Stage id.
 * @param events - Its events.
 * @returns The stage file.
 */
function stage(id: string, events: unknown[]): ContentFile {
  return {
    path: 'stages/' + id + '.stage.json',
    data: {
      formatVersion: 1,
      kind: 'stage',
      id,
      name: id.toUpperCase(),
      music: { stage: 'Stage', boss: 'FinalBoss' },
      length: 5000,
      camera: [{ x: 0, speed: 1 }],
      checkpoints: [{ x: 0 }],
      parallax: [],
      tilemap: null,
      events,
    },
  };
}

/**
 * The KESTREL, Type A, the edge and nest bosses, a tough regular enemy and the stage `hall` (the
 * edge boss's WARNING at x 10).
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      {
        path: 'enemies/e.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [
            EDGE,
            NEST,
            {
              id: 'grunt',
              hp: 1000,
              score: 100,
              hurtbox: { hw: 6, hh: 6 },
              script: 'test.none',
              sprite: 'enemies/drifter',
              drop: null,
            },
          ],
        },
      },
      stage('hall', [
        { x: 10, type: 'warning', enemy: 'edge' },
        { x: 5000, type: 'end' },
      ]),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

/** The shared DB (read-only). */
const DB = db();

/** Index of the edge boss. */
const EDGE_INDEX = DB.enemyIndex.get('edge') ?? -1;

/** Index of the nest boss. */
const NEST_INDEX = DB.enemyIndex.get('nest') ?? -1;

/** Tunables each `probe.call` start received, in order. */
const calls: Array<Readonly<Record<string, number>>> = [];

/** The API the last `probe.call` start received (reused by the system for every phase). */
let lastApi: BossScriptApi | null = null;

/** The test behaviours: `probe.call` records its start and sleeps. */
const BEHAVIORS = createBossBehaviorRegistry([
  defineBossBehavior('probe.call', { a: 1, b: 2 }, function* call(api, p): Script {
    calls.push(p);
    lastApi = api;
    yield SLEEP_FOREVER;
  }),
]);

/**
 * A world on the `hall` stage (or in free flight), player 1 harmless, god mode on.
 *
 * @param stageId - Stage, or `null` for free flight.
 * @param over - Config overrides.
 * @returns The world.
 */
function world(stageId: string | null = 'hall', over: Partial<GameConfig> = {}): World {
  const w = createWorld(
    resolveGameConfig({
      ...(stageId === null ? {} : { stage: stageId }),
      seed: 9,
      autofire: false,
      remoteMode: false,
      ...over,
    }),
    DB,
    { bossBehaviors: BEHAVIORS },
  );
  w.debugFlags.godMode = true;
  return w;
}

/** One recorded event. */
interface Recorded {
  /** Tick it was pushed in. */
  readonly tick: number;
  /** Kind. */
  readonly kind: number;
  /** Id. */
  readonly id: number;
  /** X. */
  readonly x: number;
  /** Y. */
  readonly y: number;
  /** Param. */
  readonly param: number;
}

/**
 * Steps a world, recording every event with the tick it came from.
 *
 * @param w - The world.
 * @param ticks - Ticks.
 * @param out - Collector.
 * @returns The collector.
 */
function run(w: World, ticks: number, out: Recorded[] = []): Recorded[] {
  const input = createInputSnapshot();
  for (let i = 0; i < ticks; i++) {
    const tick = w.tick;
    stepWorld(w, input);
    w.events.drain((e) =>
      out.push({ tick, kind: e.kind, id: e.id, x: e.x, y: e.y, param: e.param }),
    );
  }
  return out;
}

/**
 * Drains the events pushed outside a tick.
 *
 * @param w - The world.
 * @returns The events.
 */
function drain(w: World): Recorded[] {
  const out: Recorded[] = [];
  w.events.drain((e) =>
    out.push({ tick: -1, kind: e.kind, id: e.id, x: e.x, y: e.y, param: e.param }),
  );
  return out;
}

/**
 * Steps until the boss reaches a state.
 *
 * @param w - The world.
 * @param state - The `BossState`.
 * @param limit - Safety limit.
 */
function until(w: World, state: number, limit = 2000): void {
  const input = createInputSnapshot();
  for (let i = 0; i < limit; i++) {
    stepWorld(w, input);
    w.events.clear();
    if (w.bosses.boss.state === state) return;
  }
  throw new Error('boss never reached state ' + String(state));
}

/**
 * A `hall` world whose edge boss fights, and the script API its first phase received.
 *
 * @returns The world and the API.
 */
function fighting(): { w: World; api: BossScriptApi } {
  const w = world();
  lastApi = null;
  until(w, BossState.Fight);
  run(w, 1); // the first phase's script has run
  const api = lastApi as BossScriptApi | null;
  if (api === null) throw new Error('the first phase did not start');
  return { w, api };
}

describe('core/bosses — edge cases (M1-13)', () => {
  describe('the script API', () => {
    it('looks parts up and ignores bad indices', () => {
      const { w, api } = fighting();
      const boss = w.bosses.boss;
      expect(api.self).toBe(boss);
      expect([api.partCount, api.phase]).toEqual([9, 0]);
      expect(api.bullets).toBe(w.bullets);
      expect(api.rng).toBe(w.rng.gameplay);
      expect(api.tick).toBe(w.tick);
      expect([api.partIndex('gun'), api.partIndex('ghost'), api.partIndex('nope')]).toEqual([
        E.gun,
        E.ghost,
        -1,
      ]);
      expect([api.isDestroyed(E.hull), api.isDestroyed(-1), api.isDestroyed(9)]).toEqual([
        false,
        true,
        true,
      ]);
      expect([api.isDestroyed(1.5), api.isDestroyed(Number.NaN)]).toEqual([true, true]);
      // Open / close: one part, or every `whenOpen` part; bad indices change nothing.
      const parts = boss.parts;
      expect(parts[E.pod].open).toBe(true); // open from the data
      expect(w.bosses.isArmoured(E.pod)).toBe(false);
      api.setOpen(E.pod, false);
      expect(w.bosses.isArmoured(E.pod)).toBe(true);
      api.setOpen(-1, true);
      api.setOpen(99, true);
      api.setOpenAll(true);
      expect(parts.slice(0, 9).map((part) => part.open)).toEqual([
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
      ]);
      api.setOpenAll(false);
      expect(parts[E.pod].open).toBe(false);
      // A new offset moves the part and everything attached below it (translation only).
      const cx = w.camera.x;
      api.setPartOffset(E.arm, 5, -40);
      api.setPartOffset(-1, 99, 99);
      api.setPartOffset(0.5, 99, 99);
      run(w, 1);
      expect([parts[E.arm].x - cx, parts[E.arm].y]).toEqual([305, 60]);
      expect([parts[E.gun].x - cx, parts[E.gun].y]).toEqual([295, 60]);
      expect([parts[E.tip].x - cx, parts[E.tip].y]).toEqual([289, 60]);
      expect([parts[E.hull].x - cx, parts[E.hull].y]).toEqual([300, 100]);
    });

    it("tracks the nearest living player's height within its bounds; speed ≤ 0 holds", () => {
      const { w, api } = fighting();
      const boss = w.bosses.boss;
      const ship = w.players[0];
      ship.y = 20;
      api.track(2, 150, 60); // bounds in any order
      expect([boss.motion, boss.trackMin, boss.trackMax]).toEqual([BossMotion.Track, 60, 150]);
      run(w, 1);
      expect(boss.screenY).toBe(98);
      run(w, 30);
      expect(boss.screenY).toBe(60); // clamped at the top bound
      ship.y = 190;
      run(w, 10);
      expect(boss.screenY).toBe(80);
      run(w, 100);
      expect(boss.screenY).toBe(150);
      // Within one step of the goal it lands exactly on it.
      ship.y = 149;
      run(w, 1);
      expect(boss.screenY).toBe(149);
      // No living player: it waits where it is.
      expect(api.target()).toBe(ship);
      ship.active = false;
      ship.y = 60;
      run(w, 3);
      expect(boss.screenY).toBe(149);
      expect(api.target()).toBeNull();
      ship.active = true;
      for (const speed of [0, -1, Number.NaN]) {
        api.track(speed, 0, 200);
        expect(boss.motion).toBe(BossMotion.Hold);
      }
      api.track(1, 0, 200);
      api.hold();
      expect(boss.motion).toBe(BossMotion.Hold);
      run(w, 5);
      expect(boss.screenY).toBe(149);
    });

    it('eases a moveTo in and out over its ticks, then holds; ≤ 0 or NaN ticks jump at once', () => {
      const { w, api } = fighting();
      const boss = w.bosses.boss;
      api.moveTo(200, 50, 4);
      expect(boss.motion).toBe(BossMotion.MoveTo);
      const path: number[][] = [];
      for (let i = 0; i < 4; i++) {
        run(w, 1);
        path.push([boss.screenX, boss.screenY]);
      }
      expect(path).toEqual([
        [287.5, 93.75],
        [250, 75],
        [212.5, 56.25],
        [200, 50],
      ]);
      expect(boss.motion).toBe(BossMotion.Hold);
      run(w, 3);
      expect([boss.screenX, boss.screenY]).toEqual([200, 50]);
      expect(boss.x).toBe(w.camera.x + 200);
      expect(boss.parts[E.hull].y).toBe(50);
      for (const ticks of [0, -3, 0.5, Number.NaN]) {
        api.moveTo(100, 120, ticks);
        expect([boss.screenX, boss.screenY, boss.motion]).toEqual([100, 120, BossMotion.Hold]);
      }
      // Fractional durations are floored.
      api.moveTo(150, 120, 2.9);
      expect(boss.moveTicks).toBe(2);
      run(w, 2);
      expect([boss.screenX, boss.motion]).toEqual([150, BossMotion.Hold]);
    });

    it('fires from a standing part of a fighting boss only', () => {
      const { w, api } = fighting();
      const parts = w.bosses.boss.parts;
      const gun = parts[E.gun];
      expect(api.canFire(E.gun)).toBe(true);
      expect(api.fireWait(60)).toBeGreaterThanOrEqual(1);
      const slot = api.aimed(E.gun, 1.5, BulletKind.RoundRed);
      expect(slot).toBeGreaterThanOrEqual(0);
      const f = w.bullets.pool.fields;
      expect([f.x[slot], f.y[slot]]).toEqual([gun.x, gun.y]);
      expect(api.nWay(E.gun, 3, 40, 1, BulletKind.RoundRed)).toBe(3);
      expect(api.ring(E.gun, 8, 1, BulletKind.RoundRed)).toBe(8);
      expect(api.spray(E.gun, 4, 64, 1, 2, BulletKind.RoundRed)).toBe(4);
      expect(w.bullets.count).toBe(16);
      const attached = api.laser(E.gun);
      const lane = api.laser(E.gun, 512, 100, 6, 10, 4, 10, 4, false);
      const lf = w.bullets.lasers.fields;
      expect([lf.src[attached], lf.src[lane]]).toEqual([gun.slot, -1]);
      // Bad indices fire nothing.
      expect([api.canFire(-1), api.canFire(9), api.canFire(2.5)]).toEqual([false, false, false]);
      expect(api.aimed(-1, 1, BulletKind.RoundRed)).toBe(-1);
      expect(api.nWay(9, 3, 40, 1, BulletKind.RoundRed)).toBe(0);
      expect(api.ring(99, 3, 1, BulletKind.RoundRed)).toBe(0);
      expect(api.spray(-2, 3, 10, 1, 2, BulletKind.RoundRed)).toBe(0);
      expect(api.laser(16)).toBe(-1);
      // A destroyed part is silent.
      w.bosses.damagePart(E.gun, 5, 0);
      expect(api.canFire(E.gun)).toBe(false);
      expect(api.aimed(E.gun, 1, BulletKind.RoundRed)).toBe(-1);
      expect(api.nWay(E.gun, 3, 40, 1, BulletKind.RoundRed)).toBe(0);
      expect(api.laser(E.gun)).toBe(-1);
      // Dying: nothing fires, not even a standing part.
      expect(api.canFire(E.hull)).toBe(true);
      w.bosses.defeat();
      expect(api.canFire(E.hull)).toBe(false);
      expect(api.ring(E.hull, 8, 1, BulletKind.RoundRed)).toBe(0);
      // The same API serves the next boss; during its intro nothing fires.
      w.bosses.clear();
      expect(w.bosses.startBoss(EDGE_INDEX)).toBe(true);
      expect(w.bosses.boss.state).toBe(BossState.Intro);
      expect(api.canFire(E.gun)).toBe(false);
      expect(api.aimed(E.gun, 1, BulletKind.RoundRed)).toBe(-1);
    });
  });

  describe('phases', () => {
    it("merges a phase's params over the defaults; an unknown script runs nothing, the phase still ends", () => {
      calls.length = 0;
      const { w } = fighting();
      const boss = w.bosses.boss;
      expect(calls).toEqual([{ a: 1, b: 5 }]);
      expect(Object.isFrozen(calls[0])).toBe(true);
      // Destroying the arm takes the gun and the tip with it: 2 of [arm, tip] → phase 1.
      expect(w.bosses.damagePart(E.arm, 5, 0)).toBe(BossHit.Destroyed);
      expect(boss.destroyedMask).toBe((1 << E.arm) | (1 << E.gun) | (1 << E.tip));
      expect(w.scoring.board.scores[0].score).toBe(160);
      run(w, 2);
      expect(boss.phase).toBe(1);
      expect(calls).toEqual([
        { a: 1, b: 5 },
        { a: 1, b: 2 },
      ]);
      // The cores' total (6 + 4) must fall below 5: core A destroyed leaves 4 — the boss lives on.
      expect(w.bosses.damagePart(E.coreA, 6, 0)).toBe(BossHit.Destroyed);
      expect(boss.state).toBe(BossState.Fight);
      run(w, 1);
      expect(boss.phase).toBe(2);
      expect(boss.script).toBeNull();
      run(w, 4);
      expect(boss.phase).toBe(2);
      run(w, 1);
      expect(boss.phase).toBe(3);
      run(w, 1);
      expect(calls).toHaveLength(3);
      run(w, 200);
      expect(boss.phase).toBe(3);
    });
  });

  describe('cores and cascades', () => {
    it('dies with its last core only; the afterParts core opens when its lid goes', () => {
      const { w } = fighting();
      const bosses = w.bosses;
      const boss = bosses.boss;
      expect(bosses.damagePart(E.coreA, 6, 0)).toBe(BossHit.Destroyed);
      expect(boss.state).toBe(BossState.Fight);
      expect(bosses.damagePart(E.coreB, 4, 0)).toBe(BossHit.Clink);
      expect(bosses.damagePart(E.lid, 3, 1)).toBe(BossHit.Destroyed);
      expect(bosses.isArmoured(E.coreB)).toBe(false);
      expect(bosses.damagePart(E.coreB, 3, 1)).toBe(BossHit.Damaged);
      expect(bosses.damagePart(E.coreB, 3, 1)).toBe(BossHit.Destroyed);
      expect(boss.parts[E.coreB].hp).toBeLessThanOrEqual(0); // overkill is not clamped
      expect(boss.state).toBe(BossState.Dying);
      expect(boss.killer).toBe(1);
      const [p1, p2] = w.scoring.board.scores;
      expect([p1.score, p2.score]).toEqual([1000, 2030]);
      // `defeat` is refused once dying.
      expect(bosses.defeat(0)).toBe(false);
    });

    it('pushes a Score event for every destroyed part worth points (the popups, M1-14)', () => {
      const { w } = fighting();
      w.events.clear();
      expect(w.bosses.damagePart(E.arm, 5, 0)).toBe(BossHit.Destroyed);
      const scores: number[][] = [];
      w.events.drain((event) => {
        if (event.kind === SimEventKind.Score) scores.push([event.id, event.param]);
      });
      // The arm and the parts attached below it (gun, tip), each at its own place.
      expect(scores).toEqual([
        [0, 100],
        [0, 50],
        [0, 10],
      ]);
      w.events.clear();
      w.bosses.defeat();
      const anonymous: number[] = [];
      w.events.drain((event) => {
        if (event.kind === SimEventKind.Score) anonymous.push(event.param);
      });
      expect(anonymous).toEqual([]);
    });

    it('defeats a boss with a core left by destroying the rest (tool): nobody credited', () => {
      const { w } = fighting();
      w.bosses.damagePart(E.coreA, 6, 0);
      expect(w.bosses.defeat()).toBe(true);
      expect(w.bosses.boss.state).toBe(BossState.Dying);
      expect(w.bosses.boss.parts[E.coreB].destroyed).toBe(true);
      expect(w.scoring.board.scores[0].score).toBe(1000);
      expect(w.bosses.boss.killer).toBe(-1);
    });

    it('a destroyed parent takes its core child with it: the boss dies, the killer is credited', () => {
      const w = world(null);
      expect(w.bosses.startBoss(NEST_INDEX)).toBe(true);
      const boss = w.bosses.boss;
      expect(boss.state).toBe(BossState.Fight); // no intro
      expect(w.bosses.damagePart(0, 3, 1)).toBe(BossHit.Destroyed);
      expect(boss.parts.slice(0, 3).map((part) => part.destroyed)).toEqual([true, true, false]);
      expect(boss.state).toBe(BossState.Dying);
      expect(boss.killer).toBe(1);
      expect(w.scoring.board.scores[1].score).toBe(100);
      run(w, BOSS_CHAIN_TICKS + BOSS_BLAST_HIT_STOP_TICKS + 1);
      expect(w.scoring.board.scores[1].score).toBe(600);
    });
  });

  describe('the WARNING and the death sequence', () => {
    it('in free flight: no brake, the default boss music, the status kept when not playing', () => {
      const w = world(null);
      expect(w.stage).toBeNull();
      w.events.clear();
      expect(w.bosses.startWarning(EDGE_INDEX)).toBe(true);
      expect(w.status).toBe('bossWarning');
      const events = run(w, WARNING_TICKS);
      expect(w.bosses.boss.state).toBe(BossState.Intro);
      expect(w.status).toBe('playing');
      expect(events.filter((e) => e.kind === SimEventKind.Music).map((e) => e.id)).toEqual([
        MUSIC_CUES.Silence,
        MUSIC_CUES.Boss,
      ]);
      // The boss rides the free camera; its intro starts past the right edge (leftmost part: the
      // lid's edge at −22).
      expect(w.bosses.boss.startX).toBe(384 + BOSS_ENTRY_MARGIN + 22);
      // A WARNING while the game is over leaves the status alone, before and after.
      const v = world(null);
      v.status = 'gameOver';
      expect(v.bosses.startWarning(EDGE_INDEX)).toBe(true);
      expect(v.status).toBe('gameOver');
      run(v, WARNING_TICKS);
      expect(v.bosses.boss.state).toBe(BossState.Intro);
      expect(v.status).toBe('gameOver');
    });

    it('a hit-stop pauses the WARNING and the death sequence (simulated ticks)', () => {
      const w = world();
      until(w, BossState.Warning);
      run(w, 20);
      const ticks = w.bosses.warning.ticks;
      w.hitStop = 10;
      run(w, 10);
      expect(w.bosses.warning.ticks).toBe(ticks);
      run(w, 1);
      expect(w.bosses.warning.ticks).toBe(ticks + 1);
      until(w, BossState.Fight);
      w.bosses.defeat(0);
      run(w, 20);
      const boss = w.bosses.boss;
      expect(boss.stateTicks).toBe(20);
      w.hitStop = 7;
      run(w, 7);
      expect(boss.stateTicks).toBe(20);
      run(w, 1);
      expect(boss.stateTicks).toBe(21);
    });

    it('draws only the cosmetic RNG for the chain, inside the boxes; the parts blink until the blast', () => {
      const { w } = fighting();
      const boss = w.bosses.boss;
      const gameplay = w.rng.gameplay.callCount;
      const cosmetic = w.rng.cosmetic.callCount;
      w.bosses.defeat(0);
      const batch = w.bosses.batch;
      const events: Recorded[] = [];
      const flags: number[] = [];
      for (let t = 0; t < BOSS_CHAIN_TICKS - 1; t++) {
        run(w, 1, events);
        flags.push(batch.flags[0]);
        expect(batch.count).toBe(4); // hull, arm, gun, ghost (the cores are gone)
      }
      expect(w.rng.gameplay.callCount).toBe(gameplay);
      expect(w.rng.cosmetic.callCount).toBeGreaterThan(cosmetic);
      // Every chain explosion lies in a part's box (8 px around a part without a hurtbox).
      const chain = events.filter(
        (e) => e.kind === SimEventKind.Particles && e.id === FX_CUES.BossChain,
      );
      expect(chain.length).toBe(14);
      const parts = boss.parts.slice(0, boss.partCount);
      for (const e of chain) {
        const inside = parts.some((part) => {
          const hw = part.hurtbox ? part.hw : 8;
          const hh = part.hurtbox ? part.hh : 8;
          return (
            Math.abs(e.x - Math.floor(part.x)) <= hw && Math.abs(e.y - Math.floor(part.y)) <= hh
          );
        });
        expect(inside).toBe(true);
      }
      // Each explosion comes with its sound at the same point.
      const booms = events.filter(
        (e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.BossExplode,
      );
      expect(booms.map((e) => [e.x, e.y])).toEqual(chain.map((e) => [e.x, e.y]));
      // The blink: 4 ticks on, 4 off (by the sequence clock).
      for (let t = 0; t < flags.length; t++) {
        expect(flags[t]).toBe(((t + 1) & 4) !== 0 ? SpriteFlag.Flash : 0);
      }
      run(w, 1);
      expect(boss.blasted).toBe(true);
      expect(batch.count).toBe(0);
    });

    it('keeps a stageClear / gameOver status at the end, releasing the lock all the same', () => {
      const { w } = fighting();
      w.bosses.defeat(0);
      w.status = 'gameOver';
      run(w, BOSS_CLEAR_TICKS + BOSS_BLAST_HIT_STOP_TICKS);
      expect(w.bosses.boss.state).toBe(BossState.Dead);
      expect(w.status).toBe('gameOver');
      expect(w.stage?.locked).toBe(false);
    });

    it('runs a second boss after the first: a new WARNING, a new brake, fresh parts', () => {
      const { w } = fighting();
      w.bosses.damagePart(E.arm, 5, 0);
      w.bosses.defeat(0);
      run(w, BOSS_CLEAR_TICKS + BOSS_BLAST_HIT_STOP_TICKS);
      expect(w.status).toBe('stageClear');
      expect(w.bosses.active).toBe(false);
      expect(w.bosses.startWarning(EDGE_INDEX)).toBe(true);
      expect(w.status).toBe('stageClear'); // only `playing` turns into `bossWarning`
      run(w, 61);
      expect(w.stage?.locked).toBe(true);
      until(w, BossState.Fight);
      const boss = w.bosses.boss;
      expect(boss.destroyedMask).toBe(0);
      expect(boss.killer).toBe(-1);
      expect(boss.blasted).toBe(false);
      expect(boss.parts.slice(0, 9).map((part) => part.hp)).toEqual([1, 5, 5, 2, 6, 4, 3, 2, 1]);
      expect(boss.parts.slice(0, 9).every((part) => !part.destroyed)).toBe(true);
    });

    it('a checkpoint restart during the death sequence removes the boss and releases the lock', () => {
      const { w } = fighting();
      w.bosses.defeat(0);
      run(w, 30);
      expect(w.stage?.locked).toBe(true);
      w.stage?.restartAt(0);
      expect(w.bosses.boss.state).toBe(BossState.None);
      expect(w.bosses.active).toBe(false);
      expect(w.stage?.locked).toBe(false);
      const events = drain(w);
      expect(events.filter((e) => e.kind === SimEventKind.Music).map((e) => e.id)).toEqual([
        MUSIC_CUES.Stage,
      ]);
      run(w, 5);
      expect(w.bosses.batch.count).toBe(0);
      // A clear without a boss (the music never changed) sends no music.
      const v = world();
      v.events.clear();
      v.bosses.clear();
      expect(drain(v).filter((e) => e.kind === SimEventKind.Music)).toEqual([]);
      // Once restored, a second clear sends nothing either.
      w.bosses.clear();
      expect(drain(w).filter((e) => e.kind === SimEventKind.Music)).toEqual([]);
    });
  });

  describe('parts', () => {
    it('flashes a hit part for HIT_FLASH_TICKS ticks and animates by the tick', () => {
      const { w } = fighting();
      const bosses = w.bosses;
      const core = bosses.boss.parts[E.coreA];
      expect(bosses.damagePart(E.coreA, 1, 0)).toBe(BossHit.Damaged);
      expect(core.flashTicks).toBe(HIT_FLASH_TICKS);
      run(w, 1);
      expect(core.flashTicks).toBe(HIT_FLASH_TICKS - 1);
      run(w, HIT_FLASH_TICKS - 1);
      expect(core.flashTicks).toBe(0);
      const batch = bosses.batch;
      expect(Array.from(batch.flags.subarray(0, batch.count)).every((f) => f === 0)).toBe(true);
      // Three frames of five ticks each, by the World tick.
      const frames: number[] = [];
      for (let i = 0; i < 15; i++) {
        const tick = w.tick;
        run(w, 1);
        expect(core.frame).toBe(Math.floor(tick / 5) % 3);
        frames.push(core.frame);
      }
      expect(new Set(frames)).toEqual(new Set([0, 1, 2]));
      expect(bosses.boss.parts[E.hull].frame).toBe(0);
    });

    it('damagePart answers None outside the intro and fight; isArmoured of a bad index is false', () => {
      const w = world();
      expect(w.bosses.damagePart(0, 1, 0)).toBe(BossHit.None); // no boss
      until(w, BossState.Warning);
      expect(w.bosses.damagePart(0, 1, 0)).toBe(BossHit.None);
      until(w, BossState.Fight);
      for (const bad of [-1, 16, 0.5, Number.NaN]) {
        expect(w.bosses.isArmoured(bad)).toBe(false);
        expect(w.bosses.damagePart(bad, 1, 0)).toBe(BossHit.None);
      }
      // A slot the boss does not have.
      expect(w.bosses.damagePart(12, 1, 0)).toBe(BossHit.None);
      w.bosses.defeat(0);
      run(w, BOSS_CLEAR_TICKS + BOSS_BLAST_HIT_STOP_TICKS);
      expect(w.bosses.boss.state).toBe(BossState.Dead);
      expect(w.bosses.damagePart(E.lid, 1, 0)).toBe(BossHit.None);
    });

    it('contact: during the intro, one accepted hit per tick, touching counts, not a part without a hurtbox', () => {
      const w = world();
      until(w, BossState.Intro);
      run(w, 7); // on screen by now (the ship is kept inside the view)
      expect(w.bosses.boss.state).toBe(BossState.Intro);
      w.debugFlags.godMode = false;
      const ship = w.players[0];
      ship.invulnTicks = 0;
      const hull = w.bosses.boss.parts[E.hull];
      // The hull moves 1 tick further before phase 6: aim at where it will be.
      ship.x = hull.x;
      ship.y = hull.y;
      run(w, 1);
      expect(ship.hits).toBe(1);
      expect(ship.state).toBe('dying');
      // In the fight: the ship overlapping the hull and core A at once takes one hit.
      const { w: v } = fighting();
      v.debugFlags.godMode = false;
      const other = v.players[0];
      other.invulnTicks = 0;
      const parts = v.bosses.boss.parts;
      other.x = parts[E.hull].x - 9;
      other.y = parts[E.coreA].y;
      run(v, 1);
      expect(other.hits).toBe(1);
      // Touching the edge exactly counts; a hair beyond does not.
      const r = v.ship.hurtRadius;
      const edge = (dx: number): number => {
        const u = fighting().w;
        u.debugFlags.godMode = false;
        const s = u.players[0];
        s.invulnTicks = 0;
        const pod = u.bosses.boss.parts[E.pod];
        s.x = pod.x + pod.hw + r + dx;
        s.y = pod.y;
        run(u, 1);
        return s.hits;
      };
      expect([edge(0), edge(0.01)]).toEqual([1, 0]);
      // The ghost (no hurtbox) is never touched.
      const g = fighting().w;
      g.debugFlags.godMode = false;
      const s = g.players[0];
      s.invulnTicks = 0;
      const ghost = g.bosses.boss.parts[E.ghost];
      s.x = ghost.x;
      s.y = ghost.y;
      run(g, 1);
      expect(s.hits).toBe(0);
      expect(ghost.target).toBe(false);
    });

    it('the player shots: an enemy in the same box first, options credit their player, a gone part lets a shot through', () => {
      const { w } = fighting();
      const parts = w.bosses.boss.parts;
      const lid = parts[E.lid];
      // A tough grunt over the lid: the main shot hits the enemy (lower id), not the part.
      const grunt = w.enemies.spawn(DB.enemyIndex.get('grunt') ?? -1, lid.x, lid.y);
      expect(grunt).not.toBeNull();
      if (grunt === null) return;
      const hp = grunt.hp;
      // A main shot starts 8 px ahead of its spawn point and moves 7 px before the hit test.
      w.weapons.spawnShot(WeaponRole.Main, 0, lid.x - 16, lid.y);
      run(w, 1);
      expect(lid.hp).toBe(3);
      expect(grunt.hp).toBe(hp - 1);
      w.enemies.clear();
      // An Option's shot of player 2 destroys the lid: player 2 gets its points.
      lid.hp = 1;
      w.weapons.spawnShot(WeaponRole.Main, SHOOTERS_PER_PLAYER + 1, lid.x - 16, lid.y);
      run(w, 1);
      expect(lid.destroyed).toBe(true);
      expect(w.scoring.board.scores[1].score).toBe(30);
      // Two shots on core A in one tick, the first destroys it: the second flies on.
      const core = parts[E.coreA];
      core.hp = 1;
      // Above the hull's box (y 90…110): both shots overlap core A only.
      w.weapons.spawnShot(WeaponRole.Main, 0, core.x - 17, core.y - 5);
      w.weapons.spawnShot(WeaponRole.Main, 0, core.x - 18, core.y - 5);
      run(w, 1);
      expect(core.destroyed).toBe(true);
      expect(w.weapons.countShots(0, WeaponRole.Main)).toBe(1);
    });
  });

  it('hashWorld follows the boss: part hit points, the WARNING clock, open flags, the phase', () => {
    const a = world();
    const b = world();
    until(a, BossState.Warning);
    until(b, BossState.Warning);
    expect(hashWorld(a)).toBe(hashWorld(b));
    run(a, 1);
    expect(hashWorld(a)).not.toBe(hashWorld(b));
    run(b, 1);
    expect(hashWorld(a)).toBe(hashWorld(b));
    until(a, BossState.Fight);
    until(b, BossState.Fight);
    expect(hashWorld(a)).toBe(hashWorld(b));
    a.bosses.damagePart(E.lid, 1, 0);
    expect(hashWorld(a)).not.toBe(hashWorld(b));
    b.bosses.damagePart(E.lid, 1, 0);
    expect(hashWorld(a)).toBe(hashWorld(b));
    a.bosses.boss.parts[E.pod].open = false;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
    b.bosses.boss.parts[E.pod].open = false;
    a.bosses.damagePart(E.arm, 5, 0);
    b.bosses.damagePart(E.arm, 5, 0);
    run(a, 1);
    expect(a.bosses.boss.phase).toBe(1);
    expect(hashWorld(a)).not.toBe(hashWorld(b));
    run(b, 1);
    expect(hashWorld(a)).toBe(hashWorld(b));
  });
});
