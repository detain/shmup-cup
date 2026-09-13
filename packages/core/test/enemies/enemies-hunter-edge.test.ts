/**
 * The Option Hunter and the blue capsule's screen clear (plan M2-04) — edge cases beyond
 * `enemies-hunter.test.ts`:
 *
 * - appearance: a formation of hunters without Options ends at once (every member refused
 *   counts as escaped — no drop, no bonus), an inactive player's Options do not call one, the
 *   alarm is pushed at the spawn's whole-pixel position; a hatch never releases one without
 *   Options either;
 * - stealing: a hunter with room for only some of the chain takes what fits, two hunters on one
 *   chain in a tick (the first takes it all), ghosts and removed hunters take nothing, a hunter
 *   touching nothing pushes no sound, co-op (it takes from both ships in one tick), a hunter and a
 *   Mega Crash in the same tick (what was just taken drifts free at once), `clear()` (checkpoint)
 *   loses the haul;
 * - carrying: drawn to the right of a hunter that stands still, behind a diagonal flight, pulsing
 *   with the Options' animation, the batch full at `CARRIED_BATCH_CAPACITY`; content without the
 *   grey sprite draws nothing; a dead hunter with its own drop leaves it and the freed Options;
 * - freed Options take the drift table in turn (the 9th of a tick wraps; the next tick starts
 *   over);
 * - behaviour tunables (`hunter.option`): out-of-range variants, line-up points kept 12 px inside
 *   the playfield, no living target (lines up where it is), a zero line-up and a negative windup;
 *   it never fires;
 * - `clearOnScreen`: immune enemies and ghosts spared, kills credited, no revenge bullets, 0 with
 *   nothing on screen.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KNOWN_SCRIPT_IDS } from '../../src/behaviors/index.js';
import { BulletFlag } from '../../src/bullets/index.js';
import {
  PLAYFIELD_H,
  PLAYFIELD_W,
  resolveGameConfig,
  type GameConfig,
} from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import {
  CARRIED_BATCH_CAPACITY,
  CARRIED_OPTION_SPACING,
  DropKind,
  EnemyFlag,
  EnemyState,
  MAX_CARRIED_OPTIONS,
  type Enemy,
} from '../../src/enemies/index.js';
import { SFX_CUES, SimEventKind, type SimEvent } from '../../src/events/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { OPTION_ANIM_TICKS } from '../../src/options/index.js';
import { spawnPlayer } from '../../src/player/index.js';
import { FREE_OPTION_DRIFT, ItemFlag, ItemKind, MeterSlot } from '../../src/powerups/index.js';
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
 * A hand-made enemy entry.
 *
 * @param id - Enemy id.
 * @param over - More fields.
 * @returns The entry.
 */
function enemy(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    hp: 5,
    score: 100,
    hurtbox: { hw: 4, hh: 4 },
    script: 'test.idle',
    sprite: 'enemies/drifter',
    drop: null,
    settleTicks: 0,
    ...over,
  };
}

/** Hand-made enemies: idle hunters (with and without a drop), odd `hunter.option` tunables. */
const ENEMIES = [
  enemy('target'),
  enemy('immune', { megaCrashImmune: true }),
  enemy('avenger', { revenge: { minRank: 0, pattern: 'aimed', speed: 1 } }),
  enemy('hunter', { optionHunter: true, hurtbox: { hw: 1, hh: 1 } }),
  enemy('hunter-capsule', { optionHunter: true, drop: 'capsule' }),
  enemy('hatch', {
    ground: 'floor',
    script: 'hatch.spawner',
    child: 'hunter',
    params: { interval: 5, max: 0 },
  }),
  enemy('h-variant-9', { optionHunter: true, script: 'hunter.option', params: { variant: 9 } }),
  enemy('h-variant-neg', {
    optionHunter: true,
    script: 'hunter.option',
    params: { variant: -4, lineUpTicks: 0, windup: -10, chargeSpeed: 6 },
  }),
  enemy('h-rear', { optionHunter: true, script: 'hunter.option', params: { variant: 0 } }),
  enemy('h-dive', { optionHunter: true, script: 'hunter.option', params: { variant: 2 } }),
];

/**
 * The test content.
 *
 * @param extraSprites - Engine sprites the content provides (default all).
 * @returns The DB.
 */
