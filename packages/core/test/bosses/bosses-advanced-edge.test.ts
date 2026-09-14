/**
 * Edge cases of the advanced bosses of plan M2-09, beyond the acceptance suite
 * `bosses-advanced.test.ts`:
 *
 * - **starting bosses**: bad indices, regular enemies, a captain with a WARNING, a second main
 *   boss (also while a WARNING plays), every slot busy, a WARNING boss in a later slot;
 * - **part slots**: hits and armour queries outside the 64 part slots or on parts a slot's boss
 *   lacks, another slot's parts through their global index;
 * - **turned parts**: angles a behaviour sets (wrapped, NaN ignored, fractions kept), negative and
 *   fractional spins, `partAngle` / `aimPart` (bad index, no target, the step limit), children
 *   placed along a turned parent and destroyed with it, spins frozen while dying, a circle part in
 *   the grid as its square;
 * - **the script API**: `orbit` (hold on 0 / NaN, no jump from the ellipse, the enrage factor, the
 *   reverse direction), `launch` (the minion at the part, refused without a minion, in the intro,
 *   for a destroyed part or with every enemy slot taken), a raid part off screen that may not fire,
 *   the enraged fire interval's floor;
 * - **raids**: a looping camera path and a zero-tick segment, a raid's time limit (the camera eased
 *   back over the escape, the follow ended, the ending flag), a raid killed in its intro (no follow
 *   at all), `clear()` and a checkpoint restart in the middle of a raid;
 * - **double bosses**: no slot for the partner, a partner with a longer intro (turns wait for it —
 *   regression), the leader's escape taking a resting partner along, enraging a partner still in
 *   its intro, no enrage-phase restart when already past it, the music faded and the jingle played
 *   only by the last of the pair, the HP bar over both;
 * - **captains**: the short death's timeline (chain, a medium-shake blast without flash or
 *   hit-stop, the tally, `Dead`), the stage cleared by a stage boss while a captain fights, a
 *   captain's escape (no flag, no clear), the HP bar falling back to the captains;
 * - **boss inside a boss**: no slot for the inner boss — the outer ends the encounter;
 * - **timers**: the clock counts fight ticks only; an escaping boss is out of the grid and
 *   untouchable but drawn and in the HP bar; the ending flags are hashed;
 * - **boss rushes**: a WARNING entry, the delay counting past captains and waiting for a stage
 *   boss, the jingle only after the last entry, a broken entry skipped, a restart during a later
 *   entry;
 * - **drawing**: the dying parts blink until the blast.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createBossBehaviorRegistry, defineBossBehavior } from '../../src/behaviors/index.js';
import {
  BOSS_BLAST_HIT_STOP_TICKS,
  BOSS_CHAIN_INTERVAL,
  BOSS_CHAIN_TICKS,
  BOSS_CLEAR_TICKS,
  BOSS_ENTRY_MARGIN,
  BOSS_ESCAPE_TICKS,
  BOSS_PART_SLOTS,
  BOSS_REST_X,
  BOSS_TURN_TICKS,
  BossHit,
  BossMotion,
  BossState,
  CAPTAIN_BLAST_SHAKE_TICKS,
  CAPTAIN_CHAIN_TICKS,
  CAPTAIN_CLEAR_TICKS,
  CAPTAIN_TALLY_TICKS,
  EndingFlag,
  MAX_BOSSES,
  WARNING_TICKS,
  formatWarningText,
  turnedFrame,
  type Boss,
  type BossScriptApi,
} from '../../src/bosses/index.js';
import { BulletOrigin } from '../../src/bullets/index.js';
import type { SpatialGrid } from '../../src/collision/index.js';
import { PLAYFIELD_W, resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { MAX_ENEMIES } from '../../src/enemies/index.js';
import { FX_CUES, MUSIC_CUES, SimEventKind } from '../../src/events/index.js';
import { ShakeMagnitude } from '../../src/fx/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { cosB, sinB } from '../../src/math/index.js';
import { SLEEP_FOREVER, type Script } from '../../src/patterns/index.js';
import { SpriteFlag } from '../../src/presentation/index.js';
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

/** A small always-vulnerable core part. */
const core = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: 'core',
  hp: 20,
  radius: 6,
  core: true,
  sprite: 'bosses/core',
  score: 100,
  ...over,
});

/**
 * A boss entry whose behaviour hands the test its script API.
 *
 * @param id - Enemy id.
 * @param boss - The boss section's fields (code, name and a `test.grab` phase filled in).
 * @returns The entry.
 */
const entry = (id: string, boss: Record<string, unknown>): Record<string, unknown> => ({
  id,
  boss: {
    code: id.toUpperCase().slice(0, 8),
    displayName: id.toUpperCase().replace(/-/g, ' '),
    introTicks: 0,
    x: 300,
    y: 100,
    parts: [core()],
    phases: [{ script: 'test.grab' }],
    ...boss,
  },
});

