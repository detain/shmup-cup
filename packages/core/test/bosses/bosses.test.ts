/**
 * The bosses of plan M1-13 (acceptance): part transforms (translation, parents first, riding the
 * camera), weak-point gating (armour, `afterParts`, `whenOpen`, the invulnerable intro), phase
 * transitions (destroyed-part mask, HP threshold, timer) swapping the running script, the WARNING
 * timeline (status, siren / flash pulses, dim, music stop, the scroll brake to a lock, then the
 * intro with the boss music), the death sequence's timing (bullet cancel, chain, final blast with
 * its hit-stop, tally, stage clear, unlock), the score award, the player shots' path into the
 * parts, contact, checkpoint clears and determinism. A probe boss runs sleeping test behaviours so
 * nothing but the test moves it; the roster's behaviours are covered in `bosses-behaviors.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BOSS_BEHAVIOR_IDS,
  createBossBehaviorRegistry,
  defineBossBehavior,
} from '../../src/behaviors/index.js';
import {
  BOSS_BLAST_HIT_STOP_TICKS,
  BOSS_CHAIN_INTERVAL,
  BOSS_CHAIN_TICKS,
  BOSS_CLEAR_TICKS,
  BOSS_MUSIC_FADE_TICKS,
  BOSS_PART_ID_BASE,
  BOSS_TALLY_TICKS,
  BossHit,
  BossState,
  EMPTY_BOSS_BEHAVIORS,
  MAX_HIT_TARGETS,
  WARNING_BRAKE_TICKS,
  WARNING_DIM_PERCENT,
  WARNING_MUSIC_FADE_TICKS,
  WARNING_PULSE_TICKS,
  WARNING_TICKS,
  formatWarningText,
  moduleInfo,
} from '../../src/bosses/index.js';
import { BulletKind } from '../../src/bullets/index.js';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import {
  MAX_BOSS_PARTS,
  loadContent,
  type ContentDb,
  type ContentFile,
} from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { MAX_ENEMIES } from '../../src/enemies/index.js';
import {
  FX_CUES,
  MUSIC_CUES,
  SFX_CUES,
  SfxPriority,
  SimEventKind,
} from '../../src/events/index.js';
import { FlashKind, ShakeMagnitude } from '../../src/fx/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { SLEEP_FOREVER, type Script } from '../../src/patterns/index.js';
import { LayerId, SpriteFlag } from '../../src/presentation/index.js';
import { WeaponRole } from '../../src/weapons/index.js';
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

/** Part indices of the probe boss. */
const P = { hull: 0, arm: 1, gun: 2, core: 3, plate: 4, mouth: 5 } as const;

/** The probe boss (see the module docs): three phases of sleeping test behaviours. */
const PROBE = {
  id: 'probe',
  boss: {
    code: 'PB-07',
    displayName: 'PROBE HULK',
    introTicks: 30,
    score: 7000,
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
      {
        name: 'core',
        parent: 'hull',
        x: -12,
        hp: 10,
        hurtbox: { hw: 5, hh: 5 },
        vulnerable: 'afterParts',
        requires: ['plate'],
        core: true,
        sprite: 'bosses/core',
        anim: { frames: 2, ticks: 12 },
        score: 1000,
        explosion: 'large',
      },
      {
        name: 'plate',
        parent: 'hull',
        x: -24,
        hp: 4,
        hurtbox: { hw: 3, hh: 8 },
        sprite: 'bosses/shield-plate',
        score: 300,
      },
      {
        name: 'mouth',
        parent: 'hull',
        x: 14,
        hp: 3,
        hurtbox: { hw: 3, hh: 3 },
        vulnerable: 'whenOpen',
      },
    ],
    phases: [
      { script: 'test.a', until: { partsDestroyed: ['plate'] } },
      { script: 'test.b', until: { hpBelow: 5 } },
      { script: 'test.c' },
    ],
  },
};

/**
 * An open stage scrolling at 1 px/tick with the probe's WARNING at x 100.
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
      checkpoints: [{ x: 0 }, { x: 50 }],
      parallax: [],
      tilemap: null,
      events,
    },
  };
}

/**
 * The KESTREL, Type A, the probe boss, a regular enemy and the stages `arena` (WARNING at 100),
 * `direct` (a `boss` event at 10) and `twice` (two WARNINGs).
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
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [
            PROBE,
            {
              id: 'grunt',
              hp: 1000,
              score: 100,
              hurtbox: { hw: 4, hh: 4 },
              script: 'test.none',
              sprite: 'enemies/drifter',
              drop: null,
            },
          ],
        },
      },
      stage('arena', [
        { x: 100, type: 'warning', enemy: 'probe' },
        { x: 5000, type: 'end' },
      ]),
      stage('direct', [{ x: 10, type: 'boss', enemy: 'probe' }]),
      stage('twice', [
        { x: 10, type: 'warning', enemy: 'probe' },
        { x: 20, type: 'boss', enemy: 'probe' },
      ]),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

/** The shared DB (read-only). */
const DB = db();