function db(extraSprites: readonly string[] = ENGINE_SPRITES): ContentDb {
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      {
        path: 'enemies/t.enemies.json',
        data: { formatVersion: 1, kind: 'enemies', enemies: ENEMIES },
      },
    ],
    { extraSprites, knownScripts: [...KNOWN_SCRIPT_IDS, 'test.idle'] },
  );
  expect(issues).toEqual([]);
  return content;
}

/** The shared DB. */
const DB = db();

/**
 * A free-flight world, player 1 alive at view (`x`, `y`) with `options` Formation Options
 * (autofire off, a fixed layout).
 *
 * @param options - Options owned.
 * @param config - Config overrides.
 * @param x - View x.
 * @param y - View y.
 * @param content - The content.
 * @returns The world.
 */
function world(
  options: number,
  config: Partial<GameConfig> = {},
  x = 200,
  y = 100,
  content: ContentDb = DB,
): World {
  const w = createWorld(
    resolveGameConfig({
      seed: 3,
      autofire: false,
      remoteMode: false,
      optionChoice: 'formation',
      ...config,
    }),
    content,
  );
  const input = createInputSnapshot();
  while (w.players[0].state !== 'alive') stepWorld(w, input);
  w.players[0].x = w.camera.x + x;
  w.players[0].y = w.camera.y + y;
  w.weapons.loadouts[0].options = options;
  stepWorld(w, input);
  w.events.clear();
  return w;
}

/**
 * Spawns an enemy by id at a world position.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @param x - World x.
 * @param y - World y.
 * @returns The enemy or `null`.
 */
function spawnAt(w: World, id: string, x: number, y: number): Enemy | null {
  return w.enemies.spawn(w.content.enemyIndex.get(id)!, x, y);
}

/**
 * Drains the events.
 *
 * @param w - The world.
 * @returns The events.
 */
function drain(w: World): SimEvent[] {
  const out: SimEvent[] = [];
  w.events.drain((e) => out.push({ ...e }));
  return out;
}

/**
 * Counts SFX of a cue.
 *
 * @param events - Events.
 * @param cue - `SFX_CUES` id.
 * @returns How many.
 */
function sfx(events: readonly SimEvent[], cue: number): number {
  return events.filter((e) => e.kind === SimEventKind.Sfx && e.id === cue).length;
}

/**
 * Live items of a kind.
 *
 * @param w - The world.
 * @param kind - `ItemKind`.
 * @returns How many.
 */
function items(w: World, kind: number): number {
  const f = w.powerups.pool.fields;
  let n = 0;
  for (let i = 0; i < w.powerups.pool.count; i++) {
    if ((f.flags[i] & ItemFlag.Dead) === 0 && f.kind[i] === kind) n++;
  }
  return n;
}

/**
 * Live enemy bullets.
 *
 * @param w - The world.
 * @returns How many.
 */
function bullets(w: World): number {
  let n = 0;
  const f = w.bullets.pool.fields;
  for (let i = 0; i < w.bullets.pool.count; i++) if ((f.flags[i] & BulletFlag.Dead) === 0) n++;
  return n;
}

