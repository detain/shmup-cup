/**
 * The hidden bonus-stage entrances of plan M2-10 (`core/stage` `BonusEntrances`, wired into the
 * World): on the shipped dev stage `bonus-range` — a marked gap between two brick blocks, a window
 * whose three ground turrets must all be destroyed, a score digit — every entrance opens on its
 * condition and only while armed; a locked World opens nothing; a checkpoint restart re-arms the
 * windows it lands in; the data side (defaults, the bonus stage rules, references) and the
 * determinism of the new hashed state.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import {
  BONUS_ENTRANCES,
  BONUS_PLACES,
  DEFAULT_BONUS_PLACE,
  DEFAULT_BONUS_WINDOW,
  loadContent,
  type ContentDb,
  type ContentFile,
  type StageBonusEvent,
} from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { EnemyState } from '../../src/enemies/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { addScore } from '../../src/scoring/index.js';
import { BonusEntrance, StageEventCode } from '../../src/stage/index.js';
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

/** The bonus range, its vault and what they need. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('tilesets/terrain-a.tileset.json'),
      shipped('enemies/zone-a.enemies.json'),
      shipped('enemies/bonus.enemies.json'),
      shipped('stages/bonus-range.stage.json'),
      shipped('stages/bonus-vault.stage.json'),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

/**
 * A god-mode World on the bonus range.
 *
 * @returns The World at tick 0.
 */
function world(): World {
  const w = createWorld(resolveGameConfig({ seed: 5, stage: 'bonus-range' }), DB);
  w.debugFlags.godMode = true;
  return w;
}

/**
 * Steps a World until its camera reaches an x (or a tick limit).
 *
 * @param w - The World.
 * @param x - Camera x.
 * @param each - Called after every tick.
 */
function runTo(w: World, x: number, each?: (w: World) => void): void {
  const input = createInputSnapshot();
  for (let i = 0; i < 6000 && w.camera.x < x; i++) {
    stepWorld(w, input);
    each?.(w);
  }
}

/**
 * Puts player 1 at a world point (a teleport — tests only).
 *
 * @param w - The World.
 * @param x - World x.
 * @param y - World y.
 */
function place(w: World, x: number, y: number): void {
  w.players[0].x = x;
  w.players[0].y = y;
}

const VAULT = DB.stageIndex.get('bonus-vault') ?? -1;

