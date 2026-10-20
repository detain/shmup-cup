/**
 * The allocation guard of `hashWorld` with the R5-P.P1 key tables in play (budget and warm-up
 * rules as `debug.test.ts:101` — < 128 bytes per call, the boxed result only). The World is
 * created on the shipped zone-B content — real key tables, a real pattern bank — in free flight
 * (stage null, camera zero) and every hashed field is then armed or overwritten with WHOLE
 * numbers, so the values that already boxed before the keys (fractional fields of a live scene —
 * pre-existing behaviour, measured nowhere) cannot blur this guard: it measures exactly the
 * key-table reads. Live: enemy bullets and point items in the registered pools (the `sprite`
 * fields through `spriteKeys`), two enemies (one Path mover, `m0` and `pathId` through
 * `pathKeys`, `specIndex` through `enemyKeys`), a formation (both tables), a boss slot
 * (`enemyKeys` again), and three pattern runners re-entered at the bank's own action starts
 * (`patternKeys` mapped reads) with a fallback runner at an unmapped offset. Every call derives
 * the indices from its iteration (warm-up sees all remainders); nothing steps after arming —
 * the guard measures `hashWorld` alone. Own file: allocation guards are sensitive to what other
 * suites leave behind.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { EnemyState } from '../../src/enemies/index.js';
import { MoverKind } from '../../src/patterns/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';
import { ENGINE_SPRITES, createWorld, type World } from '../../src/world/index.js';

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
 * Loads the zone-B set (a pattern bank with several programs).
 *
 * @returns The DB.
 */
function zoneB(): ContentDb {
  const { db, issues } = loadContent(
    [
      'player/kestrel.player.json',
      'weapons/type-a.weapons.json',
      'tilesets/terrain-reef.tileset.json',
      'enemies/zone-a.enemies.json',
      'enemies/bonus.enemies.json',
      'enemies/zone-b.enemies.json',
      'stages/zone-b.stage.json',
      'stages/brine-grotto.stage.json',
      'patterns/common.patterns.json',
      'patterns/zones.patterns.json',
    ].map(shipped),
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
}

describe('core/debug — hashWorld key reads do not allocate', () => {
  it('mixes live content-indexed state within the boxed-result budget', () => {
    const db = zoneB();
    const w: World = createWorld(resolveGameConfig({ seed: 7 }), db);

    // Whole-number ships (the fly-in positions are fractional since the ×1.5 world).
    for (const p of w.players) {
      p.x = 64;
      p.y = 64;
      p.bank = 0;
    }

    // Live pool slots with whole values; only the sprite ids vary per call.
    const bullets = w.bullets.pool;
    for (let b = 0; b < 8; b++) {
      expect(bullets.alloc()).toBeGreaterThanOrEqual(0);
    }
    const items = w.powerups.pool;
    for (let k = 0; k < 4; k++) {
      expect(items.alloc()).toBeGreaterThanOrEqual(0);
    }

    // Two live enemies, whole fields: one a Path mover (m0 and pathId through pathKeys).
    const enemy = w.enemies.enemies[0];
    enemy.state = EnemyState.Live;
    const pathEnemy = w.enemies.enemies[1];
    pathEnemy.state = EnemyState.Live;
    pathEnemy.mover = MoverKind.Path;

    // A live formation riding a path.
    const formation = w.enemies.formations;
    formation.active[0] = 1;
    formation.total[0] = 5;
    formation.tracks[0].recorded = 3;

    // A boss slot in its fight state, two parts (all whole).
    const boss = w.bosses.slots[0];
    boss.state = 1;
    boss.partCount = 2;

    // Runners: three at the bank's own action starts (mapped `patternKeys` reads, program-
    // relative pc) and one at an offset the table does not map (the raw fallback).
    const starts: number[] = [];
    for (let k = 0; k < db.patterns.entries.length && starts.length < 3; k++) {
      if (db.patterns.entries[k] > 0) starts.push(db.patterns.entries[k]);
    }
    expect(starts.length).toBe(3);
    const runners = w.patterns.runners;
    for (let r = 0; r < 4; r++) {
      runners.state[r] = 1;
      runners.depth[r] = 0;
    }

    const enemyCount = db.enemyKeys.length;
    const pathCount = Math.max(db.pathKeys.length, 1);
    const spriteCount = Math.max(db.spriteKeys.length, 1);
    let sink = 0;
    const growth = measureHeapGrowth(
      (i) => {
        enemy.specIndex = i % enemyCount;
        enemy.pathId = i % pathCount;
        pathEnemy.specIndex = (i + 1) % enemyCount;
        pathEnemy.m0 = (i + 2) % pathCount;
        formation.enemy[0] = (i + 3) % enemyCount;
        formation.path[0] = i % pathCount;
        boss.specIndex = (i + 4) % enemyCount;
        for (let b = 0; b < 8; b++) {
          bullets.fields.sprite[b] = (i + b) % spriteCount;
        }
        for (let r = 0; r < 3; r++) {
          runners.entry[r] = starts[(i + r) % 3];
          runners.pc[r] = runners.entry[r] + (i % 5);
        }
        runners.entry[3] = db.patterns.code.length + (i % 3);
        runners.pc[3] = runners.entry[3] + 1;
        sink ^= hashWorld(w);
      },
      10_000,
      20_000,
    );
    expect(sink).not.toBe(0.5);
    expect(growth.bytesPerIteration).toBeLessThan(128);
  }, 60_000);
});
