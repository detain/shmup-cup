/**
 * Player shots meeting the terrain hit the destructible tile there (plan M2-07, `core/weapons` →
 * the World's stage gimmicks `hitTerrain`), per shot kind, in a World on a still stage with a
 * flat floor (top at y 168) and a wall at x 240 … 247 standing on it:
 *
 * - a straight shot hits once, at the pixel where it met the wall, with its damage, credited to
 *   its player;
 * - a laser beam hits once when its head is blocked (at the wall's first column, on its row) —
 *   not again while it stays blocked;
 * - a ground-sliding missile hits the wall it slides into; a Spread Bomb hits where it bursts;
 * - a shot that never meets terrain (open space, off the top of the view) hits nothing;
 * - in co-op the break's points go to the player whose shot broke the brick.
 *
 * Every call reaches `hitTerrain` whether or not the tile breaks (rock answers `None`), so the
 * calls are recorded with a spy on the World's gimmicks.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { TerrainHit } from '../../src/collision/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import {
  ENGINE_SPRITES,
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

/** `terrain-a` tile ids: solid rock 1, brick 18 (hp 4, 10 points). */
const ROCK = 1;
const BRICK = 18;

/**
 * The content: both ships' weapons, `terrain-a` and a still stage with a floor and a wall column
 * (tile column 30, rows 5 … 20) of one tile.
 *
 * @param tile - The wall's tile id (0 = no wall).
 * @returns The DB.
 */
function db(tile: number): ContentDb {
  const rle: string[] = [];
  for (let r = 0; r < 25; r++) rle.push(tile > 0 && r >= 5 && r <= 20 ? `30*0, ${tile}` : '');
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('weapons/types-b-d.weapons.json'),
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
            rle,
            generator: {
              type: 'heightfield',
              segments: [{ from: 0, to: 2384, floor: { base: 32, amp: 0, period: 64, seed: 1 } }],
            },
          },
          events: [],
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

/** One recorded `hitTerrain` call. */
interface Hit {
  readonly px: number;
  readonly py: number;
  readonly amount: number;
  readonly by: number;
  readonly result: number;
}

/**
 * A world on the test stage, flown in without autofire, player 1 parked at (100, 100), with every
 * `hitTerrain` call recorded.
 *
 * @param content - The content.
 * @param config - Config fields over the defaults.
 * @returns The world and its recorded hits.
 */
function world(content: ContentDb, config: Partial<GameConfig> = {}): { w: World; hits: Hit[] } {
  const w = createWorld(
    resolveGameConfig({
      seed: 3,
      stage: 't',
      autofire: false,
      remoteMode: false,
      ...config,
    }),
    content,
  );
  w.debugFlags.godMode = true;
  const input = createInputSnapshot();
  for (let i = 0; i < 45; i++) stepWorld(w, input);
  w.players[0].x = 100;
  w.players[0].y = 100;
  const hits: Hit[] = [];
  const gimmicks = w.gimmicks;
  const real = gimmicks.hitTerrain.bind(gimmicks);
  gimmicks.hitTerrain = (px, py, amount, by) => {
    const result = real(px, py, amount, by);
    hits.push({ px, py, amount, by, result });
    return result;
  };
  return { w, hits };
}

/**
 * Steps a world with held masks for players 1 and 2.
 *
 * @param w - The world.
 * @param held - Player 1's held actions.
 * @param n - Ticks.
 * @param held2 - Player 2's held actions.
 */
function run(w: World, held: number, n: number, held2 = 0): void {
  const input = createInputSnapshot();
  for (let i = 0; i < n; i++) {
    commitPlayerInput(input.players[0], held);
    commitPlayerInput(input.players[1], held2);
    stepWorld(w, input);
  }
}

