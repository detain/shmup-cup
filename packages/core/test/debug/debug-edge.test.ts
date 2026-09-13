/**
 * Edge-case suite for `hashWorld` (plan M1-06), beyond `debug.test.ts`:
 *
 * - an **independent reference** (plain FNV-1a over bytes, written from the module docs) equals
 *   `hashWorld` on random states — so the documented field order is the implemented one;
 * - sensitivity to the fields `debug.test.ts` does not cover (camera y / dx / dy / vx, player y,
 *   state timer, lives, `moving`, player 2, pool counts and later pools);
 * - what the hash deliberately ignores: presentation-only and derived state (device kinds,
 *   intents, the view batches, debug switches, queued events, the broad-phase grid);
 * - odd numbers (NaN, ±0, ±Infinity) hash deterministically;
 * - a stepped world's hash is a pure function of its state, however it was reached.
 */
import { describe, expect, it } from 'vitest';
import { fireBendingLaser, fireLaser } from '../../src/bullets/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB } from '../../src/data/index.js';
import { FNV_OFFSET_BASIS, FNV_PRIME, hashWorld } from '../../src/debug/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { MAX_PATTERN_LOCALS, MAX_REPEAT_DEPTH } from '../../src/patterns/index.js';
import { PLAYER_STATES, spawnPlayer } from '../../src/player/index.js';
import { createSoaPool } from '../../src/pools/index.js';
import { createRng } from '../../src/rng/index.js';
import { addScore } from '../../src/scoring/index.js';
import { WORLD_STATUSES, createWorld, stepWorld, type World } from '../../src/world/index.js';

/**
 * A fresh world on the empty content DB.
 *
 * @param seed - Config seed.
 * @returns The world.
 */
function world(seed = 1): World {
  return createWorld(resolveGameConfig({ seed }), EMPTY_CONTENT_DB);
}

/**
 * Reference hash, written from the module documentation with plain byte arrays: FNV-1a over the
 * little-endian bytes of every value; numbers as IEEE-754 doubles, codes / flags / counts / RNG
 * words as 32-bit words.
 *
 * @param w - The world.
 * @returns The hash.
 */
