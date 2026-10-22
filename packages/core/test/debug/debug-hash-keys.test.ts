/**
 * The stable hash keys of R5-P.P1: `loadContent` precomputes the FNV-1a of every content name /
 * id into `ContentDb` key tables, and `hashWorld` mixes those keys instead of the raw,
 * order-dependent table indices (sprite fields, enemy / boss spec indices, enemy and formation
 * path ids, a Path mover's m0, a pattern runner's code entry with its pc mixed relative to it).
 *
 * - the tables are the FNV-1a of the names, computed with `core/debug`'s own exported constants
 *   (pinning `core/data`'s local copy equal);
 * - a fixture run of zone A hashes tick-for-tick equal on a content set extended with a dummy
 *   enemy file, a dummy path file, a dummy pattern file and a dummy sprite — all of which sort
 *   FIRST, so every index the run mixes really shifted (asserted);
 * - the pattern-runner and Path-mover terms survive the bank's re-layout (armed with each
 *   content's own resolved offsets);
 * - identity-column counter-tables prove the mapped reads actually happen.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import {
  EMPTY_CONTENT_DB,
  loadContent,
  type ContentDb,
  type ContentFile,
} from '../../src/data/index.js';
import { FNV_OFFSET_BASIS, FNV_PRIME, hashWorld } from '../../src/debug/index.js';
import { EnemyState } from '../../src/enemies/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { MoverKind } from '../../src/patterns/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld, type World } from '../../src/world/index.js';

/**
 * FNV-1a of a name, written in the test with `core/debug`'s exported constants — the same
 * two-bytes-per-code-unit loop `core/data`'s `contentKey` runs (this pins the copies equal).
 *
 * @param text - The id or name.
 * @returns The unsigned 32-bit key.
 */
function fnv(text: string): number {
  let h = FNV_OFFSET_BASIS;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h = Math.imul(h ^ (c & 0xff), FNV_PRIME);
    h = Math.imul(h ^ (c >>> 8), FNV_PRIME);
  }
  return h >>> 0;
}

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

/** Zone A and what it needs (the set `debug-skip.test.ts` loads). */
const ZONE_A_FILES: ContentFile[] = [
  'player/kestrel.player.json',
  'weapons/type-a.weapons.json',
  'tilesets/terrain-a.tileset.json',
  'tilesets/terrain-azure.tileset.json',
  'paths/test-range.paths.json',
  'paths/zone-a.paths.json',
  'enemies/test-range.enemies.json',
  'enemies/zone-a.enemies.json',
  'stages/test-range.stage.json',
  'stages/zone-a.stage.json',
].map(shipped);

/** Zone B and what it needs (its jellies' patterns come from `zone-b.patterns.json`). */
const ZONE_B_FILES: ContentFile[] = [
  'player/kestrel.player.json',
  'weapons/type-a.weapons.json',
  'tilesets/terrain-reef.tileset.json',
  'enemies/zone-a.enemies.json',
  'enemies/bonus.enemies.json',
  'enemies/zone-b.enemies.json',
  'paths/zone-b.paths.json',
  'stages/zone-b.stage.json',
  'stages/brine-grotto.stage.json',
  'patterns/common.patterns.json',
  'patterns/zone-b.patterns.json',
].map(shipped);

/** A dummy sprite name sorting before every shipped and engine name. */
const DUMMY_SPRITE = '!dummy-sprite';

/** A dummy enemy file sorting before both shipped enemy files. */
const DUMMY_ENEMY_FILE: ContentFile = {
  path: 'enemies/a-dummy.enemies.json',
  data: {
    formatVersion: 1,
    kind: 'enemies',
    enemies: [
      {
        id: 'dummy-gull',
        hp: 1,
        score: 100,
        hurtbox: { hw: 6, hh: 6 },
        script: 'drifter.sine',
        sprite: 'enemies/drifter',
        anim: { frames: 1, ticks: 8 },
        params: { speed: 1, amp: 8, period: 60 },
        drop: null,
      },
    ],
  },
};

/** A dummy path file sorting before the shipped ones. */
const DUMMY_PATH_FILE: ContentFile = {
  path: 'paths/a-dummy.paths.json',
  data: {
    formatVersion: 1,
    kind: 'paths',
    paths: [
      {
        id: 'dummy-line',
        points: [
          { x: 0, y: 0 },
          { x: 900, y: 0 },
          { x: 1800, y: 0 },
        ],
      },
    ],
  },
};