describe('core/weapons — shots hitting destructible terrain', () => {
  it('hits once per straight shot, where it met the wall, with its damage and its player', () => {
    const { w, hits } = world(db(ROCK));
    run(w, Action.Shot, 1);
    run(w, 0, 60);
    expect(hits).toHaveLength(1);
    const [hit] = hits;
    expect(hit.px).toBeGreaterThanOrEqual(240);
    expect(hit.px).toBeLessThanOrEqual(247);
    expect(Math.abs(hit.py - 100)).toBeLessThanOrEqual(8);
    expect(hit.amount).toBeGreaterThan(0);
    expect([hit.by, hit.result]).toEqual([0, TerrainHit.None]); // rock does not break
    expect(w.weapons.pool.count).toBe(0);
  });

  it('breaks a brick with enough shots: its points to the shooter', () => {
    const { w, hits } = world(db(BRICK));
    for (let k = 0; k < 12 && w.gimmicks.destructible?.destroyed === 0; k++) {
      run(w, Action.Shot, 1);
      run(w, 0, 20);
    }
    expect(w.gimmicks.destructible?.destroyed).toBe(1);
    expect(hits.map((h) => h.result)).toEqual([
      ...new Array<number>(hits.length - 1).fill(TerrainHit.Damaged),
      TerrainHit.Destroyed,
    ]);
    expect(w.scoring.board.scores[0].score).toBe(10);
  });

  it('hits nothing in open space', () => {
    const { w, hits } = world(db(0));
    run(w, Action.Shot, 1);
    run(w, 0, 80);
    expect(hits).toEqual([]);
  });

  it('hits once per laser beam, when its head is blocked, at the wall column', () => {
    const { w, hits } = world(db(ROCK), { loadout: 'full' });
    // The full Type A loadout: the ship's laser and one from each Option (all at the ship yet).
    const beams = 1 + w.weapons.loadouts[0].options;
    expect(beams).toBe(5);
    run(w, Action.Shot, 1);
    run(w, 0, 40);
    expect(hits).toHaveLength(beams);
    for (const hit of hits) expect([hit.px, hit.py, hit.by]).toEqual([240, 100, 0]);
    // The beams stay blocked at the wall until they are gone: no further hits.
    run(w, 0, 120);
    expect(hits).toHaveLength(beams);
  });

  it('hits the wall a sliding ground missile runs into', () => {
    const { w, hits } = world(db(ROCK), { loadout: 'full' });
    run(w, Action.Sub, 1);
    run(w, 0, 200);
    // Each missile dropped to the floor (top 168), slid right and died in the wall's foot.
    expect(hits.length).toBeGreaterThanOrEqual(1);
    for (const hit of hits) {
      expect(hit.px).toBeGreaterThanOrEqual(240);
      expect(hit.px).toBeLessThanOrEqual(247);
      expect(hit.py).toBeGreaterThan(150);
      expect(hit.py).toBeLessThan(168);
      expect(hit.by).toBe(0);
    }
    expect(w.weapons.pool.count).toBe(0);
  });

  it('hits where a Spread Bomb bursts on the terrain', () => {
    const { w, hits } = world(db(0), { loadout: 'full', weaponPreset: 'type-b' });
    run(w, Action.Sub, 1);
    run(w, 0, 200);
    // The bombs (the ship's and its Options') burst on the floor (no wall this time), at the
    // pixel of the floor's top rows their bottom met.
    expect(hits.length).toBeGreaterThanOrEqual(1);
    for (const hit of hits) {
      expect(hit.py).toBeGreaterThanOrEqual(168);
      expect(hit.py).toBeLessThan(176);
      expect(hit.result).toBe(TerrainHit.None);
      expect(hit.by).toBe(0);
    }
    expect(w.weapons.pool.count).toBe(0);
  });

  it('credits a brick broken by player 2 in co-op to player 2', () => {
    const { w } = world(db(BRICK), { coop: true });
    expect(joinPlayer(w, 1)).toBe(true);
    run(w, 0, 60);
    const p2 = w.players[1];
    expect(p2.state).toBe('alive');
    // Player 1 above the wall's top, player 2 on a brick row.
    w.players[0].y = 20;
    p2.x = 100;
    p2.y = 120;
    for (let k = 0; k < 12 && w.gimmicks.destructible?.destroyed === 0; k++) {
      run(w, 0, 1, Action.Shot);
      run(w, 0, 20);
    }
    expect(w.gimmicks.destructible?.destroyed).toBe(1);
    expect(w.scoring.board.scores.map((s) => s.score)).toEqual([0, 10]);
  });
});