/** Behaviour starts: `<id>@<tick>`. */
const started: string[] = [];

/**
 * A boss behaviour that logs its first wake and sleeps.
 *
 * @param id - Script id.
 * @returns The definition.
 */
const sleeper = (id: string): ReturnType<typeof defineBossBehavior> =>
  defineBossBehavior(id, {}, function* sleep(api): Script {
    started.push(id + '@' + String(api.tick));
    yield SLEEP_FOREVER;
  });

/** The test behaviours. */
const BEHAVIORS = createBossBehaviorRegistry([
  sleeper('test.a'),
  sleeper('test.b'),
  sleeper('test.c'),
]);

/**
 * A world on a test stage, player 1 alive and harmless (no autofire), god mode on, events
 * drained.
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

/** One recorded event. */
interface Recorded {
  /** Tick it was pushed in. */
  readonly tick: number;
  /** Kind. */
  readonly kind: number;
  /** Id. */
  readonly id: number;
  /** Param. */
  readonly param: number;
}

/**
 * Steps a world, recording every event with the tick it came from.
 *
 * @param w - The world.
 * @param ticks - Ticks.
 * @param out - Collector.
 */
function run(w: World, ticks: number, out: Recorded[] = []): Recorded[] {
  const input = createInputSnapshot();
  for (let i = 0; i < ticks; i++) {
    const tick = w.tick;
    stepWorld(w, input);
    w.events.drain((e) => out.push({ tick, kind: e.kind, id: e.id, param: e.param }));
  }
  return out;
}

/**
 * Steps until the boss reaches a state.
 *
 * @param w - The world.
 * @param state - The `BossState`.
 * @param limit - Safety limit.
 * @returns The index of the tick it happened in.
 */
function until(w: World, state: number, limit = 2000): number {
  const input = createInputSnapshot();
  for (let i = 0; i < limit; i++) {
    const tick = w.tick;
    stepWorld(w, input);
    w.events.clear();
    if (w.bosses.boss.state === state) return tick;
  }
  throw new Error('boss never reached state ' + String(state));
}

/**
 * A world whose probe boss fights (its first phase started), events drained.
 *
 * @returns The world.
 */
function fighting(): World {
  const w = world();
  until(w, BossState.Fight);
  return w;
}

