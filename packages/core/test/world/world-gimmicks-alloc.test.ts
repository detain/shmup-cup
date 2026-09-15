/**
 * Allocation guard of the advanced stage systems (plan M2-07; definition of done: zero allocations
 * per tick), in its own file so the worker's V8 type feedback comes only from this world: a
 * shooting, weaving KESTREL on a stage with regenerating tissue it keeps breaking (heal, regrow,
 * the keep-out of its own terrain box), swinging moving blocks, an armed region trigger it keeps
 * crossing, a camera path with holds and diagonal pans, and a suction pod's pull field on it. Enemy
 * spawns stay out of the measured window (each coroutine allocates its generator — D29).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { MoverKind, setMover } from '../../src/patterns/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld } from '../../src/world/index.js';
import { KNOWN_SCRIPT_IDS } from '../../src/behaviors/index.js';
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
 * RLE rows: a tissue column (`terrain-a` tile 20) at tile columns 22 and 30, rows 8…16.
 *
 * @returns The 25 rows.
 */
function tissue(): string[] {
  const rows: string[] = [];
  for (let r = 0; r < 25; r++) rows.push(r >= 8 && r <= 16 ? '22*0, 20, 7*0, 20' : '');
  return rows;
}

/**
 * Stage length (px). At 0.1 px per tick the camera must stay inside the stage for the setup
 * ticks, the whole warm-up and every measured window the helper may run (3 × 10,000 when the
 * suite is loaded): 80 + 20,000 + 30,000 ticks ≈ 5,008 px. A shorter stage ends inside a
 * later window and the blocks vanish — a false failure exactly when load forces more windows.
 */
const STAGE_LENGTH = 6400;

/**
 * The KESTREL, Type A, `terrain-a`, the gimmick roster and a long, slow stage full of M2-07
 * systems.
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const events: unknown[] = [];
  for (let x = 0; x < STAGE_LENGTH - 200; x += 200) {
    events.push({ x, type: 'block', screenX: 250, y: 40, w: 16, h: 8, dy: 24, period: 90 });
    events.push({
      x: x + 1,
      type: 'trigger',
      flag: 'band',
      region: { x: x, y: 60, w: 400, h: 30 },
    });
  }
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('tilesets/terrain-a.tileset.json'),
      shipped('enemies/gimmick-range.enemies.json'),
      {
        path: 'stages/t.stage.json',
        data: {
          formatVersion: 1,
          kind: 'stage',
          id: 't',
          name: 'T',
          music: { stage: 'Stage', boss: 'Boss' },
          length: STAGE_LENGTH,
          camera: [
            { x: 0, speed: 0.1 },
            { x: 20, speed: 0.1, hold: 30, yTo: 8, yTicks: 20 },
            { x: 40, speed: 0.1, yTo: 0, yOver: 60 },
          ],
          checkpoints: [{ x: 0 }],
          parallax: [],
          tilemap: {
            tileSize: 8,
            tileset: 'terrain-a',
            rowsTall: 25,
            rle: tissue(),
            generator: {
              type: 'heightfield',
              segments: [
                {
                  from: 0,
                  to: STAGE_LENGTH + 384,
                  floor: { base: 24, amp: 0, period: 64, seed: 1 },
                },
              ],
            },
          },
          events,
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES, knownScripts: KNOWN_SCRIPT_IDS },
  );
  expect(issues).toEqual([]);
  return content;
}

describe('core/world allocation — stage gimmicks (M2-07)', () => {
  it('allocates nothing over ticks of breaking, regrowing, swinging, triggering and pulling', () => {
    const w = createWorld(resolveGameConfig({ stage: 't', seed: 29, loadout: 'full' }), db());
    w.debugFlags.godMode = true;
    const input = createInputSnapshot();
    for (let i = 0; i < 60; i++) stepWorld(w, input);
    // A suction pod that stays put above the ship (outside the measured window).
    const pod = w.enemies.spawn(w.content.enemyIndex.get('suction-pod') ?? -1, 250, 150);
    if (pod === null) throw new Error('no pod');
    for (let i = 0; i < 20; i++) stepWorld(w, input);
    setMover(pod, w.enemies.movers, MoverKind.None);
    pod.hp = 1e9;
    let t = 0;
    const growth = measureHeapGrowth(
      () => {
        const dir = (t / 30) % 2 < 1 ? Action.Up : Action.Down;
        commitPlayerInput(input.players[0], Action.Shot | dir);
        t++;
        stepWorld(w, input);
        w.events.clear();
      },
      10_000,
      20_000,
    );
    const d = w.gimmicks.destructible;
    expect(d?.count).toBeGreaterThan(20); // broke and regrew all along
    expect(w.stage?.triggersFired).toBeGreaterThan(0);
    expect(w.gimmicks.blocks?.blocks.count).toBeGreaterThan(0);
    expect(w.gimmicks.fieldOwner[0]).toBe(pod.slot);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 120_000);
});
