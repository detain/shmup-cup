/**
 * Edge cases of two-player co-op in the World (plan M2-06, shmup_feat.md §16): a join press of a
 * player already in the game (or still dying) changes nothing, the join cue sounds where the ship
 * flies in, a player's continue budget never goes below zero (and `continues: 0` keeps an out
 * player out), two out players pressing START on the same tick both continue mid-game,
 * `canContinue` / `continueWorld` only count active players (a co-op game player 2 never joined
 * continues player 1 alone and player 2 may still drop in), a join gives the config's starting
 * loadout (`full` too) and a continue brings it back in both power-up modes, and a join leaves
 * the other player alone.
 */
import { describe, expect, it } from 'vitest';
import { hashWorld } from '../../src/debug/index.js';
import { SFX_CUES, SfxPriority, SimEventKind, type SimEvent } from '../../src/events/index.js';
import {
  Action,
  commitPlayerInput,
  createInputSnapshot,
  type InputSnapshot,
} from '../../src/input/index.js';
import { PLAYER_DEAD_TICKS, playerOut } from '../../src/player/index.js';
import {
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
 * Makes a ship out of the game (dead, dead time over, no life left).
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
 * @param config - Config overrides over {@link COOP}.
 * @returns The world and its input snapshot.
 */
function bothAlive(config: Record<string, unknown> = {}): { w: World; input: InputSnapshot } {
  const w = aliveWorld(DB, { ...COOP, ...config });
  const input = createInputSnapshot();
  step(w, input, 0, Action.Pause);
  for (let i = 0; i < 300 && w.players[1].state !== 'alive'; i++) step(w, input, 0, 0);
  expect(w.players.map((p) => p.state)).toEqual(['alive', 'alive']);
  w.events.clear();
  return { w, input };
}

describe('core/world co-op edge: join presses that change nothing (M2-06)', () => {
  it('ignores the join of a player already flying (START is then its own business)', () => {
    const { w } = bothAlive();
    const hash = hashWorld(w);
    expect(playerCanJoin(w, 0)).toBe(false);
    expect(playerCanJoin(w, 1)).toBe(false);
    expect(joinPlayer(w, 0)).toBe(false);
    expect(joinPlayer(w, 1)).toBe(false);
    expect(hashWorld(w)).toBe(hash);
    expect(w.events.length).toBe(0);
  });

  it('waits for a dying ship`s dead time to end before it may continue', () => {
    const { w, input } = bothAlive();
    const p2 = w.players[1];
    p2.lives = 0;
    p2.state = 'dying';
    p2.stateTicks = 0;
    expect(playerOut(p2)).toBe(false);
    expect(playerCanJoin(w, 1)).toBe(false);
    step(w, input, 0, Action.Pause);
    expect(w.continuesUsed).toBe(0);
    expect(w.scoring.board.scores[1].continues).toBe(0);
    for (let i = 0; i < 400 && !playerOut(p2); i++) step(w, input, 0, 0);
    expect(playerOut(p2)).toBe(true);
    step(w, input, 0, Action.Confirm); // OK works as well as START
    expect([p2.state, p2.lives, w.continuesUsed]).toEqual([
      'respawning',
      w.config.startingLives,
      1,
    ]);
  });

  it('keeps an out player out for good with no continues in the config', () => {
    const { w, input } = bothAlive({ continues: 0 });
    expect(continuesLeft(w, 1)).toBe(0);
    knockOut(w, 1);
    step(w, input, 0, 0);
    step(w, input, 0, Action.Pause);
    expect(playerOut(w.players[1])).toBe(true);
    expect(w.status).toBe('playing');
    // A fresh slot still drops in: joining is not a continue.
    const fresh = aliveWorld(DB, { ...COOP, continues: 0 });
    expect(joinPlayer(fresh, 1)).toBe(true);
    expect(fresh.continuesUsed).toBe(0);
  });

  it('never counts a negative continue budget', () => {
    const { w } = bothAlive();
    w.scoring.board.scores[1].continues = w.config.continues + 4;
    expect(continuesLeft(w, 1)).toBe(0);
    expect(continuesLeft(w, 0)).toBe(w.config.continues);
  });
});

describe('core/world co-op edge: the join itself (M2-06)', () => {
  it('sounds the join cue where the ship flies in, with a high priority', () => {
    const w = aliveWorld(DB, COOP);
    expect(joinPlayer(w, 1)).toBe(true);
    const p2 = w.players[1];
    const cues = drain(w).filter(
      (e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.PlayerJoin,
    );
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({
      x: Math.floor(p2.x),
      y: Math.floor(p2.y),
      param: SfxPriority.High,
    });
    expect(p2.x).toBeLessThan(w.camera.x + 40); // from the left edge of the view
  });

  it('leaves player 1 alone when player 2 joins', () => {
    const w = aliveWorld(DB, COOP);
    const input = createInputSnapshot();
    const p1 = w.players[0];
    w.scoring.board.scores[0].score = 2_500;
    p1.lives = 2;
    const before = { x: p1.x, y: p1.y, state: p1.state, lives: p1.lives };
    step(w, input, 0, Action.Pause);
    expect({ x: p1.x, y: p1.y, state: p1.state, lives: p1.lives }).toEqual(before);
    expect(w.scoring.board.scores[0].score).toBe(2_500);
    expect(w.scoring.board.scores[1].score).toBe(0);
  });

  it('joins with the config`s starting loadout and gets it back with a continue (full)', () => {
    const { w, input } = bothAlive({ loadout: 'full' });
    const full = { ...w.weapons.loadouts[1] };
    expect(full.options).toBeGreaterThan(0);
    expect(full).toEqual({ ...w.weapons.loadouts[0] });
    w.weapons.loadouts[1].options = 0;
    w.weapons.loadouts[1].missile = false;
    knockOut(w, 1);
    step(w, input, 0, 0);
    step(w, input, 0, Action.Pause);
    expect({ ...w.weapons.loadouts[1] }).toEqual(full);
    expect(w.powerups.meters[1].cursor).toBe(-1);
  });

  it('resets a Direct-mode player`s levels with a mid-game continue', () => {
    const { w, input } = bothAlive({ shipId: 'manta', powerUpMode: 'direct' });
    const start = { ...w.weapons.loadouts[1] };
    const speed = w.players[1].speedLevel;
    w.weapons.loadouts[1].shot = 5;
    w.weapons.loadouts[1].sub = 2;
    w.players[1].speedLevel = speed + 2;
    knockOut(w, 1);
    step(w, input, 0, 0);
    step(w, input, 0, Action.Pause);
    expect(w.weapons.loadouts[1].shot).toBe(start.shot);
    expect(w.weapons.loadouts[1].sub).toBe(start.sub);
    expect(w.players[1].speedLevel).toBe(speed);
    expect(w.scoring.board.scores[1].continues).toBe(1);
  });

  it('joins on a START pressed in phase 1 while the boss WARNING plays', () => {
    const w = aliveWorld(DB, COOP);
    const input = createInputSnapshot();
    w.status = 'bossWarning';
    step(w, input, 0, Action.Confirm);
    expect(w.players[1].active).toBe(true);
  });
});

describe('core/world co-op edge: continues and the game over (M2-06)', () => {
  it('continues both out players pressing START on the same tick, before the game is over', () => {
    const { w, input } = bothAlive();
    const camera = w.camera.x;
    knockOut(w, 0);
    knockOut(w, 1);
    step(w, input, Action.Pause, Action.Pause);
    expect(w.status).toBe('playing');
    expect(w.players.map((p) => p.state)).toEqual(['respawning', 'respawning']);
    expect(w.scoring.board.scores.map((s) => s.continues)).toEqual([1, 1]);
    expect(w.continuesUsed).toBe(2);
    expect(w.camera.x).toBe(camera); // mid-game: no checkpoint restart
  });

  it('is over when the one who pressed START has no continues left', () => {
    const { w, input } = bothAlive();
    w.scoring.board.scores[1].continues = w.config.continues;
    knockOut(w, 0);
    knockOut(w, 1);
    step(w, input, 0, Action.Pause);
    expect(w.status).toBe('gameOver');
    expect(canContinue(w)).toBe(true); // player 1 still has its own
  });

  it('cannot continue once every active player`s continues are used up', () => {
    const { w, input } = bothAlive();
    for (const s of w.scoring.board.scores) s.continues = w.config.continues;
    knockOut(w, 0);
    knockOut(w, 1);
    step(w, input, 0, 0);
    expect(w.status).toBe('gameOver');
    expect(canContinue(w)).toBe(false);
    expect(continueWorld(w)).toBe(false);
    expect(continueWorld(w, -1)).toBe(false);
  });

  it('continues player 1 alone in a co-op game player 2 never joined; player 2 may join later', () => {
    const w = aliveWorld(DB, COOP);
    const input = createInputSnapshot();
    knockOut(w, 0);
    step(w, input, 0, 0);
    expect(w.status).toBe('gameOver');
    expect(canContinue(w)).toBe(true);
    expect(continueWorld(w, 1 << 1)).toBe(false); // player 2 is not in the game
    expect(continueWorld(w, -1)).toBe(true);
    expect(w.players[1].active).toBe(false);
    expect(w.scoring.board.scores.map((s) => s.continues)).toEqual([1, 0]);
    expect(playerCanJoin(w, 1)).toBe(true);
    step(w, input, 0, Action.Pause);
    expect(w.players[1].active).toBe(true);
    expect(w.continuesUsed).toBe(1); // a first join is no continue
  });

  it('refuses a continue while the game is not over (nothing changes)', () => {
    const { w } = bothAlive();
    const hash = hashWorld(w);
    expect(canContinue(w)).toBe(false);
    expect(continueWorld(w)).toBe(false);
    expect(continueWorld(w, 0b11)).toBe(false);
    expect(hashWorld(w)).toBe(hash);
  });

  it('never joins on a one-player World`s START, even with player 2`s slot out of lives', () => {
    const w = aliveWorld(DB, { ...COOP, coop: false });
    const input = createInputSnapshot();
    knockOut(w, 0);
    step(w, input, Action.Pause, Action.Pause);
    expect(w.status).toBe('gameOver');
    expect(w.players.map((p) => p.active)).toEqual([true, false]);
    expect(w.continuesUsed).toBe(0);
  });
});

describe('core/world co-op edge: player 2`s sprite (M2-06)', () => {
  it('draws the MANTA`s player 2 with the MANTA`s own palette swap', () => {
    const { w } = bothAlive({ shipId: 'manta', powerUpMode: 'direct' });
    w.players[0].invulnTicks = 0;
    w.players[1].invulnTicks = 0;
    syncWorldView(w);
    expect(DB.sprites.names[w.ship.spriteP2Id]).toBe('ships/manta@p2');
    expect(w.playerBatch.spriteId[1]).toBe(w.ship.spriteP2Id);
  });

  it('draws player 2 with the ship`s own sprite when the spec has no palette swap', () => {
    const { w } = bothAlive();
    (w as { ship: World['ship'] }).ship = { ...w.ship, spriteP2Id: -1 };
    w.players[0].invulnTicks = 0;
    w.players[1].invulnTicks = 0;
    syncWorldView(w);
    expect(w.playerBatch.count).toBe(2);
    expect([w.playerBatch.spriteId[0], w.playerBatch.spriteId[1]]).toEqual([
      w.ship.spriteId,
      w.ship.spriteId,
    ]);
  });

  it('does not draw player 2 before it joins, nor while it is out', () => {
    const w = aliveWorld(DB, COOP);
    w.players[0].invulnTicks = 0;
    syncWorldView(w);
    expect(w.playerBatch.count).toBe(1);
    const { w: both } = bothAlive();
    knockOut(both, 1);
    both.players[0].invulnTicks = 0;
    syncWorldView(both);
    expect(both.playerBatch.count).toBe(1);
    expect(both.playerBatch.spriteId[0]).toBe(both.ship.spriteId);
  });
});
