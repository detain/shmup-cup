/**
 * The content loader's frame-anchored bounds and defaults (plan_resolution.md R1-01, §2.6) follow
 * the frame constants of `core/config`, so R2-01's switch to 640×360 moves them with the frame:
 *
 * - the defaults `DEFAULT_BOSS_X` (88 px left of the right edge), `DEFAULT_BOSS_Y` (the
 *   playfield's middle) and `DEFAULT_BLOCK_SCREEN_X` (16 px past the right edge);
 * - a ship's `margins` (at most half the playfield on each axis);
 * - the `waypoint` mover's target (the playfield plus 64 px on every side);
 * - a `spawn` / `formation` event's `y` (64 px above to 120 px below the playfield) and
 *   `screenX` (128 px beyond either edge).
 *
 * The margins added to the frame are world distances (R2-02 scales them); only the frame part is
 * derived. Each bound is checked at its limit and one past it.
 */
import { describe, expect, it } from 'vitest';
import { PLAYFIELD_CY, PLAYFIELD_H, PLAYFIELD_W } from '../../src/config/index.js';
import {
  DEFAULT_BLOCK_SCREEN_X,
  DEFAULT_BOSS_X,
  DEFAULT_BOSS_Y,
  loadContent,
  type ContentFile,
  type ValidationIssue,
} from '../../src/data/index.js';

/** A content file of the given kind. */
const file = (path: string, kind: string, body: Record<string, unknown>): ContentFile => ({
  path,
  data: { formatVersion: 1, kind, ...body },
});

/** A valid enemy entry with the given extra fields. */
const enemy = (id: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  hp: 1,
  score: 100,
  hurtbox: { hw: 6, hh: 5 },
  script: 'drifter.sine',
  sprite: 'enemies/' + id,
  drop: null,
  ...over,
});

/**
 * The issue paths of one player file whose ship has the given margins.
 *
 * @param margins - The ship's `margins`.
 * @returns The paths of the issues.
 */
function marginIssues(margins: Record<string, number>): string[] {
  const ship = {
    id: 'kestrel',
    name: 'KESTREL',
    sprite: 'ships/kestrel',
    speeds: [1.5, 2],
    hurtRadius: 1.5,
    terrainBox: { hw: 5, hh: 3 },
    pickupBox: { hw: 8, hh: 6 },
    margins,
    enterTicks: 40,
    respawnInvulnTicks: 120,
    bankFrames: 1,
  };
  return loadContent([file('p.json', 'player', { ships: [ship] })]).issues.map((i) => i.path);
}

/**
 * The issue paths of one enemy file whose entry flies a `waypoint` mover to (x, y).
 *
 * @param x - Target x in playfield pixels.
 * @param y - Target y in playfield pixels.
 * @returns The paths of the issues.
 */
function waypointIssues(x: number, y: number): string[] {
  const mover = { type: 'waypoint', x, y, speed: 1, hold: 0, leaveVx: 0, leaveVy: 0 };
  return loadContent([file('e.json', 'enemies', { enemies: [enemy('w', { mover })] })]).issues.map(
    (i) => i.path,
  );
}

/**
 * The issues of one stage with the given events (and an enemy `e` they may spawn).
 *
 * @param events - The stage's events.
 * @returns The issues.
 */
function stageIssues(events: unknown[]): readonly ValidationIssue[] {
  const stage = {
    id: 's',
    name: 'Zone',
    music: { stage: 'Stage', boss: 'Boss' },
    length: 4096,
    camera: [{ x: 0, speed: 1 }],
    checkpoints: [],
    parallax: [],
    tilemap: null,
    events,
  };
  return loadContent([
    file('s.json', 'stage', stage),
    file('e.json', 'enemies', { enemies: [enemy('e')] }),
  ]).issues;
}

describe('core/data — frame-anchored defaults', () => {
  it('derives the boss home and the block entry from the playfield', () => {
    expect(DEFAULT_BOSS_X).toBe(PLAYFIELD_W - 88);
    expect(DEFAULT_BOSS_Y).toBe(PLAYFIELD_CY);
    expect(DEFAULT_BOSS_Y).toBe(PLAYFIELD_H / 2);
    expect(DEFAULT_BLOCK_SCREEN_X).toBe(PLAYFIELD_W + 16);
    for (const value of [DEFAULT_BOSS_X, DEFAULT_BOSS_Y, DEFAULT_BLOCK_SCREEN_X]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

describe('core/data — frame-anchored schema bounds', () => {
  it('lets a ship margin reach half the playfield, not past it', () => {
    const half = { left: PLAYFIELD_W / 2, right: PLAYFIELD_W / 2 };
    const halfH = { top: PLAYFIELD_H / 2, bottom: PLAYFIELD_H / 2 };
    expect(marginIssues({ ...half, ...halfH })).toEqual([]);
    expect(
      marginIssues({
        left: PLAYFIELD_W / 2 + 1,
        right: PLAYFIELD_W / 2 + 1,
        top: PLAYFIELD_H / 2 + 1,
        bottom: PLAYFIELD_H / 2 + 1,
      }),
    ).toEqual([
      'p.json:ships[0].margins.left',
      'p.json:ships[0].margins.right',
      'p.json:ships[0].margins.top',
      'p.json:ships[0].margins.bottom',
    ]);
  });

  it('keeps a waypoint within 64 px of the playfield', () => {
    expect(waypointIssues(-64, -64)).toEqual([]);
    expect(waypointIssues(PLAYFIELD_W + 64, PLAYFIELD_H + 64)).toEqual([]);
    expect(waypointIssues(PLAYFIELD_W + 65, 0)).toEqual(['e.json:enemies[0].mover.x']);
    expect(waypointIssues(0, PLAYFIELD_H + 65)).toEqual(['e.json:enemies[0].mover.y']);
  });

  it('bounds spawn points by the playfield plus their margins', () => {
    expect(
      stageIssues([
        { x: 0, type: 'spawn', enemy: 'e', y: -64, screenX: -128 },
        { x: 1, type: 'spawn', enemy: 'e', y: PLAYFIELD_H + 120, screenX: PLAYFIELD_W + 128 },
        {
          x: 2,
          type: 'formation',
          enemy: 'e',
          count: 2,
          interval: 4,
          y: PLAYFIELD_H + 120,
          screenX: PLAYFIELD_W + 128,
        },
      ]),
    ).toEqual([]);
    const issues = stageIssues([
      { x: 0, type: 'spawn', enemy: 'e', y: PLAYFIELD_H + 121 },
      { x: 1, type: 'spawn', enemy: 'e', screenX: PLAYFIELD_W + 129 },
      { x: 2, type: 'formation', enemy: 'e', count: 2, interval: 4, y: PLAYFIELD_H + 121 },
      { x: 3, type: 'formation', enemy: 'e', count: 2, interval: 4, screenX: PLAYFIELD_W + 129 },
    ]);
    expect(issues).toEqual([
      {
        path: 's.json:events[0].y',
        message: 'must be a finite number in -64..' + String(PLAYFIELD_H + 120),
      },
      {
        path: 's.json:events[1].screenX',
        message: 'must be a finite number in -128..' + String(PLAYFIELD_W + 128),
      },
      {
        path: 's.json:events[2].y',
        message: 'must be a finite number in -64..' + String(PLAYFIELD_H + 120),
      },
      {
        path: 's.json:events[3].screenX',
        message: 'must be a finite number in -128..' + String(PLAYFIELD_W + 128),
      },
    ]);
  });
});
