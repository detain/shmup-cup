/**
 * Edge cases of the World running the M2-07 stage systems, beyond `world-gimmicks.test.ts`:
 *
 * - the terrain rollback on every path back to a checkpoint: an Arcade-penalty death, a continue
 *   after the game is over and the debug jump (`StageRunner.jumpTo`); none after a Classic death
 *   (the ship respawns in place, the stage goes on);
 * - regrowth waiting while a ship sits in the broken cell, then growing once it leaves;
 * - `hashWorld` telling worlds apart by damaged tiles, block positions, pull fields and chains;
 * - a branch-gated block respawned after a restart only when its branch is taken;
 * - free flight and a stage without blocks (no block batch in the view; the chain batch last);
 * - region triggers probed only by living ships — a dying ship does not fire one, player 2 does.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { EnemyState, type Enemy } from '../../src/enemies/index.js';
import {
  commitPlayerInput,
  createInputSnapshot,
  type InputSnapshot,
} from '../../src/input/index.js';
import {
  ENGINE_SPRITES,
  continueWorld,
  createWorld,
  joinPlayer,
  stepWorld,
  type World,
} from '../../src/world/index.js';

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

/** Tile ids of `terrain-a`: brick 18, tissue 20. */
const BRICK = 18;
const TISSUE = 20;

/**
 * RLE rows (25) with a column of one tile at a tile column over some rows.
 *
 * @param col - Tile column.
 * @param rows - Rows `[first, last]`.
 * @param tile - Tile id.
 * @returns The rows.
 */
function column(col: number, rows: [number, number], tile: number): string[] {
  const out: string[] = [];
  for (let r = 0; r < 25; r++) out.push(r >= rows[0] && r <= rows[1] ? `${col}*0, ${tile}` : '');
  return out;
}

/**
 * The KESTREL, Type A, `terrain-a` and a test stage with a floor (top at y 168).
 *
 * @param stage - Stage fields over the defaults.
 * @returns The DB.
 */
