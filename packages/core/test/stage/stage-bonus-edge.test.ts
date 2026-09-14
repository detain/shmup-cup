/**
 * Edge cases of the M2-10 hidden bonus-stage entrances (`core/stage` `BonusEntrances`) beyond
 * `stage-bonus.test.ts`, on a small stage with one entrance of each kind (driven through
 * `arm` / `update` / `clear` on a real World, the ships and counters set by hand):
 *
 * - `gap`: only a living (`alive`) active ship opens it — not one flying in, dying, dead, leaving or
 *   inactive —, player 2 opens it too, the region's left / top edges are in and its right / bottom
 *   edges out;
 * - `digit`: player 2's score counts, a dying or dead ship's does not, a respawning ship's does;
 *   every place (tens … hundred-thousands) — the continue digit is never read;
 * - `ground`: kills of air enemies, and ground enemies spawned or killed before the window armed,
 *   do not count;
 * - the entry: the first entrance in order wins when two could open on one tick, one `PowerUpEquip`
 *   sound at the camera's whole-pixel x, everything disarmed, `arm` refused afterwards;
 * - `arm` with an index out of range or of another event; `clear` when locked or entered, a branch
 *   not taken, the window's exact edges; free flight has no entrances;
 * - the data limits: exactly {@link MAX_BONUS_ENTRANCES} entrances, one more, a `boss` event in a
 *   bonus stage, an explicit `until` of a gap, the place of a `ground` entrance;
 * - the hash covers the lock and the enemy totals.
 */
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import {
  MAX_BONUS_ENTRANCES,
  loadContent,
  type ContentDb,
  type ContentFile,
  type StageBonusEvent,
} from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { SFX_CUES, SimEventKind } from '../../src/events/index.js';
import { setPlayerState } from '../../src/player/index.js';
import { BonusEntrance, createBonusEntrances } from '../../src/stage/index.js';
import { ENGINE_SPRITES, createWorld, type World } from '../../src/world/index.js';
import { shipped, stage } from '../helpers/campaign.js';

/** Entrance indices of the test stage. */
const GAP = 0;
const GROUND = 1;
const DIGIT = 2;

/**
 * The test content: a stage `multi` whose three entrances arm at x 10 — a gap (region x 100–140,
 * y 50–70), a ground window up to x 500, a digit window (tens digit 5) up to x 300 — and a stage
 * `branchy` whose entrance only arms on a flag's branch; the bonus stage `vault`.
 */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      stage('multi', {
        length: 2000,
        events: [
          {
            x: 10,
            type: 'bonus',
            stage: 'vault',
            entrance: 'gap',
            region: { x: 100, y: 50, w: 40, h: 20 },
          },
          { x: 10, type: 'bonus', stage: 'vault', entrance: 'ground', until: 500 },
          {
            x: 10,
            type: 'bonus',
            stage: 'vault',
            entrance: 'digit',
            digit: 5,
            place: 10,
            until: 300,
          },
          { x: 1000, type: 'end' },
        ],
      }),
      stage('branchy', {
        length: 2000,
        branches: [{ id: 'low', flag: 'dive' }],
        events: [
          { x: 10, type: 'bonus', stage: 'vault', entrance: 'ground', until: 500, branch: 'low' },
          { x: 1000, type: 'end' },
        ],
      }),
      stage('vault', { type: 'bonus', events: [{ x: 300, type: 'end' }] }),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

/**
 * A World on a test stage (co-op, so player 2 can be switched on).
 *
 * @param id - Stage id.
 * @returns The World at tick 0.
 */
function world(id = 'multi'): World {
  return createWorld(resolveGameConfig({ seed: 9, stage: id, coop: true }), DB);
}

/**
 * Arms one entrance of the test stage (as the stage hook does).
 *
 * @param w - The World.
 * @param e - Entrance index.
 */
function arm(w: World, e: number): void {
  w.bonus.arm(w.bonus.eventIndex[e]);
}

/**
 * Makes a ship alive at a world point.
 *
 * @param w - The World.
 * @param p - Player slot.
 * @param x - World x.
 * @param y - World y.
 */