/** A dummy pattern file sorting before the shipped banks. */
const DUMMY_PATTERN_FILE: ContentFile = {
  path: 'patterns/a-dummy.patterns.json',
  data: {
    formatVersion: 1,
    kind: 'patterns',
    actions: [
      {
        id: 'dummy.fan-3',
        body: [
          {
            op: 'repeat',
            times: 3,
            body: [
              {
                op: 'fire',
                direction: { type: 'aim', value: '($i - 1) * 40' },
                speed: 1.5,
                bullet: { kind: 'oval-red' },
              },
            ],
          },
          { op: 'wait', ticks: 60, ranked: true },
        ],
      },
    ],
  },
};

/**
 * Loads a content set.
 *
 * @param files - The files.
 * @param extraSprites - Sprite names beyond the content's.
 * @returns The DB (issues asserted away).
 */
function load(files: readonly ContentFile[], extraSprites: readonly string[]): ContentDb {
  const { db, issues } = loadContent(files, { extraSprites });
  expect(issues).toEqual([]);
  return db;
}

let zoneA: ContentDb | undefined;
let zoneA2: ContentDb | undefined;
let zoneB: ContentDb | undefined;
let zoneB2: ContentDb | undefined;

/**
 * Zone A on the base set.
 *
 * @returns The DB.
 */
function dbA(): ContentDb {
  return (zoneA ??= load(ZONE_A_FILES, ENGINE_SPRITES));
}

/**
 * Zone A plus the dummy content (every index shifted by one).
 *
 * @returns The DB.
 */
function dbA2(): ContentDb {
  return (zoneA2 ??= load(
    [...ZONE_A_FILES, DUMMY_ENEMY_FILE, DUMMY_PATH_FILE],
    [...ENGINE_SPRITES, DUMMY_SPRITE],
  ));
}

/**
 * Zone B (with both banks) on the base set. (The dummy path rides along in both sets: it is the
 * one path id `arm` names, stable under the zone's own remaster — B isolates the bank shift, A
 * the path shift.)
 *
 * @returns The DB.
 */
function dbB(): ContentDb {
  return (zoneB ??= load([...ZONE_B_FILES, DUMMY_PATH_FILE], ENGINE_SPRITES));
}

/**
 * Zone B plus the dummy enemy and the dummy pattern action.
 *
 * @returns The DB.
 */
function dbB2(): ContentDb {
  return (zoneB2 ??= load(
    [...ZONE_B_FILES, DUMMY_PATH_FILE, DUMMY_ENEMY_FILE, DUMMY_PATTERN_FILE],
    ENGINE_SPRITES,
  ));
}

/**
 * A world stepping the given stage.
 *
 * @param db - The content.
 * @param stage - The stage id.
 * @param seed - The config seed.
 * @returns The world.
 */
function staged(db: ContentDb, stage: string, seed: number): World {
  return createWorld(resolveGameConfig({ stage, seed, loadout: 'full' }), db);
}

/**
 * Arming state the run itself does not guarantee to hold: a live enemy of a named spec, a live
 * formation riding the named path, a Path mover's m0, a bullet of the named sprite, and a
 * pattern runner at the named action plus a relative program counter. Every value is the
 * content's OWN resolved index / offset, so the two worlds hold equal identities while their
 * raw indices differ.
 *
 * @param w - The world (already stepped; nothing steps after this).
 * @param db - Its content.
 * @param pathId - The path for the formation, its pathId and the mover's m0.
 * @param bulletSprite - The sprite name for the extra bullet.
 * @param action - The pattern action to arm a runner at (or none).
 */