/** The test enemies (see the module docs). */
const ENEMIES = [
  // A regular enemy: the minion, and a broken boss-rush entry.
  {
    id: 'drone',
    hp: 1,
    score: 10,
    hurtbox: { hw: 2, hh: 2 },
    script: 'test.none',
    sprite: 'bosses/orb',
    drop: null,
  },
  // A stage boss with a drawn part beside its core (it blinks while dying).
  entry('plain', {
    code: 'PL-01',
    displayName: 'PLAIN',
    score: 700,
    parts: [core(), { name: 'fin', x: 20, hp: 5, radius: 4, sprite: 'bosses/orb' }],
  }),
  entry('plain-two', { score: 800 }),
  // A stage boss with a turret on its hub and a barrel on the turret; it launches drones.
  entry('turret-boss', {
    x: 200,
    minion: 'drone',
    parts: [
      core({ name: 'hub' }),
      {
        name: 'gun',
        parent: 'hub',
        x: 20,
        hp: 5,
        radius: 3,
        turn: 16,
        gun: true,
        sprite: 'bosses/turret',
      },
      { name: 'barrel', parent: 'gun', x: 8, hp: 2, radius: 2 },
    ],
  }),
  // Captains: one arriving at once, one with an intro that launches drones.
  entry('cap', { role: 'captain', score: 300, parts: [core({ hp: 8 })] }),
  entry('cap-launch', { role: 'captain', introTicks: 10, minion: 'drone', parts: [core()] }),
  // A looping raid: a jump at once to (−100, −60), 3 ticks there, then 4 ticks to (0, −60).
  entry('loop-raid', {
    x: 100,
    raid: {
      segments: [
        { x: -100, y: -60, ticks: 0, hold: 3 },
        { x: 0, y: -60, ticks: 4 },
      ],
      loop: true,
    },
    parts: [
      { name: 'keel', sprite: 'bosses/raid-hull' },
      core({ parent: 'keel', x: 150 }),
      { name: 'stern', parent: 'keel', x: 500, hp: 5, radius: 4, gun: true },
    ],
  }),
  // A raid with a time limit (one segment, no loop).
  entry('timed-raid', {
    x: 100,
    timeLimit: 60,
    raid: { segments: [{ x: 0, y: -50, ticks: 10 }], loop: false },
    parts: [core()],
  }),
  // A raid with an intro (killed before its camera path starts).
  entry('intro-raid', {
    x: 100,
    introTicks: 30,
    raid: { segments: [{ x: 0, y: -50, ticks: 10 }], loop: false },
    parts: [core()],
  }),
  // A double boss whose partner flies in far longer than the pair's turn.
  entry('quick', { partner: 'slow', alternate: 30, y: 60 }),
  entry('slow', {
    introTicks: 100,
    y: 140,
    enrage: { fireRate: 0.5, speed: 2, phase: 1 },
    phases: [{ script: 'test.grab', until: { ticks: 36000 } }, { script: 'test.phase2' }],
  }),
  // The acceptance suite's double boss (turns every 200 ticks, enrage into phase 1).
  entry('lead', {
    introTicks: 10,
    score: 500,
    x: 290,
    y: 60,
    partner: 'mate',
    alternate: 200,
    enrage: { fireRate: 0.5, speed: 2, phase: 1 },
    phases: [{ script: 'test.grab', until: { ticks: 36000 } }, { script: 'test.phase2' }],
  }),
  entry('mate', {
    introTicks: 10,
    score: 500,
    x: 290,
    y: 140,
    enrage: { fireRate: 0.5, speed: 2, phase: 1 },
    phases: [{ script: 'test.grab', until: { ticks: 36000 } }, { script: 'test.phase2' }],
  }),
  // A boss inside a boss.
  entry('outer', {
    score: 1000,
    inner: 'inner',
    parts: [{ name: 'hull', hurtbox: { hw: 8, hh: 8 }, vulnerable: 'never' }, core({ x: -20 })],
  }),
  entry('inner', { introTicks: 40, score: 2000 }),
  // Time limits: one arriving at once, one with an intro.
  entry('timed', { timeLimit: 60, score: 900 }),
  entry('timed-intro', { introTicks: 50, timeLimit: 60 }),
];

/**
 * An open stage scrolling at 1 px/tick.
 *
 * @param id - Stage id.
 * @param events - Its events.
 * @param extra - More stage fields (a boss rush).
 * @returns The stage file.
 */
function stage(id: string, events: unknown[], extra: Record<string, unknown> = {}): ContentFile {
  return {
    path: 'stages/' + id + '.stage.json',
    data: {
      formatVersion: 1,
      kind: 'stage',
      id,
      name: id.toUpperCase(),
      music: { stage: 'Stage', boss: 'Boss' },
      length: 20000,
      camera: [{ x: 0, speed: 1 }],
      checkpoints: [{ x: 0 }],
      parallax: [],
      tilemap: null,
      events,
      ...extra,
    },
  };
}

/** The KESTREL, Type A, the test enemies, the stages `arena` (no event) and `rush` (a rush). */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      {
        path: 'enemies/t.enemies.json',
        data: { formatVersion: 1, kind: 'enemies', enemies: ENEMIES },
      },
      stage('arena', []),
      stage('rush', [], {
        type: 'bossRush',
        rush: [
          { enemy: 'plain', delay: 5, warning: true },
          { enemy: 'plain-two', delay: 10 },
        ],
      }),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

/** The script API each boss slot's `test.grab` behaviour last handed over. */
const apis: Array<BossScriptApi | undefined> = [];

/** What `test.phase2` saw: `phase2@<tick>`. */
const log: string[] = [];

/** The test behaviours: `test.grab` keeps the API and sleeps; `test.phase2` logs and sleeps. */
const BEHAVIORS = createBossBehaviorRegistry([
  defineBossBehavior('test.grab', {}, function* grab(api: BossScriptApi): Script {
    apis[api.self.slot] = api;
    yield SLEEP_FOREVER;
  }),
  defineBossBehavior('test.phase2', {}, function* phase2(api: BossScriptApi): Script {
    apis[api.self.slot] = api;
    log.push('phase2@' + String(api.tick));
    yield SLEEP_FOREVER;
  }),
]);

/**
 * A world on a test stage, player 1 alive and harmless (no autofire), god mode on.
 *
 * @param stageId - Stage.
 * @param over - Config overrides.
 * @param db - The content (default the test DB).
 * @returns The world.
 */
function world(stageId = 'arena', over: Partial<GameConfig> = {}, db: ContentDb = DB): World {
  apis.length = 0;
  log.length = 0;
  const w = createWorld(
    resolveGameConfig({ stage: stageId, seed: 5, autofire: false, remoteMode: false, ...over }),
    db,
    { bossBehaviors: BEHAVIORS },
  );
  w.debugFlags.godMode = true;
  return w;
}

/**
 * Steps a world, collecting the events (`kind:id:param`).
 *
 * @param w - The world.
 * @param ticks - Ticks.
 * @param out - Collector.
 * @returns The collector.
 */
function run(w: World, ticks: number, out: string[] = []): string[] {
  const input = createInputSnapshot();
  for (let i = 0; i < ticks; i++) {
    stepWorld(w, input);
    w.events.drain((e) => out.push(String(e.kind) + ':' + String(e.id) + ':' + String(e.param)));
  }
  return out;
}

/**
 * Steps until a boss slot reaches a state (the tick it happened in is the last one run).
 *
 * @param w - The world.
 * @param state - The `BossState`.
 * @param slot - The slot (default 0).
 */
function untilState(w: World, state: number, slot = 0): void {
  for (let i = 0; i < 5000; i++) {
    run(w, 1);
    if (w.bosses.slots[slot].state === state) return;
  }
  throw new Error('never reached state ' + String(state));
}

/**
 * The enemy index of a test enemy.
 *
 * @param id - Its id.
 * @returns The index.
 */
function index(id: string): number {
  const i = DB.enemyIndex.get(id);
  if (i === undefined) throw new Error('no ' + id);
  return i;
}

/**
 * The script API a slot's behaviour handed over.
 *
 * @param slot - The boss slot.
 * @returns The API.
 */