function ship(w: World, p: number, x: number, y: number): void {
  const s = w.players[p];
  s.active = true;
  setPlayerState(s, 'alive');
  s.x = x;
  s.y = y;
}

describe('core/stage bonus entrance edges: gap (M2-10)', () => {
  it('opens only for an active ship that is alive (not entering, dying, dead, leaving)', () => {
    for (const state of ['entering', 'respawning', 'dying', 'dead', 'leaving'] as const) {
      const w = world();
      arm(w, GAP);
      ship(w, 0, 120, 60);
      setPlayerState(w.players[0], state);
      w.bonus.update();
      expect(w.bonus.entered, state).toBe(-1);
      expect(w.bonus.armed[GAP], state).toBe(1);
    }
    const inactive = world();
    arm(inactive, GAP);
    ship(inactive, 0, 0, 0);
    ship(inactive, 1, 120, 60);
    inactive.players[1].active = false;
    inactive.bonus.update();
    expect(inactive.bonus.entered).toBe(-1);
  });

  it('opens for player 2 as well', () => {
    const w = world();
    arm(w, GAP);
    ship(w, 0, 0, 0);
    ship(w, 1, 139, 69);
    w.bonus.update();
    expect(w.bonus.entered).toBe(GAP);
    expect(w.bonus.enteredX()).toBe(10);
  });

  it('counts the region`s left and top edges in, its right and bottom edges out', () => {
    const cases: Array<[number, number, number]> = [
      [100, 50, GAP], // top-left corner: in
      [139.5, 69.5, GAP], // just inside the far corner
      [140, 60, -1], // right edge: out
      [120, 70, -1], // bottom edge: out
      [99.9, 60, -1], // left of it
      [120, 49.9, -1], // above it
    ];
    for (const [x, y, expected] of cases) {
      const w = world();
      arm(w, GAP);
      ship(w, 0, x, y);
      w.bonus.update();
      expect(w.bonus.entered, `${x},${y}`).toBe(expected);
    }
  });
});