function referenceHash(w: World): number {
  const bytes: number[] = [];
  const word = (value: number): void => {
    for (let i = 0; i < 4; i++) bytes.push((value >>> (8 * i)) & 0xff);
  };
  const num = (value: number): void => {
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, value, true);
    for (let i = 0; i < 8; i++) bytes.push(view.getUint8(i));
  };
  num(w.tick);
  for (const x of w.rng.gameplay.getState()) word(x);
  for (const x of w.rng.cosmetic.getState()) word(x);
  const c = w.camera;
  for (const value of [c.x, c.y, c.dx, c.dy, c.vx, c.vy]) num(value);
  if (w.stage === null) {
    word(0);
  } else {
    word(1);
    for (const value of w.stage.state) num(value);
  }
  word(WORLD_STATUSES.indexOf(w.status));
  num(w.hitStop);
  num(w.rank);
  for (const p of w.players) {
    word(p.active ? 1 : 0);
    num(p.x);
    num(p.y);
    word(PLAYER_STATES.indexOf(p.state));
    num(p.stateTicks);
    num(p.speedLevel);
    num(p.invulnTicks);
    num(p.bank);
    num(p.lives);
    word(p.moving ? 1 : 0);
    word(p.hitCause);
    num(p.hitTick);
    num(p.hits);
  }
  for (const entry of w.pools.entries) {
    const count = entry.pool.count;
    word(count);
    for (const array of entry.arrays) for (let i = 0; i < count; i++) num(array[i]);
  }
  // M2-02: the bending lasers' active slots, then the pattern runners in use.
  const bend = w.bullets.bending;
  for (let s = 0; s < bend.capacity; s++) {
    word(bend.active[s]);
    if (bend.active[s] === 0) continue;
    for (const value of [
      bend.filled[s],
      bend.head[s],
      bend.length[s],
      bend.emit[s],
      bend.homing[s],
      bend.stride[s],
      bend.angle[s],
      bend.speed[s],
      bend.turnRate[s],
      bend.width[s],
    ]) {
      num(value);
    }
    word(bend.bits[s]);
    for (let n = 0; n < bend.filled[s]; n++) {
      const node = s * bend.nodes + ((bend.head[s] - n) & (bend.nodes - 1));
      num(bend.x[node]);
      num(bend.y[node]);
    }
  }
  const runners = w.patterns.runners;
  num(runners.meta[0]);
  num(runners.meta[1]);
  for (let i = 0; i < runners.state.length; i++) {
    if (runners.state[i] === 0) continue;
    num(i);
    word(runners.state[i]);
    num(runners.entry[i]);
    num(runners.pc[i]);
    num(runners.depth[i]);
    for (let d = 0; d < runners.depth[i]; d++) {
      num(runners.loopI[i * MAX_REPEAT_DEPTH + d]);
      num(runners.loopN[i * MAX_REPEAT_DEPTH + d]);
    }
    for (let k = 0; k < MAX_PATTERN_LOCALS; k++) num(runners.locals[i * MAX_PATTERN_LOCALS + k]);
    for (const value of [
      runners.wake[i],
      runners.seqDir[i],
      runners.seqSpeed[i],
      runners.heading[i],
      runners.scale[i],
    ]) {
      num(value);
    }
  }
  for (const e of w.enemies.enemies) {
    word(e.state);
    if (e.state === 0) continue;
    for (const value of [
      e.specIndex,
      e.x,
      e.y,
      e.vx,
      e.vy,
      e.hp,
      e.flashTicks,
      e.age,
      e.spawnTick,
      e.formation,
      e.member,
      e.anchor,
      e.mover,
      e.m0,
      e.m1,
      e.m2,
      e.m3,
      e.m4,
      e.m5,
      e.s0,
      e.s1,
      e.s2,
      e.s3,
      e.moverTicks,
    ]) {
      num(value);
    }
    word(e.script === null ? 0 : 1);
    num(e.wakeTick);
    word(e.flags);
    num(e.firstSeenTick);
    num(e.animFrame);
    num(e.pathId);
    num(e.camX);
    num(e.camY);
    // The Options an Option Hunter carries (M2-04).
    num(e.carried);
  }
  const f = w.enemies.formations;
  for (let slot = 0; slot < f.active.length; slot++) {
    word(f.active[slot]);
    if (f.active[slot] === 0) continue;
    for (const array of [
      f.enemy,
      f.total,
      f.spawned,
      f.killed,
      f.escaped,
      f.interval,
      f.nextTick,
      f.screenX,
      f.screenY,
      f.path,
      f.drop,
      f.bonus,
      f.lastX,
      f.lastY,
      f.leader,
    ]) {
      num(array[slot]);
    }
    num(f.tracks[slot].recorded);
  }
  // Player weapons (M1-10): loadouts and option groups, timers, live piercing shots' tables.
  const weapons = w.weapons;
  for (let p = 0; p < weapons.loadouts.length; p++) {
    const l = weapons.loadouts[p];
    num(l.main);
    word(l.missile ? 1 : 0);
    num(l.options);
    // The Direct-mode levels and family (M2-05).
    num(l.shot);
    num(l.sub);
    num(l.family);
    const g = weapons.options[p];
    num(g.count);
    num(g.stolen);
    num(g.head);
    for (const array of [g.trailX, g.trailY, g.x, g.y]) for (const value of array) num(value);
    // The Option types (M2-04): type, spread, toggle, hold, orbit angle, Snake links.
    word(g.mode);
    num(g.spreadTicks);
    word(g.toggled ? 1 : 0);
    num(g.holdTicks);
    num(g.angle);
    for (const array of [g.snakeX, g.snakeY]) for (const value of array) num(value);
  }
  for (const value of weapons.timers) num(value);
  // The Free Way's last direction per player (M2-03).
  for (const value of weapons.freeWayHeading) num(value);
  const shots = weapons.pool;
  for (let i = 0; i < shots.count; i++) {
    const table = shots.fields.table[i];
    if (table <= 0) continue;
    for (let e = 0; e < 64; e++) word(weapons.cooldowns[(table - 1) * 64 + e]);
    for (let e = 0; e < 16; e++) word(weapons.partCooldowns[(table - 1) * 16 + e]);
  }
  // Power-ups (M1-11): per player the meter cursor, pending Mega Crash and shield; taken drops.
  const powerups = w.powerups;
  for (let p = 0; p < powerups.meters.length; p++) {
    num(powerups.meters[p].cursor);
    word(powerups.megaPending[p]);
    const shield = w.players[p].shield;
    word(shield.kind);
    num(shield.hits);
    num(shield.maxHits);
    num(shield.iFrames);
    word(shield.absorbsTerrain ? 1 : 0);
    num(shield.hitTick);
    num(shield.brokeTick);
    num(shield.absorbed);
    // Reduce's hurt scale and the pods (M2-04).
    num(shield.hurtScale);
    num(shield.podCount);
    num(shield.podMaxHits);
    num(shield.podOrbit);
    num(shield.spin);
    for (const array of [shield.podHits, shield.podAngle, shield.podIFrames, shield.podHitTick]) {
      for (const value of array) num(value);
    }
    // The Arm's tier and blue-item count (M2-05).
    num(shield.tier);
    num(shield.charge);
  }
  num(powerups.dropsTaken);
  // The Direct-mode item plan's cursor (M2-05).
  num(powerups.planCursor);
  // The co-op drop scaling credit (M2-06).
  num(powerups.coopCredit);
  // Effect timers and scores (M1-12) — not the session hi-score.
  const fx = w.fx;
  for (const value of [
    fx.shakeMagnitude,
    fx.shakeTicks,
    fx.shakeDuration,
    fx.shakeTick,
    fx.flashTicks,
    fx.flashKind,
    fx.flashTick,
  ]) {
    num(value);
  }
  // Each score with its next extend and continue count (M2-01).
  for (const score of w.scoring.board.scores) {
    num(score.score);
    num(score.nextExtend);
    num(score.continues);
  }
  num(w.scoring.killsScored);
  num(w.scoring.bonusesScored);
  // The continues used and the rank inputs (M2-01).
  num(w.continuesUsed);
  for (const value of [w.rankInputs.loop, w.rankInputs.stage, w.rankInputs.power]) num(value);
  num(w.rankInputs.special);
  // The boss (M1-13): its slot, the parts in use, the WARNING.
  const b = w.bosses.boss;
  word(b.state);
  for (const value of [b.specIndex, b.x, b.y, b.screenX, b.screenY]) num(value);
  for (const value of [b.stateTicks, b.phase, b.phaseTicks]) num(value);
  word(b.script === null ? 0 : 1);
  num(b.wakeTick);
  word(b.motion);
  for (const value of [b.trackSpeed, b.trackMin, b.trackMax]) num(value);
  for (const value of [b.moveFromX, b.moveFromY, b.moveToX, b.moveToY, b.moveTicks]) num(value);
  num(b.moveElapsed);
  word(b.destroyedMask);
  num(b.killer);
  word(b.blasted ? 1 : 0);
  num(b.partCount);
  for (const part of b.parts.slice(0, b.partCount)) {
    for (const value of [part.localX, part.localY, part.x, part.y, part.hp]) num(value);
    word(part.destroyed ? 1 : 0);
    word(part.open ? 1 : 0);
    num(part.flashTicks);
  }
  word(w.bosses.warning.active ? 1 : 0);
  num(w.bosses.warning.ticks);
  let h = FNV_OFFSET_BASIS;
  for (const b of bytes) h = Math.imul(h ^ b, FNV_PRIME) >>> 0;
  return h;
}

