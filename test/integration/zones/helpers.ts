/**
 * Shared fixtures of the per-zone content tests (`content-zone-*.test.ts`).
 *
 * `content.test.ts` held the zones' content tests in one describe per zone group (R5-P.P2a
 * splits them into one file per zone, so an R5 zone lane never shares a test file with
 * another zone). What the moved tests share lives here: the shipped DB and its stage /
 * enemy resolution, the capsule sources of a stage, the scroll timing to the WARNING, and
 * the zone tables the `it.each` blocks walk — the case templates ride on those blocks, so
 * every split file re-substitutes the very titles the single file produced. The tests
 * themselves moved verbatim.
 */
import {
  ENGINE_SPRITES,
  KNOWN_SCRIPT_IDS,
  createGame,
  createHeadlessPlatform,
  createStageRunner,
  loadContent,
  type BossPartSpec,
  type BossSpec,
  type ContentDb,
  type StageSpec,
} from '@shmup/core';
import { expect } from 'vitest';
import { readContentFiles } from '../../../vite.shared.js';

/** The shipped content files (what `virtual:shmup-content` inlines), examples excluded. */
export const shippedFiles = readContentFiles();

/**
 * The shipped content with the engine's scripts and sprites (the shell's loader).
 *
 * @returns The DB (asserted issue-free).
 */
export function shippedDb(): ContentDb {
  const { db, issues } = loadContent(shippedFiles, {
    knownScripts: KNOWN_SCRIPT_IDS,
    extraSprites: ENGINE_SPRITES,
  });
  expect(issues).toEqual([]);
  return db;
}

/**
 * A stage by its id.
 *
 * @param db - Content.
 * @param id - The stage id.
 * @returns The spec (undefined index when the id is absent — the tests' own failure).
 */
export function stageOf(db: ContentDb, id: string): StageSpec {
  return db.stages[db.stageIndex.get(id) ?? -1];
}

/**
 * The indices of every enemy a stage can bring into play: its spawn / formation / WARNING / boss
 * events' enemies and their children.
 *
 * @param db - Content.
 * @param stage - The stage.
 * @returns Enemy indices.
 */
export function stageEnemies(db: ContentDb, stage: StageSpec): Set<number> {
  const used = new Set<number>();
  for (const event of stage.events) {
    if ('enemyId' in event && event.enemyId >= 0) used.add(event.enemyId);
  }
  for (const index of [...used]) {
    const child = db.enemies[index].childId;
    if (child >= 0) used.add(child);
  }
  return used;
}

/**
 * Everything a zone can bring in: its timeline's enemies, the bosses inside and the minions.
 * (The former zones H / I version, the superset of B–G's one-pass walk: no B–G boss has an
 * `inner`, and a minion's child is already collected, so the passes are no-ops there.)
 *
 * @param db - Content.
 * @param stage - The stage.
 * @returns Enemy indices.
 */
export function zoneEnemies(db: ContentDb, stage: StageSpec): Set<number> {
  const used = stageEnemies(db, stage);
  for (let pass = 0; pass < 3; pass++) {
    for (const index of [...used]) {
      const boss = db.enemies[index].boss;
      if (boss === null) continue;
      for (const id of [boss.minionId, boss.innerId]) {
        if (id < 0) continue;
        used.add(id);
        const child = db.enemies[id].childId;
        if (child >= 0) used.add(child);
      }
    }
  }
  return used;
}

/**
 * The ids of the enemies the timelines of some stages place (their types).
 *
 * @param db - Content.
 * @param stageIds - The stages to walk.
 * @returns Enemy ids.
 */
export function placedIn(db: ContentDb, stageIds: readonly string[]): Set<string> {
  return new Set(
    stageIds.flatMap((id) => [...stageEnemies(db, stageOf(db, id))].map((i) => db.enemies[i].id)),
  );
}

/**
 * The x of every capsule source of a stage: a dropping enemy, a formation that drops.
 *
 * @param db - Content.
 * @param stage - The stage.
 * @returns Source positions, in event order.
 */
export function capsuleSources(db: ContentDb, stage: StageSpec): number[] {
  /** Whether an event is a capsule source: a dropping enemy, a formation that drops. */
  const capsule = (event: StageSpec['events'][number]): boolean =>
    event.type === 'spawn'
      ? db.enemies[event.enemyId].drop === 'capsule'
      : event.type === 'formation' && event.drop !== null;
  return stage.events.filter(capsule).map((e) => e.x);
}

/**
 * The ticks the stage's scroll needs to reach its WARNING event.
 *
 * @param stage - The stage.
 * @returns Ticks (capped at ten minutes, like the content tests).
 */
export function scrollTicksToWarning(stage: StageSpec): number {
  const runner = createStageRunner(stage, { event() {}, clear() {} });
  const warningX = stage.events.find((e) => e.type === 'warning')?.x ?? 0;
  let ticks = 0;
  while (runner.camera.x < warningX && ticks < 60 * 60 * 10) {
    runner.tick();
    ticks++;
  }
  return ticks;
}