describe('core/bosses', () => {
  it('describes itself (implemented since M2-09)', () => {
    expect(moduleInfo.name).toBe('bosses');
    expect(moduleInfo.status).toBe('implemented');
    expect(moduleInfo.specRefs).toContain('shmup_feat.md §13');
    expect(BOSS_PART_ID_BASE).toBe(MAX_ENEMIES);
    // Four boss slots of 16 parts each (M2-09).
    expect(MAX_HIT_TARGETS).toBe(MAX_ENEMIES + 4 * MAX_BOSS_PARTS);
  });

  it("builds the WARNING text from the game's own template (D10), once per boss", () => {
    const text = formatWarningText('PROBE HULK', 'PB-07');
    expect(text).toBe('WARNING!!\nGIANT HOSTILE "PROBE HULK"\nCLOSING IN - CODE PB-07');
    for (const line of text.split('\n')) expect(line.length * 6).toBeLessThanOrEqual(384);
    const w = world();
    const probe = DB.enemyIndex.get('probe') ?? -1;
    expect(w.bosses.isBoss(probe)).toBe(true);
    expect(w.bosses.isBoss(DB.enemyIndex.get('grunt') ?? -1)).toBe(false);
    expect(w.bosses.warningText(probe)).toBe(text);
    expect(w.bosses.warningText(probe)).toBe(w.bosses.warningText(probe));
    expect([w.bosses.warningText(-1), w.bosses.warningText(0.5)]).toEqual(['', '']);
    expect(w.view.warning).toBe(w.bosses.warning);
    expect(w.bosses.warning).toMatchObject({ active: false, ticks: 0, text: '' });
  });

  it('plays the WARNING: status, siren pulses, flashes, dim, music stop, brake to a lock', () => {
    const w = world();
    const events = run(w, 99);
    expect(w.bosses.boss.state).toBe(BossState.None);
    run(w, 1, events); // tick 99: the camera reaches x 100 → the warning event
    const t0 = 99;
    const boss = w.bosses.boss;
    expect(boss.state).toBe(BossState.Warning);
    expect(w.status).toBe('bossWarning');
    expect(w.bosses.warning).toMatchObject({ active: true, ticks: 0, duration: WARNING_TICKS });
    expect(w.bosses.warning.text).toBe(formatWarningText('PROBE HULK', 'PB-07'));
    run(w, WARNING_TICKS - 1, events);
    expect(boss.state).toBe(BossState.Warning);
    expect(w.bosses.warning.ticks).toBe(WARNING_TICKS - 1);
    expect(w.status).toBe('bossWarning');
    const at = (kind: number, id: number): number[] =>
      events.filter((e) => e.kind === kind && e.id === id).map((e) => e.tick);
    const pulses = [t0, t0 + WARNING_PULSE_TICKS, t0 + 2 * WARNING_PULSE_TICKS];
    expect(at(SimEventKind.Sfx, SFX_CUES.WarningSiren)).toEqual(pulses);
    expect(
      events
        .filter((e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.WarningSiren)
        .map((e) => e.param),
    ).toEqual([SfxPriority.Critical, SfxPriority.Critical, SfxPriority.Critical]);
    expect(at(SimEventKind.Flash, FlashKind.Warning)).toEqual(pulses);
    expect(events.filter((e) => e.kind === SimEventKind.Dim)).toEqual([
      { tick: t0, kind: SimEventKind.Dim, id: WARNING_DIM_PERCENT, param: WARNING_TICKS },
    ]);
    expect(events.filter((e) => e.kind === SimEventKind.Music && e.tick >= t0)).toEqual([
      {
        tick: t0,
        kind: SimEventKind.Music,
        id: MUSIC_CUES.Silence,
        param: WARNING_MUSIC_FADE_TICKS,
      },
    ]);
    // The brake: the scroll decelerates to 0 over a second and locks; the camera stays put.
    const stage = w.stage;
    expect(stage?.locked).toBe(true);
    expect(stage?.speed).toBe(0);
    expect(w.camera.x).toBeCloseTo(100 + WARNING_BRAKE_TICKS - (WARNING_BRAKE_TICKS + 1) / 2, 9);
    // Then the boss flies in: intro, boss music of the stage, WARNING over, status back.
    const entered = run(w, 1);
    expect(boss.state).toBe(BossState.Intro);
    expect(w.status).toBe('playing');
    expect(w.bosses.warning.active).toBe(false);
    expect(entered.filter((e) => e.kind === SimEventKind.Music)).toEqual([
      { tick: t0 + WARNING_TICKS, kind: SimEventKind.Music, id: MUSIC_CUES.FinalBoss, param: 0 },
    ]);
    // The intro lasts 30 ticks, then the first phase's script runs on the same tick.
    started.length = 0;
    const fight = until(w, BossState.Fight);
    expect(fight).toBe(t0 + WARNING_TICKS + 30);
    expect(started).toEqual(['test.a@' + String(fight)]);
    expect(stage?.locked).toBe(true);
  });

  it('flies the boss in from beyond the right edge, eased, and puts the parts after their parents', () => {
    const w = world();
    until(w, BossState.Intro);
    const boss = w.bosses.boss;
    // The plate's left edge (x −24 − 3 px) starts 8 px past the right edge of the view.
    expect(boss.screenX).toBe(384 + 8 + 27);
    const parts = boss.parts;
    expect(parts[P.plate].x - parts[P.plate].hw).toBe(w.camera.x + 384 + 8);
    let last = boss.screenX;
    for (let i = 0; i < 29; i++) {
      run(w, 1);
      expect(boss.screenX).toBeLessThan(last);
      last = boss.screenX;
    }
    run(w, 1);
    expect(boss.state).toBe(BossState.Fight);
    expect([boss.screenX, boss.screenY]).toEqual([300, 100]);
    const cx = w.camera.x;
    expect([boss.x, boss.y]).toEqual([cx + 300, 100]);
    expect([parts[P.hull].x, parts[P.hull].y]).toEqual([cx + 300, 100]);
    expect([parts[P.arm].x, parts[P.arm].y]).toEqual([cx + 300, 70]);
    expect([parts[P.gun].x, parts[P.gun].y]).toEqual([cx + 290, 70]);
    expect([parts[P.core].x, parts[P.plate].x, parts[P.mouth].x]).toEqual([
      cx + 288,
      cx + 276,
      cx + 314,
    ]);
    // A part's offset moves its children with it (translation only).
    parts[P.arm].localY = -40;
    run(w, 1);
    expect([parts[P.arm].y, parts[P.gun].y]).toEqual([60, 60]);
    expect(boss.partCount).toBe(6);
    expect(parts.slice(6).every((part) => !part.active)).toBe(true);
  });

  it('draws the standing parts with sprites on AIR_ENEMIES, flashing when hit', () => {
    const w = fighting();
    const batch = w.bosses.batch;
    expect(batch.layer).toBe(LayerId.AirEnemies);
    expect(w.view.batches).toContain(batch);
    // The mouth has no sprite: five sprites.
    expect(batch.count).toBe(5);
    expect(w.bosses.damagePart(P.plate, 1, 0)).toBe(BossHit.Damaged);
    run(w, 1);
    const plate = Array.from(batch.spriteId.subarray(0, batch.count)).indexOf(
      DB.sprites.index.get('bosses/shield-plate') ?? -1,
    );
    expect(batch.flags[plate] & SpriteFlag.Flash).toBe(SpriteFlag.Flash);
    expect(w.bosses.damagePart(P.arm, 5, 0)).toBe(BossHit.Destroyed);
    run(w, 1);
    expect(batch.count).toBe(3); // the arm and its gun are gone
  });

  it('gates the weak points: the intro, armour, afterParts and whenOpen clink', () => {
    const w = world();
    until(w, BossState.Intro);
    const bosses = w.bosses;
    for (let i = 0; i < 6; i++) expect(bosses.damagePart(i, 1, 0)).toBe(BossHit.Clink);
    expect(bosses.isArmoured(P.plate)).toBe(true);
    until(w, BossState.Fight);
    const parts = bosses.boss.parts;
    expect(bosses.damagePart(P.hull, 99, 0)).toBe(BossHit.Clink);
    expect(bosses.damagePart(P.core, 99, 0)).toBe(BossHit.Clink); // the plate still stands
    expect(bosses.damagePart(P.mouth, 1, 0)).toBe(BossHit.Clink); // closed
    expect([parts[P.hull].hp, parts[P.core].hp, parts[P.mouth].hp]).toEqual([1, 10, 3]);
    parts[P.mouth].open = true;
    expect(bosses.isArmoured(P.mouth)).toBe(false);
    expect(bosses.damagePart(P.mouth, 1, 0)).toBe(BossHit.Damaged);
    expect(parts[P.mouth].hp).toBe(2);
    expect(bosses.damagePart(P.plate, 3, 0)).toBe(BossHit.Damaged);
    expect(bosses.damagePart(P.plate, 1, 0)).toBe(BossHit.Destroyed);
    expect(bosses.damagePart(P.plate, 1, 0)).toBe(BossHit.None); // gone: the shot flies on
    expect(bosses.isArmoured(P.core)).toBe(false);
    expect(bosses.damagePart(P.core, 2, 0)).toBe(BossHit.Damaged);
    expect(parts[P.core].hp).toBe(8);
    expect([bosses.damagePart(-1, 1, 0), bosses.damagePart(6, 1, 0)]).toEqual([
      BossHit.None,
      BossHit.None,
    ]);
    expect([bosses.damagePart(0.5, 1, 0), bosses.damagePart(99, 1, 0)]).toEqual([
      BossHit.None,
      BossHit.None,
    ]);
  });

  it('changes phase on the destroyed-part mask and on the HP threshold, swapping the script', () => {
    const w = fighting();
    const boss = w.bosses.boss;
    expect(boss.phase).toBe(0);
    started.length = 0;
    w.bosses.damagePart(P.plate, 4, 0);
    const change = w.tick;
    run(w, 1);
    expect(boss.phase).toBe(1);
    expect(boss.phaseTicks).toBe(0);
    expect(started).toEqual([]); // the new script runs from the next tick
    run(w, 1);
    expect(started).toEqual(['test.b@' + String(change + 1)]);
    // The cores' total (10) must fall below 5: 6 → 4 of damage.
    w.bosses.damagePart(P.core, 5, 0);
    run(w, 1);
    expect(boss.phase).toBe(1);
    w.bosses.damagePart(P.core, 1, 0);
    run(w, 2);
    expect(boss.phase).toBe(2);
    expect(started.slice(1)).toEqual(['test.c@' + String(w.tick - 1)]);
    // The last phase runs until the boss dies.
    run(w, 100);
    expect(boss.phase).toBe(2);
  });

  it('ends a phase on its timer and runs several met conditions in one tick', () => {
    const { db: content, issues } = loadContent([
      {
        path: 'enemies/b.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [
            {
              id: 'timed',
              boss: {
                code: 'T-1',
                displayName: 'TIMED',
                introTicks: 0,
                parts: [
                  { name: 'core', hp: 10, hurtbox: { hw: 4, hh: 4 }, core: true },
                  { name: 'a', hurtbox: { hw: 2, hh: 2 } },
                  { name: 'b', hurtbox: { hw: 2, hh: 2 } },
                ],
                phases: [
                  { script: 'test.a', until: { ticks: 20 } },
                  { script: 'test.b', until: { partsDestroyed: ['a', 'b'], count: 1 } },
                  { script: 'test.c', until: { hpBelow: 10 } },
                  { script: 'test.a' },
                ],
              },
            },
          ],
        },
      },
    ]);
    expect(issues).toEqual([]);
    const w = createWorld(resolveGameConfig({ seed: 1 }), content, { bossBehaviors: BEHAVIORS });
    expect(w.bosses.startBoss(0)).toBe(true);
    const boss = w.bosses.boss;
    expect(boss.state).toBe(BossState.Fight); // no intro: the fight starts at once
    run(w, 19);
    expect(boss.phase).toBe(0);
    run(w, 1);
    expect(boss.phase).toBe(1);
    // One of the two parts ends phase 1; the core already lost hp, so phase 2 ends too.
    w.bosses.damagePart(0, 1, 0);
    w.bosses.damagePart(2, 1, 0);
    run(w, 1);
    expect(boss.phase).toBe(3);
  });

  it('destroys the parts attached below a destroyed part and pays every one', () => {
    const w = fighting();
    const parts = w.bosses.boss.parts;
    expect(w.bosses.damagePart(P.arm, 5, 0)).toBe(BossHit.Destroyed);
    expect([parts[P.arm].destroyed, parts[P.gun].destroyed]).toEqual([true, true]);
    expect(w.bosses.boss.destroyedMask).toBe((1 << P.arm) | (1 << P.gun));
    expect(w.scoring.board.scores[0].score).toBe(150);
    const events: Recorded[] = [];
    w.events.drain((e) => events.push({ tick: 0, kind: e.kind, id: e.id, param: e.param }));
    expect(events.filter((e) => e.kind === SimEventKind.Particles).map((e) => e.id)).toEqual([
      FX_CUES.ExplosionMedium,
      FX_CUES.ExplosionMedium,
    ]);
    // Gone parts are no targets, and nobody is credited for a hit by -1.
    run(w, 1);
    expect([parts[P.arm].target, parts[P.gun].target, parts[P.hull].target]).toEqual([
      false,
      false,
      true,
    ]);
    w.bosses.damagePart(P.plate, 4, -1);
    expect(w.scoring.board.scores[0].score).toBe(150);
  });

  it('runs the death sequence on time: cancel, chain, blast + hit-stop, tally, stage clear', () => {
    const w = fighting();
    const boss = w.bosses.boss;
    w.bosses.damagePart(P.plate, 4, 0);
    run(w, 1);
    for (let i = 0; i < 5; i++)
      w.bullets.spawn(w.camera.x + 100 + i * 10, 50, 0, 0, BulletKind.RoundRed);
    const killTick = w.tick; // the kill happens between ticks: the sequence counts from here
    expect(w.bosses.damagePart(P.core, 10, 0)).toBe(BossHit.Destroyed);
    expect(boss.state).toBe(BossState.Dying);
    expect(boss.killer).toBe(0);
    expect(boss.script).toBeNull();
    const kill: Recorded[] = [];
    w.events.drain((e) => kill.push({ tick: 0, kind: e.kind, id: e.id, param: e.param }));
    expect(
      kill.filter((e) => e.kind === SimEventKind.Particles && e.id === FX_CUES.BulletCancel),
    ).toHaveLength(5);
    expect(kill).toContainEqual({
      tick: 0,
      kind: SimEventKind.Music,
      id: MUSIC_CUES.Silence,
      param: BOSS_MUSIC_FADE_TICKS,
    });
    expect(w.bosses.damagePart(P.hull, 1, 0)).toBe(BossHit.None); // nothing takes hits now
    const events = run(w, BOSS_CHAIN_TICKS);
    expect(w.bullets.count).toBe(0);
    const chain = events
      .filter((e) => e.kind === SimEventKind.Particles && e.id === FX_CUES.BossChain)
      .map((e) => e.tick - killTick + 1);
    const expected: number[] = [];
    for (let t = BOSS_CHAIN_INTERVAL; t < BOSS_CHAIN_TICKS; t += BOSS_CHAIN_INTERVAL) {
      expected.push(t);
    }
    expect(chain).toEqual(expected);
    // The final blast on the chain's last tick: flash, large shake, rumble, hit-stop.
    const blastTick = killTick + BOSS_CHAIN_TICKS - 1;
    const blast = events.filter((e) => e.tick === blastTick);
    expect(blast.map((e) => [e.kind, e.id])).toEqual(
      expect.arrayContaining([
        [SimEventKind.Particles, FX_CUES.BossBlast],
        [SimEventKind.Sfx, SFX_CUES.BossExplode],
        [SimEventKind.Rumble, 0],
        [SimEventKind.Flash, FlashKind.BossBlast],
        [SimEventKind.Shake, 40],
        [SimEventKind.HitStop, 0],
      ]),
    );
    expect(blast.find((e) => e.kind === SimEventKind.Shake)?.param).toBe(ShakeMagnitude.Large);
    expect(boss.blasted).toBe(true);
    expect(w.bosses.batch.count).toBe(0);
    expect(w.hitStop).toBe(BOSS_BLAST_HIT_STOP_TICKS);
    // The hit-stop freezes the sequence; the tally comes on its first tick after.
    const score = w.scoring.board.scores[0].score;
    const frozen = run(w, BOSS_BLAST_HIT_STOP_TICKS);
    expect(frozen.filter((e) => e.kind === SimEventKind.BossDefeated)).toEqual([]);
    expect(boss.stateTicks).toBe(BOSS_CHAIN_TICKS);
    const tally = run(w, 1);
    expect(boss.stateTicks).toBe(BOSS_TALLY_TICKS);
    expect(tally.filter((e) => e.kind === SimEventKind.BossDefeated)).toEqual([
      {
        tick: killTick + BOSS_CHAIN_TICKS + BOSS_BLAST_HIT_STOP_TICKS,
        kind: SimEventKind.BossDefeated,
        id: DB.enemyIndex.get('probe'),
        param: 7000,
      },
    ]);
    expect(tally.filter((e) => e.kind === SimEventKind.Music).map((e) => e.id)).toEqual([
      MUSIC_CUES.StageClear,
    ]);
    expect(w.scoring.board.scores[0].score).toBe(score + 7000);
    // Stage clear 180 simulated ticks after the kill (the hit-stop adds its 5).
    run(w, BOSS_CLEAR_TICKS - BOSS_TALLY_TICKS - 1);
    expect(w.status).toBe('playing');
    expect(w.stage?.locked).toBe(true);
    run(w, 1);
    expect(w.tick).toBe(killTick + BOSS_CLEAR_TICKS + BOSS_BLAST_HIT_STOP_TICKS);
    expect(boss.state).toBe(BossState.Dead);
    expect(w.status).toBe('stageClear');
    // The lock is released: the scroll picks up again.
    expect(w.stage?.locked).toBe(false);
    const x = w.camera.x;
    run(w, 90);
    expect(w.camera.x).toBeGreaterThan(x + 30);
    expect(w.stage?.speed).toBe(1);
  });

  it('awards every part and the tally to the players who destroyed them', () => {
    const w = fighting();
    w.bosses.damagePart(P.plate, 4, 1);
    w.bosses.damagePart(P.arm, 5, 0);
    w.bosses.damagePart(P.core, 10, 1);
    const [p1, p2] = w.scoring.board.scores;
    expect([p1.score, p2.score]).toEqual([150, 1300]);
    run(w, BOSS_TALLY_TICKS + BOSS_BLAST_HIT_STOP_TICKS);
    expect([p1.score, p2.score]).toEqual([150, 8300]);
    // Defeated by nobody (a tool): no tally points.
    const v = fighting();
    expect(v.bosses.defeat()).toBe(true);
    expect(v.bosses.boss.state).toBe(BossState.Dying);
    const tally = run(v, BOSS_TALLY_TICKS + BOSS_BLAST_HIT_STOP_TICKS);
    expect(tally.find((e) => e.kind === SimEventKind.BossDefeated)?.param).toBe(0);
    expect(v.scoring.board.scores[0].score).toBe(0);
    expect(v.bosses.defeat()).toBe(false);
  });

  it("the players' shots hit parts through the grid: damage, clink on armour, pierce cooldowns", () => {
    const w = fighting();
    const parts = w.bosses.boss.parts;
    const plate = parts[P.plate];
    const events: Recorded[] = [];
    // A main shot 20 px left of the plate: one tick later it overlaps the plate only.
    const shot = w.weapons.spawnShot(WeaponRole.Main, 0, plate.x - 20, plate.y);
    expect(shot).toBeGreaterThanOrEqual(0);
    run(w, 1, events);
    expect(plate.hp).toBe(3);
    expect(w.weapons.countShots(0, WeaponRole.Main)).toBe(0);
    // At the armoured hull: the shot dies with a clink.
    const hull = parts[P.hull];
    w.weapons.spawnShot(WeaponRole.Main, 0, hull.x - 20, hull.y + 9);
    run(w, 1, events);
    expect(w.weapons.countShots(0, WeaponRole.Main)).toBe(0);
    expect(
      events.filter((e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.Clink),
    ).toHaveLength(1);
    expect(hull.hp).toBe(1);
    // A piercing laser keeps a cooldown per part.
    const laser = w.weapons.spawnShot(WeaponRole.Laser, 0, plate.x - 30, plate.y);
    expect(laser).toBeGreaterThanOrEqual(0);
    const table = w.weapons.pool.fields.table[laser];
    let hitTick = -1;
    for (let i = 0; i < 8 && hitTick < 0; i++) {
      run(w, 1);
      if (plate.hp < 3) hitTick = i;
    }
    expect(plate.hp).toBe(2);
    expect(w.weapons.partCooldowns[(table - 1) * MAX_BOSS_PARTS + P.plate]).toBeGreaterThan(0);
  });

  it('kills a ship that touches a part (contact), not while the boss is dying', () => {
    const w = fighting();
    w.debugFlags.godMode = false;
    const ship = w.players[0];
    const hull = w.bosses.boss.parts[P.hull];
    ship.invulnTicks = 0;
    ship.x = hull.x + 9;
    ship.y = hull.y;
    run(w, 1);
    expect(ship.state).toBe('dying');
    const v = fighting();
    v.debugFlags.godMode = false;
    v.bosses.defeat(0);
    const other = v.players[0];
    other.invulnTicks = 0;
    const core = v.bosses.boss.parts[P.hull];
    other.x = core.x;
    other.y = core.y;
    run(v, 1);
    expect(other.state).toBe('alive');
  });

  it('attaches part lasers that follow the part and stop when it is destroyed', () => {
    const w = fighting();
    const gun = w.bosses.boss.parts[P.gun];
    expect(w.laserSources[BOSS_PART_ID_BASE + P.gun]).toBe(gun);
    const slot = w.bullets.fireLaser({ x: gun.x, y: gun.y }, 512, 200, 6, 40, 8, 60, 8, gun.slot);
    expect(w.bullets.lasers.fields.src[slot]).toBe(gun.slot);
    w.bosses.boss.parts[P.arm].localY = -50;
    run(w, 1);
    expect(w.bullets.lasers.fields.y[slot]).toBe(gun.y);
    w.bosses.damagePart(P.arm, 5, 0); // takes the gun with it: the warning laser is removed
    run(w, 1);
    expect(w.bullets.lasers.count).toBe(0);
  });

  it('starts a boss event at once (no WARNING, no brake) and one boss at a time', () => {
    const w = world('direct');
    w.events.clear();
    const events = run(w, 11);
    const boss = w.bosses.boss;
    expect(boss.state).toBe(BossState.Intro);
    expect(w.status).toBe('playing');
    expect(w.stage?.locked).toBe(false);
    expect(
      events.filter((e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.WarningSiren),
    ).toEqual([]);
    expect(events.filter((e) => e.kind === SimEventKind.Music).map((e) => e.id)).toEqual([
      MUSIC_CUES.FinalBoss,
    ]);
    expect(w.bosses.startBoss(DB.enemyIndex.get('probe') ?? -1)).toBe(false);
    expect(w.bosses.startWarning(DB.enemyIndex.get('probe') ?? -1)).toBe(false);
    // `twice`: the boss event during the WARNING is ignored.
    const v = world('twice');
    run(v, 30);
    expect(v.bosses.boss.state).toBe(BossState.Warning);
    expect(v.bosses.warning.ticks).toBe(20); // started on tick 9; the boss event at x 20 passed
    expect(v.bosses.startWarning(DB.enemyIndex.get('grunt') ?? -1)).toBe(false);
    expect(v.bosses.startBoss(-1)).toBe(false);
  });

  it('never spawns a boss entry as an enemy, and the Mega Crash leaves the boss alone', () => {
    const w = fighting();
    expect(w.enemies.spawn(DB.enemyIndex.get('probe') ?? -1, w.camera.x + 100, 100)).toBeNull();
    const grunt = w.enemies.spawn(DB.enemyIndex.get('grunt') ?? -1, w.camera.x + 100, 50);
    expect(grunt).not.toBeNull();
    expect(w.enemies.megaCrash(0)).toBe(1);
    expect(w.bosses.boss.parts.slice(0, 6).map((part) => part.hp)).toEqual([1, 5, 5, 10, 4, 3]);
    expect(w.bosses.boss.state).toBe(BossState.Fight);
  });

  it('a checkpoint restart removes the boss, the WARNING and restores the stage theme', () => {
    const w = world();
    run(w, 150);
    expect(w.status).toBe('bossWarning');
    expect(w.bosses.boss.state).toBe(BossState.Warning);
    w.stage?.restartAt(1);
    expect(w.bosses.boss.state).toBe(BossState.None);
    expect(w.bosses.warning.active).toBe(false);
    expect(w.status).toBe('playing');
    expect(w.stage?.locked).toBe(false);
    const events: Recorded[] = [];
    w.events.drain((e) => events.push({ tick: 0, kind: e.kind, id: e.id, param: e.param }));
    expect(events.filter((e) => e.kind === SimEventKind.Music).map((e) => e.id)).toEqual([
      MUSIC_CUES.Stage,
    ]);
    // Replayed from the checkpoint, the WARNING plays again.
    until(w, BossState.Warning);
    // During the fight too (the arcade respawn restarts there).
    const v = fighting();
    v.stage?.restartAt(0);
    expect(v.bosses.boss.state).toBe(BossState.None);
    expect(v.bosses.batch.count).toBe(0);
    run(v, 1);
    expect(v.bosses.batch.count).toBe(0);
    expect(v.bosses.active).toBe(false);
  });

  it('the arcade penalty during the fight restarts at the checkpoint without the boss', () => {
    const v = createWorld(
      resolveGameConfig({
        stage: 'arena',
        seed: 3,
        autofire: false,
        remoteMode: false,
        deathPenalty: 'arcade',
      }),
      DB,
      { bossBehaviors: BEHAVIORS },
    );
    v.debugFlags.godMode = true;
    until(v, BossState.Fight);
    v.debugFlags.godMode = false;
    const other = v.players[0];
    other.invulnTicks = 0;
    other.x = v.bosses.boss.parts[P.hull].x;
    other.y = v.bosses.boss.parts[P.hull].y;
    run(v, 120);
    expect(other.state === 'respawning' || other.state === 'alive').toBe(true);
    expect(v.bosses.boss.state).not.toBe(BossState.Fight);
    expect(v.camera.x).toBeLessThan(120);
  });

  it('is deterministic: two worlds fighting the shipped test boss hash equal', () => {
    const { db: content, issues } = loadContent(
      [
        shipped('player/kestrel.player.json'),
        shipped('weapons/type-a.weapons.json'),
        shipped('enemies/test-range.enemies.json'),
        shipped('enemies/test-boss.enemies.json'),
        shipped('stages/test-boss.stage.json'),
      ],
      { extraSprites: ENGINE_SPRITES },
    );
    expect(issues).toEqual([]);
    const make = (): World => {
      const w = createWorld(
        resolveGameConfig({ stage: 'test-boss', seed: 77, loadout: 'full' }),
        content,
      );
      w.debugFlags.godMode = true;
      return w;
    };
    const a = make();
    const b = make();
    const input = createInputSnapshot();
    for (let t = 0; t < 2400; t++) {
      commitPlayerInput(
        input.players[0],
        (t >> 5) % 3 === 0 ? Action.Up : (t >> 5) % 3 === 1 ? Action.Down : 0,
      );
      stepWorld(a, input);
      stepWorld(b, input);
      a.events.clear();
      b.events.clear();
      if (t % 200 === 0) expect(hashWorld(a)).toBe(hashWorld(b));
    }
    expect(hashWorld(a)).toBe(hashWorld(b));
    // The fully powered KESTREL has fought its way into the boss by now.
    expect(a.bosses.boss.state).not.toBe(BossState.None);
    expect(a.bosses.boss.destroyedMask).not.toBe(0);
    // A world without boss behaviours still runs the boss (no script).
    const quiet = createWorld(resolveGameConfig({ stage: 'test-boss', seed: 1 }), content, {
      bossBehaviors: EMPTY_BOSS_BEHAVIORS,
    });
    quiet.debugFlags.godMode = true;
    until(quiet, BossState.Fight);
    expect(quiet.bosses.boss.script).toBeNull();
    expect(BOSS_BEHAVIOR_IDS).toContain('boss.hover');
  });
});
