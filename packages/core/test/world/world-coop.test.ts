/**
 * Two-player simultaneous co-op in the World (plan M2-06, shmup_feat.md §16): the drop-in join
 * (`JOIN_ACTIONS` on an inactive slot of a `coop` World — never in a one-player game, never while
 * the game is not being played), a player out of lives leaving play while the other plays on and
 * dropping back in with a per-player continue (no stage restart), the game over once both are out,
 * `continueWorld`'s player mask, the aim tie-break towards player 1, item ownership, the co-op drop
 * scaling (`coopExtra`), player 2's palette-swap sprite, and lockstep determinism of two co-op
 * worlds fed the same two inputs.
 */
import { describe, expect, it } from 'vitest';
import { hashWorld } from '../../src/debug/index.js';
import { SFX_CUES, SimEventKind, type SimEvent } from '../../src/events/index.js';
import {
  Action,
  commitPlayerInput,
  createInputSnapshot,
  type InputSnapshot,
} from '../../src/input/index.js';
import { PLAYER_DEAD_TICKS, playerOut } from '../../src/player/index.js';
import { COOP_EXTRA_OFFSET, ItemKind, MeterSlot } from '../../src/powerups/index.js';
import { CAPSULE_SCORE } from '../../src/powerups/index.js';
import {
  JOIN_ACTIONS,
  canContinue,
  continueWorld,
  continuesLeft,
  joinPlayer,
  playerCanJoin,
  stepWorld,
  syncWorldView,
  type World,
} from '../../src/world/index.js';
import { aliveWorld, directDb } from '../helpers/direct.js';

/** The shared content (KESTREL, MANTA, the test range's carriers, a still stage). */
const DB = directDb();

/** The KESTREL (meter mode) in a co-op game on the still stage. */
const COOP = Object.freeze({ shipId: 'kestrel', powerUpMode: 'meter' as const, coop: true });

/**
 * Steps a world with per-player held masks.
 *
 * @param w - The world.
 * @param input - The snapshot to reuse.
 * @param held1 - Player 1's held actions.
 * @param held2 - Player 2's held actions.
 * @param ticks - Ticks.
 */
function step(w: World, input: InputSnapshot, held1: number, held2: number, ticks = 1): void {
  for (let t = 0; t < ticks; t++) {
    commitPlayerInput(input.players[0], held1);
    commitPlayerInput(input.players[1], held2);
    stepWorld(w, input);
  }
}

/**
 * Drains a world's events.
 *
 * @param w - The world.
 * @returns Copies of the events.
 */
function drain(w: World): SimEvent[] {
  const out: SimEvent[] = [];
  w.events.drain((e) => out.push({ ...e }));
  return out;
}

/**
 * Makes a ship out of the game (dead, dead time over, no life left) — as after its last death.
 *
 * @param w - The world.
 * @param slot - The player slot.
 */
function knockOut(w: World, slot: number): void {
  const ship = w.players[slot];
  ship.state = 'dead';
  ship.stateTicks = PLAYER_DEAD_TICKS + 5;
  ship.lives = 0;
}

/**
 * A co-op world with player 2 joined and both ships alive.
 *
 * @returns The world and its input snapshot.
 */
function bothAlive(): { w: World; input: InputSnapshot } {
  const w = aliveWorld(DB, COOP);
  const input = createInputSnapshot();
  step(w, input, 0, Action.Pause);
  for (let i = 0; i < 300 && w.players[1].state !== 'alive'; i++) step(w, input, 0, 0);
  expect(w.players.map((p) => p.state)).toEqual(['alive', 'alive']);
  w.events.clear();
  return { w, input };
}