/** One `it.each` row of the zones B–G table (the fields the shared case templates read). */
export interface ZoneRow {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly boss: string;
  readonly tileset: string;
  readonly earlier: readonly string[];
  readonly lanes: number;
}

// `earlier`: the zones a run can have flown before (a zone's "new" types are new to them);
// `lanes`: the most separate laser lanes the boss may have up at once.
export const ZONES_B_G: readonly ZoneRow[] = [
  {
    id: 'zone-b',
    name: 'BRINE NEBULA',
    code: 'GM-02',
    boss: 'GALVANIC MAW',
    tileset: 'terrain-reef',
    earlier: ['zone-a'],
    lanes: 1,
  },
  {
    id: 'zone-c',
    name: 'DUNE EXPANSE',
    code: 'SW-03',
    boss: 'SANDGRAVE WIDOW',
    tileset: 'terrain-dune',
    earlier: ['zone-a'],
    lanes: 1,
  },
  {
    id: 'zone-d',
    name: 'MAGMA DEEP',
    code: 'CB-04',
    boss: 'CINDER BASTION',
    tileset: 'terrain-magma',
    earlier: ['zone-a', 'zone-b', 'zone-c'],
    lanes: 2,
  },
  {
    id: 'zone-e',
    name: 'TEMPEST RIDGE',
    code: 'SS-05',
    boss: 'SQUALL STEED',
    tileset: 'terrain-ridge',
    earlier: ['zone-a', 'zone-b', 'zone-c'],
    lanes: 0,
  },
  {
    id: 'zone-f',
    name: 'CELL VAULT',
    code: 'MR-06',
    boss: 'MANTLE REGENT',
    tileset: 'terrain-vault',
    earlier: ['zone-a', 'zone-b', 'zone-c', 'zone-d', 'zone-e'],
    lanes: 0,
  },
  {
    id: 'zone-g',
    name: 'PRISM LABYRINTH',
    code: 'FM-07',
    boss: 'FACET MONARCH',
    tileset: 'terrain-prism',
    earlier: ['zone-a', 'zone-b', 'zone-c', 'zone-d', 'zone-e'],
    lanes: 1,
  },
];

/**
 * The boss the stage's WARNING event announces.
 *
 * @param db - Content.
 * @param stage - The stage.
 * @returns The boss spec, or `null` when the stage has no WARNING.
 */
export function bossOf(db: ContentDb, stage: StageSpec): BossSpec | null {
  const warning = stage.events.find((e) => e.type === 'warning');
  return warning?.type === 'warning' ? db.enemies[warning.enemyId].boss : null;
}

/**
 * The **arms** of a boss (M2-13): chains of circle-hit parts, each hung from a part that is not
 * one (its root's parent), as lists of part indices from the root to the tip.
 */
export function bossArms(parts: readonly BossPartSpec[]): number[][] {
  const isArm = (i: number): boolean => parts[i].radius > 0 && parts[i].parentIndex >= 0;
  const arms: number[][] = [];
  parts.forEach((_part, root) => {
    if (!isArm(root) || isArm(parts[root].parentIndex)) return;
    const chain = [root];
    for (;;) {
      const last = chain[chain.length - 1];
      const next = parts.findIndex((p, i) => isArm(i) && p.parentIndex === last);
      if (next < 0) break;
      chain.push(next);
    }
    arms.push(chain);
  });
  return arms;
}

/**
 * The map columns of a zone that hold a tile, each as the list of map rows holding it.
 *
 * @param db - Content.
 * @param id - Stage id.
 * @param tile - Tile id (1-based; 0 = none).
 * @returns Rows per column that has the tile.
 */
export function tileColumns(db: ContentDb, id: string, tile: number): number[][] {
  const game = createGame(createHeadlessPlatform(), { seed: 1, stage: id }, db);
  const map = game.world.terrain;
  if (map === null) throw new Error('no terrain');
  const columns: number[][] = [];
  for (let col = 0; col < map.cols; col++) {
    const rows: number[] = [];
    for (let row = 0; row < map.rows; row++)
      if (map.tiles[row * map.cols + col] === tile) rows.push(row);
    if (rows.length > 0) columns.push(rows);
  }
  return columns;
}

/** One `it.each` row of the zones H / I table (the fields the shared case templates read). */
export interface ZoneHiRow {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly boss: string;
  readonly tileset: string;
}

export const ZONES_H_I: readonly ZoneHiRow[] = [
  {
    id: 'zone-h',
    name: 'IRON CITADEL',
    code: 'IS-08',
    boss: 'IRON SOVEREIGN',
    tileset: 'terrain-citadel',
  },
  {
    id: 'zone-i',
    name: 'ABYSSAL THRONE',
    code: 'AA-09',
    boss: 'ABYSS ARK',
    tileset: 'terrain-abyss',
  },
];
