/**
 * Allocation guard of a two-player co-op game (plan M2-06; definition of done: zero allocations
 * per tick), in its own file so the worker's V8 type feedback comes only from this world: two fully
 * powered KESTRELs on a scrolling stage weave and autofire, both collect capsules (the co-op drop
 * scaling credit counts on drops — here the capsules are spawned directly), bullets now and then
 * shoot player 2 down (the death sequence, the `classic` penalty, the respawn fly-in), and player 2
 * runs out of lives and **continues with START** mid-game again and again (the join path:
 * `joinPlayer` in phase 1) while player 1 plays on. Rare events run cold code that may cost a few
 * bytes each; the budget is the one every World guard uses.
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
          tilemap: null,
          events: [],
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

/**
 * A fully powered co-op world with player 2 joined, both ships alive.
 *
 * @returns The world.
 */
function world(): World {
  const config = resolveGameConfig({ stage: 't', loadout: 'full', seed: 23, coop: true });
  const w = createWorld(config, db());
  const input = createInputSnapshot();
  commitPlayerInput(input.players[1], Action.Pause);
  stepWorld(w, input);
  commitPlayerInput(input.players[1], 0);
  while (w.players[0].state !== 'alive' || w.players[1].state !== 'alive') stepWorld(w, input);
  return w;
}

describe('core/world allocation — two-player co-op (M2-06)', () => {
  it('allocates nothing over co-op ticks with deaths, drop-in continues and pickups', () => {
    const w = world();
    const [p1, p2] = w.players;
    const score2 = w.scoring.board.scores[1];
    const input = createInputSnapshot();
    let t = 0;
    let deaths = 0;
    let continues = 0;
    const growth = measureHeapGrowth(
      () => {
        commitPlayerInput(input.players[0], (t / 24) % 2 < 1 ? Action.Up : Action.Down);
        // Player 2 weaves the other way and presses START every 32 ticks (a continue once out).
        const start = t % 32 === 0 ? Action.Pause : 0;
        commitPlayerInput(input.players[1], ((t / 20) % 2 < 1 ? Action.Down : Action.Up) | start);
        const x2 = Math.floor(p2.x) | 0;
        const y2 = Math.floor(p2.y) | 0;
        const x1 = Math.floor(p1.x) | 0;
        const y1 = Math.floor(p1.y) | 0;
        if (t % 7 === 0) spawnBullet(w, x2 + 120, y2, 0, 0, BulletKind.RoundPink);
        if (t % 61 === 0) spawnBullet(w, x2, y2, 0, 0, BulletKind.OvalRed);
        if (t % 15 === 0) w.powerups.spawnItem(ItemKind.Capsule, x1 + 10, y1);
        if (t % 17 === 0) w.powerups.spawnItem(ItemKind.Capsule, x2 + 10, y2);
        if (p1.lives < 3) p1.lives = 3;
        // Player 2's continues never run out (its score's digit keeps counting them).
        if (score2.continues >= 3) score2.continues = 0;
        const before = p2.state;
        const used = w.continuesUsed;
        t++;
        stepWorld(w, input);
        if (before === 'alive' && p2.state === 'dying') deaths++;
        if (w.continuesUsed !== used) continues++;
        w.events.clear();
      },
      10_000,
      20_000,
    );
    expect(deaths).toBeGreaterThan(20);
    expect(continues).toBeGreaterThan(5);
    expect(w.status).toBe('playing');
    expect(w.scoring.board.scores[1].score).toBeGreaterThan(0);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 120_000);
});