describe('core/world co-op: drop-in join (M2-06)', () => {
  it('never joins player 2 in a one-player game', () => {
    const w = aliveWorld(DB, { ...COOP, coop: false });
    const input = createInputSnapshot();
    expect(playerCanJoin(w, 1)).toBe(false);
    step(w, input, 0, JOIN_ACTIONS);
    expect(w.players[1].active).toBe(false);
    expect(joinPlayer(w, 1)).toBe(false);
  });

  it('joins player 2 on its START or OK press, not on other presses', () => {
    for (const press of [Action.Pause, Action.Confirm]) {
      const w = aliveWorld(DB, COOP);
      const input = createInputSnapshot();
      expect(playerCanJoin(w, 1)).toBe(true);
      step(w, input, 0, Action.Shot | Action.PowerUp | Action.Up | Action.Special);
      expect(w.players[1].active).toBe(false);
      step(w, input, 0, 0);
      step(w, input, 0, press);
      const p2 = w.players[1];
      expect(p2.active).toBe(true);
      expect(p2.state).toBe('respawning'); // a blinking fly-in from the left edge
      expect(p2.lives).toBe(w.config.startingLives);
      expect(p2.invulnTicks).toBeGreaterThan(0);
      expect(playerCanJoin(w, 1)).toBe(false);
      const joins = drain(w).filter(
        (e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.PlayerJoin,
      );
      expect(joins).toHaveLength(1);
      // A held press does not join twice (it is already in).
      step(w, input, 0, press, 10);
      expect(w.continuesUsed).toBe(0);
    }
  });

  it('flies player 2 in and hands it control after the fly-in', () => {
    const { w, input } = bothAlive();
    const x = w.players[1].x;
    step(w, input, 0, Action.Right, 5);
    expect(w.players[1].x).toBeGreaterThan(x);
    expect(w.scoring.board.scores[1].score).toBe(0);
  });

  it('joins while the boss WARNING plays, but not once the stage is clear or the game over', () => {
    const w = aliveWorld(DB, COOP);
    w.status = 'bossWarning';
    expect(joinPlayer(w, 1)).toBe(true);
    for (const status of ['stageClear', 'gameOver'] as const) {
      const other = aliveWorld(DB, COOP);
      other.status = status;
      expect(playerCanJoin(other, 1)).toBe(false);
      expect(joinPlayer(other, 1)).toBe(false);
      expect(other.players[1].active).toBe(false);
    }
  });

  it('ignores bad slots', () => {
    const w = aliveWorld(DB, COOP);
    for (const slot of [-1, 2, 0.5, Number.NaN]) {
      expect(playerCanJoin(w, slot)).toBe(false);
      expect(joinPlayer(w, slot)).toBe(false);
      expect(continuesLeft(w, slot)).toBe(0);
    }
  });

  it('joins during a hit-stop (phase 1 runs on frozen ticks)', () => {
    const w = aliveWorld(DB, COOP);
    const input = createInputSnapshot();
    w.hitStop = 5;
    step(w, input, 0, Action.Pause);
    expect(w.players[1].active).toBe(true);
    expect(w.players[1].stateTicks).toBe(0); // phase 2 did not run yet
  });
});

describe('core/world co-op: leaving play, per-player continues, game over (M2-06)', () => {
  it('plays on when one player is out, lets it continue with START, no stage restart', () => {
    const { w, input } = bothAlive();
    w.scoring.board.scores[1].score = 4_000;
    w.weapons.loadouts[1].options = 2;
    knockOut(w, 1);
    step(w, input, 0, 0);
    expect(w.status).toBe('playing'); // player 1 plays on
    expect(playerOut(w.players[1])).toBe(true);
    expect(continuesLeft(w, 1)).toBe(w.config.continues);
    expect(playerCanJoin(w, 1)).toBe(true);
    const camera = w.camera.x;
    const tick = w.tick;
    step(w, input, 0, Action.Pause);
    const p2 = w.players[1];
    expect([p2.lives, p2.state]).toEqual([w.config.startingLives, 'respawning']);
    expect(w.scoring.board.scores[1]).toMatchObject({ score: 4_001, continues: 1 });
    expect(w.weapons.loadouts[1].options).toBe(0); // power gone, the starting loadout again
    expect(w.continuesUsed).toBe(1);
    expect(continuesLeft(w, 1)).toBe(w.config.continues - 1);
    expect(w.camera.x).toBe(camera); // the stage did not restart
    expect(w.tick).toBe(tick + 1);
    expect(w.scoring.board.scores[0].continues).toBe(0); // player 1's own count
  });

  it('keeps a player out for good once its continues are used up; the other plays on', () => {
    const { w, input } = bothAlive();
    for (let c = 0; c < w.config.continues; c++) {
      knockOut(w, 1);
      step(w, input, 0, 0);
      step(w, input, 0, Action.Pause);
      expect(w.players[1].lives).toBe(w.config.startingLives);
    }
    knockOut(w, 1);
    step(w, input, 0, 0);
    expect(continuesLeft(w, 1)).toBe(0);
    step(w, input, 0, Action.Pause);
    expect(playerOut(w.players[1])).toBe(true);
    expect(w.status).toBe('playing');
  });

  it('is over only when both players are out, even with player 2 never having joined', () => {
    const { w, input } = bothAlive();
    knockOut(w, 0);
    step(w, input, 0, 0);
    expect(w.status).toBe('playing');
    knockOut(w, 1);
    step(w, input, 0, 0);
    expect(w.status).toBe('gameOver');
    // A START now is no drop-in: the game is over (the continue countdown decides).
    step(w, input, Action.Pause, Action.Pause);
    expect(w.players.map((p) => p.lives)).toEqual([0, 0]);

    const solo = aliveWorld(DB, COOP);
    knockOut(solo, 0);
    step(solo, createInputSnapshot(), 0, 0);
    expect(solo.status).toBe('gameOver');
  });

  it('continues only the players of continueWorld`s mask; the other may drop in later', () => {
    const { w, input } = bothAlive();
    knockOut(w, 0);
    knockOut(w, 1);
    step(w, input, 0, 0);
    expect(canContinue(w)).toBe(true);
    expect(continueWorld(w, 1 << 1)).toBe(true);
    expect([w.status, w.players[1].state, w.players[0].state]).toEqual([
      'playing',
      'respawning',
      'dead',
    ]);
    expect(w.scoring.board.scores.map((s) => s.continues)).toEqual([0, 1]);
    expect(w.continuesUsed).toBe(1);
    // Player 1 is still out with its continues: START brings it back mid-game.
    expect(playerCanJoin(w, 0)).toBe(true);
    step(w, input, Action.Pause, 0);
    expect(w.players[0].lives).toBe(w.config.startingLives);
    expect(w.scoring.board.scores[0].continues).toBe(1);
  });

  it('refuses a continue for a mask of players without continues (nothing changes)', () => {
    const { w, input } = bothAlive();
    w.scoring.board.scores[1].continues = w.config.continues;
    knockOut(w, 0);
    knockOut(w, 1);
    step(w, input, 0, 0);
    const hash = hashWorld(w);
    expect(continueWorld(w, 1 << 1)).toBe(false);
    expect(hashWorld(w)).toBe(hash);
    expect(continueWorld(w, 0)).toBe(false);
    expect(continueWorld(w)).toBe(true); // player 1 still has its own
    expect(w.players.map((p) => p.state)).toEqual(['respawning', 'dead']);
  });
});

describe('core/world co-op: targets and items (M2-06)', () => {
  it('aims at the nearest living player, player 1 on a tie', () => {
    const { w } = bothAlive();
    const [p1, p2] = w.players;
    const at = { x: w.camera.x + 200, y: w.camera.y + 100 };
    p1.x = at.x - 100;
    p1.y = at.y;
    p2.x = at.x + 100;
    p2.y = at.y;
    expect(w.bullets.aimFrom(at)).toBe(512); // equal: player 1 (left)
    p2.x = at.x + 90;
    expect(w.bullets.aimFrom(at)).toBe(0); // player 2 is nearer
    p2.state = 'dying';
    expect(w.bullets.aimFrom(at)).toBe(512);
    p2.state = 'alive';
    p1.state = 'dead';
    p2.x = at.x + 200;
    expect(w.bullets.aimFrom(at)).toBe(0); // the only living one, however far
  });

  it('gives an item to whoever grabs it — its meter and its score', () => {
    const { w, input } = bothAlive();
    const [p1, p2] = w.players;
    p1.x = w.camera.x + 60;
    p1.y = w.camera.y + 40;
    p2.x = w.camera.x + 60;
    p2.y = w.camera.y + 160;
    w.powerups.spawnItem(ItemKind.Capsule, p2.x, p2.y);
    step(w, input, 0, 0);
    expect(w.powerups.meters.map((m) => m.cursor)).toEqual([-1, MeterSlot.Speed]);
    expect(w.scoring.board.scores.map((s) => s.score)).toEqual([0, CAPSULE_SCORE]);
    // Touching both on the same tick: player 1's.
    p2.y = p1.y;
    p2.x = p1.x;
    w.powerups.spawnItem(ItemKind.Capsule, p1.x, p1.y);
    step(w, input, 0, 0);
    expect(w.powerups.meters.map((m) => m.cursor)).toEqual([MeterSlot.Speed, MeterSlot.Speed]);
  });
});

describe('core/world co-op: drop scaling (coopExtra, M2-06)', () => {
  /**
   * Kills a capsule carrier between ticks and steps once (its drop becomes items in phase 3).
   *
   * @param w - The world.
   * @param input - The snapshot.
   * @returns Items now in the pool.
   */
  function dropOne(w: World, input: InputSnapshot): number {
    const index = DB.enemyIndex.get('carrier') ?? -1;
    const e = w.enemies.spawn(index, w.camera.x + 300, w.camera.y + 60);
    expect(e).not.toBeNull();
    w.enemies.kill(e!, 0);
    step(w, input, 0, 0);
    return w.powerups.count;
  }

  it('drops an extra item every 1 / coopExtra drops while two ships play', () => {
    const { w, input } = bothAlive();
    expect(w.config.coopExtra).toBe(0.5);
    expect(dropOne(w, input)).toBe(1);
    expect(w.powerups.coopCredit).toBe(0.5);
    expect(dropOne(w, input)).toBe(3); // the second drop comes twice
    expect(w.powerups.coopCredit).toBe(0);
    const f = w.powerups.pool.fields;
    expect([f.kind[1], f.kind[2]]).toEqual([ItemKind.Capsule, ItemKind.Capsule]);
    expect(f.y[2] - f.y[1]).toBe(COOP_EXTRA_OFFSET);
    expect(f.x[2]).toBe(f.x[1]);
  });

  it('scales nothing with one ship in play, and follows the config', () => {
    const solo = aliveWorld(DB, COOP); // player 2 never joined
    const input = createInputSnapshot();
    expect(dropOne(solo, input)).toBe(1);
    expect(dropOne(solo, input)).toBe(2);
    expect(solo.powerups.coopCredit).toBe(0);

    const { w, input: both } = bothAlive();
    knockOut(w, 1); // out: one ship in play
    step(w, both, 0, 0);
    expect(dropOne(w, both)).toBe(1);

    const double = aliveWorld(DB, { ...COOP, coopExtra: 2 });
    const i2 = createInputSnapshot();
    step(double, i2, 0, Action.Pause);
    expect(dropOne(double, i2)).toBe(3);
    const none = aliveWorld(DB, { ...COOP, coopExtra: 0 });
    const i3 = createInputSnapshot();
    step(none, i3, 0, Action.Pause);
    expect(dropOne(none, i3)).toBe(1);
  });

  it('turns the extra into the plan`s next item in Direct mode', () => {
    const w = aliveWorld(DB, { coop: true, coopExtra: 1 }); // the MANTA
    const input = createInputSnapshot();
    step(w, input, 0, Action.Pause);
    expect(dropOne(w, input)).toBe(2);
    expect(w.powerups.planCursor).toBe(2);
  });
});

describe('core/world co-op: drawing and determinism (M2-06)', () => {
  it('draws player 2 with the ship`s palette swap', () => {
    const { w } = bothAlive();
    w.players[0].invulnTicks = 0;
    w.players[1].invulnTicks = 0;
    syncWorldView(w);
    const batch = w.playerBatch;
    expect(batch.count).toBe(2);
    expect(w.ship.spriteP2Id).toBeGreaterThanOrEqual(0);
    expect(DB.sprites.names[w.ship.spriteP2Id]).toBe('ships/kestrel@p2');
    expect([batch.spriteId[0], batch.spriteId[1]]).toEqual([w.ship.spriteId, w.ship.spriteP2Id]);
  });

  it('keeps two co-op worlds fed the same two inputs in lockstep (a join and a continue)', () => {
    const make = (): World => aliveWorld(DB, { ...COOP, stage: 'direct-range', coop: true });
    const a = make();
    const b = make();
    const ia = createInputSnapshot();
    const ib = createInputSnapshot();
    for (let t = 0; t < 1_500; t++) {
      const h1 = (t >> 4) % 2 === 0 ? Action.Up : Action.Down;
      const h2 =
        t === 30 || t === 900 ? Action.Pause : (t >> 5) % 2 === 0 ? Action.Right : Action.Left;
      if (t === 700) {
        knockOut(a, 1);
        knockOut(b, 1);
      }
      step(a, ia, h1, h2);
      step(b, ib, h1, h2);
      if (t % 100 === 0) expect(hashWorld(a), `tick ${t}`).toBe(hashWorld(b));
    }
    expect(hashWorld(a)).toBe(hashWorld(b));
    expect(a.players[1].active).toBe(true);
    expect(a.scoring.board.scores[1].continues).toBe(1);
  });
});
