/**
 * The R3-06.L4 boss-part glows (`core/bosses`): the part's `glow` name resolves at entry
 * (the cold `enter` path, not the tick loop), the two additive glow batches exist only when the
 * content names one, the drawn-part walk refills a glow beside its owner in the same pass, and
 * a destroyed part loses its glow with its body.
 */
import { describe, expect, it } from 'vitest';
import {
  createBossBehaviorRegistry,
  defineBossBehavior,
  type BossBehaviorRegistry,
} from '../../src/behaviors/index.js';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { BossState } from '../../src/bosses/index.js';
import { commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { SLEEP_FOREVER, type Script } from '../../src/patterns/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld, type World } from '../../src/world/index.js';
import { shipped } from '../helpers/campaign.js';

/** The glow sprites the fixture parts name. */
const HALO = 'glows/halo';

/**
 * The test boss: a never-vulnerable hull (glowing), a glowing arm and a core.
 *
 * @param glow - Whether the hull and arm name their glow.
 * @returns The enemy entry.
 */
function glover(glow: boolean): Record<string, unknown> {
  const halos = glow ? { glow: HALO } : {};
  return {
    id: 'glover',
    boss: {
      code: 'GL-01',
      displayName: 'GLOVER',
      introTicks: 2,
      score: 5000,
      x: 300,
      y: 100,
      parts: [
        {
          name: 'hull',
          hurtbox: { hw: 12, hh: 12 },
          vulnerable: 'never',
          sprite: 'bosses/hull-block',
          ...halos,
        },
        {
          name: 'arm',
          parent: 'hull',
          y: -20,
          hp: 5,
          hurtbox: { hw: 4, hh: 4 },
          sprite: 'bosses/emitter',
          score: 100,
          ...halos,
        },
        {
          name: 'core',
          parent: 'hull',
          x: -12,
          hp: 10,
          hurtbox: { hw: 5, hh: 5 },
          core: true,
          sprite: 'bosses/core',
          score: 1000,
        },
      ],
      phases: [{ script: 'test.sleep' }],
    },
  };
}

/**
 * The DB: the KESTREL, Type A and one boss stage (`glade`, boss event at x 10).
 *
 * @param glow - Whether the part specs name glows.
 * @returns The DB.
 */
function db(glow: boolean): ContentDb {
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      {
        path: 'enemies/t.enemies.json',
        data: { formatVersion: 1, kind: 'enemies', enemies: [glover(glow)] },
      },
      {
        path: 'stages/glade.stage.json',
        data: {
          formatVersion: 1,
          kind: 'stage',
          id: 'glade',
          name: 'GLADE',
          music: { stage: 'Stage', boss: 'FinalBoss' },
          length: 5000,
          camera: [{ x: 0, speed: 1 }],
          checkpoints: [{ x: 0 }],
          parallax: [],
          tilemap: null,
          events: [{ x: 10, type: 'boss', enemy: 'glover' }],
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

/** The shared DBs (read-only). */
const GLOW_DB = db(true);
const PLAIN_DB = db(false);

/** A boss phase behaviour that sleeps. */
const BEHAVIORS: BossBehaviorRegistry = createBossBehaviorRegistry([
  defineBossBehavior('test.sleep', {}, function* sleep(): Script {
    yield SLEEP_FOREVER;
  }),
]);

/**
 * A world on the glade stage, god mode on.
 *
 * @param glowDb - Use the glowing DB (default true).
 * @returns The world.
 */
function world(glowDb = true): World {
  const config: Partial<GameConfig> = { stage: 'glade', seed: 3, autofire: false };
  const w = createWorld(resolveGameConfig(config), glowDb ? GLOW_DB : PLAIN_DB, {
    bossBehaviors: BEHAVIORS,
  });
  w.debugFlags.godMode = true;
  return w;
}

/**
 * Steps a world with no input.
 *
 * @param w - The world.
 * @param ticks - Ticks.
 */
function run(w: World, ticks: number): void {
  const input = createInputSnapshot();
  for (let i = 0; i < ticks; i++) {
    commitPlayerInput(input.players[0], 0);
    stepWorld(w, input);
  }
}

/**
 * Runs until the boss reaches a state (fails past 600 ticks).
 *
 * @param w - The world.
 * @param state - The wanted `BossState`.
 */
function until(w: World, state: number): void {
  for (let tick = 0; tick < 600 && w.bosses.boss.state !== state; tick++) run(w, 1);
  expect(w.bosses.boss.state).toBe(state);
}

describe('core/bosses glow batches (R3-06.L4)', () => {
  it('creates no glow batches for parts that name no glow', () => {
    const w = world(false);
    expect(w.bosses.glowBatch).toBeNull();
    expect(w.bosses.glowBackBatch).toBeNull();
    until(w, BossState.Fight);
    for (const batch of w.view.batches) expect(batch.blend).toBeUndefined();
  });

  it('refills the additive air glow beside every drawn glowing part', () => {
    const w = world();
    until(w, BossState.Fight);
    const glow = w.bosses.glowBatch;
    expect(glow).not.toBeNull();
    expect(glow?.blend).toBe('additive');
    expect(w.view.batches).toContain(glow);
    expect(glow?.count).toBe(2); // the hull and the arm glow; the core has no glow
    const id = GLOW_DB.sprites.index.get(HALO) ?? -1;
    expect(id).toBeGreaterThanOrEqual(0);
    expect(glow?.spriteId[0]).toBe(id);
    expect(glow?.spriteId[1]).toBe(id);
    const parts = w.bosses.boss.parts;
    expect(glow?.x[0]).toBe(parts[0].x); // travels with the owner (same pass)
    expect(glow?.y[1]).toBe(parts[1].y);
    expect(glow?.frame[0]).toBe(0);
    expect(glow?.flags[0]).toBe(0);
    expect(w.bosses.batch.count).toBe(3); // the bodies are unaffected
  });

  it('loses the glow with the part: a destroyed part draws neither body nor glow', () => {
    const w = world();
    until(w, BossState.Fight);
    expect(w.bosses.glowBatch?.count).toBe(2);
    w.bosses.damagePart(1, 99, 0); // the arm
    run(w, 1);
    expect(w.bosses.glowBatch?.count).toBe(1);
    expect(w.bosses.batch.count).toBe(2);
  });

  it('resolves the part glow name at entry (the cold path)', () => {
    const w = world();
    until(w, BossState.Fight);
    const parts = w.bosses.boss.parts;
    expect(parts[0].glowId).toBe(GLOW_DB.sprites.index.get(HALO));
    expect(parts[2].glowId).toBe(-1); // the core names none
  });
});
