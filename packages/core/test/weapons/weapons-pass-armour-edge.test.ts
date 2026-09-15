/**
 * Edge cases of `direct.bolt`'s `passArmour` tunable (plan M2-18), beyond
 * `weapons-pass-armour.test.ts`'s armoured enemy:
 *
 * - **boss parts** — the path the release bot runs needed (MANTLE REGENT, IRON SOVEREIGN, THE
 *   HOLLOW KING): a `passArmour` wave clinks on a part that can never take damage and flies on to
 *   the core behind it; without the tunable the armour stops every wave and the core is untouched;
 * - **the clink cooldown** — a slow wave that overlaps the armour for many ticks clinks at most
 *   once every `hitCooldownTicks` (a long cooldown: once per pass), never every tick;
 * - **compilation** — any positive `passArmour` turns it on (0.5 as well as 1), zero or a negative
 *   value leaves it off; a missing tunable is the default 0;
 * - **the shipped waves** — the four `LASER → WAVE` levels of the MANTA pierce with `passArmour` 1
 *   and no other shipped weapon sets it (a non-piercing shot would ignore it anyway).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createBossBehaviorRegistry, defineBossBehavior } from '../../src/behaviors/index.js';
import { BossState } from '../../src/bosses/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { EnemyFlag, type Enemy } from '../../src/enemies/index.js';
import { SFX_CUES, SimEventKind } from '../../src/events/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { SLEEP_FOREVER, type Script } from '../../src/patterns/index.js';
import { ShotFlag } from '../../src/weapons/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld, type World } from '../../src/world/index.js';
import { MANTA, shipped } from '../helpers/direct.js';

/**
 * A stage without scrolling; `boss` starts the armoured test boss at once.
 *
 * @param id - Stage id.
 * @param events - Its events.
 * @returns The stage file.
 */
function stage(id: string, events: unknown[]): ContentFile {
  return {
    path: `stages/${id}.stage.json`,
    data: {
      formatVersion: 1,
      kind: 'stage',
      id,
      name: id.toUpperCase(),
      music: { stage: 'Stage', boss: 'Boss' },
      length: 4000,
      camera: [{ x: 0, speed: 0 }],
      checkpoints: [{ x: 0 }],
      parallax: [],
      tilemap: null,
      events,
    },
  };
}

/** The test boss: a core with an armour plate 40 px in front of it (to the left). */
const WALLED = {
  id: 'walled',
  boss: {
    code: 'WL-01',
    displayName: 'WALLED CORE',
    introTicks: 10,
    score: 1000,
    x: 300,
    y: 100,
    parts: [
      {
        name: 'core',
        hp: 500,
        hurtbox: { hw: 5, hh: 5 },
        core: true,
        sprite: 'bosses/core',
      },
      {
        name: 'armour',
        parent: 'core',
        x: -40,
        hurtbox: { hw: 4, hh: 14 },
        vulnerable: 'never',
        sprite: 'bosses/shield-plate',
      },
    ],
    phases: [{ script: 'test.sleep' }],
  },
};

/** The test boss behaviour: sleeps. */
const BOSS_BEHAVIORS = createBossBehaviorRegistry([
  defineBossBehavior('test.sleep', {}, function* sleep(): Script {
    yield SLEEP_FOREVER;
  }),
]);

/** What a wave of {@link waveDb} is like. */
interface WaveSpec {
  /** Whether it pierces. */
  readonly pierce: boolean;
  /** The `passArmour` tunable (`undefined` = left out). */
  readonly passArmour?: number;
  /** Its speed (px/tick, default 7). */
  readonly speed?: number;
  /** `hitCooldownTicks` (default 6). */
  readonly cooldown?: number;
  /** Volleys of the family's level (default 3). */
  readonly volleys?: number;
}

/**
 * Content with the MANTA whose only main level fires one wave, an armoured enemy, a target, the
 * {@link WALLED} boss and the stages `still` (nothing) and `arena` (the boss at once).
 *
 * @param wave - The wave.
 * @returns The DB (validated without an issue).
 */
