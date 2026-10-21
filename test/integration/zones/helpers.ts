/**
 * Shared fixtures of the per-zone content tests (`content-zone-*.test.ts`).
 *
 * `content.test.ts` held the zones' content tests in one describe per zone group (R5-P.P2a
 * splits them into one file per zone, so an R5 zone lane never shares a test file with
 * another zone). What the moved tests share lives here: the shipped DB and its stage /
 * enemy resolution, the capsule sources of a stage, the scroll timing to the WARNING, the
 * zone tables the `it.each` blocks walk — the case templates ride on those blocks, so
 * every split file re-substitutes the very titles the single file produced — and, since
 * R5-P.P6, the zone contracts (`ZoneContract`, `boundsOf`, `contractPx`, `shapeViolations`,
 * `ZONE_CONTRACTS`): each zone's shape bounds for its v1 branch and its ported R5-D2 branch.
 * The tests themselves moved verbatim. Since R5-P.P5e it also holds the tick steppers and the
 * camera / open-space checks of the per-zone runtime tests (`steps`, `stepUntil`,
 * `expectInOpenSpace`, `expectCameraAt`, `crash`), copied verbatim out of the split
 * `zones-*-runtime*.test.ts` pair files; the fixtures a case file's own `DB` feeds
 * (`bricks`, `tileId`, `enemyIndex`, the game's `stageOf`) stayed beside those tests.
 */
import {
  ENGINE_SPRITES,
  KNOWN_SCRIPT_IDS,
  PLAYFIELD_H,
  PLAYFIELD_W,
  PlayerHitCause,
  TerrainType,
  boxHitsTerrain,
  createGame,
  createHeadlessPlatform,
  createStageRunner,
  loadContent,
  playerHit,
  type BossPartSpec,
  type BossSpec,
  type ContentDb,
  type Game,
  type StageSpec,
  type World,
} from '@shmup/core';
import { expect } from 'vitest';
import { readContentFiles } from '../../../vite.shared.js';
import { K, v1rel, v1x } from '../../../packages/core/test/helpers/v1-port.js';
import { zoneAContract } from './zone-a.contract.js';
import { zoneBContract } from './zone-b.contract.js';
import { zoneCContract } from './zone-c.contract.js';
import { zoneDContract } from './zone-d.contract.js';
import { zoneEContract } from './zone-e.contract.js';
import { zoneFContract } from './zone-f.contract.js';
import { zoneGContract } from './zone-g.contract.js';
import { zoneHContract } from './zone-h.contract.js';
import { zoneIContract } from './zone-i.contract.js';

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

/**
 * One branch of a zone's content contract (R5-P.P6, plan_resolution decision R5-D2): the shape
 * bounds its per-zone test and the release audit gate on. Numbers are **authored on the
 * branch**: a v1 branch states the v1 plan's numbers (M2-11 … M2-14's rulings, what
 * `content.test.ts` always asserted), a v2 branch states the ported world's (R5-D2). `null`
 * means the branch has no such gate.
 */
export interface ZoneBounds {
  /** Stage length `[min, max]` px (`null`: the branch gates no length). */
  readonly lengthPx: readonly [number, number] | null;
  /** Seconds `[min, max]` of scroll from the start to the WARNING. */
  readonly scrollSec: readonly [number, number];
  /**
   * Seconds `[min, max]` for the 4-way bot's whole god-mode clear (`null`: the branch gates
   * none). No case in P6's file list plays a whole run (the zone files' bot cases stage-skip
   * to the boss); the wave 09 zone lanes read this for their playtest runs.
   */
  readonly botRunSec: readonly [number, number] | null;
  /** Fewest checkpoints (`null`: the zone's ships case pins its exact checkpoint map instead). */
  readonly checkpointsMin: number | null;
  /** New enemy types by sprite over the earlier zones `[min, max]` (`null`: zone A debut). */
  readonly newTypesBySprite: readonly [number, number] | null;
  /**
   * Distinct enemy behaviours besides the boss `[min, max]` — zone A's rule (it has no earlier
   * zone to be new against); `null` for zones B–I.
   */
  readonly behaviours: readonly [number, number] | null;
  /** Capsule sources before the WARNING `[min, max]` (zone tests gate the min, the audit both). */
  readonly capsulesBeforeWarning: readonly [number, number];
  /** The recovery rule after a checkpoint: `min` capsule sources within `px` of its x. */
  readonly capsuleWindow: { readonly px: number; readonly min: number };
  /** Entries of the Direct-mode item plan `[min, max]` (zone tests gate the min, the audit both). */
  readonly directItems: readonly [number, number];
  /** Most blue capsules (the Option Hunter's counter) the zone drops (the audit's gate). */
  readonly blueCapsulesMax: number;
}

