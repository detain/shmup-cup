/**
 * `boss.bulwark` (plan M1-18) driving the shipped HALCYON BULWARK (HB-01,
 * `content/enemies/zone-a.enemies.json`), reached with the debug stage skip:
 *
 * - phase 0 (four plates): slow tracking of the ship's height, a telegraphed lane laser every
 *   110 ticks from the top and the bottom emitter in turn, **attached** (the lane moves with the
 *   boss), no bullets;
 * - two plates down → phase 1: aimed 3-ways of purple needles at 1.5 px/tick from both emitters;
 * - the last plate down → phase 2: lanes every 55 ticks, so the two emitters' lanes overlap in
 *   time — never closer than the emitters' spacing;
 * - the core takes damage only once every plate is gone, and its death clears the stage.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOSS_PART_ID_BASE, BossHit, BossState } from '../../src/bosses/index.js';
import { BulletFlag, BulletKind, LaserPhase } from '../../src/bullets/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
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

/**
 * Zone A with what it needs.
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const { db: content, issues } = loadContent(
    [
      'player/kestrel.player.json',
      'tilesets/terrain-a.tileset.json',
      'paths/zone-a.paths.json',
      'enemies/zone-a.enemies.json',
      'stages/zone-a.stage.json',
    ].map(shipped),
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

const DB = db();

/** HB-01's part indices (the file's order). */
const P = { emitterTop: 3, emitterBottom: 4, core: 5, plates: [6, 7, 8, 9] } as const;

/**
 * A zone A world at HB-01's first fight tick (skip to the boss, god mode, no weapons fired).
 *
 * @returns The world.
 */
function fighting(): World {
  const w = createWorld(
    resolveGameConfig({ stage: 'zone-a', stageSkip: 'boss', autofire: false, remoteMode: false }),
    DB,
  );
  w.debugFlags.godMode = true;
  const input = createInputSnapshot();
  for (let i = 0; i < 2000 && w.bosses.boss.state !== BossState.Fight; i++) {
    stepWorld(w, input);
    w.events.clear();
  }
  expect(w.bosses.boss.state).toBe(BossState.Fight);
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
  for (let i = 0; i < ticks; i++) {
    stepWorld(w, input);
    w.events.clear();
  }
}

/**
 * The live lasers.
 *
 * @param w - The world.
 * @returns Slot, source id, y and phase of each.
 */
function lasers(w: World): { src: number; y: number; phase: number }[] {
  const pool = w.bullets.lasers;
  const f = pool.fields;
  const out: { src: number; y: number; phase: number }[] = [];
  for (let i = 0; i < pool.count; i++) {
    if ((f.flags[i] & BulletFlag.Dead) !== 0) continue;
    out.push({ src: f.src[i], y: f.y[i], phase: f.phase[i] });
  }
  return out;
}

describe('core/behaviors boss.bulwark — HALCYON BULWARK (M1-18)', () => {
  it('alternates attached lane lasers between the emitters and fires no bullets in phase 0', () => {
    const w = fighting();
    const parts = w.bosses.boss.parts;
    run(w, 59);
    expect(lasers(w)).toEqual([]);
    run(w, 1);
    const first = lasers(w);
    expect(first.map((l) => l.src)).toEqual([BOSS_PART_ID_BASE + P.emitterTop]);
    expect(first[0].phase).toBe(LaserPhase.Telegraph);
    run(w, 110);
    expect(lasers(w).map((l) => l.src)).toContain(BOSS_PART_ID_BASE + P.emitterBottom);
    expect(w.bullets.count).toBe(0);
    // Attached: the lane follows its emitter while the boss tracks the ship.
    w.players[0].y = 40;
    run(w, 30);
    const bottom = lasers(w).find((l) => l.src === BOSS_PART_ID_BASE + P.emitterBottom);
    expect(bottom?.y).toBeCloseTo(parts[P.emitterBottom].y, 6);
    expect(w.bosses.boss.phase).toBe(0);
  });

  it('adds aimed 3-ways of needles at 1.5 px/tick once two plates are down (phase 1)', () => {
    const w = fighting();
    const bosses = w.bosses;
    expect(bosses.damagePart(P.core, 5, 0)).toBe(BossHit.Clink); // plates still up
    bosses.damagePart(P.plates[3], 99, 0);
    bosses.damagePart(P.plates[2], 99, 0);
    run(w, 1);
    expect(bosses.boss.phase).toBe(1);
    let fired = 0;
    for (let i = 0; i < 200 && fired === 0; i++) {
      run(w, 1);
      fired = w.bullets.count;
    }
    expect(fired).toBe(6); // 3 per emitter
    const f = w.bullets.pool.fields;
    for (let i = 0; i < fired; i++) {
      expect(f.kind[i]).toBe(BulletKind.NeedlePurple);
      expect(f.speed[i]).toBeCloseTo(1.5, 9);
    }
  });

  it('overlaps the two lanes in phase 2, apart by the emitters, and dies by its core', () => {
    const w = fighting();
    const bosses = w.bosses;
    for (const plate of P.plates) bosses.damagePart(plate, 99, 0);
    run(w, 1);
    expect(bosses.boss.phase).toBe(2);
    let both = 0;
    for (let i = 0; i < 400; i++) {
      run(w, 1);
      const live = lasers(w).filter((l) => l.phase !== LaserPhase.Fade);
      const srcs = new Set(live.map((l) => l.src));
      if (srcs.size === 2) {
        both++;
        const ys = live.map((l) => l.y);
        expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThanOrEqual(48);
      }
    }
    expect(both).toBeGreaterThan(0);
    expect(bosses.damagePart(P.core, 40, 0)).toBe(BossHit.Destroyed);
    for (let i = 0; i < 400 && w.status !== 'stageClear'; i++) run(w, 1);
    expect(w.status).toBe('stageClear');
  });
});
