/**
 * Edge cases of the M2-07 gimmick behaviours (`core/behaviors`), with a test roster of variants
 * on a still stage between a flat floor (y 160) and a flat ceiling (y 32):
 *
 * - `defineBehavior` keeps a `death` callback only when given; the registry knows the six ids;
 * - `rock.fall`: a trigger of 0 falls at once; a stone keeps a `Ballistic` arc it was given;
 * - `bubble.split`: one child flies straight left, three fan out evenly, no child / `count` 0 do not
 *   split, a full enemy table drops the pieces quietly;
 * - `volcano.lob`: nothing while it may not fire (off screen) or without a child;
 * - `field.suction`: no pull until the pod is on screen;
 * - `tentacle.grab`: never lunges while no ship is in reach;
 * - `cube.stack`: without a target it flies straight left; a margin that leaves no span keeps the
 *   spawn row.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BEHAVIOR_DEFS,
  KNOWN_SCRIPT_IDS,
  defineBehavior,
} from '../../src/behaviors/index.js';
import { PLAYFIELD_H, resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { EnemyState, MAX_ENEMIES, type Enemy } from '../../src/enemies/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { ANGLE_UNITS, cosB, sinB } from '../../src/math/index.js';
import {
  BALLISTIC_FLYING,
  MoverKind,
  SLEEP_FOREVER,
  type Script,
} from '../../src/patterns/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld, type World } from '../../src/world/index.js';

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
 * A test roster entry.
 *
 * @param id - Enemy id.
 * @param script - Behaviour id.
 * @param over - Fields over a small flying enemy.
 * @returns The entry.
 */
function entry(
  id: string,
  script: string,
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    hp: 3,
    score: 100,
    hurtbox: { hw: 4, hh: 4 },
    script,
    sprite: 'enemies/bubble',
    drop: null,
    ...over,
  };
}

/** The test DB: the KESTREL, `terrain-a`, the variant roster and a still stage. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('tilesets/terrain-a.tileset.json'),
      {
        path: 'enemies/v.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [
            entry('piece', 'bubble.split', { hp: 1 }),
            entry('one', 'bubble.split', { child: 'piece', params: { count: 1 } }),
            entry('three', 'bubble.split', {
              child: 'piece',
              params: { count: 3, spread: 256, splitSpeed: 2 },
            }),
            entry('none', 'bubble.split', { child: 'piece', params: { count: 0 } }),
            entry('childless', 'bubble.split'),
            entry('stone', 'rock.fall', {
              hp: 1,
              params: { trigger: 0 },
              hurtbox: { hw: 2, hh: 2 },
            }),
            entry('volcano', 'volcano.lob', {
              child: 'stone',
              ground: 'floor',
              params: { interval: 10 },
              hurtbox: { hw: 9, hh: 5 },
            }),
            entry('pod', 'field.suction', { hp: 50, params: { radius: 400, strength: 1 } }),
            entry('claw', 'tentacle.grab', { ground: 'ceiling', params: { reach: 20 } }),
            entry('cube', 'cube.stack', { hp: 1, params: { speed: 2, margin: 24 } }),
            entry('wide', 'cube.stack', { hp: 1, params: { speed: 2, margin: 120 } }),
          ],
        },
      },
      {
        path: 'stages/g.stage.json',
        data: {
          formatVersion: 1,
          kind: 'stage',
          id: 'g',
          name: 'G',
          music: { stage: 'Stage', boss: 'Boss' },
          length: 2000,
          camera: [{ x: 0, speed: 0 }],
          checkpoints: [{ x: 0 }],
          parallax: [],
          tilemap: {
            tileSize: 8,
            tileset: 'terrain-a',
            rowsTall: 25,
            generator: {
              type: 'heightfield',
              segments: [
                {
                  from: 0,
                  to: 2384,
                  floor: { base: 40, amp: 0, period: 64, seed: 1 },
                  ceiling: { base: 32, amp: 0, period: 64, seed: 2 },
                },
              ],
            },
          },
          events: [],
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

/**
 * A world on the still stage, the ship flown in, immortal, parked at the top left.
 *
 * @returns The world.
 */