describe('core/stage bonus entrances (M2-10)', () => {
  it('compiles the stage`s three entrances with their defaults', () => {
    const w = world();
    const b = w.bonus;
    expect(b.count).toBe(3);
    expect([...b.kind]).toEqual([BonusEntrance.Gap, BonusEntrance.Ground, BonusEntrance.Digit]);
    expect([...b.stageId]).toEqual([VAULT, VAULT, VAULT]);
    expect([...b.armX]).toEqual([420, 1000, 2000]);
    // gap: the region's right edge; ground: its explicit until; digit: its x.
    expect([...b.until]).toEqual([880, 1800, 2000]);
    expect([b.x0[0], b.y0[0], b.x1[0], b.y1[0]]).toEqual([816, 0, 880, 24]);
    expect([b.digit[2], b.place[2]]).toEqual([0, 1000]);
    expect([b.entered, b.enteredTick, b.locked]).toEqual([-1, -1, false]);
    expect(b.enteredStage()).toBe(-1);
    expect(b.enteredX()).toBe(-1);
    expect(StageEventCode.Bonus).toBe(10);
    expect([...BONUS_ENTRANCES]).toEqual(['gap', 'ground', 'digit']);
  });

  it('gap: opens when a living ship`s centre is in the region — only while armed', () => {
    const w = world();
    runTo(w, 300);
    // Not armed yet: the region is ignored.
    place(w, 840, 12);
    stepWorld(w, createInputSnapshot());
    expect(w.bonus.entered).toBe(-1);
    // Back down, out of the gap's row: armed from 420, the region (x 816–880) is in view from
    // camera x 496 on.
    place(w, w.camera.x + 100, 100);
    runTo(w, 500);
    expect(w.bonus.armed[0]).toBe(1);
    place(w, w.camera.x + 200, 100);
    stepWorld(w, createInputSnapshot());
    expect(w.bonus.entered).toBe(-1);
    place(w, 840, 12);
    const tick = w.tick;
    stepWorld(w, createInputSnapshot());
    expect(w.bonus.entered).toBe(0);
    expect(w.bonus.enteredTick).toBe(tick);
    expect(w.bonus.enteredStage()).toBe(VAULT);
    expect(w.bonus.enteredX()).toBe(420);
    expect([...w.bonus.armed]).toEqual([0, 0, 0]);
    // The World plays on (the scene flow does the rest).
    expect(w.status).toBe('playing');
  });

  it('gap: the window closes when the camera passes its until', () => {
    const w = world();
    runTo(w, 881);
    expect(w.bonus.armed[0]).toBe(0);
    place(w, 900, 12);
    w.bonus.x0[0] = 890; // even a region still in view does not open once closed
    w.bonus.x1[0] = 950;
    stepWorld(w, createInputSnapshot());
    expect(w.bonus.entered).toBe(-1);
  });

  it('ground: opens when the window closes with every ground enemy of it destroyed', () => {
    const w = world();
    w.stage?.jumpTo(990);
    const killer = (world: World): void => {
      for (const e of world.enemies.enemies) {
        if (e.state === EnemyState.Live && e.anchor !== 0) world.enemies.kill(e, 0);
      }
    };
    runTo(w, 1790, killer);
    expect(w.bonus.armed[1]).toBe(1);
    expect(w.enemies.stats.groundKilled - w.bonus.groundKilled0[1]).toBe(3);
    expect(w.bonus.entered).toBe(-1);
    runTo(w, 1801, killer);
    expect(w.bonus.entered).toBe(1);
  });

  it('ground: stays shut when one ground enemy survives, or when none appeared', () => {
    const w = world();
    w.stage?.jumpTo(990);
    let spared = -1;
    runTo(w, 1801, (world) => {
      for (const e of world.enemies.enemies) {
        if (e.state !== EnemyState.Live || e.anchor === 0) continue;
        if (spared < 0) spared = e.slot;
        if (e.slot === spared) continue;
        world.enemies.kill(e, 0);
      }
    });
    expect(w.enemies.stats.groundSpawned - w.bonus.groundSpawned0[1]).toBe(3);
    expect(w.enemies.stats.groundKilled - w.bonus.groundKilled0[1]).toBe(2);
    expect(w.bonus.entered).toBe(-1);
    expect(w.bonus.armed[1]).toBe(0);
    // A window without ground enemies never opens.
    const empty = world();
    empty.bonus.arm(empty.bonus.eventIndex[1]);
    empty.bonus.until[1] = 0;
    stepWorld(empty, createInputSnapshot());
    expect(empty.bonus.entered).toBe(-1);
  });

  it('ground: kills credited to nobody do not count', () => {
    const w = world();
    w.stage?.jumpTo(990);
    runTo(w, 1801, (world) => {
      for (const e of world.enemies.enemies) {
        if (e.state === EnemyState.Live && e.anchor !== 0) world.enemies.kill(e, -1);
      }
    });
    expect(w.bonus.entered).toBe(-1);
  });

  it('digit: opens when a playing ship`s score shows the digit at its place', () => {
    const miss = world();
    miss.stage?.jumpTo(1900);
    addScore(miss, 0, 21_000);
    runTo(miss, 2001);
    expect(miss.bonus.entered).toBe(-1);
    const hit = world();
    hit.stage?.jumpTo(1900);
    addScore(hit, 0, 20_300); // thousands digit 0
    runTo(hit, 2001);
    expect(hit.bonus.entered).toBe(2);
  });

  it('a locked World opens nothing, and the first entrance to open wins', () => {
    const w = world();
    w.bonus.lock();
    runTo(w, 500);
    expect(w.bonus.armed[0]).toBe(0);
    place(w, 840, 12);
    stepWorld(w, createInputSnapshot());
    expect(w.bonus.entered).toBe(-1);
    expect(w.bonus.locked).toBe(true);
    const first = world();
    runTo(first, 500);
    place(first, 840, 12);
    stepWorld(first, createInputSnapshot());
    expect(first.bonus.entered).toBe(0);
    // Arming another entrance after the entry does nothing.
    first.bonus.arm(first.bonus.eventIndex[1]);
    expect(first.bonus.armed[1]).toBe(0);
  });

  it('a checkpoint restart re-arms the windows it lands in, fresh counters, and not the others', () => {
    const w = world();
    runTo(w, 1200);
    expect(w.bonus.armed[1]).toBe(1);
    // A jump to 1500 lands inside the ground window: re-armed with the totals of now.
    w.stage?.jumpTo(1500);
    expect(w.bonus.armed[1]).toBe(1);
    expect(w.bonus.groundSpawned0[1]).toBe(w.enemies.stats.groundSpawned);
    expect(w.bonus.armed[0]).toBe(0);
    // A jump back to the start: every window ahead again (they arm when reached).
    w.stage?.jumpTo(0);
    expect([...w.bonus.armed]).toEqual([0, 0, 0]);
  });

  it('keeps two worlds with the same inputs in lockstep through an entry (hashed state)', () => {
    const a = world();
    const b = world();
    const input = createInputSnapshot();
    for (let i = 0; i < 560; i++) {
      stepWorld(a, input);
      stepWorld(b, input);
    }
    place(a, 840, 12);
    place(b, 840, 12);
    stepWorld(a, input);
    stepWorld(b, input);
    expect(a.bonus.entered).toBe(0);
    expect(hashWorld(a)).toBe(hashWorld(b));
    const c = world();
    for (let i = 0; i < 561; i++) stepWorld(c, input);
    expect(c.bonus.entered).toBe(-1);
    expect(hashWorld(c)).not.toBe(hashWorld(a));
  });
});