describe('core/stage bonus entrance edges: digit and ground (M2-10)', () => {
  /**
   * Arms the digit entrance, sets the scores, closes the window and tests it.
   *
   * @param setup - Sets the scores / ships.
   * @returns The entered entrance.
   */
  function digit(setup: (w: World) => void): number {
    const w = world();
    arm(w, DIGIT);
    ship(w, 0, 0, 0);
    setup(w);
    w.bonus.until[DIGIT] = w.camera.x; // the camera reaches the window's end
    w.bonus.update();
    return w.bonus.entered;
  }

  it('reads player 2`s score, skips a dying or dead ship, counts a respawning one', () => {
    const tens5 = 1_250; // tens digit 5
    expect(digit((w) => (w.scoring.board.scores[0].score = tens5))).toBe(DIGIT);
    expect(digit((w) => (w.scoring.board.scores[0].score = 1_240))).toBe(-1);
    expect(
      digit((w) => {
        ship(w, 1, 0, 0);
        w.scoring.board.scores[1].score = tens5;
      }),
    ).toBe(DIGIT);
    for (const state of ['dying', 'dead'] as const) {
      expect(
        digit((w) => {
          w.scoring.board.scores[0].score = tens5;
          setPlayerState(w.players[0], state);
        }),
        state,
      ).toBe(-1);
    }
    expect(
      digit((w) => {
        w.scoring.board.scores[0].score = tens5;
        setPlayerState(w.players[0], 'respawning');
      }),
    ).toBe(DIGIT);
    // An inactive player 2's score is never read.
    expect(
      digit((w) => {
        w.players[1].active = false;
        w.scoring.board.scores[1].score = tens5;
      }),
    ).toBe(-1);
  });

  it('reads each place (10 … 100,000) and never the continue digit', () => {
    const score = 9_876_543; // …, 100,000s 8, 10,000s 7, 1,000s 6, 100s 5, 10s 4; last digit 3
    const expected: Array<[number, number]> = [
      [10, 4],
      [100, 5],
      [1000, 6],
      [10000, 7],
      [100000, 8],
    ];
    for (const [place, shown] of expected) {
      for (let d = 0; d <= 9; d++) {
        const entered = digit((w) => {
          w.bonus.place[DIGIT] = place;
          w.bonus.digit[DIGIT] = d;
          w.scoring.board.scores[0].score = score;
        });
        expect(entered, `place ${place} digit ${d}`).toBe(d === shown ? DIGIT : -1);
      }
    }
    // The continue digit (3) is not the tens digit (4).
    expect(
      digit((w) => {
        w.bonus.digit[DIGIT] = 3;
        w.scoring.board.scores[0].score = score;
      }),
    ).toBe(-1);
  });

  it('ground: counts only ground enemies spawned and killed while armed', () => {
    const w = world();
    const stats = w.enemies.stats;
    // Before the window: ground spawns and kills (they must not count).
    stats.spawned = 10;
    stats.groundSpawned = 4;
    stats.groundKilled = 1;
    arm(w, GROUND);
    expect([w.bonus.groundSpawned0[GROUND], w.bonus.groundKilled0[GROUND]]).toEqual([4, 1]);
    // In the window: air enemies only — never opens (no ground enemy appeared).
    stats.spawned += 5;
    stats.killed += 5;
    w.bonus.until[GROUND] = w.camera.x;
    w.bonus.update();
    expect(w.bonus.entered).toBe(-1);
    expect(w.bonus.armed[GROUND]).toBe(0);
    // Again: two ground enemies in the window, both killed — plus the kill of one from before.
    arm(w, GROUND);
    stats.groundSpawned += 2;
    stats.groundKilled += 2;
    w.bonus.update();
    expect(w.bonus.entered).toBe(GROUND);
  });

  it('ground: stays shut with one survivor, and while the window is still open', () => {
    const w = world();
    arm(w, GROUND);
    const stats = w.enemies.stats;
    stats.groundSpawned += 2;
    stats.groundKilled += 2;
    // Every ground enemy is down, but the window has not closed yet: it waits.
    w.bonus.update();
    expect([w.bonus.entered, w.bonus.armed[GROUND]]).toEqual([-1, 1]);
    // Another one appears and survives to the window's end.
    stats.groundSpawned += 1;
    w.bonus.until[GROUND] = 0;
    w.bonus.update();
    expect([w.bonus.entered, w.bonus.armed[GROUND]]).toEqual([-1, 0]);
  });
});