function waveDb(wave: WaveSpec): ContentDb {
  const params: Record<string, number> = { hw: 4, hh: 7, hitCooldownTicks: wave.cooldown ?? 6 };
  if (wave.passArmour !== undefined) params.passArmour = wave.passArmour;
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('player/manta.player.json'),
      shipped('weapons/type-a.weapons.json'),
      {
        path: 'weapons/w.weapons.json',
        data: {
          formatVersion: 1,
          kind: 'weapons',
          weapons: [
            {
              id: 'w.wave',
              slot: 'main',
              behavior: 'direct.bolt',
              damage: 2,
              speed: wave.speed ?? 7,
              cap: 3,
              pierce: wave.pierce,
              sprite: 'shots/wave',
              sfx: 'PlayerShot',
              params,
            },
          ],
          families: [
            {
              id: 'wave',
              label: 'WAVE',
              slot: 'main',
              levels: [{ shots: [{ weapon: 'w.wave' }], volleys: wave.volleys ?? 3 }],
            },
          ],
        },
      },
      {
        path: 'enemies/t.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [
            ...['armor', 'target'].map((id) => ({
              id,
              hp: 1000,
              score: 100,
              hurtbox: { hw: 4, hh: 4 },
              script: 'test.idle',
              sprite: 'enemies/drifter',
              drop: null,
            })),
            WALLED,
          ],
        },
      },
      stage('still', []),
      stage('arena', [{ x: 0, type: 'boss', enemy: 'walled' }]),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
}

/**
 * A MANTA world on a stage, player 1 alive.
 *
 * @param db - The content.
 * @param stageId - The stage.
 * @returns The world.
 */
function mantaWorld(db: ContentDb, stageId: string): World {
  const w = createWorld(resolveGameConfig({ seed: 5, stage: stageId, ...MANTA }), db, {
    bossBehaviors: BOSS_BEHAVIORS,
  });
  w.debugFlags.godMode = true;
  const input = createInputSnapshot();
  while (w.players[0].state !== 'alive') stepWorld(w, input);
  return w;
}

/**
 * Steps a world and returns the ticks (counted from 0) on which a clink sounded.
 *
 * @param w - The world.
 * @param ticks - Ticks to step.
 * @param flags - Collects every flag bit a live shot carried.
 * @returns The clink ticks.
 */
function clinkTicks(w: World, ticks: number, flags: { bits: number } = { bits: 0 }): number[] {
  const input = createInputSnapshot();
  const clinks: number[] = [];
  w.events.clear();
  for (let t = 0; t < ticks; t++) {
    stepWorld(w, input);
    w.events.drain((e) => {
      if (e.kind === SimEventKind.Sfx && e.id === SFX_CUES.Clink) clinks.push(t);
    });
    const f = w.weapons.pool.fields;
    for (let i = 0; i < w.weapons.pool.count; i++) flags.bits |= f.flags[i];
  }
  return clinks;
}

/** What {@link fireAtBoss} measured. */
interface BossOutcome {
  /** Hit points the core lost. */
  readonly coreLost: number;
  /** Clink sounds. */
  readonly clinks: number;
}

/**
 * Starts the {@link WALLED} boss, waits for its fight, parks the MANTA 60 px in front of the armour
 * in the core's row and lets the forced autofire shoot for 120 ticks.
 *
 * @param db - The content.
 * @returns What happened.
 */
function fireAtBoss(db: ContentDb): BossOutcome {
  const w = mantaWorld(db, 'arena');
  const input = createInputSnapshot();
  for (let t = 0; t < 400 && w.bosses.boss.state !== BossState.Fight; t++) stepWorld(w, input);
  expect(w.bosses.boss.state).toBe(BossState.Fight);
  const core = w.bosses.boss.parts[0];
  const armour = w.bosses.boss.parts[1];
  const hp = core.hp;
  const ship = w.players[0];
  ship.x = armour.x - 60;
  ship.y = core.y;
  const clinks = clinkTicks(w, 120).length;
  return { coreLost: hp - core.hp, clinks };
}

describe('core/weapons — passArmour on boss parts (M2-18)', () => {
  it('lets a piercing passArmour wave clink on an armoured part and hurt the core behind it', () => {
    const out = fireAtBoss(waveDb({ pierce: true, passArmour: 1 }));
    expect(out.clinks).toBeGreaterThan(0);
    expect(out.coreLost).toBeGreaterThan(0);
  });

  it('keeps an armoured part a wall for a piercing wave without passArmour', () => {
    const out = fireAtBoss(waveDb({ pierce: true, passArmour: 0 }));
    expect(out.clinks).toBeGreaterThan(0);
    expect(out.coreLost).toBe(0);
  });

  it('keeps it a wall for a non-piercing wave, whatever passArmour says', () => {
    const out = fireAtBoss(waveDb({ pierce: false, passArmour: 1 }));
    expect(out.clinks).toBeGreaterThan(0);
    expect(out.coreLost).toBe(0);
  });
});

/**
 * Parks the MANTA at (40, 100) of the screen with an invulnerable enemy 50 px ahead and a target
 * 150 px ahead, and lets one slow wave (one volley at a time) fly through both.
 *
 * @param db - The content.
 * @param ticks - Ticks to step.
 * @returns The clink ticks and what the target lost.
 */