function world(): World {
  const w = createWorld(
    resolveGameConfig({ seed: 8, stage: 'g', autofire: false, remoteMode: false }),
    DB,
  );
  w.debugFlags.godMode = true;
  run(w, 45);
  w.players[0].x = 40;
  w.players[0].y = 44;
  return w;
}

/**
 * Steps a world with no input.
 *
 * @param w - The world.
 * @param ticks - Ticks.
 */
function run(w: World, ticks: number): void {
  const input = createInputSnapshot();
  for (let i = 0; i < ticks; i++) stepWorld(w, input);
}

/**
 * Spawns an enemy of the test roster.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @param x - World x.
 * @param y - World y.
 * @returns The enemy.
 */
function spawn(w: World, id: string, x: number, y: number): Enemy {
  const e = w.enemies.spawn(w.content.enemyIndex.get(id) ?? -1, x, y);
  if (e === null) throw new Error('could not spawn ' + id);
  return e;
}

/**
 * Live enemies of one id.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @returns They.
 */
function live(w: World, id: string): Enemy[] {
  const index = w.content.enemyIndex.get(id);
  return w.enemies.enemies.filter((e) => e.state === EnemyState.Live && e.specIndex === index);
}

describe('core/behaviors gimmicks — definitions', () => {
  it('keeps a death callback only when one is given, and freezes the definition', () => {
    const plain = defineBehavior('t.plain', {}, function* plain(): Script {
      yield SLEEP_FOREVER;
    });
    expect('death' in plain).toBe(false);
    const death = (): void => {};
    const split = defineBehavior(
      't.split',
      { a: 1 },
      function* split(): Script {
        yield SLEEP_FOREVER;
      },
      false,
      false,
      death,
    );
    expect(split.death).toBe(death);
    expect(Object.isFrozen(split)).toBe(true);
    expect(Object.isFrozen(split.params)).toBe(true);
  });

  it('registers the six gimmick behaviours; only bubble.split has a death callback', () => {
    const ids = [
      'rock.fall',
      'bubble.split',
      'volcano.lob',
      'field.suction',
      'tentacle.grab',
      'cube.stack',
    ];
    for (const id of ids) expect(KNOWN_SCRIPT_IDS).toContain(id);
    const withDeath = DEFAULT_BEHAVIOR_DEFS.filter((d) => d.death !== undefined).map((d) => d.id);
    expect(withDeath).toEqual(['bubble.split']);
    const volcano = DEFAULT_BEHAVIOR_DEFS.find((d) => d.id === 'volcano.lob');
    expect(volcano?.needsChild).toBe(true);
    expect(DEFAULT_BEHAVIOR_DEFS.find((d) => d.id === 'bubble.split')?.needsChild).toBe(false);
  });
});