describe('core/stage bonus entrance edges: entry, arming and restarts (M2-10)', () => {
  it('the first entrance in order wins a shared tick: one sound, all disarmed', () => {
    const w = world();
    arm(w, GAP);
    arm(w, DIGIT);
    ship(w, 0, 120, 60);
    w.scoring.board.scores[0].score = 50;
    w.bonus.until[DIGIT] = 0;
    w.events.clear();
    w.bonus.update();
    expect(w.bonus.entered).toBe(GAP);
    expect(w.bonus.enteredTick).toBe(w.tick);
    expect([...w.bonus.armed]).toEqual([0, 0, 0]);
    const sounds: Array<[number, number, number]> = [];
    w.events.drain((e) => {
      if (e.kind === SimEventKind.Sfx) sounds.push([e.id, e.x, e.y]);
    });
    expect(sounds).toEqual([[SFX_CUES.PowerUpEquip, Math.floor(w.camera.x), 0]]);
    // Nothing more once entered.
    arm(w, GROUND);
    w.bonus.update();
    expect([w.bonus.entered, w.bonus.armed[GROUND]]).toEqual([GAP, 0]);
  });

  it('arm ignores indices out of range and events that are not entrances', () => {
    const w = world();
    const b = w.bonus;
    b.arm(-1);
    b.arm(3); // the `end` event
    b.arm(99);
    b.arm(0.5);
    b.arm(Number.NaN);
    expect([...b.armed]).toEqual([0, 0, 0]);
    // Arming again takes the counters afresh.
    arm(w, GROUND);
    w.enemies.stats.groundSpawned = 7;
    arm(w, GROUND);
    expect(b.groundSpawned0[GROUND]).toBe(7);
  });

  it('clear: nothing re-arms when locked or entered; the window`s edges are exclusive', () => {
    const w = world();
    const b = w.bonus;
    // armX 10, until 500 (ground), 300 (digit), 140 (gap: the region's right edge).
    b.clear(null, 10);
    expect([...b.armed]).toEqual([0, 0, 0]); // exactly at x: they arm when the camera gets there
    b.clear(null, 11);
    expect([...b.armed]).toEqual([1, 1, 1]);
    b.clear(null, 140);
    expect([...b.armed]).toEqual([0, 1, 1]); // at the gap's until: closed
    b.clear(null, 499);
    expect([...b.armed]).toEqual([0, 1, 0]);
    b.clear(null, 500);
    expect([...b.armed]).toEqual([0, 0, 0]);
    b.lock();
    b.clear(null, 50);
    expect([...b.armed]).toEqual([0, 0, 0]);
    const entered = world();
    arm(entered, GAP);
    ship(entered, 0, 120, 60);
    entered.bonus.update();
    entered.bonus.clear(null, 50);
    expect([...entered.bonus.armed]).toEqual([0, 0, 0]);
    expect(entered.bonus.entered).toBe(GAP); // a restart keeps the entry
  });

  it('clear asks the runner whether an entrance`s branch is taken', () => {
    const w = world();
    const asked: number[] = [];
    w.bonus.clear(
      {
        eventActive(index: number): boolean {
          asked.push(index);
          return index !== w.bonus.eventIndex[GROUND];
        },
      },
      50,
    );
    expect(asked).toEqual([0, 1, 2]);
    expect([...w.bonus.armed]).toEqual([1, 0, 1]);
    // On the shipped runner: the branch's flag is not set, so the entrance stays disarmed.
    const branchy = world('branchy');
    branchy.stage?.jumpTo(100);
    expect(branchy.bonus.count).toBe(1);
    expect(branchy.bonus.armed[0]).toBe(0);
  });

  it('free flight (no stage) has no entrances; every call is harmless', () => {
    const w = createWorld(resolveGameConfig({ seed: 1 }), DB);
    expect(w.stage).toBeNull();
    expect(w.bonus.count).toBe(0);
    w.bonus.arm(0);
    w.bonus.update();
    w.bonus.clear(null, 0);
    w.bonus.lock();
    expect([w.bonus.entered, w.bonus.enteredStage(), w.bonus.enteredX()]).toEqual([-1, -1, -1]);
    // A stand-alone set built without a stage.
    const alone = createBonusEntrances(w, w.enemies.stats, null);
    expect(alone.count).toBe(0);
    expect(alone.eventIndex).toHaveLength(0);
  });

  it('compiles every field of the test stage`s entrances', () => {
    const w = world();
    const b = w.bonus;
    const vault = DB.stageIndex.get('vault') ?? -1;
    expect([...b.kind]).toEqual([BonusEntrance.Gap, BonusEntrance.Ground, BonusEntrance.Digit]);
    expect([...b.eventIndex]).toEqual([0, 1, 2]);
    expect([...b.stageId]).toEqual([vault, vault, vault]);
    expect([...b.until]).toEqual([140, 500, 300]);
    expect([b.x0[GAP], b.y0[GAP], b.x1[GAP], b.y1[GAP]]).toEqual([100, 50, 140, 70]);
    expect([b.digit[DIGIT], b.place[DIGIT]]).toEqual([5, 10]);
    // A ground entrance carries the default place (unused).
    expect(b.place[GROUND]).toBe(100);
  });

  it('hashes the lock and the enemy totals', () => {
    const a = world();
    const b = world();
    expect(hashWorld(a)).toBe(hashWorld(b));
    b.bonus.lock();
    expect(hashWorld(b)).not.toBe(hashWorld(a));
    const c = world();
    c.enemies.stats.groundKilled = 1;
    expect(hashWorld(c)).not.toBe(hashWorld(a));
    const d = world();
    arm(d, GROUND);
    expect(hashWorld(d)).not.toBe(hashWorld(a));
  });
});

