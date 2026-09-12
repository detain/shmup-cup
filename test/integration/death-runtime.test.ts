/**
 * The life cycle end to end (plan M1-12): headless games on the shipped `test-range` stage, built
 * from the real `content/` files with the engine's script registry and sprites (the way the shell
 * loads them), driven only through `Game.step()`.
 *
 * - Unattended sessions (the default loadout, nobody steering) under each death-penalty preset
 *   die three times and end in `gameOver` exactly when the last ship's explosion and dead time are
 *   over. After every tick: lives never grow and drop by one only on a death, the hit-stop never
 *   exceeds the death's, a frozen tick moves nothing, every respawn flies in from the left edge of
 *   the view, the ship is never hit during its `respawnInvulnTicks` after control returns, and
 *   the score equals what the tick outcomes credited to player 1 (the enemies' content `score`,
 *   formation bonuses, 300 per capsule); the hi-score follows it. `arcade` respawns restart the
 *   stage at the last checkpoint with the pools empty; the other presets never scroll back. Two
 *   sessions of each preset keep equal `hashWorld`s every tick (hit-stop determinism).
 * - A fully powered KESTREL (it would clear the stage on its own) crashed into the terrain on
 *   purpose shows each preset's outcome on the shipped content: `classic` one level per death,
 *   `casual` nothing but the shield, `arcade` everything, the meter cursor and a restart at the
 *   checkpoint it passed (x 1500).
 */