function api(slot = 0): BossScriptApi {
  const found = apis[slot];
  if (found === undefined) throw new Error('slot ' + String(slot) + ' ran no test.grab');
  return found;
}

/**
 * An event string of {@link run}.
 *
 * @param kind - `SimEventKind`.
 * @param id - Its id.
 * @param param - Its param.
 * @returns `kind:id:param`.
 */
const ev = (kind: number, id: number, param: number): string =>
  String(kind) + ':' + String(id) + ':' + String(param);

/**
 * A grid that records the boxes inserted into it (`id:x0,y0,x1,y1`).
 *
 * @returns The grid and its log.
 */
function recordingGrid(): { grid: SpatialGrid; boxes: string[] } {
  const boxes: string[] = [];
  const grid = {
    insert(id: number, x0: number, y0: number, x1: number, y1: number): void {
      boxes.push(String(id) + ':' + [x0, y0, x1, y1].join(','));
    },
  } as unknown as SpatialGrid;
  return { grid, boxes };
}

describe('core/bosses — starting bosses (M2-09 edges)', () => {
  it('refuses bad indices, regular enemies, a captain’s WARNING and a second main boss', () => {
    const w = world();
    const bosses = w.bosses;
    for (const bad of [-1, NaN, 1.5, DB.enemies.length, index('drone')]) {
      expect(bosses.isBoss(bad)).toBe(false);
      expect(bosses.warningText(bad)).toBe('');
      expect(bosses.startWarning(bad)).toBe(false);
      expect(bosses.startBoss(bad)).toBe(false);
    }
    expect(bosses.startWarning(index('cap'))).toBe(false);
    expect(bosses.warningText(index('plain'))).toBe(formatWarningText('PLAIN', 'PL-01'));
    expect(bosses.active).toBe(false);
    // A WARNING runs: no second WARNING and no second main boss meanwhile — a captain may come.
    expect(bosses.startWarning(index('plain'))).toBe(true);
    expect([w.status, bosses.mainActive, bosses.warning.active]).toEqual([
      'bossWarning',
      true,
      true,
    ]);
    expect(bosses.startWarning(index('plain-two'))).toBe(false);
    expect(bosses.startBoss(index('plain-two'))).toBe(false);
    expect(bosses.startBoss(index('cap'))).toBe(true);
    expect(bosses.slots[1].specIndex).toBe(index('cap'));
    // The captain's entry did not end the WARNING.
    expect(bosses.warning.active).toBe(true);
    expect(w.status).toBe('bossWarning');
  });

  it('puts a WARNING’s boss in the first free slot, and refuses it when every slot is busy', () => {
    const w = world();
    expect(w.bosses.startBoss(index('cap'))).toBe(true);
    expect(w.bosses.startWarning(index('plain'))).toBe(true);
    const boss = w.bosses.slots[1];
    expect(boss.state).toBe(BossState.Warning);
    run(w, WARNING_TICKS);
    // No intro: it fights from the tick the WARNING ends.
    expect(boss.state).toBe(BossState.Fight);
    expect(w.status).toBe('playing');
    const full = world();
    for (let i = 0; i < MAX_BOSSES; i++) expect(full.bosses.startBoss(index('cap'))).toBe(true);
    expect(full.bosses.startWarning(index('plain'))).toBe(false);
    expect([full.status, full.bosses.warning.active]).toEqual(['playing', false]);
  });
});

describe('core/bosses — part slots (M2-09 edges)', () => {
  it('ignores hits and armour queries outside the part slots or on parts a boss lacks', () => {
    const w = world();
    const bosses = w.bosses;
    for (const bad of [-1, BOSS_PART_SLOTS, 1.5, NaN]) {
      expect(bosses.damagePart(bad, 1, 0)).toBe(BossHit.None);
      expect(bosses.isArmoured(bad)).toBe(false);
    }
    bosses.startBoss(index('cap'));
    // Its part 1 does not exist; slot 1 holds no boss.
    expect(bosses.damagePart(1, 1, 0)).toBe(BossHit.None);
    expect(bosses.damagePart(16, 1, 0)).toBe(BossHit.None);
    // Slot 1's core is part slot 16.
    bosses.startBoss(index('cap'));
    const second = bosses.slots[1].parts[0];
    expect(second.global).toBe(16);
    expect(bosses.damagePart(16, 3, 0)).toBe(BossHit.Damaged);
    expect([second.hp, bosses.slots[0].parts[0].hp]).toEqual([5, 8]);
  });
});