describe('core/data bonus entrance edges (M2-10)', () => {
  /**
   * Loads a zone with the given events and the bonus stage `vault`.
   *
   * @param events - The zone's events (an `end` is appended).
   * @param vault - Fields of the vault.
   * @returns The load result.
   */
  function load(
    events: Array<Record<string, unknown>>,
    vault: Record<string, unknown> = {},
  ): ReturnType<typeof loadContent> {
    const file = (id: string, body: Record<string, unknown>): ContentFile => ({
      path: `stages/${id}.stage.json`,
      data: {
        formatVersion: 1,
        kind: 'stage',
        id,
        name: id,
        music: { stage: 'Stage', boss: 'Boss' },
        length: 1000,
        camera: [{ x: 0, speed: 1 }],
        checkpoints: [],
        parallax: [],
        tilemap: null,
        events: [{ x: 1000, type: 'end' }],
        ...body,
      },
    });
    return loadContent([
      file('zone', { events: [...events, { x: 1000, type: 'end' }] }),
      file('vault', { type: 'bonus', ...vault }),
    ]);
  }

  /**
   * `n` ground entrances.
   *
   * @param n - How many.
   * @returns The events.
   */
  const entrances = (n: number): Array<Record<string, unknown>> => {
    const out: Array<Record<string, unknown>> = [];
    for (let i = 0; i < n; i++) {
      out.push({ x: 10 * i, type: 'bonus', stage: 'vault', entrance: 'ground' });
    }
    return out;
  };

  it('allows exactly MAX_BONUS_ENTRANCES per stage, not one more', () => {
    expect(load(entrances(MAX_BONUS_ENTRANCES)).issues).toEqual([]);
    expect(load(entrances(MAX_BONUS_ENTRANCES + 1)).issues).toEqual([
      {
        path: 'stages/zone.stage.json:events',
        message: `has ${MAX_BONUS_ENTRANCES + 1} bonus entrances (at most ${MAX_BONUS_ENTRANCES})`,
      },
    ]);
  });

  it('keeps an explicit until of a gap and refuses a boss event in a bonus stage', () => {
    const gap = load([
      {
        x: 100,
        type: 'bonus',
        stage: 'vault',
        entrance: 'gap',
        region: { x: 400, y: 0, w: 20, h: 20 },
        until: 900,
      },
    ]);
    expect(gap.issues).toEqual([]);
    const event = gap.db.stages[gap.db.stageIndex.get('zone') ?? 0].events[0] as StageBonusEvent;
    expect([event.until, event.place]).toEqual([900, 100]);
    // until exactly at x is fine (the digit's default).
    expect(
      load([{ x: 100, type: 'bonus', stage: 'vault', entrance: 'digit', digit: 0, until: 100 }])
        .issues,
    ).toEqual([]);
    const bossy = load([], {
      events: [
        { x: 10, type: 'boss', enemy: 'x' },
        { x: 1000, type: 'end' },
      ],
    });
    expect(bossy.issues.map((i) => i.path + ': ' + i.message)).toContain(
      'stages/vault.stage.json:events[0]: a bonus stage has no boss event',
    );
  });

  it('refuses a digit out of 0–9 and a place out of range', () => {
    const paths = (event: Record<string, unknown>): string[] =>
      load([event]).issues.map((i) => i.path);
    const base = { x: 100, type: 'bonus', stage: 'vault', entrance: 'digit' };
    expect(paths({ ...base, digit: 10 })).toEqual(['stages/zone.stage.json:events[0].digit']);
    expect(paths({ ...base, digit: -1 })).toEqual(['stages/zone.stage.json:events[0].digit']);
    expect(paths({ ...base, digit: 1, place: 1 })).toEqual([
      'stages/zone.stage.json:events[0].place',
    ]);
    expect(paths({ ...base, digit: 1, place: 1_000_000 })).toEqual([
      'stages/zone.stage.json:events[0].place',
    ]);
    expect(paths({ ...base, digit: 9, place: 100000 })).toEqual([]);
  });
});
