/**
 * Edge cases of the World running a stage (plan M1-07), beyond `world-stage.test.ts`: hit-stop
 * freezes the camera path and the timeline (the parallax view stays put), the ship rides along
 * a vertical pan and sits still on screen during a boss lock, several timeline music events on
 * one tick become queued music events in order, an open-space stage (no tilemap, no parallax)
 * and a stage whose tileset failed to load run without terrain, terrain hits for an active
 * player 2 but never an inactive one, hazard tiles hit, decorative tiles never do, ceilings hit,
 * and `stageClear` holds while the World keeps ticking to the stage end.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { MUSIC_CUES, SimEventKind } from '../../src/events/index.js';
import {
  Action,
  commitPlayerInput,
  createInputSnapshot,
  type InputSnapshot,
} from '../../src/input/index.js';
import { PlayerHitCause, spawnPlayer } from '../../src/player/index.js';
import { createWorld, stepWorld, type World } from '../../src/world/index.js';

/**
 * Reads a shipped content file.
 *
 * @param path - Path below `content/`.
 * @returns The parsed JSON.
 */
function shipped(path: string): unknown {
  return JSON.parse(
    readFileSync(new URL('../../../../content/' + path, import.meta.url), 'utf8'),
  ) as unknown;
}

/** A tileset with rock (1), spikes (2, hazard) and a vine (3, decoration). */
const MIXED = {
  formatVersion: 1,
  kind: 'tileset',
  id: 'mixed',
  sprite: 'tiles/terrain-a',
  tileSize: 8,
  tiles: [
    { name: 'rock', type: 'solid', frame: 0, anchor: 'floor', mask: [8, 8, 8, 8, 8, 8, 8, 8] },
    { name: 'spikes', type: 'hazard', frame: 7, anchor: 'floor', mask: [8, 8, 8, 8, 8, 8, 8, 8] },
    { name: 'vine', type: 'empty', frame: 1, anchor: 'floor', mask: [8, 8, 8, 8, 8, 8, 8, 8] },
  ],
};

/**
 * Content with the KESTREL, the `mixed` tileset and one stage.
 *
 * @param stage - Stage fields over an open-space stage (length 2000, speed 1).
 * @param extra - More content files.
 * @returns The DB and the load issues.
 */
function load(
  stage: Record<string, unknown>,
  extra: ContentFile[] = [],
): { db: ContentDb; issues: readonly { path: string; message: string }[] } {
  return loadContent([
    { path: 'player/kestrel.player.json', data: shipped('player/kestrel.player.json') },
    { path: 'tilesets/mixed.tileset.json', data: MIXED },
    {
      path: 'stages/t.stage.json',
      data: {
        formatVersion: 1,
        kind: 'stage',
        id: 't',
        name: 'T',
        music: { stage: 'Stage', boss: 'Boss' },
        length: 2000,
        camera: [{ x: 0, speed: 1 }],
        checkpoints: [],
        parallax: [],
        tilemap: null,
        events: [],
        ...stage,
      },
    },
    ...extra,
  ]);
}

/**
 * A world on a stage (asserting the content loads cleanly).
 *
 * @param stage - Stage fields.
 * @returns The world.
 */
function world(stage: Record<string, unknown>): World {
  const { db, issues } = load(stage);
  expect(issues).toEqual([]);
  return createWorld(resolveGameConfig({ seed: 3, stage: 't' }), db);
}

/**
 * RLE rows (25) with one row filled with a tile id.
 *
 * @param row - Map row.
 * @param id - Tile id.
 * @returns The rows.
 */
function band(row: number, id: number): string[] {
  const rows = new Array<string>(25).fill('');
  rows[row] = '298*' + String(id); // (2000 + 384) / 8 columns
  return rows;
}

/**
 * Steps a world `n` times with one held mask for player 1.
 *
 * @param w - The world.
 * @param input - Snapshot to reuse.
 * @param held - Held actions.
 * @param n - Ticks.
 */
function run(w: World, input: InputSnapshot, held: number, n: number): void {
  for (let i = 0; i < n; i++) {
    commitPlayerInput(input.players[0], held);
    stepWorld(w, input);
  }
}

