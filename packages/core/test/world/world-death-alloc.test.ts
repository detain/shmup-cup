/**
 * Allocation guard of the life cycle (plan M1-12; definition of done: zero allocations per tick),
 * in its own file so the worker's V8 type feedback comes only from this world: a fully powered
 * KESTREL on a scrolling stage is shot down again and again — each death runs the whole sequence
 * (explosion events, hit-stop, shake, bullet cancel with sparkles, the `classic` penalty taking
 * one level), then `dying` → `dead` → the respawn fly-in with its invulnerability blink — while
 * the ship weaves and autofires and the score counts the capsules it picks up. Lives are topped up
 * so the game never ends. Rare events (a death every few seconds) run cold code that may cost a
 * few bytes each; the budget is the one every World guard uses.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BulletKind, spawnBullet } from '../../src/bullets/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { ItemKind } from '../../src/powerups/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld, type World } from '../../src/world/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

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
 * The KESTREL, Type A and an open stage scrolling at 0.75 px/tick (no terrain: only bullets kill).
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      {
        path: 'stages/t.stage.json',
        data: {
          formatVersion: 1,
          kind: 'stage',
          id: 't',
          name: 'T',
          music: { stage: 'Stage', boss: 'Boss' },
          length: 60000,
          camera: [{ x: 0, speed: 0.75 }],
          checkpoints: [{ x: 0 }],
          parallax: [],
          tilemap: {
            tileSize: 8,
            tileset: 'terrain-a',
            rowsTall: 25,
            rle: new Array<string>(25).fill(''),
          },
          events: [],
        },
      },
      shipped('tilesets/terrain-a.tileset.json'),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

/**
 * A fully powered world (the `classic` penalty, the default), its ship alive.
 *
 * @returns The world.
 */
function world(): World {
  const w = createWorld(resolveGameConfig({ stage: 't', loadout: 'full', seed: 21 }), db());
  const input = createInputSnapshot();
  while (w.players[0].state !== 'alive') stepWorld(w, input);
  return w;
}

describe('core/world allocation — death and respawn (M1-12)', () => {
  it('allocates nothing over ticks with repeated deaths, penalties and respawns', () => {
    const w = world();
    const ship = w.players[0];
    const input = createInputSnapshot();
    let t = 0;
    let deaths = 0;
    let respawns = 0;
    const growth = measureHeapGrowth(
      () => {
        commitPlayerInput(input.players[0], (t / 24) % 2 < 1 ? Action.Up : Action.Down);
        const sx = Math.floor(ship.x) | 0;
        const sy = Math.floor(ship.y) | 0;
        // A few bullets on screen (cancelled by each death), one on the ship now and then.
        if (t % 7 === 0) spawnBullet(w, sx + 120, sy, 0, 0, BulletKind.RoundPink);
        if (t % 97 === 0) spawnBullet(w, sx, sy, 0, 0, BulletKind.OvalRed);
        if (t % 15 === 0) w.powerups.spawnItem(ItemKind.Capsule, sx + 10, sy);
        if (ship.lives < 3) ship.lives = 3;
        const before = ship.state;
        t++;
        stepWorld(w, input);
        if (before === 'alive' && ship.state === 'dying') deaths++;
        if (before === 'dead' && ship.state === 'respawning') respawns++;
        w.events.clear();
      },
      10_000,
      20_000,
    );
    expect(deaths).toBeGreaterThan(40);
    expect(respawns).toBeGreaterThan(40);
    expect(w.scoring.board.scores[0].score).toBeGreaterThan(0);
    expect(w.status).toBe('playing');
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 120_000);
});