describe('core/debug hashWorld — reference and coverage', () => {
  it('equals an independent FNV-1a over the documented field order (random states)', () => {
    const rng = createRng(2024);
    for (let round = 0; round < 60; round++) {
      const w = world(rng.nextU32());
      const input = createInputSnapshot();
      if (round % 2 === 0) {
        const pool = w.pools.register('b', createSoaPool(8, { vx: 'f32', x: 'f64', hp: 'i16' }));
        const n = rng.rangeInt(0, 8);
        for (let i = 0; i < n; i++) {
          const slot = pool.alloc();
          pool.fields.x[slot] = rng.nextFloat() * 400;
          pool.fields.vx[slot] = rng.rangeInt(-8, 8) / 4;
          pool.fields.hp[slot] = rng.rangeInt(-3, 300);
        }
      }
      if (round % 3 === 0) w.pools.register('e', createSoaPool(4, { t: 'u8' })).alloc();
      if (round % 5 === 0) fireBendingLaser(w, { slot: -1, x: w.camera.x + 300, y: 100 });
      w.players[1].active = round % 4 === 0;
      if (w.players[1].active) spawnPlayer(w.players[1], w.camera);
      w.camera.vx = rng.rangeInt(0, 3) / 4;
      w.camera.vy = rng.rangeInt(-1, 1) / 8;
      w.status = WORLD_STATUSES[rng.rangeInt(0, WORLD_STATUSES.length - 1)];
      const ticks = rng.rangeInt(0, 120);
      for (let t = 0; t < ticks; t++) {
        if (t === 50) w.hitStop = rng.rangeInt(0, 5);
        commitPlayerInput(input.players[0], rng.rangeInt(0, 15));
        commitPlayerInput(input.players[1], rng.rangeInt(0, 15));
        stepWorld(w, input);
      }
      w.players[0].invulnTicks = rng.rangeInt(0, 3);
      w.players[0].lives = rng.rangeInt(0, 9);
      w.rng.gameplay.nextU32();
      expect(hashWorld(w), `round ${round}`).toBe(referenceHash(w));
    }
  });

  it.each([
    ['camera y', (w: World) => void (w.camera.y = -0.5)],
    ['camera dx', (w: World) => void (w.camera.dx = 0.25)],
    ['camera dy', (w: World) => void (w.camera.dy = 0.25)],
    ['camera vx', (w: World) => void (w.camera.vx = 0.25)],
    ['player y', (w: World) => void (w.players[0].y += 1e-9)],
    ['player state timer', (w: World) => void (w.players[0].stateTicks = 1)],
    ['player lives', (w: World) => void (w.players[0].lives = 2)],
    ['player moving flag', (w: World) => void (w.players[0].moving = true)],
    ['player hit cause', (w: World) => void (w.players[0].hitCause = 1)],
    ['player hit tick', (w: World) => void (w.players[0].hitTick = 7)],
    ['player hit count', (w: World) => void (w.players[0].hits = 1)],
    ['player 2 x', (w: World) => void (w.players[1].x = 3)],
    ['player 2 lives', (w: World) => void (w.players[1].lives = 0)],
    ['status (each code)', (w: World) => void (w.status = 'stageClear')],
    ['rank', (w: World) => void (w.rank = 3)],
    ['an enemy bullet', (w: World) => void w.bullets.spawn(100, 100, 0, 1, 0)],
    ['an enemy laser', (w: World) => void fireLaser(w, { slot: -1, x: 50, y: 50 }, 0, 100)],
    ['shake magnitude', (w: World) => void (w.fx.shakeMagnitude = 2)],
    ['shake ticks', (w: World) => void (w.fx.shakeTicks = 2)],
    ['shake duration', (w: World) => void (w.fx.shakeDuration = 2)],
    ['shake request tick', (w: World) => void (w.fx.shakeTick = 2)],
    ['flash ticks', (w: World) => void (w.fx.flashTicks = 2)],
    ['flash kind', (w: World) => void (w.fx.flashKind = 1)],
    ['flash request tick', (w: World) => void (w.fx.flashTick = 2)],
    ['player 1 score', (w: World) => void addScore(w, 0, 100)],
    ['player 2 score', (w: World) => void addScore(w, 1, 100)],
  ])('changes when the %s changes', (_label, mutate) => {
    const a = world();
    const b = world();
    mutate(b);
    expect(hashWorld(b)).not.toBe(hashWorld(a));
  });

  it('distinguishes every status and every player state', () => {
    const statusHashes = WORLD_STATUSES.map((status) => {
      const w = world();
      w.status = status;
      return hashWorld(w);
    });
    expect(new Set(statusHashes).size).toBe(WORLD_STATUSES.length);
    const stateHashes = PLAYER_STATES.map((state) => {
      const w = world();
      w.players[0].state = state;
      return hashWorld(w);
    });
    expect(new Set(stateHashes).size).toBe(PLAYER_STATES.length);
  });

  it('covers pool counts (even with equal slot values) and every registered pool', () => {
    const a = world();
    const b = world();
    const pa = a.pools.register('p', createSoaPool(4, { x: 'f64' }));
    const pb = b.pools.register('p', createSoaPool(4, { x: 'f64' }));
    pa.alloc();
    pb.alloc();
    expect(hashWorld(a)).toBe(hashWorld(b));
    pb.alloc(); // a second slot holding 0 — only the count differs
    expect(hashWorld(b)).not.toBe(hashWorld(a));
    pa.alloc();
    expect(hashWorld(a)).toBe(hashWorld(b));
    // A second pool is hashed too.
    const qa = a.pools.register('q', createSoaPool(2, { y: 'u16' }));
    const qb = b.pools.register('q', createSoaPool(2, { y: 'u16' }));
    qa.fields.y[qa.alloc()] = 7;
    qb.fields.y[qb.alloc()] = 8;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});

describe('core/debug hashWorld — what it ignores, odd values, purity', () => {
  it('ignores presentation-only and derived state', () => {
    const a = world();
    const b = world();
    const base = hashWorld(a);
    expect(hashWorld(b)).toBe(base);
    b.players[0].device = 'remote';
    b.intents[0].held = Action.Shot;
    b.intents[1].moveX = 1;
    b.playerBatch.count = 0;
    b.debugFlags.showHitboxes = true;
    b.debugFlags.slowMo = 4;
    b.events.push(1, 2, 3, 4, 5);
    b.grid.begin(100, 100);
    b.grid.insert(1, 0, 0, 10, 10);
    b.grid.build();
    // The session hi-score and the HUD's dirty flags (M1-12): presentation, raised from a save.
    b.scoring.board.setHiScore(123_456);
    b.scoring.board.scores[0].displayDirty = true;
    b.fx.frozen = true;
    expect(hashWorld(b)).toBe(base);
  });

  it('hashes NaN, ±0 and ±Infinity deterministically (and tells ±0 apart)', () => {
    const values = [Number.NaN, 0, -0, Infinity, -Infinity];
    const hashes = values.map((value) => {
      const w = world();
      w.players[0].x = value;
      return hashWorld(w);
    });
    const again = values.map((value) => {
      const w = world();
      w.players[0].x = value;
      return hashWorld(w);
    });
    expect(again).toEqual(hashes);
    expect(new Set(hashes).size).toBe(values.length);
  });

  it('is a pure function of the state, however the state was reached', () => {
    // A: step 60 ticks idle. B: step 60 ticks, then overwrite every hashed value with A's.
    const a = world(9);
    const b = world(9);
    const input = createInputSnapshot();
    for (let i = 0; i < 60; i++) stepWorld(a, input);
    commitPlayerInput(input.players[0], Action.Up | Action.Right);
    for (let i = 0; i < 60; i++) stepWorld(b, input);
    expect(hashWorld(b)).not.toBe(hashWorld(a));
    Object.assign(b.players[0], {
      x: a.players[0].x,
      y: a.players[0].y,
      bank: a.players[0].bank,
      moving: a.players[0].moving,
      stateTicks: a.players[0].stateTicks,
    });
    // The option trail recorded B's movement too (M1-10).
    const ga = a.weapons.options[0];
    const gb = b.weapons.options[0];
    gb.trailX.set(ga.trailX);
    gb.trailY.set(ga.trailY);
    gb.x.set(ga.x);
    gb.y.set(ga.y);
    gb.head = ga.head;
    // …and so did the Free Way's last direction (M2-03).
    b.weapons.freeWayHeading.set(a.weapons.freeWayHeading);
    expect(hashWorld(b)).toBe(hashWorld(a));
  });
});