describe('core/behaviors gimmicks — rock.fall and bubble.split edges', () => {
  it('drops a stone with trigger 0 at once and shatters it on the floor', () => {
    const w = world();
    const stone = spawn(w, 'stone', 250, 60);
    run(w, 1);
    expect([stone.mover, stone.s0]).toEqual([MoverKind.Ballistic, BALLISTIC_FLYING]);
    run(w, 80);
    expect(stone.state).not.toBe(EnemyState.Live);
    expect(w.scoring.board.scores[0].score).toBe(0);
  });

  it('keeps a Ballistic arc a stone was given before its script starts', () => {
    const w = world();
    const stone = spawn(w, 'stone', 250, 100);
    // Thrown up before its script's first run (what volcano.lob's setMoverOf does).
    stone.mover = MoverKind.Ballistic;
    stone.m1 = -3;
    stone.s0 = BALLISTIC_FLYING;
    stone.s2 = -3;
    run(w, 1);
    expect(stone.mover).toBe(MoverKind.Ballistic);
    expect(stone.y).toBeLessThan(100); // still going up
  });

  it('splits one child straight left, three evenly fanned', () => {
    const w = world();
    const one = spawn(w, 'one', 250, 100);
    run(w, 2);
    w.enemies.kill(one, 0);
    const [piece] = live(w, 'piece');
    expect(live(w, 'piece')).toHaveLength(1);
    expect(piece.m0).toBeCloseTo(cosB(ANGLE_UNITS / 2) * 1.25, 9);
    expect(piece.m1).toBeCloseTo(sinB(ANGLE_UNITS / 2) * 1.25, 9);
    expect(piece.m0).toBeLessThan(0);
    const w3 = world();
    const three = spawn(w3, 'three', 250, 100);
    run(w3, 2);
    w3.enemies.kill(three, 0);
    const pieces = live(w3, 'piece');
    expect(pieces).toHaveLength(3);
    const angles = [384, 512, 640];
    pieces.forEach((p, k) => {
      expect(p.m0).toBeCloseTo(cosB(angles[k]) * 2, 9);
      expect(p.m1).toBeCloseTo(sinB(angles[k]) * 2, 9);
    });
  });

  it('does not split with count 0 or without a child, and drops pieces with no free slot', () => {
    const w = world();
    const none = spawn(w, 'none', 250, 100);
    const childless = spawn(w, 'childless', 250, 120);
    run(w, 2);
    w.enemies.kill(none, 0);
    w.enemies.kill(childless, 0);
    expect(live(w, 'piece')).toHaveLength(0);
    run(w, 1);
    // Fill every slot but the splitter's own: its pieces have nowhere to go.
    const full = world();
    const three = spawn(full, 'three', 250, 100);
    run(full, 2);
    let filled = 0;
    while (full.enemies.spawn(full.content.enemyIndex.get('piece') ?? -1, 300, 60) !== null)
      filled++;
    expect(filled).toBe(MAX_ENEMIES - 1);
    expect(() => full.enemies.kill(three, 0)).not.toThrow();
    expect(live(full, 'piece')).toHaveLength(MAX_ENEMIES - 1);
  });
});

describe('core/behaviors gimmicks — volcano, suction, tentacle, cube edges', () => {
  it('throws nothing while the volcano may not fire (off screen)', () => {
    const w = world();
    spawn(w, 'volcano', 600, Number.NaN); // beyond the view's right edge
    run(w, 60);
    expect(live(w, 'stone')).toHaveLength(0);
    const on = world();
    spawn(on, 'volcano', 250, Number.NaN);
    run(on, 60);
    expect(live(on, 'stone').length).toBeGreaterThan(0);
  });

  it('starts no pull field until the pod is on screen', () => {
    const w = world();
    const pod = spawn(w, 'pod', 440, 100); // off screen; drifts nowhere (no mover)
    run(w, 40);
    expect(w.gimmicks.fieldOwner[0]).toBe(-1);
    expect(w.players[0].x).toBe(40);
    pod.x = 300;
    run(w, 10);
    expect(w.gimmicks.fieldOwner[0]).toBe(pod.slot);
    run(w, 10);
    expect(w.players[0].x).toBeGreaterThan(40);
  });

  it('never lunges while no ship comes within reach', () => {
    const w = world();
    const claw = spawn(w, 'claw', 250, Number.NaN);
    const [x, y] = [claw.x, claw.y];
    run(w, 200);
    expect([claw.x, claw.y, claw.mover]).toEqual([x, y, MoverKind.None]);
    expect(w.gimmicks.chainOwner[0]).toBe(claw.slot);
    expect(w.gimmicks.fieldOwner[0]).toBe(-1);
  });

  it('flies a cube straight left without a target, and keeps its row with no span', () => {
    const w = world();
    w.players[0].active = false; // no target
    const cube = spawn(w, 'cube', 300, 100);
    run(w, 1);
    expect(cube.mover).toBe(MoverKind.Ballistic);
    expect(cube.m0).toBeCloseTo(-2, 9);
    expect(cube.m1).toBeCloseTo(0, 9);
    expect(cube.y).toBeGreaterThanOrEqual(24);
    expect(cube.y).toBeLessThanOrEqual(PLAYFIELD_H - 24);
    const wide = world();
    const keep = spawn(wide, 'wide', 300, 100);
    run(wide, 1);
    expect(PLAYFIELD_H - 2 * 120).toBeLessThanOrEqual(0);
    // No span: no random row — it left from y 100 (one mover step at its aimed velocity since).
    expect(keep.y - keep.m1).toBeCloseTo(100, 9);
  });
});