describe('core/world stage edge — camera and timeline', () => {
  it('freezes the camera path, the timeline and the parallax during hit-stop', () => {
    const w = world({
      parallax: [{ layer: 'far', sprite: 'bg/stars-far', factor: 0.5, y: 0, spacing: 128 }],
      events: [{ x: 12, type: 'flag', flag: 'x' }],
    });
    const input = createInputSnapshot();
    run(w, input, 0, 10);
    expect(w.camera.x).toBe(10);
    w.hitStop = 5;
    run(w, input, 0, 5);
    expect([w.camera.x, w.stage?.flags, w.stage?.ticks, w.parallax?.offsetX[0]]).toEqual([
      10, 0, 10, 5,
    ]);
    run(w, input, 0, 2);
    expect([w.camera.x, w.stage?.flags]).toEqual([12, 1]);
  });

  it('carries the ship along a vertical pan and keeps it still on screen while locked', () => {
    const w = world({
      camera: [
        { x: 0, speed: 1 },
        { x: 60, speed: 1, yTo: 80, yTicks: 20 },
        { x: 120, speed: 1, lock: true },
      ],
    });
    const input = createInputSnapshot();
    run(w, input, 0, 50);
    const ship = w.players[0];
    expect(ship.state).toBe('alive');
    // The ship rides the previous tick's camera step: its offset from the camera position
    // before the last step stays constant.
    const screen = [ship.x - (w.camera.x - w.camera.dx), ship.y - (w.camera.y - w.camera.dy)];
    const ys: number[] = [];
    for (let i = 0; i < 100; i++) {
      run(w, input, 0, 1);
      ys.push(w.camera.y);
      // (The eased pan's fractional steps accumulate rounding in the ship's y.)
      expect(ship.x - (w.camera.x - w.camera.dx)).toBe(screen[0]);
      expect(ship.y - (w.camera.y - w.camera.dy)).toBeCloseTo(screen[1], 9);
    }
    expect(ys[ys.length - 1]).toBe(80);
    expect(w.stage?.locked).toBe(true);
    expect([w.camera.x, w.camera.dx]).toEqual([120, 0]);
    expect(ship.x - w.camera.x).toBe(screen[0]);
    expect(ship.y - w.camera.y).toBeCloseTo(screen[1], 9);
  });

  it('queues several music events of one tick in timeline order', () => {
    const w = world({
      camera: [{ x: 0, speed: 5 }],
      events: [
        { x: 3, type: 'music', cue: 'Boss' },
        { x: 4, type: 'music', cue: 'Silence' },
        { x: 5, type: 'music', cue: 'Stage' },
      ],
    });
    const input = createInputSnapshot();
    const music: number[] = [];
    run(w, input, 0, 1);
    w.events.drain((event) => {
      if (event.kind === SimEventKind.Music) music.push(event.id);
    });
    expect(music).toEqual([
      MUSIC_CUES.Stage,
      MUSIC_CUES.Boss,
      MUSIC_CUES.Silence,
      MUSIC_CUES.Stage,
    ]);
  });

  it('keeps stageClear while the World ticks on to the stage end', () => {
    const w = world({ length: 50, camera: [{ x: 0, speed: 2 }], events: [{ x: 20, type: 'end' }] });
    const input = createInputSnapshot();
    run(w, input, 0, 10);
    expect(w.status).toBe('stageClear');
    run(w, input, 0, 40);
    expect([w.status, w.camera.x, w.camera.dx]).toEqual(['stageClear', 50, 0]);
  });
});

describe('core/world stage edge — stages without terrain', () => {
  it('runs an open-space stage with no terrain and no parallax', () => {
    const w = world({});
    expect([w.terrain, w.parallax, w.view.terrain, w.view.parallax]).toEqual([
      null,
      null,
      null,
      null,
    ]);
    const input = createInputSnapshot();
    run(w, input, Action.Down, 200);
    expect(w.players[0].hits).toBe(0);
    expect(w.camera.x).toBe(200);
  });

  it('runs a stage whose tileset is missing without terrain (the loader reported it)', () => {
    const { db, issues } = load({
      tilemap: { tileSize: 8, tileset: 'gone', rowsTall: 25, rle: band(24, 1) },
    });
    expect(issues.map((i) => i.message)).toEqual(['unknown tileset id "gone"']);
    const w = createWorld(resolveGameConfig({ stage: 't' }), db);
    expect([w.terrain, w.view.terrain]).toEqual([null, null]);
    const input = createInputSnapshot();
    run(w, input, Action.Down, 150);
    expect(w.players[0].hits).toBe(0);
  });
});

describe('core/world stage edge — terrain hits', () => {
  it('hits an active, alive player 2 but never an inactive one', () => {
    const w = world({ tilemap: { tileSize: 8, tileset: 'mixed', rowsTall: 25, rle: band(20, 1) } });
    const input = createInputSnapshot();
    run(w, input, 0, 45);
    const p2 = w.players[1];
    p2.x = w.camera.x + 100;
    p2.y = 164; // inside the rock band (world y 160 … 167)
    p2.state = 'alive';
    run(w, input, 0, 3);
    expect(p2.hits).toBe(0); // inactive
    p2.active = true;
    run(w, input, 0, 1);
    expect([p2.hits, p2.hitCause]).toEqual([1, PlayerHitCause.Terrain]);
    expect(w.players[0].hits).toBe(0); // player 1 flies above the band
  });

  it('does not hit a player 2 still flying in', () => {
    const w = world({ tilemap: { tileSize: 8, tileset: 'mixed', rowsTall: 25, rle: band(12, 1) } });
    const input = createInputSnapshot();
    const p2 = w.players[1];
    p2.active = true;
    spawnPlayer(p2, w.camera); // y 100: inside the rock band (world y 96 … 103)
    run(w, input, 0, 30);
    expect(p2.state).toBe('entering');
    expect(p2.hits).toBe(0);
    run(w, input, 0, 15);
    expect(p2.hits).toBeGreaterThan(0);
  });

  it('hits on hazard tiles, never on decorative ones, and on a ceiling', () => {
    const hazard = world({
      tilemap: { tileSize: 8, tileset: 'mixed', rowsTall: 25, rle: band(22, 2) },
    });
    const vine = world({
      tilemap: { tileSize: 8, tileset: 'mixed', rowsTall: 25, rle: band(22, 3) },
    });
    const ceiling = world({
      tilemap: { tileSize: 8, tileset: 'mixed', rowsTall: 25, rle: band(2, 1) },
    });
    const input = createInputSnapshot();
    for (const w of [hazard, vine]) run(w, input, Action.Down, 150);
    run(ceiling, input, Action.Up, 150);
    expect(hazard.players[0].hits).toBeGreaterThan(0);
    expect(hazard.players[0].hitCause).toBe(PlayerHitCause.Terrain);
    expect(vine.players[0].hits).toBe(0);
    expect(ceiling.players[0].hits).toBeGreaterThan(0);
    // The ship's clamp keeps it 6 px off the bottom edge (world y 194): the vine row 22 covers
    // 176 … 183, so the ship really flew through it.
    expect(vine.players[0].y).toBeGreaterThan(183);
  });
});