describe('core/data bonus stages and entrances (M2-10)', () => {
  /**
   * Loads a stage with a bonus event (and a bonus stage `vault`).
   *
   * @param event - The event.
   * @param vault - Fields of the vault stage.
   * @returns The load result.
   */
  function load(
    event: Record<string, unknown>,
    vault: Record<string, unknown> = {},
  ): ReturnType<typeof loadContent> {
    const stage = (id: string, body: Record<string, unknown>): ContentFile => ({
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
      stage('zone', { events: [event, { x: 1000, type: 'end' }] }),
      stage('vault', { type: 'bonus', ...vault }),
    ]);
  }

  it('fills the defaults: until by entrance, place 100', () => {
    const gap = load({
      x: 100,
      type: 'bonus',
      stage: 'vault',
      entrance: 'gap',
      region: { x: 500, y: 0, w: 40, h: 20 },
    });
    expect(gap.issues).toEqual([]);
    const zone = (db: ContentDb): StageBonusEvent =>
      db.stages[db.stageIndex.get('zone') ?? 0].events[0] as StageBonusEvent;
    const event = zone(gap.db);
    expect([event.until, event.place, event.stageId]).toEqual([
      540,
      DEFAULT_BONUS_PLACE,
      gap.db.stageIndex.get('vault'),
    ]);
    const ground = load({ x: 100, type: 'bonus', stage: 'vault', entrance: 'ground' });
    expect(zone(ground.db).until).toBe(100 + DEFAULT_BONUS_WINDOW);
    const digit = load({ x: 100, type: 'bonus', stage: 'vault', entrance: 'digit', digit: 7 });
    expect(zone(digit.db).until).toBe(100);
    expect([...BONUS_PLACES]).toEqual([10, 100, 1000, 10000, 100000]);
  });

  it('reports a gap without region, a digit without digit, a bad place and an early until', () => {
    const at = (field: string) => 'stages/zone.stage.json:events[0]' + field;
    expect(load({ x: 100, type: 'bonus', stage: 'vault', entrance: 'gap' }).issues).toEqual([
      { path: at('.region'), message: 'a gap entrance needs its region' },
    ]);
    expect(load({ x: 100, type: 'bonus', stage: 'vault', entrance: 'digit' }).issues).toEqual([
      { path: at('.digit'), message: 'a digit entrance needs its digit' },
    ]);
    expect(
      load({ x: 100, type: 'bonus', stage: 'vault', entrance: 'digit', digit: 1, place: 50 })
        .issues,
    ).toEqual([{ path: at('.place'), message: 'must be one of 10, 100, 1000, 10000, 100000' }]);
    expect(
      load({ x: 100, type: 'bonus', stage: 'vault', entrance: 'ground', until: 50 }).issues,
    ).toEqual([{ path: at('.until'), message: 'must be >= x (the window closes there)' }]);
  });

  it('needs the entrance to name a bonus stage, and a bonus stage to be a plain one', () => {
    const zone = load({ x: 100, type: 'bonus', stage: 'zone', entrance: 'ground' });
    expect(zone.issues).toEqual([
      {
        path: 'stages/zone.stage.json:events[0].stage',
        message: 'must name a stage of type "bonus"',
      },
    ]);
    const bossy = load(
      { x: 100, type: 'bonus', stage: 'vault', entrance: 'ground' },
      {
        events: [
          { x: 10, type: 'warning', enemy: 'x' },
          { x: 20, type: 'bonus', stage: 'vault', entrance: 'ground' },
        ],
      },
    );
    const messages = bossy.issues.map((i) => i.path + ': ' + i.message);
    expect(messages).toContain(
      'stages/vault.stage.json:events[0]: a bonus stage has no warning event',
    );
    expect(messages).toContain(
      'stages/vault.stage.json:events[1]: a bonus stage has no bonus event',
    );
    expect(messages).toContain('stages/vault.stage.json:events: a bonus stage needs an end event');
  });
});