/**
 * A zone's content contract: `remastered` is the zone's flip flag — the wave 09 R5-P.D-* lane
 * that lands the zone's port sets it `true`, and every consumer (`boundsOf`, `contractPx`,
 * the per-zone test, the release audit) moves to the v2 bounds with no other edit.
 */
export interface ZoneContract {
  readonly remastered: boolean;
  readonly v1: ZoneBounds;
  readonly v2: ZoneBounds;
}

/** A campaign zone's letter (`stage.id` is `zone-<letter>`). */
export type ZoneLetter = keyof typeof ZONE_CONTRACTS;

/** The live branch of a contract. */
export function boundsOf(contract: ZoneContract): ZoneBounds {
  return contract.remastered ? contract.v2 : contract.v1;
}

/**
 * A px number authored on a contract's branch, in the live world's px: the identity once the
 * zone is remastered, {@link v1x} (the port's ×K + pad rules are the content's own) while its
 * authored numbers are still v1 px.
 *
 * @param contract - The zone's contract.
 * @param px - The branch-authored px.
 * @returns The live px.
 */
export function contractPx(contract: ZoneContract, px: number): number {
  return contract.remastered ? px : v1x(px);
}

/** The zone-shape numbers {@link shapeViolations} gates; an absent field skips its gate. */
export interface StageShape {
  readonly lengthPx?: number;
  readonly scrollSec?: number;
  readonly checkpoints?: number;
  readonly directItems?: number;
}

/**
 * Violations of a bounds object by a stage shape — the contract's numeric gates the shipped DB
 * cannot re-derive (capsule placement and the rosters need the DB and stay in the zone tests).
 * Pure, so `contract.test.ts` can run **either branch** against any shape.
 *
 * @param bounds - The bounds of either branch.
 * @param lengthScale - What to multiply `bounds.lengthPx` by: {@link K} on a v1 branch (its
 * length is authored in v1 px), 1 on a v2 branch (authored in the ported world's px).
 * @param shape - The stage's numbers.
 * @returns One message per violated gate (empty when the shape is in contract).
 */
export function shapeViolations(
  bounds: ZoneBounds,
  lengthScale: number,
  shape: StageShape,
): string[] {
  const out: string[] = [];
  if (bounds.lengthPx !== null && shape.lengthPx !== undefined) {
    const lo = bounds.lengthPx[0] * lengthScale;
    const hi = bounds.lengthPx[1] * lengthScale;
    if (shape.lengthPx < lo || shape.lengthPx > hi)
      out.push(`length ${String(shape.lengthPx)} outside [${String(lo)}, ${String(hi)}]`);
  }
  if (shape.scrollSec !== undefined) {
    if (shape.scrollSec < bounds.scrollSec[0] || shape.scrollSec > bounds.scrollSec[1])
      out.push(
        `scroll ${String(shape.scrollSec)} s outside [${String(bounds.scrollSec[0])}, ${String(
          bounds.scrollSec[1],
        )}]`,
      );
  }
  if (
    bounds.checkpointsMin !== null &&
    shape.checkpoints !== undefined &&
    shape.checkpoints < bounds.checkpointsMin
  )
    out.push(`${String(shape.checkpoints)} checkpoints under ${String(bounds.checkpointsMin)}`);
  if (
    shape.directItems !== undefined &&
    (shape.directItems < bounds.directItems[0] || shape.directItems > bounds.directItems[1])
  )
    out.push(
      `${String(shape.directItems)} item-plan entries outside [${String(
        bounds.directItems[0],
      )}, ${String(bounds.directItems[1])}]`,
    );
  return out;
}