describe('core/bosses — turned parts (M2-09 edges)', () => {
  it('wraps the angles a behaviour sets, ignores NaN, keeps fractions and spins both ways', () => {
    const w = world();
    w.bosses.startBoss(index('turret-boss'));
    run(w, 1);
    const a = api();
    const [hub, gun] = w.bosses.boss.parts;
    a.setPartAngle(0, -256);
    expect(hub.angle).toBe(768);
    a.setPartAngle(0, 1024 * 3 + 5);
    expect(hub.angle).toBe(5);
    a.setPartAngle(0, 10.5);
    expect(hub.angle).toBe(10.5);
    a.setPartAngle(0, NaN);
    expect(hub.angle).toBe(10.5);
    // Bad indices change nothing and answer 0.
    a.setPartAngle(9, 3);
    a.setPartAngle(0.5, 3);
    a.spinPart(-1, 3);
    expect([a.partAngle(-1), a.partAngle(9), a.partAngle(0.5)]).toEqual([0, 0, 0]);
    a.spinPart(0, NaN);
    expect(hub.spin).toBe(0);
    a.setPartAngle(0, 1);
    a.spinPart(0, -3);
    run(w, 1);
    // Wrapped below 0 — and the gun, with no turn of its own, follows its parent's world angle.
    expect(hub.angle).toBe(1022);
    expect([a.partAngle(0), a.partAngle(1)]).toEqual([1022, 1022]);
    expect(gun.worldAngle).toBe(1022);
    a.spinPart(0, 0.25);
    run(w, 2);
    expect(hub.angle).toBe(1022.5);
    // `partAngle` answers whole units; the heading frame rounds the world angle.
    expect(a.partAngle(0)).toBe(1022);
    expect(gun.frame).toBe(turnedFrame(1022.5, 16));
    expect(gun.frame).toBe(0);
  });

  it('turns a turret toward the player by at most the step, at once for a step ≤ 0', () => {
    const w = world();
    w.bosses.startBoss(index('turret-boss'));
    run(w, 1);
    const a = api();
    const gun = w.bosses.boss.parts[1];
    expect(gun.worldAngle).toBe(0);
    // The ship straight below the gun: the aimed heading is a quarter turn (256).
    const ship = w.players[0];
    ship.state = 'alive';
    ship.x = gun.x;
    ship.y = gun.y + 60;
    const origin = new BulletOrigin();
    origin.x = gun.x;
    origin.y = gun.y;
    expect(w.bullets.aimFrom(origin)).toBe(256);
    expect(a.aimPart(-1, 8)).toBe(-1);
    expect(a.aimPart(0.5, 8)).toBe(-1);
    expect(a.aimPart(1, 8)).toBe(8);
    expect(gun.angle).toBe(8);
    // The world angle and the frame follow in phase 5 (the boss and the ship ride the camera).
    expect(gun.worldAngle).toBe(0);
    run(w, 1);
    expect([gun.worldAngle, gun.frame]).toEqual([8, 0]);
    // A step ≤ 0 turns it all the way at once.
    expect(a.aimPart(1, 0)).toBe(256);
    expect(gun.angle).toBe(256);
    run(w, 1);
    expect([gun.worldAngle, gun.frame]).toEqual([256, 4]);
    expect(a.aimPart(1, -5)).toBe(256);
    expect(gun.angle).toBe(256);
    // Nobody to aim at.
    ship.active = false;
    expect(a.aimPart(1, 8)).toBe(-1);
    ship.active = true;
    expect(gun.angle).toBe(256);
  });

  it('places children along a turned parent, destroys them with it and freezes spins in death', () => {
    const w = world();
    w.bosses.startBoss(index('turret-boss'));
    run(w, 1);
    const a = api();
    const boss = w.bosses.boss;
    const [hub, gun, barrel] = boss.parts;
    a.spinPart(1, 4);
    run(w, 3);
    expect(gun.angle).toBe(12);
    // The barrel sits 8 px along the gun's heading (the gun's own turn — the hub has none).
    expect(barrel.x).toBeCloseTo(gun.x + 8 * cosB(12), 9);
    expect(barrel.y).toBeCloseTo(gun.y + 8 * sinB(12), 9);
    expect(barrel.worldAngle).toBe(12);
    // The turret destroyed: the barrel goes with it (not the hub).
    expect(w.bosses.damagePart(1, 5, 0)).toBe(BossHit.Destroyed);
    expect([gun.destroyed, barrel.destroyed, hub.destroyed]).toEqual([true, true, false]);
    expect(boss.destroyedMask).toBe(0b110);
    expect(w.bosses.damagePart(2, 1, 0)).toBe(BossHit.None);
    // Dying: spins stop.
    a.spinPart(0, 4);
    run(w, 1);
    const turned = hub.angle;
    expect(turned).toBe(4);
    w.bosses.defeat(0);
    run(w, 5);
    expect(boss.state).toBe(BossState.Dying);
    expect(hub.angle).toBe(turned);
  });

  it('puts a circle part into the grid as its square, and no part of a resting boss', () => {
    const w = world();
    w.bosses.startBoss(index('turret-boss'));
    run(w, 1);
    const hub = w.bosses.boss.parts[0];
    hub.x = 100.5;
    hub.y = 50.25;
    const { grid, boxes } = recordingGrid();
    w.bosses.insertColliders(grid);
    expect(boxes[0]).toBe(String(hub.slot) + ':94,44,107,57');
    expect(boxes).toHaveLength(3);
    expect(hub.target).toBe(true);
    w.bosses.boss.resting = true;
    const again = recordingGrid();
    w.bosses.insertColliders(again.grid);
    expect(again.boxes).toEqual([]);
    expect(hub.target).toBe(false);
  });
});

describe('core/bosses — the script API (M2-09 edges)', () => {
  it('orbits from where the boss is, holds on a zero or NaN speed, and speeds up when enraged', () => {
    const w = world();
    w.bosses.startBoss(index('turret-boss'));
    run(w, 1);
    const a = api();
    const boss = w.bosses.boss;
    a.orbit(200, 100, 50, 20, 0);
    expect(boss.motion).toBe(BossMotion.Hold);
    a.orbit(200, 100, 50, 20, NaN);
    expect(boss.motion).toBe(BossMotion.Hold);
    // On the ellipse's right end: angle 0, so the orbit starts without a jump.
    a.moveTo(250, 100, 0);
    expect([boss.screenX, boss.screenY]).toEqual([250, 100]);
    a.orbit(200, 100, 50, 20, 8);
    expect([boss.motion, boss.orbitAngle]).toEqual([BossMotion.Orbit, 0]);
    run(w, 1);
    expect(boss.orbitAngle).toBe(8);
    expect(boss.screenX).toBeCloseTo(200 + 50 * cosB(8), 9);
    expect(boss.screenY).toBeCloseTo(100 + 20 * sinB(8), 9);
    // Enraged: × its factor.
    boss.enraged = true;
    boss.enrageSpeed = 2;
    run(w, 1);
    expect(boss.orbitAngle).toBe(24);
    boss.enraged = false;
    // Counter-clockwise from where it is (the bottom of a circle: a quarter turn).
    a.moveTo(200, 150, 0);
    a.orbit(200, 100, 50, 50, -8);
    expect(boss.orbitAngle).toBe(256);
    run(w, 1);
    expect(boss.orbitAngle).toBe(248);
    a.orbit(200, 100, 50, 50, -300);
    run(w, 1);
    expect(boss.orbitAngle).toBeGreaterThanOrEqual(0);
    expect(boss.orbitAngle).toBeLessThan(1024);
  });

  it('launches its minion from a part only while that part may fire', () => {
    const w = world();
    w.bosses.startBoss(index('turret-boss'));
    run(w, 1);
    const a = api();
    const gun = w.bosses.boss.parts[1];
    const before = w.enemies.count;
    expect(a.launch(1)).toBe(true);
    expect(w.enemies.count).toBe(before + 1);
    const drone = w.enemies.enemies.find((e) => e.specIndex === index('drone'));
    expect(drone?.x).toBeCloseTo(gun.x, 9);
    expect(drone?.y).toBeCloseTo(gun.y, 9);
    expect([a.launch(-1), a.launch(7)]).toEqual([false, false]);
    // Every enemy slot taken: nothing launched.
    for (let i = 0; i < MAX_ENEMIES; i++) w.enemies.spawn(index('drone'), w.camera.x + 200, 100);
    expect(w.enemies.count).toBe(MAX_ENEMIES);
    expect(a.launch(1)).toBe(false);
    w.enemies.clear();
    // A destroyed part does not fire.
    w.bosses.damagePart(1, 5, 0);
    expect(a.launch(1)).toBe(false);
    // A boss without a minion never launches.
    const plain = world();
    plain.bosses.startBoss(index('plain'));
    run(plain, 1);
    expect(api().launch(0)).toBe(false);
  });

  it('keeps a captain from launching during its intro', () => {
    const w = world();
    w.bosses.startBoss(index('cap-launch'));
    // Its script first runs after the intro; the API object is the slot's, shared by every phase.
    untilState(w, BossState.Fight);
    run(w, 1);
    const a = api();
    expect(a.launch(0)).toBe(true);
    w.bosses.clear();
    w.bosses.startBoss(index('cap-launch'));
    expect(w.bosses.boss.state).toBe(BossState.Intro);
    expect([a.canFire(0), a.launch(0)]).toEqual([false, false]);
  });

  it('never fires a raid’s part while it is off screen', () => {
    const w = world();
    w.bosses.startBoss(index('loop-raid'));
    run(w, 1);
    const a = api();
    const [keel, hull, stern] = w.bosses.boss.parts;
    expect(keel.inView).toBe(true);
    // The stern is 500 px behind the keel: far off the right edge.
    expect(stern.x - w.camera.x).toBeGreaterThan(PLAYFIELD_W + 8);
    expect([stern.inView, hull.inView]).toEqual([false, true]);
    expect([a.canFire(2), a.canFire(1)]).toEqual([false, true]);
    expect(a.aimed(2, 1, 0)).toBe(-1);
    expect(a.ring(2, 8, 1, 0)).toBe(0);
    expect(a.nWay(2, 3, 16, 1, 0)).toBe(0);
    expect(a.spray(2, 3, 64, 1, 2, 0)).toBe(0);
    expect(a.laser(2)).toBe(-1);
    expect(a.ring(1, 8, 1, 0)).toBe(8);
  });

  it('floors the enraged fire interval at one tick', () => {
    const w = world();
    w.bosses.startBoss(index('plain'));
    run(w, 1);
    const a = api();
    const boss = w.bosses.boss;
    const normal = a.fireWait(60);
    expect(normal).toBe(60);
    boss.enraged = true;
    boss.enrageFireRate = 0.5;
    expect([a.enraged, a.fireWait(60), a.fireWait(1)]).toEqual([true, 30, 1]);
    boss.enrageFireRate = 0.001;
    expect(a.fireWait(60)).toBe(1);
  });
});

