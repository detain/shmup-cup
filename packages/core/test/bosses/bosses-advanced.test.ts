/**
 * The advanced bosses of plan M2-09 (acceptance): **rotation transforms** (turned parts: binary
 * angles, spins, children placed by their parent's world angle, heading frames, circle hurtboxes
 * hit by shots and ships), **raid camera paths** (a world-anchored battleship, boss-relative camera
 * segments followed by the stage runner, the return when it dies), the **nested boss spawn** (the
 * inner boss revealed by the outer's final blast), the **enrage rule** of a double boss (turns,
 * the resting half out of play, the survivor's faster fire, motion and phase), the **timer
 * escape** (flight off screen, the ending flag, the stage clear without a tally), the **HP bar
 * model** (cores and the parts they require, the intro fill, main bosses before captains),
 * captains (mid-bosses that ride the scroll and clear nothing) and boss rushes. Test behaviours
 * sleep, so nothing but the test and the mechanic under test moves a boss.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createBossBehaviorRegistry, defineBossBehavior } from '../../src/behaviors/index.js';
import {
  BOSS_BLAST_HIT_STOP_TICKS,
  BOSS_CLEAR_TICKS,
  BOSS_CHAIN_TICKS,
  BOSS_ESCAPE_TICKS,
  BOSS_PART_ID_BASE,
  BOSS_REST_X,
  BOSS_TURN_TICKS,
  BossHit,
  BossMotion,
  BossRole,
  BossState,
  CAPTAIN_CLEAR_TICKS,
  EndingFlag,
  MAX_BOSSES,
  RAID_RETURN_TICKS,
  WARNING_TICKS,
  turnedFrame,
  type BossScriptApi,
} from '../../src/bosses/index.js';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { MUSIC_CUES, SimEventKind } from '../../src/events/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { cosB, sinB } from '../../src/math/index.js';
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

/** The test bosses (see the module docs). */
const BOSSES = [
  {
    // Rotation: a spinning hub, an arm on it, a turret on the arm (heading frames).
    id: 'spinner',
    boss: {
      code: 'SP-01',
      displayName: 'SPINNER',
      introTicks: 0,
      x: 200,
      y: 100,
      parts: [
        { ...core({ name: 'hub', spin: 4 }) },
        { name: 'arm', parent: 'hub', x: 20, hp: 3, radius: 4, sprite: 'bosses/orb', score: 10 },
        {
          name: 'tip',
          parent: 'arm',
          x: 10,
          angle: 256,
          hp: 3,
          radius: 3,
          turn: 16,
          gun: true,
          sprite: 'bosses/turret',
        },
        { name: 'box', parent: 'hub', y: -30, hp: 3, hurtbox: { hw: 4, hh: 4 } },
      ],
      phases: [{ script: 'test.sleep' }],
    },
  },
  {
    // A raid: anchored in the world, the camera follows two boss-relative segments.
    id: 'raid',
    boss: {
      code: 'RD-01',
      displayName: 'RAIDER',
      introTicks: 20,
      x: 100,
      y: 100,
      raid: {
        segments: [
          { x: -50, y: -100, ticks: 10, hold: 5 },
          { x: 50, y: -60, ticks: 20 },
        ],
        loop: false,
      },
      parts: [{ name: 'keel', sprite: 'bosses/raid-hull' }, core({ parent: 'keel', x: 200 })],
      phases: [{ script: 'test.sleep' }],
    },
  },
  {
    // A boss inside a boss.
    id: 'outer',
    boss: {
      code: 'OU-01',
      displayName: 'OUTER SHELL',
      introTicks: 0,
      score: 1000,
      x: 280,
      y: 90,
      inner: 'inner',
      parts: [{ name: 'hull', hurtbox: { hw: 8, hh: 8 }, vulnerable: 'never' }, core({ x: -20 })],
      phases: [{ script: 'test.sleep' }],
    },
  },
  {
    id: 'inner',
    boss: {
      code: 'IN-02',
      displayName: 'INNER CORE',
      introTicks: 40,
      score: 2000,
      x: 300,
      y: 120,
      parts: [core()],
      phases: [{ script: 'test.sleep' }],
    },
  },
  {
    // A double boss: turns every 200 ticks, the survivor enrages into its second phase.
    id: 'lead',
    boss: {
      code: 'LD-01',
      displayName: 'LEAD TWIN',
      introTicks: 10,
      score: 500,
      x: 290,
      y: 60,
      partner: 'mate',
      alternate: 200,
      enrage: { fireRate: 0.5, speed: 2, phase: 1 },
      parts: [core()],
      phases: [{ script: 'test.track', until: { ticks: 36000 } }, { script: 'test.phase2' }],
    },
  },
  {
    id: 'mate',
    boss: {
      code: 'MT-02',
      displayName: 'MATE TWIN',
      introTicks: 10,
      score: 500,
      x: 290,
      y: 140,
      enrage: { fireRate: 0.5, speed: 2, phase: 1 },
      parts: [core()],
      phases: [{ script: 'test.track', until: { ticks: 36000 } }, { script: 'test.phase2' }],
    },
  },
  {
    // A time limit.
    id: 'timed',
    boss: {
      code: 'TM-01',
      displayName: 'TIMED',
      introTicks: 0,
      score: 900,
      x: 300,
      y: 100,
      timeLimit: 120,
      parts: [core()],
      phases: [{ script: 'test.sleep' }],
    },
  },
  {
    // A captain.
    id: 'cap',
    boss: {
      code: 'CP-09',
      displayName: 'CAPTAIN',
      role: 'captain',
      introTicks: 10,
      score: 300,
      x: 320,
      y: 50,
      parts: [
        core({ hp: 8 }),
        { name: 'plate', parent: 'core', x: -10, hp: 4, hurtbox: { hw: 3, hh: 6 } },
      ],
      phases: [{ script: 'test.sleep' }],
    },
  },
  {
    // The HP bar: a core behind a plate behind a shield (the bar counts all three).
    id: 'barred',
    boss: {
      code: 'BR-01',
      displayName: 'BARRED',
      introTicks: 40,
      x: 300,
      y: 100,
      parts: [
        { name: 'hull', hurtbox: { hw: 8, hh: 8 }, vulnerable: 'never' },
        core({ hp: 20, vulnerable: 'afterParts', requires: ['plate'] }),
        {
          name: 'plate',
          hp: 10,
          hurtbox: { hw: 3, hh: 6 },
          vulnerable: 'afterParts',
          requires: ['shield'],
        },
        { name: 'shield', hp: 6, hurtbox: { hw: 3, hh: 6 } },
        { name: 'gun', hp: 50, hurtbox: { hw: 3, hh: 3 } },
      ],
      phases: [{ script: 'test.sleep' }],
    },
  },
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

/**
 * The KESTREL, Type A, the test bosses and the stages `arena` (no event), `raid` (the raid's
 * WARNING at 10), `rush` (a boss rush: `timed`, then `outer`).
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      {
        path: 'enemies/t.enemies.json',
        data: { formatVersion: 1, kind: 'enemies', enemies: BOSSES },
      },
      stage('arena', []),
      stage('raid', [{ x: 10, type: 'warning', enemy: 'raid' }]),
      stage('rush', [], {
        type: 'bossRush',
        rush: [
          { enemy: 'timed', delay: 30 },
          { enemy: 'cap-less', delay: 5 },
        ],
      }),
    ].map((file) => fixRush(file)),
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

/**
 * The rush stage names `outer` second (a placeholder id keeps the list readable above).
 *
 * @param file - A file.
 * @returns The same file, the rush fixed.
 */
function fixRush(file: ContentFile): ContentFile {
  const data = file.data as { rush?: Array<{ enemy: string }> };
  if (data.rush !== undefined) data.rush[1].enemy = 'outer';
  return file;
}

/** The shared DB (read-only). */
const DB = db();

/** What the test behaviours saw: `<id>@<tick>` starts and `fireWait(60)` answers. */
const log: string[] = [];

/** The test behaviours: sleep; track (and log `fireWait(60)`); a second phase that logs. */
const BEHAVIORS = createBossBehaviorRegistry([
  defineBossBehavior('test.sleep', {}, function* sleep(): Script {
    yield SLEEP_FOREVER;
  }),
  defineBossBehavior('test.track', {}, function* track(api: BossScriptApi): Script {
    api.track(1, 0, 200);
    log.push('track@' + String(api.tick) + ' wait=' + String(api.fireWait(60)));
    yield SLEEP_FOREVER;
  }),
  defineBossBehavior('test.phase2', {}, function* phase2(api: BossScriptApi): Script {
    log.push('phase2@' + String(api.tick) + ' wait=' + String(api.fireWait(60)));
    api.track(1, 0, 200);
    yield SLEEP_FOREVER;
  }),
]);

/**
 * A world on a test stage, player 1 alive and harmless (no autofire), god mode on.
 *
 * @param stageId - Stage.
 * @param over - Config overrides.
 * @returns The world.
 */
function world(stageId = 'arena', over: Partial<GameConfig> = {}): World {
  const w = createWorld(
    resolveGameConfig({ stage: stageId, seed: 3, autofire: false, remoteMode: false, ...over }),
    DB,
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
 * The enemy index of a test boss.
 *
 * @param id - Its id.
 * @returns The index.
 */
function index(id: string): number {
  const i = DB.enemyIndex.get(id);
  if (i === undefined) throw new Error('no ' + id);
  return i;
}

describe('core/bosses — rotation transforms (M2-09)', () => {
  it('places children by their parent’s world angle, spins, and picks heading frames', () => {
    const w = world();
    expect(w.bosses.startBoss(index('spinner'))).toBe(true);
    const boss = w.bosses.boss;
    expect(boss.state).toBe(BossState.Fight);
    const [hub, arm, tip, box] = boss.parts;
    // Tick 0 of the fight: every angle 0 but the tip's own quarter turn.
    run(w, 1);
    // The hub spins 4 units a tick (spun once before placing).
    expect(hub.angle).toBe(4);
    for (let t = 0; t < 30; t++) {
      const a = hub.angle;
      // The arm sits 20 px along the hub's heading; the tip 10 px along the arm's (the arm has no
      // turn of its own, so it inherits the hub's).
      expect(arm.x).toBeCloseTo(hub.x + 20 * cosB(a), 9);
      expect(arm.y).toBeCloseTo(hub.y + 20 * sinB(a), 9);
      expect(arm.worldAngle).toBe(a);
      expect(tip.x).toBeCloseTo(arm.x + 10 * cosB(a), 9);
      expect(tip.y).toBeCloseTo(arm.y + 10 * sinB(a), 9);
      // The tip's own quarter turn rotates only what hangs on it — and its heading frame.
      expect(tip.worldAngle).toBe((a + 256) % 1024);
      expect(tip.frame).toBe(turnedFrame(tip.worldAngle, 16));
      // A box part keeps its box but its offset turns with the hub.
      expect(box.x).toBeCloseTo(hub.x + 30 * sinB(a), 9);
      expect(box.y).toBeCloseTo(hub.y - 30 * cosB(a), 9);
      run(w, 1);
    }
    expect(hub.angle).toBe(4 * 31);
  });

  it('names the heading frame nearest an angle', () => {
    expect(turnedFrame(0, 16)).toBe(0);
    expect(turnedFrame(256, 16)).toBe(4);
    expect(turnedFrame(31, 16)).toBe(0);
    expect(turnedFrame(32, 16)).toBe(1);
    expect(turnedFrame(1000, 16)).toBe(0);
    expect(turnedFrame(512, 1)).toBe(0);
  });

  it('hits a circle part by its circle: shots in the box corner miss, the ship’s touch counts', () => {
    const w = world();
    w.bosses.startBoss(index('spinner'));
    const boss = w.bosses.boss;
    const hub = boss.parts[0];
    hub.spin = 0;
    hub.angle = 0;
    run(w, 1);
    // A shot box at the circle's corner (inside the 6-px square, outside the radius): no hit.
    const shots = w.weapons.pool;
    const s = shots.alloc();
    const f = shots.fields;
    f.x[s] = hub.x + 5.5;
    f.y[s] = hub.y + 5.5;
    f.hw[s] = 0.5;
    f.hh[s] = 0.5;
    f.vx[s] = 0;
    f.vy[s] = 0;
    f.damage[s] = 1;
    f.table[s] = 0;
    f.flags[s] = 0;
    f.kind[s] = 0;
    f.shooter[s] = 0;
    w.grid.begin(Math.floor(w.camera.x) - 64, Math.floor(w.camera.y) - 64);
    w.bosses.insertColliders(w.grid);
    w.grid.build();
    w.weapons.collide(w.grid);
    expect(w.weapons.hitCount).toBe(0);
    // At the circle's edge along x: a hit on the hub (part slot 0).
    f.x[s] = hub.x + 6.4;
    f.y[s] = hub.y;
    w.weapons.collide(w.grid);
    expect(w.weapons.hitCount).toBe(1);
    expect(w.weapons.hitEnemy[0]).toBe(BOSS_PART_ID_BASE + 0);
    // The ship touching the circle is contact; just outside it is not.
    const ship = w.players[0];
    w.debugFlags.godMode = false;
    ship.state = 'alive';
    ship.invulnTicks = 0;
    ship.x = hub.x + 6 + w.ship.hurtRadius + 0.5;
    ship.y = hub.y;
    w.bosses.collidePlayers();
    expect(ship.hitTick).not.toBe(w.tick);
    ship.x = hub.x + 6 + w.ship.hurtRadius - 0.5;
    w.bosses.collidePlayers();
    expect(ship.hitTick).toBe(w.tick);
  });
});

describe('core/bosses — raids (M2-09)', () => {
  it('anchors the raid where it entered and makes the camera follow its segments', () => {
    const w = world('raid');
    const runner = w.stage;
    if (runner === null) throw new Error('no stage');
    const boss = w.bosses.boss;
    // The WARNING (at x 10), then the intro (20 ticks) — the camera stopped where it entered.
    untilState(w, BossState.Warning);
    run(w, WARNING_TICKS - 1);
    expect(boss.state).toBe(BossState.Warning);
    run(w, 1);
    expect(boss.state).toBe(BossState.Intro);
    expect(boss.anchored).toBe(true);
    const anchorX = boss.anchorX;
    expect(anchorX).toBe(w.camera.x);
    expect(runner.locked).toBe(true);
    // The fight starts after the 20-tick intro; the camera's first segment tick is that one.
    run(w, 19);
    expect(boss.state).toBe(BossState.Intro);
    run(w, 1);
    expect(boss.state).toBe(BossState.Fight);
    expect(boss.raiding).toBe(true);
    expect(boss.raidTicks).toBe(1);
    expect(runner.following).toBe(w.bosses.raidCamera);
    // The origin stays at its world point while the camera moves.
    const originX = anchorX + 100;
    expect(boss.x).toBe(originX);
    // Segment 0: from the start offset (≈ −100, −100) to (−50, −100) over 10 ticks, eased.
    run(w, 4);
    const early = w.camera.x - boss.x;
    expect(early).toBeGreaterThan(-100);
    expect(early).toBeLessThan(-50);
    run(w, 5);
    expect(w.camera.x - boss.x).toBeCloseTo(-50, 9);
    expect(w.camera.y - boss.y).toBeCloseTo(-100, 9);
    expect(boss.x).toBe(originX);
    // Held 5 ticks, then segment 1 to (50, −60) over 20.
    run(w, 5);
    expect(w.camera.x - boss.x).toBeCloseTo(-50, 9);
    run(w, 10);
    const mid = w.camera.x - boss.x;
    expect(mid).toBeGreaterThan(-50);
    expect(mid).toBeLessThan(50);
    run(w, 10);
    expect(w.camera.x - boss.x).toBeCloseTo(50, 9);
    expect(w.camera.y - boss.y).toBeCloseTo(-60, 9);
    // No loop: it stays at the last offset.
    run(w, 60);
    expect(w.camera.x - boss.x).toBeCloseTo(50, 9);
    // The ship rides the camera (dx / dy recorded).
    expect(w.camera.dx).toBeCloseTo(0, 9);
  });

  it('eases the camera back when the raid dies, then releases it', () => {
    const w = world('raid');
    const runner = w.stage;
    if (runner === null) throw new Error('no stage');
    const boss = w.bosses.boss;
    untilState(w, BossState.Fight);
    const home = { x: boss.raidHomeX, y: boss.raidHomeY };
    run(w, 40);
    expect(w.camera.x).not.toBe(home.x);
    expect(w.bosses.defeat(0)).toBe(true);
    expect(boss.returning).toBe(true);
    run(w, RAID_RETURN_TICKS);
    expect(w.camera.x).toBeCloseTo(home.x, 9);
    expect(w.camera.y).toBeCloseTo(home.y, 9);
    expect(runner.following).toBe(w.bosses.raidCamera);
    // Home: the tick after (the blast's hit-stop first), the stage has the camera again; the
    // lock holds until the death sequence ends.
    run(w, 1 + BOSS_BLAST_HIT_STOP_TICKS);
    expect(runner.following).toBeNull();
    expect(boss.returning).toBe(false);
    expect(runner.locked).toBe(true);
    expect(w.camera.x).toBeCloseTo(home.x, 9);
    run(w, BOSS_CLEAR_TICKS - RAID_RETURN_TICKS + 10);
    expect(boss.state).toBe(BossState.Dead);
    expect(w.status).toBe('stageClear');
    expect(runner.locked).toBe(false);
  });

  it('steers the free-flight camera by its velocity', () => {
    const w = world('arena', { stage: null });
    w.bosses.startBoss(index('raid'));
    untilState(w, BossState.Fight);
    expect(w.bosses.boss.raiding).toBe(true);
    run(w, 12);
    expect(w.camera.x - w.bosses.boss.x).toBeCloseTo(-50, 9);
    w.bosses.clear();
    expect([w.camera.vx, w.camera.vy]).toEqual([0, 0]);
  });
});

describe('core/bosses — boss inside a boss (M2-09)', () => {
  it('reveals the inner boss at the outer’s blast, from its core, and clears after it', () => {
    const w = world();
    const events: string[] = [];
    w.bosses.startBoss(index('outer'));
    const outer = w.bosses.slots[0];
    const inner = w.bosses.slots[1];
    run(w, 5, events);
    const coreX = outer.parts[1].x - w.camera.x;
    w.bosses.defeat(0);
    run(w, BOSS_CHAIN_TICKS - 1, events);
    expect(inner.state).toBe(BossState.None);
    run(w, 1, events);
    // The blast: the inner boss enters in slot 1, from where the core was (on screen — the outer
    // rides the camera, so the core kept its screen position).
    expect(outer.blasted).toBe(true);
    expect(inner.state).toBe(BossState.Intro);
    expect(inner.specIndex).toBe(index('inner'));
    expect(inner.startX).toBeCloseTo(coreX, 6);
    expect(inner.screenX).toBeCloseTo(inner.startX, 6);
    // The outer's tally pays, but no stage-clear jingle and no stage clear.
    run(w, BOSS_CLEAR_TICKS - BOSS_CHAIN_TICKS + 10, events);
    expect(outer.state).toBe(BossState.Dead);
    expect(events).toContain(
      String(SimEventKind.BossDefeated) + ':' + String(index('outer')) + ':1000',
    );
    expect(events).not.toContain(
      String(SimEventKind.Music) + ':' + String(MUSIC_CUES.StageClear) + ':0',
    );
    expect(w.status).toBe('playing');
    // The inner fights (its 40-tick intro, counted from the tick after the blast), then dies.
    expect(inner.state).toBe(BossState.Fight);
    w.bosses.defeat(0);
    run(w, BOSS_CLEAR_TICKS + 10, events);
    expect(inner.state).toBe(BossState.Dead);
    expect(w.status).toBe('stageClear');
    expect(events).toContain(
      String(SimEventKind.Music) + ':' + String(MUSIC_CUES.StageClear) + ':0',
    );
  });
});

describe('core/bosses — double bosses and the enrage rule (M2-09)', () => {
  it('brings the partner in, alternates turns, keeps the resting half out of play', () => {
    const w = world();
    log.length = 0;
    expect(w.bosses.startBoss(index('lead'))).toBe(true);
    const [lead, mate] = w.bosses.slots;
    expect(mate.specIndex).toBe(index('mate'));
    expect([lead.partner, mate.partner]).toEqual([1, 0]);
    expect([lead.leader, mate.leader]).toEqual([true, false]);
    untilState(w, BossState.Fight);
    // Both fought from the same tick; the mate withdraws to rest.
    expect([lead.state, mate.state]).toEqual([BossState.Fight, BossState.Fight]);
    expect([lead.resting, mate.resting]).toEqual([false, true]);
    run(w, BOSS_TURN_TICKS - 1);
    expect(mate.screenX).toBeCloseTo(BOSS_REST_X, 9);
    expect(mate.turning).toBe(false);
    // Drawn behind; not hit, not touched, not scripted.
    expect(w.bosses.backBatch.count).toBe(1);
    expect(w.bosses.batch.count).toBe(1);
    expect(w.bosses.damagePart(mate.parts[0].global, 1, 0)).toBe(BossHit.None);
    expect(mate.parts[0].target).toBe(false);
    // The turn 200 fight ticks in: the lead withdraws, the mate comes forward.
    run(w, 200 - BOSS_TURN_TICKS);
    expect([lead.resting, mate.resting]).toEqual([false, true]);
    run(w, 1);
    expect([lead.resting, mate.resting]).toEqual([true, false]);
    run(w, BOSS_TURN_TICKS - 1);
    expect(mate.screenX).toBeCloseTo(290, 9);
    // Home: its script runs for the first time (it rested since the fight began) and tracks.
    expect(log.filter((l) => l.startsWith('track@'))).toHaveLength(1);
    run(w, 1);
    expect(log.filter((l) => l.startsWith('track@'))).toHaveLength(2);
    expect(mate.motion).toBe(BossMotion.Track);
    // The lead, now resting, keeps its tracking for the way back.
    run(w, 200 - BOSS_TURN_TICKS);
    expect([lead.resting, mate.resting]).toEqual([false, true]);
    run(w, BOSS_TURN_TICKS);
    expect(lead.motion).toBe(BossMotion.Track);
  });

  it('enrages the survivor: forward for good, faster fire and motion, its enrage phase', () => {
    const w = world();
    log.length = 0;
    w.bosses.startBoss(index('lead'));
    const [lead, mate] = w.bosses.slots;
    untilState(w, BossState.Fight);
    run(w, BOSS_TURN_TICKS);
    expect(mate.resting).toBe(true);
    // The lead dies (its core destroyed): the mate enrages.
    const hit = w.bosses.damagePart(lead.parts[0].global, 1000, 0);
    expect(hit).toBe(BossHit.Destroyed);
    expect(lead.state).toBe(BossState.Dying);
    expect(mate.enraged).toBe(true);
    expect(mate.resting).toBe(false);
    // Its enrage phase (1) at once; its script waits until it is back home.
    expect(mate.phase).toBe(1);
    expect(mate.turning).toBe(true);
    run(w, BOSS_TURN_TICKS);
    expect(mate.turning).toBe(false);
    expect(log.filter((l) => l.startsWith('phase2'))).toEqual([]);
    run(w, 1);
    // The enraged script: the halved fire interval.
    expect(log.filter((l) => l.startsWith('phase2'))).toEqual([
      'phase2@' + String(w.tick - 1) + ' wait=30',
    ]);
    // Tracking at 1 px/tick × 2.
    run(w, 1);
    const ship = w.players[0];
    ship.y = w.camera.y + 190;
    const before = mate.screenY;
    run(w, 1);
    expect(mate.screenY - before).toBeCloseTo(2, 9);
    // No more turns; the stage clears only after the survivor too.
    run(w, 200);
    expect(mate.resting).toBe(false);
    expect(lead.state).toBe(BossState.Dead);
    expect(w.status).toBe('playing');
    w.bosses.defeat(0);
    run(w, BOSS_CLEAR_TICKS + 10);
    expect(w.status).toBe('stageClear');
  });
});

describe('core/bosses — timers and escapes (M2-09)', () => {
  it('escapes when its time runs out: flies off, no tally, the ending flag, the stage clear', () => {
    const w = world();
    const events: string[] = [];
    w.bosses.startBoss(index('timed'));
    const boss = w.bosses.boss;
    run(w, 119, events);
    expect(boss.state).toBe(BossState.Fight);
    run(w, 1, events);
    expect(boss.state).toBe(BossState.Escape);
    expect(boss.parts[0].target).toBe(false);
    expect(w.bosses.damagePart(0, 1, 0)).toBe(BossHit.None);
    expect(events).toContain(String(SimEventKind.Music) + ':' + String(MUSIC_CUES.Silence) + ':60');
    run(w, BOSS_ESCAPE_TICKS - 1, events);
    // Gone off the right edge.
    expect(boss.screenX).toBeCloseTo(boss.startX, 9);
    expect(boss.state).toBe(BossState.Escape);
    run(w, 1, events);
    expect(boss.state).toBe(BossState.Dead);
    expect(boss.escaped).toBe(true);
    expect(w.endingFlags & EndingFlag.BossEscaped).toBe(EndingFlag.BossEscaped);
    expect(events).toContain(
      String(SimEventKind.BossEscaped) + ':' + String(index('timed')) + ':0',
    );
    expect(events.some((e) => e.startsWith(String(SimEventKind.BossDefeated) + ':'))).toBe(false);
    expect(w.scoring.board.scores[0].score).toBe(0);
    expect(w.status).toBe('stageClear');
  });

  it('does not escape once it is dying', () => {
    const w = world();
    w.bosses.startBoss(index('timed'));
    run(w, 100);
    w.bosses.defeat(0);
    run(w, BOSS_CLEAR_TICKS + 10);
    expect(w.bosses.boss.escaped).toBe(false);
    expect(w.endingFlags).toBe(0);
  });
});

describe('core/bosses — the HP bar model (M2-09)', () => {
  it('counts the cores and the parts they require, fills during the intro, empties at death', () => {
    const w = world();
    const bar = w.bosses.hpBar;
    expect(bar.visible).toBe(false);
    w.bosses.startBoss(index('barred'));
    run(w, 1);
    // Core 20 + plate 10 + shield 6 (the plate requires the shield); the gun does not count.
    expect(bar.visible).toBe(true);
    expect(bar.maxHp).toBe(36);
    expect(bar.hp).toBe(Math.floor((36 * 0) / 40));
    run(w, 20);
    expect(bar.hp).toBe(Math.floor((36 * 20) / 40));
    run(w, 20);
    expect(w.bosses.boss.state).toBe(BossState.Fight);
    expect(bar.hp).toBe(36);
    const boss = w.bosses.boss;
    w.bosses.damagePart(3, 4, 0); // shield 6 → 2
    w.bosses.damagePart(4, 10, 0); // the gun: not counted
    run(w, 1);
    expect(bar.hp).toBe(32);
    w.bosses.damagePart(3, 4, 0); // shield destroyed
    w.bosses.damagePart(2, 3, 0); // plate 10 → 7
    run(w, 1);
    expect(bar.hp).toBe(27);
    w.bosses.defeat(0);
    run(w, 1);
    expect(boss.state).toBe(BossState.Dying);
    expect([bar.visible, bar.hp]).toEqual([true, 0]);
    run(w, BOSS_CHAIN_TICKS);
    expect(bar.visible).toBe(false);
  });

  it('shows the main bosses before the captains', () => {
    const w = world();
    const bar = w.bosses.hpBar;
    w.bosses.startBoss(index('cap'));
    run(w, 11);
    expect([bar.visible, bar.bosses, bar.maxHp]).toEqual([true, 1, 8]);
    w.bosses.startBoss(index('timed'));
    run(w, 1);
    expect([bar.bosses, bar.maxHp]).toEqual([1, 20]);
  });
});

describe('core/bosses — captains (M2-09)', () => {
  it('rides the scroll beside a stage boss, keeps the music and clears nothing', () => {
    const w = world();
    const runner = w.stage;
    if (runner === null) throw new Error('no stage');
    const events: string[] = [];
    w.events.clear();
    expect(w.bosses.startWarning(index('cap'))).toBe(false);
    expect(w.bosses.startBoss(index('cap'))).toBe(true);
    const cap = w.bosses.slots[0];
    expect(cap.role).toBe(BossRole.Captain);
    run(w, 30, events);
    expect(runner.locked).toBe(false);
    expect(w.camera.dx).toBe(1);
    expect(events.some((e) => e.startsWith(String(SimEventKind.Music) + ':'))).toBe(false);
    expect(w.bosses.mainActive).toBe(false);
    // A stage boss can come meanwhile (another slot); a second one cannot.
    expect(w.bosses.startBoss(index('timed'))).toBe(true);
    expect(w.bosses.slots[1].state).toBe(BossState.Fight);
    expect(w.bosses.startBoss(index('outer'))).toBe(false);
    // The captain's short death: its tally, no jingle, no stage clear.
    w.bosses.damagePart(0, 100, 0);
    expect(cap.state).toBe(BossState.Dying);
    run(w, CAPTAIN_CLEAR_TICKS, events);
    expect(cap.state).toBe(BossState.Dead);
    expect(events).toContain(
      String(SimEventKind.BossDefeated) + ':' + String(index('cap')) + ':300',
    );
    expect(w.status).toBe('playing');
    expect(w.bosses.slots[1].state).toBe(BossState.Fight);
  });

  it('fills every slot, then refuses more', () => {
    const w = world();
    for (let i = 0; i < MAX_BOSSES; i++) expect(w.bosses.startBoss(index('cap'))).toBe(true);
    expect(w.bosses.startBoss(index('cap'))).toBe(false);
    expect(w.bosses.slots.map((b) => b.state)).toEqual([2, 2, 2, 2]);
    // Every slot's parts have their own hit ids.
    expect(w.bosses.slots[3].parts[0].slot).toBe(BOSS_PART_ID_BASE + 48);
  });
});

describe('core/bosses — boss rush (M2-09)', () => {
  it('brings the rush bosses one after another and clears after the last', () => {
    const w = world('rush');
    const bosses = w.bosses;
    expect([bosses.rushIndex, bosses.rushDelay]).toEqual([0, 30]);
    run(w, 30);
    expect(bosses.boss.state).toBe(BossState.None);
    run(w, 1);
    expect(bosses.boss.specIndex).toBe(index('timed'));
    expect(bosses.boss.rushEntry).toBe(0);
    // It escapes (its time limit): the next entry waits its delay; no stage clear.
    run(w, 120 + BOSS_ESCAPE_TICKS);
    expect(bosses.boss.escaped).toBe(true);
    expect([bosses.rushIndex, w.status]).toEqual([1, 'playing']);
    run(w, 6);
    expect(bosses.boss.specIndex).toBe(index('outer'));
    // The outer and its inner boss: the last entry — the stage clears after the inner.
    bosses.defeat(0);
    run(w, BOSS_CLEAR_TICKS + 50);
    bosses.defeat(0);
    run(w, BOSS_CLEAR_TICKS + 10);
    expect(w.status).toBe('stageClear');
    expect(bosses.rushIndex).toBe(2);
  });

  it('brings the current entry again after a checkpoint restart', () => {
    const w = world('rush');
    run(w, 31);
    expect(w.bosses.boss.state).toBe(BossState.Fight);
    w.stage?.restartAt(0);
    expect(w.bosses.boss.state).toBe(BossState.None);
    expect([w.bosses.rushIndex, w.bosses.rushDelay]).toEqual([0, 30]);
  });

  it('stays in lockstep through a rush', () => {
    const a = world('rush');
    const b = world('rush');
    for (let i = 0; i < 600; i++) {
      run(a, 1);
      run(b, 1);
      if (i % 50 === 0) expect(hashWorld(a)).toBe(hashWorld(b));
    }
  });
});