function slowPass(db: ContentDb, ticks: number): { clinks: number[]; targetLost: number } {
  const w = mantaWorld(db, 'still');
  const ship = w.players[0];
  ship.x = w.camera.x + 40;
  ship.y = w.camera.y + 100;
  const spawn = (id: string, dx: number): Enemy => {
    const e = w.enemies.spawn(db.enemyIndex.get(id) ?? -1, ship.x + dx, ship.y);
    expect(e).not.toBeNull();
    return e as Enemy;
  };
  const armour = spawn('armor', 50);
  armour.flags |= EnemyFlag.Invulnerable;
  const target = spawn('target', 150);
  const clinks = clinkTicks(w, ticks);
  return { clinks, targetLost: 1000 - target.hp };
}

describe('core/weapons — passArmour clinks at most once per hit cooldown (M2-18)', () => {
  it('spaces the clinks of a slow wave crossing the armour by the cooldown', () => {
    // 1 px/tick through an 8-px-wide hurtbox with an 8-px-wide wave: many ticks of overlap.
    const { clinks, targetLost } = slowPass(
      waveDb({ pierce: true, passArmour: 1, speed: 1, cooldown: 6, volleys: 1 }),
      200,
    );
    expect(clinks.length).toBeGreaterThanOrEqual(2);
    for (let k = 1; k < clinks.length; k++) {
      expect(clinks[k] - clinks[k - 1]).toBeGreaterThanOrEqual(6);
    }
    expect(targetLost).toBeGreaterThan(0);
  });

  it('clinks once per pass when the cooldown outlasts the overlap', () => {
    const { clinks, targetLost } = slowPass(
      waveDb({ pierce: true, passArmour: 1, speed: 1, cooldown: 60, volleys: 1 }),
      200,
    );
    expect(clinks).toHaveLength(1);
    expect(targetLost).toBeGreaterThan(0);
  });
});

describe('core/weapons — compiling passArmour (M2-18)', () => {
  /**
   * The flag bits the live shots of a wave carried over 30 ticks.
   *
   * @param wave - The wave.
   * @returns The bits.
   */
  const bits = (wave: WaveSpec): number => {
    const w = mantaWorld(waveDb(wave), 'still');
    const flags = { bits: 0 };
    clinkTicks(w, 30, flags);
    return flags.bits;
  };

  it('turns on for any positive value', () => {
    expect(bits({ pierce: true, passArmour: 1 }) & ShotFlag.PassArmour).toBe(ShotFlag.PassArmour);
    expect(bits({ pierce: true, passArmour: 0.5 }) & ShotFlag.PassArmour).toBe(ShotFlag.PassArmour);
    expect(bits({ pierce: true, passArmour: 7 }) & ShotFlag.PassArmour).toBe(ShotFlag.PassArmour);
  });

  it('stays off for zero, a negative value or a missing tunable — the shot still pierces', () => {
    for (const passArmour of [0, -1, undefined]) {
      const flags = bits({ pierce: true, passArmour });
      expect(flags & ShotFlag.PassArmour, String(passArmour)).toBe(0);
      expect(flags & ShotFlag.Pierce, String(passArmour)).toBe(ShotFlag.Pierce);
    }
  });
});

describe('content — the shipped passArmour waves (M2-18)', () => {
  /** A weapon of a shipped weapons file. */
  interface WeaponJson {
    readonly id: string;
    readonly behavior: string;
    readonly pierce?: boolean;
    readonly params?: Readonly<Record<string, number>>;
  }

  const direct = JSON.parse(
    readFileSync(
      new URL('../../../../content/weapons/direct.weapons.json', import.meta.url),
      'utf8',
    ),
  ) as { weapons: WeaponJson[] };

  it('sets passArmour 1 on four piercing direct.bolt waves and nowhere else', () => {
    const passing = direct.weapons.filter((w) => (w.params?.passArmour ?? 0) > 0);
    expect(passing).toHaveLength(4);
    for (const weapon of passing) {
      expect(weapon.behavior, weapon.id).toBe('direct.bolt');
      expect(weapon.pierce, weapon.id).toBe(true);
      expect(weapon.params?.passArmour, weapon.id).toBe(1);
      expect(weapon.id, weapon.id).toMatch(/wave/);
    }
    for (const file of ['type-a', 'types-b-d']) {
      const text = readFileSync(
        new URL(`../../../../content/weapons/${file}.weapons.json`, import.meta.url),
        'utf8',
      );
      expect(text, file).not.toContain('passArmour');
    }
  });
});