describe('core/bosses — raids (M2-09 edges)', () => {
  it('loops its camera path back to the first segment; a zero-tick segment jumps at once', () => {
    const w = world();
    const runner = w.stage;
    if (runner === null) throw new Error('no stage');
    w.bosses.startBoss(index('loop-raid'));
    const boss = w.bosses.boss;
    expect([boss.raiding, runner.following]).toEqual([true, w.bosses.raidCamera]);
    const offsets: number[] = [];
    for (let t = 0; t < 12; t++) {
      run(w, 1);
      offsets.push(w.camera.x - boss.x);
      expect(w.camera.y - boss.y).toBeCloseTo(-60, 9);
    }
    // Segment 0 at once, held 3 ticks; segment 1 eased over 4 (in-out quad); then segment 0 again.
    expect(offsets).toEqual([-100, -100, -100, -87.5, -50, -12.5, 0, -100, -100, -100, -87.5, -50]);
  });

  it('eases the camera back over its escape when its time runs out, then lets go', () => {
    const w = world();
    const runner = w.stage;
    if (runner === null) throw new Error('no stage');
    const events: string[] = [];
    w.bosses.startBoss(index('timed-raid'));
    const boss = w.bosses.boss;
    const home = { x: boss.raidHomeX, y: boss.raidHomeY };
    run(w, 59, events);
    expect(boss.state).toBe(BossState.Fight);
    expect(w.camera.y).toBeCloseTo(boss.y - 50, 9);
    run(w, 1, events);
    expect(boss.state).toBe(BossState.Escape);
    expect([boss.raiding, boss.returning]).toEqual([false, true]);
    run(w, BOSS_ESCAPE_TICKS - 1, events);
    // Home exactly on the escape's last tick, still followed.
    expect([w.camera.x, w.camera.y]).toEqual([home.x, home.y]);
    expect(runner.following).toBe(w.bosses.raidCamera);
    expect(boss.state).toBe(BossState.Escape);
    run(w, 1, events);
    expect(boss.state).toBe(BossState.Dead);
    expect([boss.escaped, boss.returning, runner.following]).toEqual([true, false, null]);
    expect(w.endingFlags).toBe(EndingFlag.BossEscaped);
    expect(events).toContain(ev(SimEventKind.BossEscaped, index('timed-raid'), 0));
    expect([w.status, runner.locked]).toEqual(['stageClear', false]);
  });

  it('never follows when it dies in its intro', () => {
    const w = world();
    const runner = w.stage;
    if (runner === null) throw new Error('no stage');
    w.bosses.startBoss(index('intro-raid'));
    const boss = w.bosses.boss;
    expect(boss.anchored).toBe(true);
    run(w, 5);
    // Anchored where it entered: the camera stopped at once.
    expect(runner.locked).toBe(true);
    expect(w.bosses.defeat(0)).toBe(true);
    expect([boss.raiding, boss.returning]).toEqual([false, false]);
    for (let t = 0; t < BOSS_CLEAR_TICKS + BOSS_BLAST_HIT_STOP_TICKS; t++) {
      run(w, 1);
      expect(runner.following).toBeNull();
    }
    expect(boss.state).toBe(BossState.Dead);
    expect([w.status, runner.locked]).toEqual(['stageClear', false]);
  });

  it('stops the raid on clear() and on a checkpoint restart', () => {
    const w = world();
    const runner = w.stage;
    if (runner === null) throw new Error('no stage');
    w.bosses.startBoss(index('loop-raid'));
    run(w, 5);
    w.bosses.clear();
    const boss = w.bosses.boss;
    expect([boss.state, boss.anchored, boss.raiding, runner.following]).toEqual([
      BossState.None,
      false,
      false,
      null,
    ]);
    // A restart in the middle of a raid: the camera scrolls from the checkpoint again.
    w.bosses.startBoss(index('loop-raid'));
    run(w, 5);
    expect(runner.following).toBe(w.bosses.raidCamera);
    runner.restartAt(0);
    expect([boss.state, runner.following]).toEqual([BossState.None, null]);
    const x = w.camera.x;
    run(w, 3);
    expect(w.camera.x).toBe(x + 3);
  });
});