function arm(w: World, db: ContentDb, pathId: string, bulletSprite: string, action?: string): void {
  const path = db.pathIndex.get(pathId);
  expect(path).toBeTypeOf('number');
  const enemyName = 'skeet';
  const spec = db.enemyIndex.get(enemyName);
  expect(spec).toBeTypeOf('number');
  const slot = w.enemies.enemies.findIndex((e) => e.state === EnemyState.Free);
  expect(slot).toBeGreaterThanOrEqual(0);
  const enemy = w.enemies.enemies[slot];
  enemy.state = EnemyState.Live;
  enemy.specIndex = spec as number;
  enemy.mover = MoverKind.Path;
  enemy.m0 = path as number;
  enemy.pathId = path as number;
  const formation = w.enemies.formations;
  formation.active[0] = 1;
  formation.enemy[0] = spec as number;
  formation.path[0] = path as number;
  formation.total[0] = 5;
  formation.tracks[0].recorded = 3;
  const pool = w.bullets.pool;
  const bullet = pool.alloc();
  expect(bullet).toBeGreaterThanOrEqual(0);
  pool.fields.sprite[bullet] = db.sprites.index.get(bulletSprite) as number;
  if (action !== undefined) {
    const entry = db.patterns.entries[db.patterns.actionIndex.get(action) as number];
    expect(entry).toBeGreaterThan(0);
    const runners = w.patterns.runners;
    runners.state[0] = 1;
    runners.entry[0] = entry;
    runners.pc[0] = entry + 4;
  }
}

/**
 * The state hash of every tick of a held-fire run.
 *
 * @param db - The content.
 * @param stage - The stage.
 * @param ticks - How many.
 * @param armIt - Arming hook after the run (identity: the same in both worlds).
 * @returns The per-tick hashes (and the final world).
 */
function run(
  db: ContentDb,
  stage: string,
  ticks: number,
  armIt?: (w: World, db: ContentDb) => void,
): number[] {
  const w = staged(db, stage, 11);
  const input = createInputSnapshot();
  commitPlayerInput(input.players[0], Action.Shot);
  const hashes: number[] = [];
  for (let t = 0; t < ticks; t++) {
    stepWorld(w, input);
    hashes.push(hashWorld(w));
  }
  if (armIt !== undefined) armIt(w, db);
  hashes.push(hashWorld(w));
  return hashes;
}

