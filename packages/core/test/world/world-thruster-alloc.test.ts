/**
 * R4-01.A2 — allocation guard of the thruster push: `syncWorldView` now writes two slots per
 * player (the flame behind the hull), at whole-pixel positions computed with `Math.floor(x) | 0`
 * and a `(tick >> 2) & 3` frame — all integers, so the extra push must cost nothing. A powered
 * KESTREL flies the open stage, steering in circles (the ship's x drifts through fractions every
 * tick — exactly the value a boxing bug would leak), autofiring, while the camera scrolls; the
 * tick index never repeats across the warm-up and the windows. The budget is the one every World
 * guard uses.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
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

/** The KESTREL, Type A and an open scrolling stage. */
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

/** The circle's eight stick states, built once — never inside the measured loop. */
const CIRCLE: readonly number[] = Object.freeze([
  Action.Up,
  Action.Up | Action.Right,
  Action.Right,
  Action.Down | Action.Right,
  Action.Down,
  Action.Down | Action.Left,
  Action.Left,
  Action.Up | Action.Left,
]);

describe('core/world allocation — the thruster push (R4-01.A2)', () => {
  it('allocates nothing over ticks that sync the player batch with thrusters', () => {
    const w: World = createWorld(
      resolveGameConfig({ stage: 't', loadout: 'full', seed: 11, autofire: true }),
      db(),
    );
    const input = createInputSnapshot();
    while (w.players[0].state !== 'alive') stepWorld(w, input);
    const ship = w.players[0];
    let t = 0;
    const growth = measureHeapGrowth(
      () => {
        // A circle: the stick turns every 16 ticks, so ship.x / ship.y sit on a fresh fraction
        // on almost every call — the thruster's Math.floor runs on a different value each time.
        // `CIRCLE` is a module constant; an array literal here would allocate on every tick.
        commitPlayerInput(input.players[0], CIRCLE[((t / 16) | 0) % CIRCLE.length]);
        if (ship.lives < 3) ship.lives = 3;
        t++;
        stepWorld(w, input);
        w.events.clear();
      },
      10_000,
      20_000,
    );
    expect(w.status).toBe('playing');
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 120_000);
});