describe('core/bosses — double bosses (M2-09 edges)', () => {
  it('fights alone when no slot is free for its partner', () => {
    const w = world();
    for (let i = 0; i < MAX_BOSSES - 1; i++) w.bosses.startBoss(index('cap'));
    expect(w.bosses.startBoss(index('lead'))).toBe(true);
    const lead = w.bosses.slots[MAX_BOSSES - 1];
    expect(lead.specIndex).toBe(index('lead'));
    expect([lead.partner, lead.leader]).toEqual([-1, false]);
    untilState(w, BossState.Fight, MAX_BOSSES - 1);
    run(w, 400);
    expect([lead.turnTicks, lead.resting]).toEqual([0, false]);
  });

  it('takes turns only once a partner with a longer intro has flown in (regression)', () => {
    const w = world();
    w.bosses.startBoss(index('quick'));
    const [quick, slow] = w.bosses.slots;
    expect([quick.state, slow.state]).toEqual([BossState.Fight, BossState.Intro]);
    // The pair's first turn comes while the partner is still flying in: the leader keeps its
    // turn (instead of never turning again).
    run(w, 100);
    expect(slow.state).toBe(BossState.Fight);
    expect([quick.resting, slow.resting]).toEqual([false, true]);
    let swaps = 0;
    let resting = quick.resting;
    for (let t = 0; t < 300; t++) {
      run(w, 1);
      if (quick.resting !== resting) {
        resting = quick.resting;
        swaps++;
      }
      // One of the pair fights at any time.
      expect(quick.resting && slow.resting).toBe(false);
    }
    expect(swaps).toBeGreaterThanOrEqual(8);
  });

  it('takes a resting partner along when the leader escapes', () => {
    const w = world();
    w.bosses.startBoss(index('lead'));
    const [lead, mate] = w.bosses.slots;
    untilState(w, BossState.Fight);
    run(w, BOSS_TURN_TICKS);
    expect(mate.resting).toBe(true);
    expect(mate.screenX).toBeCloseTo(BOSS_REST_X, 9);
    lead.timeLimit = lead.fightTicks + 1;
    run(w, 1);
    expect([lead.state, mate.state]).toEqual([BossState.Escape, BossState.Escape]);
    // Out of its rest: drawn in front again, off to its entry's intro start.
    expect(mate.resting).toBe(false);
    expect(mate.moveToX).toBe(PLAYFIELD_W + BOSS_ENTRY_MARGIN + 6);
    run(w, BOSS_ESCAPE_TICKS);
    expect([lead.state, mate.state]).toEqual([BossState.Dead, BossState.Dead]);
    expect([lead.escaped, mate.escaped]).toEqual([true, true]);
    expect([lead.partner, mate.partner]).toEqual([-1, -1]);
    expect(w.endingFlags).toBe(EndingFlag.BossEscaped);
    expect(w.status).toBe('stageClear');
  });

  it('enrages a partner still in its intro: it never rests and fights in its enrage phase', () => {
    const w = world();
    w.bosses.startBoss(index('quick'));
    const [quick, slow] = w.bosses.slots;
    run(w, 5);
    expect(w.bosses.damagePart(quick.parts[0].global, 1000, 0)).toBe(BossHit.Destroyed);
    expect([slow.state, slow.enraged, slow.phase]).toEqual([BossState.Intro, true, 0]);
    untilState(w, BossState.Fight, 1);
    expect([slow.phase, slow.resting]).toEqual([1, false]);
    run(w, 1);
    expect(log).toHaveLength(1);
    run(w, 200);
    expect(slow.resting).toBe(false);
  });

  it('does not restart a phase when the survivor is already at or past its enrage phase', () => {
    const w = world();
    w.bosses.startBoss(index('lead'));
    const [lead, mate] = w.bosses.slots;
    untilState(w, BossState.Fight);
    // The resting mate's phase ends (its clock is paused, so set it): phase 1.
    mate.phaseTicks = 36000;
    run(w, 1);
    expect(mate.phase).toBe(1);
    const script = mate.script;
    expect(script).not.toBeNull();
    w.bosses.damagePart(lead.parts[0].global, 1000, 0);
    expect(mate.enraged).toBe(true);
    // (`toBe`: a deep comparison would iterate — and run — the generator.)
    expect(mate.phase).toBe(1);
    expect(mate.script).toBe(script);
  });

  it('fades the music and plays the jingle only for the last of the pair; the bar counts both', () => {
    const w = world();
    const bar = w.bosses.hpBar;
    w.bosses.startBoss(index('lead'));
    const [lead, mate] = w.bosses.slots;
    untilState(w, BossState.Fight);
    run(w, 1);
    expect([bar.bosses, bar.hp, bar.maxHp]).toEqual([2, 40, 40]);
    const events: string[] = [];
    w.events.clear();
    w.bosses.damagePart(lead.parts[0].global, 1000, 0);
    run(w, 1, events);
    // The lead dying counts 0 until its blast; the mate its 20.
    expect([bar.bosses, bar.hp, bar.maxHp]).toEqual([2, 20, 40]);
    const silence = ev(SimEventKind.Music, MUSIC_CUES.Silence, 60);
    expect(events).not.toContain(silence);
    run(w, BOSS_CHAIN_TICKS + BOSS_BLAST_HIT_STOP_TICKS, events);
    expect([bar.bosses, bar.hp, bar.maxHp]).toEqual([1, 20, 20]);
    run(w, BOSS_CLEAR_TICKS, events);
    expect(lead.state).toBe(BossState.Dead);
    const jingle = ev(SimEventKind.Music, MUSIC_CUES.StageClear, 0);
    expect(events).not.toContain(jingle);
    expect(events).toContain(ev(SimEventKind.BossDefeated, index('lead'), 500));
    w.events.clear();
    w.bosses.damagePart(mate.parts[0].global, 1000, 0);
    w.events.drain((e) => events.push(ev(e.kind, e.id, e.param)));
    expect(events).toContain(silence);
    run(w, BOSS_CLEAR_TICKS + BOSS_BLAST_HIT_STOP_TICKS, events);
    expect(events.filter((e) => e === jingle)).toHaveLength(1);
    expect(w.status).toBe('stageClear');
  });
});