describe('core/debug — stable hash keys (R5-P.P1)', () => {
  it('builds the key tables as the FNV-1a of the names, with the exported constants', () => {
    const db = dbA();
    expect(db.spriteKeys.length).toBe(db.sprites.names.length);
    for (let i = 0; i < db.sprites.names.length; i++) {
      expect(db.spriteKeys[i]).toBe(fnv(db.sprites.names[i]));
    }
    expect(db.enemyKeys.length).toBe(db.enemies.length);
    for (let i = 0; i < db.enemies.length; i++) expect(db.enemyKeys[i]).toBe(fnv(db.enemies[i].id));
    expect(db.pathKeys.length).toBe(db.paths.length);
    for (let i = 0; i < db.paths.length; i++) expect(db.pathKeys[i]).toBe(fnv(db.paths[i].id));
    // The dummy sprite really sorts first, so the table really shifted.
    expect(dbA2().sprites.names[0]).toBe(DUMMY_SPRITE);
    // `EMPTY_CONTENT_DB` carries empty tables — the hash then falls back to the raw values
    // (every other debug suite runs on it). The pattern table spans the empty bank's lone
    // `End` offset.
    expect(EMPTY_CONTENT_DB.spriteKeys.length).toBe(0);
    expect(EMPTY_CONTENT_DB.enemyKeys.length).toBe(0);
    expect(EMPTY_CONTENT_DB.pathKeys.length).toBe(0);
    expect(EMPTY_CONTENT_DB.patternKeys.length).toBe(1);
    expect(EMPTY_CONTENT_DB.patternKeys[0]).toBe(0);
  });

  it('labels every program region of the pattern bank with its action', () => {
    const db = dbB();
    const bank = db.patterns;
    expect(bank.code.length).toBeGreaterThan(1);
    expect(db.patternKeys.length).toBe(bank.code.length);
    expect(db.patternKeys[0]).toBe(0);
    const starts: number[] = [];
    for (let k = 0; k < bank.entries.length; k++) {
      expect(db.patternKeys[bank.entries[k]]).toBe(fnv(bank.actions[k]));
      starts.push(bank.entries[k]);
    }
    // Inside a program the key persists until the next start.
    const sorted = [...starts].sort((a, b) => a - b);
    for (const s of sorted) {
      for (let o = s; o < Math.min(s + 8, db.patternKeys.length); o++) {
        expect(db.patternKeys[o]).toBe(db.patternKeys[s]);
      }
    }
  });

  it('shifts every index when the dummy content sorts first (the test is not vacuous)', () => {
    const a = dbA();
    const b = dbA2();
    expect(b.enemyIndex.get('skeet')).toBe(a.enemyIndex.get('skeet')! + 1);
    expect(b.pathIndex.get('vane-arc-up')).toBe(a.pathIndex.get('vane-arc-up')! + 1);
    expect(b.sprites.index.get('enemies/drifter')).toBe(
      a.sprites.index.get('enemies/drifter')! + 1,
    );
    // The banks themselves: zone A loads none, so the pattern shift is proved on zone B below.
    const bb = dbB();
    const b2 = dbB2();
    const jellies = bb.patterns.actionIndex.get('brine.jelly-ring')!;
    const jellies2 = b2.patterns.actionIndex.get('brine.jelly-ring')!;
    expect(jellies2).toBe(jellies + 1);
    expect(b2.patterns.entries[jellies2]).not.toBe(bb.patterns.entries[jellies]);
    expect(b2.patternKeys[b2.patterns.entries[jellies2]]).toBe(fnv('brine.jelly-ring'));
  });

  it(
    'hashes a zone-A run tick-for-tick equal across the shifted content (enemies, paths, ' +
      'formations, sprites, a Path mover m0 and an armed runner)',
    () => {
      const base = run(dbA(), 'zone-a', 3300, (w, db) =>
        arm(w, db, 'vane-arc-up', 'enemies/drifter'),
      );
      const shifted = run(dbA2(), 'zone-a', 3300, (w, db) =>
        arm(w, db, 'vane-arc-up', 'enemies/drifter'),
      );
      expect(shifted).toEqual(base);
      expect(new Set(base).size).toBeGreaterThan(100); // the state really moved
    },
    60_000,
  );

  it('holds the runner term across the pattern bank re-layout (zone B)', () => {
    const base = run(dbB(), 'zone-b', 1200, (w, db) =>
      arm(w, db, 'dummy-line', 'enemies/drifter', 'brine.jelly-ring'),
    );
    const shifted = run(dbB2(), 'zone-b', 1200, (w, db) =>
      arm(w, db, 'dummy-line', 'enemies/drifter', 'brine.jelly-ring'),
    );
    expect(shifted).toEqual(base);
  });

  it('mixes through the tables: identity counter-tables move the hash', () => {
    const w = staged(dbA2(), 'zone-a', 11);
    const input = createInputSnapshot();
    commitPlayerInput(input.players[0], Action.Shot);
    for (let t = 0; t < 300; t++) stepWorld(w, input);
    arm(w, dbA2(), 'vane-arc-up', 'enemies/drifter');
    const stable = hashWorld(w);
    const enemyCount = dbA2().enemyKeys.length;
    const pathCount = dbA2().pathKeys.length;
    const spriteCount = dbA2().spriteKeys.length;
    // The interface is readonly; the test owns this loaded db (never shared with another world).
    const mutable = dbA2() as unknown as {
      enemyKeys: Uint32Array;
      pathKeys: Uint32Array;
      spriteKeys: Uint32Array;
    };
    const good = {
      enemyKeys: dbA2().enemyKeys,
      pathKeys: dbA2().pathKeys,
      spriteKeys: dbA2().spriteKeys,
    };
    // Swap one table for the identity column (the pre-P1 raw index as a key): the field that
    // reads it must move the hash.
    for (const patch of [
      (): void => {
        mutable.enemyKeys = Uint32Array.from({ length: enemyCount }, (_, i) => i);
      },
      (): void => {
        mutable.pathKeys = Uint32Array.from({ length: pathCount }, (_, i) => i);
      },
      (): void => {
        mutable.spriteKeys = Uint32Array.from({ length: spriteCount }, (_, i) => i);
      },
    ]) {
      patch();
      expect(hashWorld(w), 'an identity table read as keys').not.toBe(stable);
      mutable.enemyKeys = good.enemyKeys;
      mutable.pathKeys = good.pathKeys;
      mutable.spriteKeys = good.spriteKeys;
      expect(hashWorld(w)).toBe(stable);
    }
  });
});