import {
  CAPSULE_SCORE,
  DEATH_HIT_STOP_TICKS,
  ENGINE_SPRITES,
  ENTER_START_X,
  KNOWN_SCRIPT_IDS,
  MAX_OPTIONS,
  MainWeapon,
  PLAYER_DEAD_TICKS,
  PLAYER_DYING_TICKS,
  PlayerHitCause,
  createGame,
  createHeadlessPlatform,
  hashWorld,
  loadContent,
  playerHit,
  type ContentDb,
  type DeathPenaltyPreset,
  type Game,
  type GameConfig,
  type World,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';

/**
 * The shipped content with the engine sprites, validated like the shell does.
 *
 * @returns The DB (asserted issue-free).
 */
function shipped(): ContentDb {
  const { db, issues } = loadContent(readContentFiles(), {
    knownScripts: KNOWN_SCRIPT_IDS,
    extraSprites: ENGINE_SPRITES,
  });
  expect(issues).toEqual([]);
  return db;
}

const DB = shipped();

/** The presets of decision D6. */
const PRESETS: readonly DeathPenaltyPreset[] = ['classic', 'arcade', 'casual'];

/**
 * A headless game on the test range.
 *
 * @param config - Config overrides.
 * @returns The game.
 */
function game(config: Partial<GameConfig> = {}): Game {
  return createGame(createHeadlessPlatform(), { seed: 17, stage: 'test-range', ...config }, DB);
}

/**
 * What the tick's outcomes credit to player 1 (read after a tick that ran its phases).
 *
 * @param w - The world.
 * @returns Points.
 */
function creditedToP1(w: World): number {
  let points = 0;
  const o = w.enemies.outcomes;
  for (let k = 0; k < o.killCount; k++) if (o.killBy[k] === 0) points += o.killScore[k];
  for (let b = 0; b < o.bonusCount; b++) if (o.bonusBy[b] === 0) points += o.bonusScore[b];
  const p = w.powerups.outcomes;
  for (let k = 0; k < p.pickupCount; k++) {
    if (p.pickupPlayer[k] === 0) {
      expect(p.pickupScore[k]).toBe(CAPSULE_SCORE);
      points += p.pickupScore[k];
    }
  }
  return points;
}

/** What an unattended session recorded. */
interface Session {
  /** `hashWorld` after every tick. */
  readonly hashes: number[];
  /** Ticks on which the ship started dying. */
  readonly deaths: number[];
  /** Ticks on which the ship respawned. */
  readonly respawns: number[];
  /** The tick the status became `gameOver` (-1 = never). */
  readonly overAt: number;
  /** The world at the end. */
  readonly world: World;
  /** The game (to step on). */
  readonly game: Game;
}

/**
 * Plays an unattended session to its game over, checking the life-cycle invariants after every
 * tick (see the module docs).
 *
 * @param deathPenalty - The preset.
 * @returns What happened.
 */
function unattended(deathPenalty: DeathPenaltyPreset): Session {
  const g = game({ deathPenalty });
  const w = g.world;
  const ship = w.players[0];
  const spec = w.ship;
  const stage = w.stage!;
  const hashes: number[] = [];
  const deaths: number[] = [];
  const respawns: number[] = [];
  let overAt = -1;
  let expected = 0;
  let controlAt = -1;
  for (let t = 0; t < 20_000 && overAt < 0; t++) {
    const before = { state: ship.state, lives: ship.lives, camera: w.camera.x, tick: w.tick };
    g.step();
    const frozen = w.fx.frozen;
    // Lives: never more, one fewer exactly on a death.
    if (before.state === 'alive' && ship.state === 'dying') {
      deaths.push(before.tick);
      expect(ship.lives).toBe(before.lives - 1);
      if (controlAt >= 0)
        expect(before.tick - controlAt).toBeGreaterThanOrEqual(spec.respawnInvulnTicks);
    } else {
      expect(ship.lives).toBe(before.lives);
    }
    expect(w.hitStop).toBeLessThanOrEqual(DEATH_HIT_STOP_TICKS);
    if (frozen) {
      expect(w.camera.x).toBe(before.camera);
      expect(ship.state).toBe(before.state);
    } else {
      expected += creditedToP1(w);
    }
    if (before.state === 'dead' && ship.state === 'respawning') {
      respawns.push(before.tick);
      // From the left edge of the view as phase 2 saw it (phase 3 scrolled on afterwards).
      const viewX = w.camera.x - w.camera.dx;
      expect(ship.x).toBe(viewX + ENTER_START_X);
      if (deathPenalty === 'arcade') {
        const cp = stage.checkpoint;
        expect(viewX).toBe(cp < 0 ? 0 : stage.stage.checkpoints[cp].x);
        expect([w.bullets.count, w.bullets.lasers.count, w.powerups.count]).toEqual([0, 0, 0]);
        expect(w.weapons.pool.count).toBe(0);
      }
    }
    if (deathPenalty !== 'arcade') expect(w.camera.x).toBeGreaterThanOrEqual(before.camera);
    if (before.state === 'respawning' && ship.state === 'alive') {
      controlAt = before.tick;
      expect(ship.invulnTicks).toBe(spec.respawnInvulnTicks);
    }
    expect(w.scoring.board.scores[0].score).toBe(expected);
    expect(w.scoring.board.hiScore).toBe(expected);
    hashes.push(hashWorld(w));
    if (w.status === 'gameOver') overAt = before.tick;
    else expect(w.status).toBe('playing');
  }
  return { hashes, deaths, respawns, overAt, world: w, game: g };
}

describe('integration: unattended sessions on the test range (M1-12)', () => {
  it.each(PRESETS)('%s: three deaths, then game over after the last dead time', (preset) => {
    const a = unattended(preset);
    const w = a.world;
    expect(a.deaths).toHaveLength(3);
    expect(a.respawns).toHaveLength(2);
    for (let i = 0; i < a.respawns.length; i++) {
      expect(a.respawns[i] - a.deaths[i]).toBe(
        DEATH_HIT_STOP_TICKS + PLAYER_DYING_TICKS + PLAYER_DEAD_TICKS,
      );
    }
    expect(a.overAt).toBe(
      a.deaths[2] + DEATH_HIT_STOP_TICKS + PLAYER_DYING_TICKS + PLAYER_DEAD_TICKS,
    );
    expect([w.players[0].lives, w.players[0].state]).toEqual([0, 'dead']);
    expect(w.scoring.board.scores[0].score).toBeGreaterThan(0);
    // Game over is final: the World simulates on, the ship never comes back.
    for (let t = 0; t < 300; t++) a.game.step();
    expect([w.status, w.players[0].state]).toEqual(['gameOver', 'dead']);
    // Two identical sessions: identical hashes on every tick, through every hit-stop.
    const b = unattended(preset);
    expect(b.hashes).toEqual(a.hashes);
  });

  it('arcade replays from the checkpoint: the camera goes back, the score is kept', () => {
    const s = unattended('arcade');
    const classic = unattended('classic');
    // Arcade flies the same opening again after each restart, so it scores more before its end.
    expect(s.world.scoring.board.scores[0].score).toBeGreaterThan(
      classic.world.scoring.board.scores[0].score,
    );
    expect(s.world.camera.x).toBeLessThan(classic.world.camera.x);
  });
});

/**
 * Steps a game until a condition holds (at most `limit` ticks).
 *
 * @param g - The game.
 * @param done - The condition.
 * @param limit - Tick limit.
 */
function stepUntil(g: Game, done: () => boolean, limit = 10_000): void {
  for (let t = 0; t < limit && !done(); t++) g.step();
  expect(done()).toBe(true);
}

/**
 * Crashes player 1 into the terrain (the Force Field does not absorb it) and steps the death tick.
 *
 * @param g - The game.
 * @returns The meter cursor as the death tick found it after its pickups (what the penalty saw).
 */
function crash(g: Game): number {
  const w = g.world;
  const ship = w.players[0];
  stepUntil(g, () => ship.state === 'alive' && ship.invulnTicks === 0);
  const cursor = w.powerups.meters[0].cursor;
  expect(playerHit(ship, PlayerHitCause.Terrain, w.tick, w.debugFlags)).toBe(true);
  g.step();
  expect(ship.state).toBe('dying');
  // A capsule collected on the death tick advances the cursor before the penalty runs.
  return w.powerups.outcomes.pickupCount === 0 ? cursor : w.powerups.meters[0].cursor;
}

describe('integration: death penalties on the shipped content (decision D6)', () => {
  it('classic: one level per death in the D6 order, cursor kept, shield gone', () => {
    const g = game({ loadout: 'full', startingLives: 5 });
    const w = g.world;
    const ship = w.players[0];
    const loadout = w.weapons.loadouts[0];
    const meter = w.powerups.meters[0];
    meter.cursor = 3;
    const speed = ship.speedLevel;
    const seen: unknown[][] = [];
    for (let d = 0; d < 4; d++) {
      const cursor = crash(g);
      seen.push([loadout.options, loadout.main, loadout.missile, ship.speedLevel]);
      expect(meter.cursor).toBe(cursor); // kept
      expect(ship.shield.kind).toBe(0);
    }
    expect(seen).toEqual([
      [MAX_OPTIONS - 1, MainWeapon.Laser, true, speed],
      [MAX_OPTIONS - 2, MainWeapon.Laser, true, speed],
      [MAX_OPTIONS - 3, MainWeapon.Laser, true, speed],
      [MAX_OPTIONS - 4, MainWeapon.Laser, true, speed],
    ]);
    crash(g);
    expect([loadout.options, loadout.main, loadout.missile]).toEqual([0, MainWeapon.Basic, true]);
    stepUntil(g, () => w.status === 'gameOver');
  });

  it('casual: the loadout survives every death; only the shield is lost', () => {
    const g = game({ loadout: 'full', deathPenalty: 'casual' });
    const w = g.world;
    const ship = w.players[0];
    const loadout = w.weapons.loadouts[0];
    const before = [loadout.options, loadout.main, loadout.missile, ship.speedLevel];
    for (let d = 0; d < 3; d++) {
      crash(g);
      expect([loadout.options, loadout.main, loadout.missile, ship.speedLevel]).toEqual(before);
      expect(ship.shield.kind).toBe(0);
    }
    stepUntil(g, () => w.status === 'gameOver');
  });

  it('arcade: everything and the cursor lost, the stage restarted at the checkpoint passed', () => {
    const g = game({ loadout: 'full', deathPenalty: 'arcade' });
    const w = g.world;
    const ship = w.players[0];
    const stage = w.stage!;
    const loadout = w.weapons.loadouts[0];
    stepUntil(g, () => w.camera.x >= 1700);
    expect(stage.checkpoint).toBe(1);
    const checkpointX = stage.stage.checkpoints[1].x;
    expect(checkpointX).toBe(1500);
    w.powerups.meters[0].cursor = 4;
    crash(g);
    expect([loadout.options, loadout.main, loadout.missile, ship.speedLevel]).toEqual([
      0,
      MainWeapon.Basic,
      false,
      0,
    ]);
    expect(w.powerups.meters[0].cursor).toBe(-1);
    const score = w.scoring.board.scores[0].score;
    expect(score).toBeGreaterThan(0);
    stepUntil(g, () => ship.state === 'respawning');
    expect(w.camera.x - w.camera.dx).toBe(checkpointX);
    expect([
      w.bullets.count,
      w.bullets.lasers.count,
      w.powerups.count,
      w.weapons.pool.count,
    ]).toEqual([0, 0, 0, 0]);
    expect(w.scoring.board.scores[0].score).toBe(score);
    // The stage plays on from there (its timeline fires again).
    stepUntil(g, () => w.enemies.count > 0, 2000);
  });
});