describe('core/bosses — captains (M2-09 edges)', () => {
  it('dies in a short sequence: chain, a medium blast without flash or hit-stop, tally, Dead', () => {
    const w = world();
    w.bosses.startBoss(index('cap'));
    const cap = w.bosses.boss;
    run(w, 1);
    w.events.clear();
    expect(w.bosses.damagePart(0, 100, 0)).toBe(BossHit.Destroyed);
    const byTick: string[][] = [];
    const states: number[] = [];
    for (let t = 1; t <= CAPTAIN_CLEAR_TICKS; t++) {
      byTick[t] = run(w, 1);
      states[t] = cap.state;
    }
    const chain = ev(SimEventKind.Particles, FX_CUES.BossChain, 1);
    const chainTicks = byTick.flatMap((events, t) => (events.includes(chain) ? [t] : []));
    const expected: number[] = [];
    for (let t = BOSS_CHAIN_INTERVAL; t < CAPTAIN_CHAIN_TICKS; t += BOSS_CHAIN_INTERVAL) {
      expected.push(t);
    }
    expect(chainTicks).toEqual([...expected, CAPTAIN_CHAIN_TICKS]);
    const blast = byTick[CAPTAIN_CHAIN_TICKS];
    expect(blast).toContain(ev(SimEventKind.Particles, FX_CUES.ExplosionLarge, 1));
    expect(blast).toContain(
      ev(SimEventKind.Shake, CAPTAIN_BLAST_SHAKE_TICKS, ShakeMagnitude.Medium),
    );
    const all = byTick.flat();
    expect(all.some((e) => e.startsWith(String(SimEventKind.Flash) + ':'))).toBe(false);
    expect(all.some((e) => e.startsWith(String(SimEventKind.HitStop) + ':'))).toBe(false);
    expect(all.some((e) => e.startsWith(String(SimEventKind.Music) + ':'))).toBe(false);
    expect(cap.blasted).toBe(true);
    expect(byTick[CAPTAIN_TALLY_TICKS]).toContain(ev(SimEventKind.BossDefeated, index('cap'), 300));
    expect(w.scoring.board.scores[0].score).toBe(100 + 300);
    expect([states[CAPTAIN_CLEAR_TICKS - 1], states[CAPTAIN_CLEAR_TICKS]]).toEqual([
      BossState.Dying,
      BossState.Dead,
    ]);
    expect(w.status).toBe('playing');
  });

  it('lets a stage boss clear the stage while a captain still fights', () => {
    const w = world();
    w.bosses.startBoss(index('cap'));
    w.bosses.startBoss(index('plain'));
    const [cap, plain] = w.bosses.slots;
    run(w, 1);
    w.bosses.damagePart(plain.parts[0].global, 1000, 0);
    run(w, BOSS_CLEAR_TICKS + BOSS_BLAST_HIT_STOP_TICKS);
    expect(plain.state).toBe(BossState.Dead);
    expect(cap.state).toBe(BossState.Fight);
    expect(w.status).toBe('stageClear');
  });

  it('escapes without an ending flag or a stage clear', () => {
    const w = world();
    const events: string[] = [];
    w.bosses.startBoss(index('cap'));
    const cap = w.bosses.boss;
    cap.timeLimit = 30;
    run(w, 29);
    run(w, 1, events);
    expect(cap.state).toBe(BossState.Escape);
    // A captain changed no music, so its escape fades none.
    expect(events.some((e) => e.startsWith(String(SimEventKind.Music) + ':'))).toBe(false);
    run(w, BOSS_ESCAPE_TICKS, events);
    expect([cap.state, cap.escaped]).toEqual([BossState.Dead, true]);
    expect(events).toContain(ev(SimEventKind.BossEscaped, index('cap'), 0));
    expect([w.endingFlags, w.status]).toEqual([0, 'playing']);
  });

  it('shows the captains in the HP bar once the stage boss has blasted; sums several', () => {
    const w = world();
    const bar = w.bosses.hpBar;
    w.bosses.startBoss(index('cap'));
    w.bosses.startBoss(index('cap'));
    run(w, 1);
    expect([bar.visible, bar.bosses, bar.hp, bar.maxHp]).toEqual([true, 2, 16, 16]);
    w.bosses.damagePart(0, 3, 0);
    run(w, 1);
    expect(bar.hp).toBe(13);
    w.bosses.startBoss(index('plain'));
    run(w, 1);
    expect([bar.bosses, bar.hp, bar.maxHp]).toEqual([1, 20, 20]);
    w.bosses.damagePart(w.bosses.slots[2].parts[0].global, 1000, 0);
    run(w, 1);
    expect([bar.bosses, bar.hp, bar.maxHp]).toEqual([1, 0, 20]);
    run(w, BOSS_CHAIN_TICKS + BOSS_BLAST_HIT_STOP_TICKS);
    expect([bar.bosses, bar.hp, bar.maxHp]).toEqual([2, 13, 16]);
  });
});

describe('core/bosses — boss inside a boss (M2-09 edges)', () => {
  it('reveals nothing when no slot is free: the outer then ends the encounter', () => {
    const w = world();
    const events: string[] = [];
    w.bosses.startBoss(index('outer'));
    for (let i = 1; i < MAX_BOSSES; i++) w.bosses.startBoss(index('cap'));
    run(w, 1);
    w.bosses.damagePart(1, 1000, 0);
    const outer = w.bosses.boss;
    expect(outer.state).toBe(BossState.Dying);
    run(w, BOSS_CLEAR_TICKS + BOSS_BLAST_HIT_STOP_TICKS, events);
    expect(outer.state).toBe(BossState.Dead);
    expect(w.bosses.slots.slice(1).map((b) => b.specIndex)).toEqual([
      index('cap'),
      index('cap'),
      index('cap'),
    ]);
    expect(w.bosses.slots.some((b) => b.specIndex === index('inner'))).toBe(false);
    expect(events).toContain(ev(SimEventKind.Music, MUSIC_CUES.StageClear, 0));
    expect(w.status).toBe('stageClear');
  });
});