function db(stage: Record<string, unknown> = {}): ContentDb {
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('tilesets/terrain-a.tileset.json'),
      {
        path: 'stages/t.stage.json',
        data: {
          formatVersion: 1,
          kind: 'stage',
          id: 't',
          name: 'T',
          music: { stage: 'Stage', boss: 'Boss' },
          length: 2000,
          camera: [{ x: 0, speed: 0 }],
          checkpoints: [{ x: 0 }],
          parallax: [],
          tilemap: {
            tileSize: 8,
            tileset: 'terrain-a',
            rowsTall: 25,
            rle: column(20, [10, 14], BRICK),
            generator: {
              type: 'heightfield',
              segments: [{ from: 0, to: 2384, floor: { base: 32, amp: 0, period: 64, seed: 1 } }],
            },
          },
          events: [],
          ...stage,
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

const BRICKS = db();

/**
 * A world on the test stage, flown in.
 *
 * @param content - Content.
 * @param config - Config over the defaults.
 * @returns The world.
 */
function world(content: ContentDb = BRICKS, config: Partial<GameConfig> = {}): World {
  const w = createWorld(resolveGameConfig({ seed: 1, stage: 't', ...config }), content);
  run(w, createInputSnapshot(), 45);
  return w;
}

/**
 * Steps a world with no input.
 *
 * @param w - The world.
 * @param input - Snapshot to reuse.
 * @param n - Ticks.
 */
function run(w: World, input: InputSnapshot, n: number): void {
  for (let i = 0; i < n; i++) {
    commitPlayerInput(input.players[0], 0);
    stepWorld(w, input);
  }
}

/**
 * Breaks the brick at cell (20, 12) with a direct hit.
 *
 * @param w - The world.
 */
function breakBrick(w: World): void {
  const d = w.gimmicks.destructible;
  if (d === null) throw new Error('no destructible terrain');
  expect(d.hit(164, 100, 99)).toBe(2);
  expect(cell(w)).toBe(0);
}

/**
 * The tile at cell (20, 12).
 *
 * @param w - The world.
 * @returns The tile id.
 */
function cell(w: World): number {
  const map = w.terrain;
  if (map === null) throw new Error('no terrain');
  return map.tiles[12 * map.cols + 20];
}

/**
 * Flies player 1 into the floor (it dies of terrain) and runs until the death is resolved.
 *
 * @param w - The world.
 * @param input - Snapshot.
 * @param until - Stop condition.
 */
function crash(w: World, input: InputSnapshot, until: () => boolean): void {
  w.players[0].y = 190;
  for (let t = 0; t < 600 && !until(); t++) run(w, input, 1);
  expect(until()).toBe(true);
}

describe('core/world gimmicks edge — the terrain rollback', () => {
  it('restores the tiles after an Arcade-penalty death (the checkpoint restart)', () => {
    const w = world(BRICKS, { deathPenalty: 'arcade' });
    breakBrick(w);
    const resets = w.gimmicks.destructible?.resets ?? -1;
    crash(w, createInputSnapshot(), () => (w.gimmicks.destructible?.resets ?? 0) > resets);
    expect(cell(w)).toBe(BRICK);
    expect(w.gimmicks.destructible?.destroyed).toBe(0);
  });

  it('keeps the broken tiles after a Classic death (the ship respawns in place)', () => {
    const w = world(BRICKS, { deathPenalty: 'classic' });
    breakBrick(w);
    const input = createInputSnapshot();
    crash(w, input, () => w.players[0].state === 'dying');
    run(w, input, 300);
    expect(w.gimmicks.destructible?.resets).toBe(0);
    expect(cell(w)).toBe(0);
  });

  it('restores the tiles on a continue after the game is over', () => {
    const w = world(BRICKS, { startingLives: 1, continues: 3 });
    breakBrick(w);
    crash(w, createInputSnapshot(), () => w.status === 'gameOver');
    expect(cell(w)).toBe(0);
    expect(continueWorld(w)).toBe(true);
    expect(cell(w)).toBe(BRICK);
    expect(w.gimmicks.destructible?.resets).toBe(1);
  });

  it('restores the tiles on a debug jump', () => {
    const w = world();
    breakBrick(w);
    w.stage?.jumpTo(500);
    expect(cell(w)).toBe(BRICK);
  });
});

describe('core/world gimmicks edge — regrowth around the ship', () => {
  it('waits while the ship sits in the broken cell and grows once it has left', () => {
    const w = world(
      db({
        tilemap: {
          tileSize: 8,
          tileset: 'terrain-a',
          rowsTall: 25,
          rle: column(20, [12, 12], TISSUE),
        },
      }),
    );
    w.debugFlags.godMode = true;
    const d = w.gimmicks.destructible;
    if (d === null) throw new Error('no destructible terrain');
    expect(d.hit(164, 100, 99)).toBe(2);
    const ship = w.players[0];
    ship.x = 164;
    ship.y = 100;
    const input = createInputSnapshot();
    run(w, input, 400); // tissue regrows after 240 ticks — not onto the ship
    expect(cell(w)).toBe(0);
    expect(d.entries).toBe(1);
    ship.x = 100;
    run(w, input, 1);
    expect(cell(w)).toBe(TISSUE);
    expect(d.entries).toBe(0);
  });
});

describe('core/world gimmicks edge — hashWorld', () => {
  const BLOCK = db({
    camera: [{ x: 0, speed: 0.5 }],
    events: [{ x: 0, type: 'block', screenX: 200, y: 60, w: 16, h: 8, dy: 10, period: 60 }],
  });

  it('tells worlds apart by damage, placed tiles, blocks, fields and chains', () => {
    const pair = (): [World, World] => [world(BLOCK), world(BLOCK)];
    let [a, b] = pair();
    expect(hashWorld(a)).toBe(hashWorld(b));
    // Damage (a tracked entry), then a break (the change log).
    a.gimmicks.destructible?.hit(164, 100, 1);
    expect(hashWorld(a)).not.toBe(hashWorld(b));
    b.gimmicks.destructible?.hit(164, 100, 1);
    expect(hashWorld(a)).toBe(hashWorld(b));
    a.gimmicks.placeTile(8, 8, 1);
    expect(hashWorld(a)).not.toBe(hashWorld(b));
    // A block one pixel off.
    [a, b] = pair();
    const geometry = a.gimmicks.blocks?.blocks;
    if (geometry === undefined) throw new Error('no blocks');
    expect(a.gimmicks.blocks?.slotEvent[0]).toBe(0);
    geometry.y0[0]++;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
    // A pull field and a chain (this content has no enemies: a stand-in owner).
    [a, b] = pair();
    const fake = { slot: 0, spawnTick: a.tick, state: EnemyState.Live, x: 300, y: 60 } as Enemy;
    a.gimmicks.pull(fake, 30, 1, 0);
    expect(hashWorld(a)).not.toBe(hashWorld(b));
    b.gimmicks.pull(fake, 30, 1, 0);
    expect(hashWorld(a)).toBe(hashWorld(b));
    a.gimmicks.chain(fake, 0, 0, 4);
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});

describe('core/world gimmicks edge — blocks, branches and views', () => {
  const BRANCHED = db({
    camera: [{ x: 0, speed: 1 }],
    checkpoints: [{ x: 0 }, { x: 100 }],
    branches: [{ id: 'b', flag: 'open' }],
    events: [
      { x: 10, type: 'flag', flag: 'open' },
      { x: 50, type: 'block', screenX: 100, y: 60, w: 8, h: 8, branch: 'b' },
      { x: 60, type: 'block', screenX: 100, y: 90, w: 8, h: 8 },
    ],
  });

  it('respawns a branch-gated block after a restart only while its branch is taken', () => {
    const w = world(BRANCHED);
    const blocks = w.gimmicks.blocks;
    if (blocks === null || w.stage === null) throw new Error('no blocks');
    run(w, createInputSnapshot(), 80);
    expect(
      Array.from(blocks.slotEvent)
        .filter((e) => e >= 0)
        .sort(),
    ).toEqual([1, 2]);
    w.stage.restartAt(1); // the flag event at 10 re-applies: the branch is taken
    expect(
      Array.from(blocks.slotEvent)
        .filter((e) => e >= 0)
        .sort(),
    ).toEqual([1, 2]);
    // Without the flag event (a stage where it is cleared again first) the gated block stays away.
    const closed = db({
      camera: [{ x: 0, speed: 1 }],
      checkpoints: [{ x: 0 }, { x: 100 }],
      branches: [{ id: 'b', flag: 'open' }],
      events: [
        { x: 10, type: 'flag', flag: 'open' },
        { x: 40, type: 'flag', flag: 'open', value: false },
        { x: 50, type: 'block', screenX: 100, y: 60, w: 8, h: 8, branch: 'b' },
        { x: 60, type: 'block', screenX: 100, y: 90, w: 8, h: 8 },
      ],
    });
    const c = world(closed);
    c.stage?.restartAt(1);
    expect(Array.from(c.gimmicks.blocks?.slotEvent ?? []).filter((e) => e >= 0)).toEqual([3]);
  });

  it('has no block batch without block events, and nothing at all in free flight', () => {
    const w = world();
    expect(w.gimmicks.blocks).toBeNull();
    expect(w.view.batches[w.view.batches.length - 1]).toBe(w.gimmicks.chainBatch);
    expect(w.view.terrain?.changes).toBe(w.gimmicks.destructible);
    const free = createWorld(resolveGameConfig({ seed: 1, stage: null }), BRICKS);
    expect([free.gimmicks.destructible, free.gimmicks.blocks, free.view.terrain]).toEqual([
      null,
      null,
      null,
    ]);
    run(free, createInputSnapshot(), 120);
    expect(free.tick).toBe(120);
  });
});

describe('core/world gimmicks edge — region triggers', () => {
  const TRIGGER = db({
    events: [{ x: 0, type: 'trigger', flag: 'hit', region: { x: 150, y: 80, w: 40, h: 40 } }],
  });

  it('is not fired by a dying ship; a living player 2 fires it', () => {
    const w = world(TRIGGER, { coop: true });
    const stage = w.stage;
    if (stage === null) throw new Error('no stage');
    const input = createInputSnapshot();
    expect(stage.triggersArmed).toBe(1);
    const p1 = w.players[0];
    p1.state = 'dying';
    p1.x = 160;
    p1.y = 100;
    // The stage phase's probe on its own (a World step would move the dying ship on).
    w.gimmicks.updateStage(stage);
    expect(stage.triggersArmed).toBe(1);
    p1.state = 'alive';
    p1.y = 20;
    expect(joinPlayer(w, 1)).toBe(true);
    run(w, input, 60);
    const p2 = w.players[1];
    expect(p2.state).toBe('alive');
    p2.x = 170;
    p2.y = 90;
    run(w, input, 1);
    expect([stage.triggersArmed, stage.triggersFired, stage.flags]).toEqual([0, 1, 1]);
  });
});