/** The violations against a contract's live branch (the flag picks scale 1 / {@link K}). */
export function contractViolations(contract: ZoneContract, shape: StageShape): string[] {
  return shapeViolations(boundsOf(contract), contract.remastered ? 1 : K, shape);
}

/** Every campaign zone's content contract, keyed by its letter. */
export const ZONE_CONTRACTS = {
  a: zoneAContract,
  b: zoneBContract,
  c: zoneCContract,
  d: zoneDContract,
  e: zoneEContract,
  f: zoneFContract,
  g: zoneGContract,
  h: zoneHContract,
  i: zoneIContract,
} as const;

/**
 * Steps a game with its events dropped.
 *
 * @param game - The game.
 * @param ticks - Ticks.
 */
export function steps(game: Game, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    game.step();
    game.events.clear();
  }
}

/**
 * Steps a game until a condition holds (or fails the test after `limit` ticks).
 *
 * @param game - The game.
 * @param done - The condition.
 * @param limit - Most ticks.
 * @returns Ticks stepped.
 */
export function stepUntil(game: Game, done: () => boolean, limit: number): number {
  let t = 0;
  for (; t < limit && !done(); t++) {
    game.step();
    game.events.clear();
  }
  expect(done(), `not reached in ${String(limit)} ticks`).toBe(true);
  return t;
}

/**
 * Checks that player 1 flies in open space inside the view: alive, its terrain box clear of rock
 * and of every destructible tile, inside the playfield.
 *
 * @param world - The World.
 * @param where - A label for the failure message.
 */
export function expectInOpenSpace(world: World, where: string): void {
  const ship = world.players[0];
  const map = world.terrain;
  expect(ship.state, where).toBe('alive');
  if (map !== null) {
    const box = world.ship.terrainBox;
    expect(boxHitsTerrain(map, ship.x, ship.y, box.hw, box.hh), where).toBe(TerrainType.Empty);
  }
  expect(ship.x - world.camera.x, where).toBeGreaterThan(0);
  expect(ship.x - world.camera.x, where).toBeLessThan(PLAYFIELD_W);
  expect(ship.y - world.camera.y, where).toBeGreaterThan(8);
  expect(ship.y - world.camera.y, where).toBeLessThan(PLAYFIELD_H - 8);
}

/**
 * Asserts the camera sits within one tick of scroll of `x`: a practice start or checkpoint
 * jump lands a fraction of a scroll step past its (ported) checkpoint after the first tick.
 *
 * @param world - The running World.
 * @param x - The checkpoint's world x.
 */
export function expectCameraAt(world: World, x: number): void {
  let speed = 0;
  for (const key of world.stage?.stage.camera ?? []) {
    if (key.x <= x + 1e-6) speed = key.speed;
  }
  expect(world.camera.x).toBeGreaterThanOrEqual(x);
  expect(world.camera.x).toBeLessThan(x + Math.max(speed, v1rel(1)));
}

/**
 * Crashes player 1 (god mode off for the hit, back on after) and waits until it flies again.
 *
 * @param game - The game.
 */
export function crash(game: Game): void {
  const world = game.world;
  const ship = world.players[0];
  stepUntil(game, () => ship.state === 'alive' && ship.invulnTicks === 0, 400);
  world.debugFlags.godMode = false;
  expect(playerHit(ship, PlayerHitCause.Terrain, world.tick, world.debugFlags)).toBe(true);
  game.step();
  game.events.clear();
  expect(ship.state).toBe('dying');
  world.debugFlags.godMode = true;
}