describe('core/bosses — timers (M2-09 edges)', () => {
  it('counts fight ticks only: an intro never runs the clock', () => {
    const w = world();
    w.bosses.startBoss(index('timed-intro'));
    const boss = w.bosses.boss;
    run(w, 50);
    expect([boss.state, boss.fightTicks]).toEqual([BossState.Fight, 0]);
    run(w, 59);
    expect(boss.state).toBe(BossState.Fight);
    run(w, 1);
    expect(boss.state).toBe(BossState.Escape);
  });

  it('keeps an escaping boss out of the grid and untouchable, but drawn and in the HP bar', () => {
    const w = world();
    w.bosses.startBoss(index('timed'));
    const boss = w.bosses.boss;
    const hub = boss.parts[0];
    w.bosses.damagePart(0, 5, 0);
    run(w, 60);
    expect(boss.state).toBe(BossState.Escape);
    expect([boss.motion, boss.moveToX, boss.moveToY]).toEqual([
      BossMotion.MoveTo,
      PLAYFIELD_W + BOSS_ENTRY_MARGIN + 6,
      100,
    ]);
    const { grid, boxes } = recordingGrid();
    w.bosses.insertColliders(grid);
    expect(boxes).toEqual([]);
    expect(w.bosses.isArmoured(0)).toBe(false);
    expect(w.bosses.damagePart(0, 1, 0)).toBe(BossHit.None);
    // A ship right on the core is not touched.
    w.debugFlags.godMode = false;
    const ship = w.players[0];
    ship.invulnTicks = 0;
    ship.x = hub.x;
    ship.y = hub.y;
    w.bosses.collidePlayers();
    expect(ship.hitTick).not.toBe(w.tick);
    w.debugFlags.godMode = true;
    run(w, 1);
    expect(w.bosses.batch.count).toBe(1);
    expect([w.bosses.hpBar.visible, w.bosses.hpBar.hp]).toEqual([true, 15]);
    expect(w.bosses.active).toBe(true);
    expect(w.bosses.mainActive).toBe(true);
  });

  it('hashes the ending flags', () => {
    const a = world();
    const b = world();
    expect(hashWorld(a)).toBe(hashWorld(b));
    b.endingFlags = EndingFlag.BossEscaped;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});

describe('core/bosses — boss rush (M2-09 edges)', () => {
  it('brings an entry with the WARNING when it says so, and counts its delay past captains', () => {
    const w = world('rush');
    const bosses = w.bosses;
    bosses.startBoss(index('cap'));
    run(w, 5);
    expect(bosses.rushDelay).toBe(0);
    run(w, 1);
    const boss = bosses.slots[1];
    expect([boss.state, boss.rushEntry, bosses.rushDelay]).toEqual([BossState.Warning, 0, -1]);
    expect([w.status, bosses.warning.active]).toEqual(['bossWarning', true]);
    // The WARNING blocks the next entry's clock like the fight will.
    run(w, WARNING_TICKS);
    expect(boss.state).toBe(BossState.Fight);
    expect([bosses.rushIndex, bosses.rushDelay]).toEqual([0, -1]);
  });

  it('waits for a stage boss to end, then the next delay; the jingle only after the last', () => {
    const w = world('rush');
    const bosses = w.bosses;
    const events: string[] = [];
    run(w, 6 + WARNING_TICKS, events);
    const first = bosses.boss;
    expect([first.specIndex, first.state]).toEqual([index('plain'), BossState.Fight]);
    bosses.damagePart(0, 1000, 0);
    run(w, BOSS_CLEAR_TICKS + BOSS_BLAST_HIT_STOP_TICKS - 1, events);
    expect([first.state, bosses.rushIndex, bosses.rushDelay]).toEqual([BossState.Dying, 0, -1]);
    run(w, 1, events);
    // Its end sets the next delay (10), which counts from the same tick (the rush clock runs
    // after the slots).
    expect([first.state, bosses.rushIndex, bosses.rushDelay]).toEqual([BossState.Dead, 1, 9]);
    const jingle = ev(SimEventKind.Music, MUSIC_CUES.StageClear, 0);
    expect(events).not.toContain(jingle);
    expect(w.status).toBe('playing');
    run(w, 9, events);
    expect([bosses.boss.state, bosses.rushDelay]).toEqual([BossState.Dead, 0]);
    run(w, 1, events);
    expect([bosses.boss.specIndex, bosses.boss.state, bosses.boss.rushEntry]).toEqual([
      index('plain-two'),
      BossState.Fight,
      1,
    ]);
    bosses.damagePart(0, 1000, 0);
    run(w, BOSS_CLEAR_TICKS + BOSS_BLAST_HIT_STOP_TICKS, events);
    expect(events.filter((e) => e === jingle)).toHaveLength(1);
    expect([w.status, bosses.rushIndex, bosses.rushDelay]).toEqual(['stageClear', 2, -1]);
  });

  it('skips an entry that cannot start (content that was never validated)', () => {
    const rushStage = DB.stages.find((s) => s.id === 'rush');
    if (rushStage === undefined) throw new Error('no rush stage');
    const broken: ContentDb = {
      ...DB,
      stages: DB.stages.map((s) =>
        s === rushStage
          ? {
              ...s,
              rush: [
                { enemy: 'drone', enemyId: index('drone'), delay: 0, warning: false },
                rushStage.rush[1],
              ],
            }
          : s,
      ),
    };
    const w = world('rush', {}, broken);
    run(w, 1);
    expect([w.bosses.rushIndex, w.bosses.rushDelay, w.bosses.boss.state]).toEqual([
      1,
      10,
      BossState.None,
    ]);
    run(w, 11);
    expect(w.bosses.boss.specIndex).toBe(index('plain-two'));
  });

  it('brings the later entry again after a checkpoint restart during it', () => {
    const w = world('rush');
    run(w, 6 + WARNING_TICKS);
    w.bosses.damagePart(0, 1000, 0);
    run(w, BOSS_CLEAR_TICKS + BOSS_BLAST_HIT_STOP_TICKS + 11);
    expect(w.bosses.boss.specIndex).toBe(index('plain-two'));
    w.stage?.restartAt(0);
    expect([w.bosses.boss.state, w.bosses.rushIndex, w.bosses.rushDelay]).toEqual([
      BossState.None,
      1,
      10,
    ]);
    run(w, 11);
    expect([w.bosses.boss.specIndex, w.bosses.boss.state]).toEqual([
      index('plain-two'),
      BossState.Fight,
    ]);
  });
});

describe('core/bosses — drawing (M2-09 edges)', () => {
  it('blinks the dying boss’s standing parts every 4 ticks until the blast', () => {
    const w = world();
    w.bosses.startBoss(index('plain'));
    const boss: Boss = w.bosses.boss;
    run(w, 1);
    w.bosses.defeat(0);
    const flags: number[] = [];
    for (let t = 0; t < 12; t++) {
      run(w, 1);
      // The core is gone; the fin is drawn.
      expect(w.bosses.batch.count).toBe(1);
      flags.push(w.bosses.batch.flags[0] & SpriteFlag.Flash ? 1 : 0);
    }
    expect(flags).toEqual([0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1]);
    run(w, BOSS_CHAIN_TICKS);
    expect(boss.blasted).toBe(true);
    expect(w.bosses.batch.count).toBe(0);
  });
});