describe('M2-04 Option Hunter edges: appearance', () => {
  it('a formation of hunters without Options ends at once: no member, drop or bonus', () => {
    const w = world(0);
    const slot = w.enemies.startFormation(
      w.content.enemyIndex.get('hunter')!,
      3,
      1,
      300,
      60,
      -1,
      DropKind.BlueCapsule,
      500,
    );
    expect(slot).toBeGreaterThanOrEqual(0);
    for (let t = 0; t < 5; t++) stepWorld(w, createInputSnapshot());
    expect(w.enemies.formations.active[slot]).toBe(0);
    expect(w.enemies.formations.escaped[slot]).toBe(3);
    expect(w.enemies.count).toBe(0);
    expect(items(w, ItemKind.BlueCapsule)).toBe(0);
    expect(w.scoring.board.scores[0].score).toBe(0);
    expect(sfx(drain(w), SFX_CUES.OptionHunter)).toBe(0);
  });

  it('only an active player`s Options call one; the alarm is at the spawn`s whole pixel', () => {
    const w = world(0);
    w.weapons.loadouts[1].options = 4; // player 2 is not in play
    expect(w.players[1].active).toBe(false);
    expect(spawnAt(w, 'hunter', w.camera.x + 300.75, w.camera.y + 50)).toBeNull();
    w.weapons.loadouts[0].options = 1;
    const x = w.camera.x + 300.75;
    expect(spawnAt(w, 'hunter', x, w.camera.y + 50)).not.toBeNull();
    const alarms = drain(w).filter(
      (e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.OptionHunter,
    );
    expect(alarms).toHaveLength(1);
    expect(alarms[0].x).toBe(Math.floor(x));
  });

  it('a hatch never releases a hunter while nobody has an Option', () => {
    const w = world(0);
    const hatch = spawnAt(w, 'hatch', w.camera.x + 300, w.camera.y + 150);
    expect(hatch).not.toBeNull();
    for (let t = 0; t < 60; t++) stepWorld(w, createInputSnapshot());
    expect(w.enemies.count).toBe(1);
    w.weapons.loadouts[0].options = 1;
    for (let t = 0; t < 30; t++) stepWorld(w, createInputSnapshot());
    expect(w.enemies.count).toBeGreaterThan(1);
  });
});

describe('M2-04 Option Hunter edges: stealing', () => {
  it('with room for only part of the chain it takes what fits', () => {
    const w = world(4);
    const group = w.weapons.options[0];
    const hunter = spawnAt(w, 'hunter', group.x[0], group.y[0])!;
    hunter.carried = MAX_CARRIED_OPTIONS - 3;
    drain(w);
    expect(w.enemies.huntOptions()).toBe(3);
    expect([hunter.carried, w.weapons.loadouts[0].options, group.count, group.stolen]).toEqual([
      MAX_CARRIED_OPTIONS,
      1,
      1,
      3,
    ]);
    const events = drain(w);
    expect(sfx(events, SFX_CUES.OptionStolen)).toBe(1);
    const stolen = events.find((e) => e.id === SFX_CUES.OptionStolen)!;
    expect([stolen.x, stolen.y]).toEqual([Math.floor(group.x[0]), Math.floor(group.y[0])]);
  });

  it('two hunters on one chain in a tick: the first takes it all, the second nothing', () => {
    const w = world(4);
    const group = w.weapons.options[0];
    const first = spawnAt(w, 'hunter', group.x[1], group.y[1])!;
    const second = spawnAt(w, 'hunter', group.x[3], group.y[3])!;
    expect(w.enemies.huntOptions()).toBe(3);
    expect([first.carried, second.carried, w.weapons.loadouts[0].options]).toEqual([3, 0, 1]);
  });

  it('ghosts, removed hunters and hunters touching nothing take nothing and stay quiet', () => {
    const w = world(4);
    const group = w.weapons.options[0];
    const ghost = spawnAt(w, 'hunter', group.x[0], group.y[0])!;
    ghost.flags |= EnemyFlag.Ghost;
    const far = spawnAt(w, 'hunter', group.x[0] + 60, group.y[0])!;
    drain(w);
    expect(w.enemies.huntOptions()).toBe(0);
    ghost.flags &= ~EnemyFlag.Ghost;
    ghost.state = EnemyState.Removed; // killed earlier this tick
    expect(w.enemies.huntOptions()).toBe(0);
    expect([ghost.carried, far.carried, w.weapons.loadouts[0].options]).toEqual([0, 0, 4]);
    expect(sfx(drain(w), SFX_CUES.OptionStolen)).toBe(0);
  });

  it('co-op: one hunter takes from both ships in the same tick', () => {
    const w = world(2);
    const p2 = w.players[1];
    p2.active = true;
    spawnPlayer(p2, w.camera);
    const input = createInputSnapshot();
    while (p2.state !== 'alive') stepWorld(w, input);
    w.weapons.loadouts[1].options = 2;
    // Both ships at the same spot: their Formations overlap.
    p2.x = w.players[0].x;
    p2.y = w.players[0].y;
    stepWorld(w, input);
    const g1 = w.weapons.options[0];
    const g2 = w.weapons.options[1];
    expect([g1.count, g2.count]).toEqual([2, 2]);
    const hunter = spawnAt(w, 'hunter', g1.x[0], g1.y[0])!;
    drain(w);
    expect(w.enemies.huntOptions()).toBe(4);
    expect([hunter.carried, w.weapons.loadouts[0].options, w.weapons.loadouts[1].options]).toEqual([
      4, 0, 0,
    ]);
    expect([g1.stolen, g2.stolen]).toEqual([2, 2]);
    expect(sfx(drain(w), SFX_CUES.OptionStolen)).toBe(2);
  });

  it('a steal and a Mega Crash in the same tick: the Options drift free at once', () => {
    const w = world(3);
    const group = w.weapons.options[0];
    const hunter = spawnAt(w, 'hunter', group.x[0], group.y[0])!;
    // The ship stands still, so its Formation stays under the hunter; `!` = Mega Crash.
    w.powerups.meters[0].cursor = MeterSlot.Mega;
    const input = createInputSnapshot();
    commitPlayerInput(input.players[0], Action.PowerUp);
    stepWorld(w, input);
    const events = drain(w);
    expect(sfx(events, SFX_CUES.OptionStolen)).toBe(1);
    expect(sfx(events, SFX_CUES.MegaCrash)).toBe(1);
    expect(hunter.state).not.toBe(EnemyState.Live);
    expect(w.weapons.loadouts[0].options).toBe(0);
    expect(items(w, ItemKind.FreeOption)).toBe(3);
  });

  it('a checkpoint clear takes the hunter and its haul: nothing is freed', () => {
    const w = world(2);
    const group = w.weapons.options[0];
    const hunter = spawnAt(w, 'hunter', group.x[0], group.y[0])!;
    w.enemies.huntOptions();
    expect(hunter.carried).toBe(2);
    w.enemies.clear();
    w.powerups.resolve();
    expect(items(w, ItemKind.FreeOption)).toBe(0);
    expect(w.enemies.carriedBatch.count).toBe(0);
  });
});

describe('M2-04 Option Hunter edges: carrying', () => {
  it('draws the haul to the right of a hunter standing still, behind a diagonal flight', () => {
    const w = world(1);
    const still = spawnAt(w, 'hunter', w.camera.x + 100, w.camera.y + 40)!;
    still.carried = 2;
    w.enemies.sync();
    const batch = w.enemies.carriedBatch;
    expect(batch.count).toBe(2);
    expect([batch.x[0], batch.y[0]]).toEqual([still.x + CARRIED_OPTION_SPACING, still.y]);
    expect([batch.x[1], batch.y[1]]).toEqual([still.x + 2 * CARRIED_OPTION_SPACING, still.y]);
    still.vx = 3;
    still.vy = 4; // speed 5: unit (0.6, 0.8), trailing behind
    w.enemies.sync();
    expect(batch.x[0]).toBeCloseTo(still.x - 0.6 * CARRIED_OPTION_SPACING, 9);
    expect(batch.y[0]).toBeCloseTo(still.y - 0.8 * CARRIED_OPTION_SPACING, 9);
    expect(batch.flags[0]).toBe(0);
    // Pulsing with the Options' two frames.
    const frames = new Set<number>();
    for (let t = 0; t < 2 * OPTION_ANIM_TICKS; t++) {
      stepWorld(w, createInputSnapshot());
      still.carried = 2;
      frames.add(batch.frame[0]);
    }
    expect([...frames].sort()).toEqual([0, 1]);
  });

  it('fills the batch up to CARRIED_BATCH_CAPACITY and stops there', () => {
    const w = world(1);
    for (let k = 0; k < 3; k++) {
      const h = spawnAt(w, 'hunter', w.camera.x + 100 + k * 40, w.camera.y + 40)!;
      h.carried = MAX_CARRIED_OPTIONS;
    }
    w.enemies.sync();
    expect(w.enemies.carriedBatch.count).toBe(CARRIED_BATCH_CAPACITY);
    expect(CARRIED_BATCH_CAPACITY).toBe(2 * MAX_CARRIED_OPTIONS);
  });

  it('content without the grey sprite draws no haul (the World still runs)', () => {
    const content = db(ENGINE_SPRITES.filter((name) => name !== 'options/stolen'));
    const w = world(1, {}, 200, 100, content);
    const h = spawnAt(w, 'hunter', w.camera.x + 100, w.camera.y + 40)!;
    h.carried = 3;
    for (let t = 0; t < 3; t++) stepWorld(w, createInputSnapshot());
    expect(w.enemies.carriedBatch.count).toBe(0);
  });

  it('a dead hunter leaves its own drop and one freed Option per carried Option', () => {
    const w = world(1);
    const h = spawnAt(w, 'hunter-capsule', w.camera.x + 100, w.camera.y + 40)!;
    h.carried = 2;
    stepWorld(w, createInputSnapshot());
    expect(w.enemies.kill(h, 0)).toBe(true);
    const o = w.enemies.outcomes;
    expect([...o.dropKind.slice(0, o.dropCount)]).toEqual([
      DropKind.Capsule,
      DropKind.FreeOption,
      DropKind.FreeOption,
    ]);
    w.powerups.resolve();
    expect([items(w, ItemKind.Capsule), items(w, ItemKind.FreeOption)]).toEqual([1, 2]);
  });
});

describe('M2-04 Option Hunter edges: freed Options drift', () => {
  it('take the drift table in turn; the 9th freed in a tick wraps to the first entry', () => {
    const w = world(1);
    const a = spawnAt(w, 'hunter', w.camera.x + 200, w.camera.y + 60)!;
    const b = spawnAt(w, 'hunter', w.camera.x + 240, w.camera.y + 140)!;
    a.carried = MAX_CARRIED_OPTIONS;
    b.carried = 1;
    stepWorld(w, createInputSnapshot());
    expect(w.enemies.clearOnScreen(0)).toBe(2);
    w.powerups.resolve();
    const f = w.powerups.pool.fields;
    const drifts: number[][] = [];
    for (let i = 0; i < w.powerups.pool.count; i++) {
      if ((f.flags[i] & ItemFlag.Dead) === 0 && f.kind[i] === ItemKind.FreeOption) {
        drifts.push([f.vx[i], f.vy[i]]);
      }
    }
    expect(drifts).toHaveLength(9);
    for (let n = 0; n < 9; n++) {
      const k = (n & 7) * 2;
      expect(drifts[n]).toEqual([FREE_OPTION_DRIFT[k], FREE_OPTION_DRIFT[k + 1]]);
    }
    // The next tick starts the table over.
    stepWorld(w, createInputSnapshot());
    const c = spawnAt(w, 'hunter', w.camera.x + 200, w.camera.y + 60)!;
    c.carried = 1;
    stepWorld(w, createInputSnapshot());
    w.enemies.kill(c, 0);
    w.powerups.resolve();
    let last = -1;
    for (let i = 0; i < w.powerups.pool.count; i++) {
      if ((f.flags[i] & ItemFlag.Dead) === 0 && f.kind[i] === ItemKind.FreeOption) last = i;
    }
    expect([f.vx[last], f.vy[last]]).toEqual([FREE_OPTION_DRIFT[0], FREE_OPTION_DRIFT[1]]);
  });
});

describe('M2-04 Option Hunter edges: behaviour tunables', () => {
  it('variant 9 is the dive; a negative variant is the rear one', () => {
    const w = world(1, {}, 250, 150);
    const dive = spawnAt(w, 'h-variant-9', w.camera.x + 60, w.camera.y - 20)!;
    for (let t = 0; t < 100; t++) stepWorld(w, createInputSnapshot());
    expect(dive.x - w.camera.x).toBeCloseTo(250, 0);
    expect(dive.y - w.camera.y).toBeCloseTo(24, 0);
    const v = world(1, {}, 250, 150);
    const rear = spawnAt(v, 'h-variant-neg', v.camera.x - 20, v.camera.y + 20)!;
    // One aim (a line-up of 1 tick) and no windup: it flies to the row it saw, then charges.
    for (let t = 0; t < 120; t++) stepWorld(v, createInputSnapshot());
    expect(rear.vx).toBeCloseTo(6, 9);
    expect(rear.vy).toBe(0);
  });

  it('keeps its line-up point 12 px inside the playfield', () => {
    const top = world(1, {}, 250, 2);
    const h1 = spawnAt(top, 'h-rear', top.camera.x - 20, top.camera.y + 100)!;
    for (let t = 0; t < 80; t++) stepWorld(top, createInputSnapshot());
    expect(h1.y - top.camera.y).toBeCloseTo(12, 0);
    const bottom = world(1, {}, 250, PLAYFIELD_H - 1);
    const h2 = spawnAt(bottom, 'h-rear', bottom.camera.x - 20, bottom.camera.y + 100)!;
    for (let t = 0; t < 80; t++) stepWorld(bottom, createInputSnapshot());
    expect(h2.y - bottom.camera.y).toBeCloseTo(PLAYFIELD_H - 12, 0);
    const right = world(1, {}, PLAYFIELD_W - 2, 150);
    const h3 = spawnAt(right, 'h-dive', right.camera.x + 300, right.camera.y - 20)!;
    for (let t = 0; t < 80; t++) stepWorld(right, createInputSnapshot());
    expect(h3.x - right.camera.x).toBeCloseTo(PLAYFIELD_W - 12, 0);
  });

  it('without a living player it lines up where it is (its own row) and never fires', () => {
    const w = world(1);
    const h = spawnAt(w, 'h-rear', w.camera.x - 20, w.camera.y + 77)!;
    w.players[0].active = false;
    for (let t = 0; t < 80; t++) stepWorld(w, createInputSnapshot());
    expect(h.y - w.camera.y).toBeCloseTo(77, 0);
    expect(h.x - w.camera.x).toBeCloseTo(48, 0);
    expect(bullets(w)).toBe(0);
  });
});

describe('M2-04 blue capsule edges: clearOnScreen', () => {
  it('spares the immune and the ghosts, credits the kills, fires no revenge bullets', () => {
    const w = world(1, { loadout: 'full' });
    const a = spawnAt(w, 'target', w.camera.x + 250, w.camera.y + 50)!;
    const immune = spawnAt(w, 'immune', w.camera.x + 260, w.camera.y + 80)!;
    const ghost = spawnAt(w, 'target', w.camera.x + 270, w.camera.y + 110)!;
    const avenger = spawnAt(w, 'avenger', w.camera.x + 280, w.camera.y + 140)!;
    const hunter = spawnAt(w, 'hunter', w.camera.x + 290, w.camera.y + 170)!;
    stepWorld(w, createInputSnapshot());
    ghost.flags |= EnemyFlag.Ghost;
    w.bullets.pool.clear();
    expect(w.enemies.clearOnScreen(0)).toBe(3);
    expect([a.state, avenger.state, hunter.state].every((s) => s !== EnemyState.Live)).toBe(true);
    expect([immune.state, ghost.state]).toEqual([EnemyState.Live, EnemyState.Live]);
    const o = w.enemies.outcomes;
    expect([...o.killBy.slice(0, o.killCount)]).toEqual([0, 0, 0]);
    expect(bullets(w)).toBe(0);
    // The same avenger killed by a shot does fire (the rank is high enough).
    const b = spawnAt(w, 'avenger', w.camera.x + 280, w.camera.y + 140)!;
    stepWorld(w, createInputSnapshot());
    w.enemies.kill(b, 0);
    expect(bullets(w)).toBe(1);
  });

  it('kills nothing with nothing on screen, and credits nobody by default', () => {
    const w = world(0);
    expect(w.enemies.clearOnScreen()).toBe(0);
    const e = spawnAt(w, 'target', w.camera.x + 250, w.camera.y + 50)!;
    stepWorld(w, createInputSnapshot());
    expect(w.enemies.clearOnScreen()).toBe(1);
    expect(e.state).not.toBe(EnemyState.Live);
    const o = w.enemies.outcomes;
    expect(o.killBy[o.killCount - 1]).toBe(-1);
  });

  it('the power-up system`s clearScreen with a bad slot credits nobody, sound at the origin', () => {
    const w = world(0);
    spawnAt(w, 'target', w.camera.x + 250, w.camera.y + 50);
    stepWorld(w, createInputSnapshot());
    drain(w);
    for (const bad of [-1, 2, 7, 0.5, NaN]) {
      expect(w.powerups.clearScreen(bad)).toBeLessThanOrEqual(1);
    }
    const crash = drain(w).filter(
      (e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.MegaCrash,
    );
    expect(crash).toHaveLength(5);
    for (const e of crash) expect([e.x, e.y]).toEqual([0, 0]);
    const o = w.enemies.outcomes;
    expect(o.killBy[o.killCount - 1]).toBe(-1);
  });
});
