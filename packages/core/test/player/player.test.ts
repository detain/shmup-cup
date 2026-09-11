/**
 * Tests for the player ship (plan M1-06): intents from input bits, movement per speed level,
 * the diagonal scale (D4), clamping to the camera view minus the margins, 4-way-only input, the
 * fly-in, riding along with the camera scroll, banking and the ship-spec lookup.
 */
import { describe, expect, it } from 'vitest';
import { PLAYFIELD_H, PLAYFIELD_W } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB, loadContent, type PlayerShipSpec } from '../../src/data/index.js';
import { Action } from '../../src/input/index.js';
import {
  DEFAULT_PLAYER_SHIP,
  DIAGONAL_SCALE,
  ENTER_END_X,
  ENTER_START_X,
  PLAYER_STATES,
  SPAWN_Y,
  createPlayer,
  createPlayerIntent,
  moduleInfo,
  playerBankFrame,
  readPlayerIntent,
  resolvePlayerShip,
  setPlayerState,
  spawnPlayer,
  updatePlayer,
  type PlayerIntent,
  type PlayerShip,
} from '../../src/player/index.js';

/** A mutable camera for the tests. */
interface TestCamera {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

const SPEC = DEFAULT_PLAYER_SHIP;

/**
 * A ship that finished its fly-in, at a given position, and a static camera at the origin.
 *
 * @param x - World x.
 * @param y - World y.
 * @returns Ship, camera and a reusable intent.
 */
function aliveShip(
  x = 150,
  y = 100,
): { ship: PlayerShip; camera: TestCamera; intent: PlayerIntent } {
  const ship = createPlayer(0, 3);
  ship.active = true;
  setPlayerState(ship, 'alive');
  ship.x = x;
  ship.y = y;
  return { ship, camera: { x: 0, y: 0, dx: 0, dy: 0 }, intent: createPlayerIntent() };
}

/**
 * Sets the intent from a held action mask.
 *
 * @param intent - Intent to fill.
 * @param held - Held actions.
 */
function hold(intent: PlayerIntent, held: number): void {
  readPlayerIntent(intent, { held, pressed: 0, released: 0, device: 'keyboard' });
}

describe('core/player', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('player');
    expect(moduleInfo.status).toBe('partial');
    expect(PLAYER_STATES).toEqual(['entering', 'alive', 'dying', 'dead', 'respawning']);
  });

  it('reads direction bits into unit intents (opposites cancel)', () => {
    const intent = createPlayerIntent();
    hold(intent, Action.Up | Action.Right | Action.Shot);
    expect([intent.moveX, intent.moveY, intent.held, intent.device]).toEqual([
      1,
      -1,
      Action.Up | Action.Right | Action.Shot,
      'keyboard',
    ]);
    hold(intent, Action.Left | Action.Right | Action.Down);
    expect([intent.moveX, intent.moveY]).toEqual([0, 1]);
    hold(intent, Action.Up | Action.Down);
    expect([intent.moveX, intent.moveY]).toEqual([0, 0]);
  });

  it.each(SPEC.speeds.map((speed, level) => [level, speed]))(
    'moves speeds[%i] = %f px/tick on one axis at speed level %i',
    (level, speed) => {
      const { ship, camera, intent } = aliveShip();
      ship.speedLevel = level;
      hold(intent, Action.Right);
      updatePlayer(ship, SPEC, intent, camera);
      expect([ship.x, ship.y]).toEqual([150 + speed, 100]);
      hold(intent, Action.Up);
      updatePlayer(ship, SPEC, intent, camera);
      expect([ship.x, ship.y]).toEqual([150 + speed, 100 - speed]);
      expect(ship.moving).toBe(true);
    },
  );

  it('clamps a speed level outside the table to its ends', () => {
    const { ship, camera, intent } = aliveShip();
    ship.speedLevel = 99;
    hold(intent, Action.Left);
    updatePlayer(ship, SPEC, intent, camera);
    expect(ship.x).toBe(150 - 4);
    ship.speedLevel = -3;
    updatePlayer(ship, SPEC, intent, camera);
    expect(ship.x).toBe(150 - 4 - 1.5);
  });

  it('scales each axis of a diagonal by 0.7071 (decision D4)', () => {
    const { ship, camera, intent } = aliveShip();
    hold(intent, Action.Down | Action.Right);
    updatePlayer(ship, SPEC, intent, camera);
    expect(DIAGONAL_SCALE).toBe(0.7071);
    expect(ship.x).toBe(150 + 1.5 * 0.7071);
    expect(ship.y).toBe(100 + 1.5 * 0.7071);
    hold(intent, Action.Up | Action.Left);
    updatePlayer(ship, SPEC, intent, camera);
    expect(ship.x).toBeCloseTo(150, 12);
    expect(ship.y).toBeCloseTo(100, 12);
  });

  it('has no inertia: no input, no movement', () => {
    const { ship, camera, intent } = aliveShip();
    hold(intent, Action.Right);
    updatePlayer(ship, SPEC, intent, camera);
    hold(intent, 0);
    updatePlayer(ship, SPEC, intent, camera);
    expect(ship.x).toBe(151.5);
    expect(ship.moving).toBe(false);
  });

  it('4-way-only input reaches every point by alternating axes at full speed', () => {
    const { ship, camera, intent } = aliveShip(100, 100);
    // A remote that cannot hold two arrows: right, up, right, up … never a diagonal.
    for (let i = 0; i < 20; i++) {
      hold(intent, i % 2 === 0 ? Action.Right : Action.Up);
      updatePlayer(ship, SPEC, intent, camera);
    }
    expect([ship.x, ship.y]).toEqual([100 + 10 * 1.5, 100 - 10 * 1.5]);
  });

  it('clamps to the camera view minus the margins', () => {
    const { ship, camera, intent } = aliveShip();
    ship.speedLevel = 5;
    const margins = SPEC.margins;
    for (const [held, x, y] of [
      [Action.Left, margins.left, 100],
      [Action.Up, margins.left, margins.top],
      [Action.Right, PLAYFIELD_W - margins.right, margins.top],
      [Action.Down, PLAYFIELD_W - margins.right, PLAYFIELD_H - margins.bottom],
    ] as const) {
      hold(intent, held);
      for (let i = 0; i < 200; i++) updatePlayer(ship, SPEC, intent, camera);
      expect([ship.x, ship.y]).toEqual([x, y]);
    }
    // The bounds follow the camera.
    camera.x = 1000;
    camera.y = -16;
    updatePlayer(ship, SPEC, intent, camera);
    expect([ship.x, ship.y]).toEqual([1000 + margins.left, -16 + PLAYFIELD_H - margins.bottom]);
  });

  it('rides along with the camera scroll before applying the input', () => {
    const { ship, camera, intent } = aliveShip(100, 100);
    camera.dx = 1;
    for (let i = 1; i <= 30; i++) {
      camera.x += 1; // the stage phase moved the camera during the previous tick
      updatePlayer(ship, SPEC, intent, camera);
    }
    expect(ship.x).toBe(130); // same screen position
    hold(intent, Action.Left);
    camera.x += 1;
    updatePlayer(ship, SPEC, intent, camera);
    expect(ship.x).toBe(131 - 1.5);
  });

  it('flies in from the left for enterTicks ticks, uncontrollable, then is alive', () => {
    const ship = createPlayer(0, 3);
    ship.active = true;
    const camera = { x: 500, y: 20, dx: 0, dy: 0 };
    spawnPlayer(ship, camera);
    expect([ship.x, ship.y, ship.state]).toEqual([500 + ENTER_START_X, 20 + SPAWN_Y, 'entering']);
    const intent = createPlayerIntent();
    hold(intent, Action.Up | Action.Left);
    let previous = ship.x;
    for (let i = 1; i < SPEC.enterTicks; i++) {
      updatePlayer(ship, SPEC, intent, camera);
      expect(ship.state).toBe('entering');
      expect(ship.x).toBeGreaterThan(previous);
      expect(ship.y).toBe(20 + SPAWN_Y);
      previous = ship.x;
    }
    updatePlayer(ship, SPEC, intent, camera);
    expect([ship.x, ship.state, ship.stateTicks]).toEqual([500 + ENTER_END_X, 'alive', 0]);
    // Now it obeys the input.
    updatePlayer(ship, SPEC, intent, camera);
    expect(ship.x).toBeCloseTo(500 + ENTER_END_X - 1.5 * DIAGONAL_SCALE, 12);
  });

  it('a respawn flies in the same way; enterTicks 0 is immediate', () => {
    const ship = createPlayer(0, 3);
    ship.active = true;
    const camera = { x: 0, y: 0, dx: 0, dy: 0 };
    spawnPlayer(ship, camera, 'respawning');
    expect(ship.state).toBe('respawning');
    const instant: PlayerShipSpec = { ...SPEC, enterTicks: 0 };
    updatePlayer(ship, instant, createPlayerIntent(), camera);
    expect([ship.x, ship.state]).toEqual([ENTER_END_X, 'alive']);
  });

  it('banks one step per tick towards the vertical intent', () => {
    const { ship, camera, intent } = aliveShip();
    const spec: PlayerShipSpec = { ...SPEC, bankFrames: 2 };
    hold(intent, Action.Up);
    updatePlayer(ship, spec, intent, camera);
    expect(ship.bank).toBe(-1);
    updatePlayer(ship, spec, intent, camera);
    updatePlayer(ship, spec, intent, camera);
    expect(ship.bank).toBe(-2);
    hold(intent, Action.Down);
    updatePlayer(ship, spec, intent, camera);
    expect(ship.bank).toBe(-1);
    hold(intent, 0);
    updatePlayer(ship, spec, intent, camera);
    expect(ship.bank).toBe(0);
    expect([playerBankFrame(0, 1), playerBankFrame(-1, 1), playerBankFrame(1, 1)]).toEqual([
      0, 1, 2,
    ]);
    expect([playerBankFrame(-2, 2), playerBankFrame(1, 2), playerBankFrame(2, 2)]).toEqual([
      2, 3, 4,
    ]);
  });

  it('skips inactive ships; dying / dead only advance their timers', () => {
    const { ship, camera, intent } = aliveShip();
    hold(intent, Action.Right);
    ship.active = false;
    updatePlayer(ship, SPEC, intent, camera);
    expect([ship.x, ship.stateTicks, ship.device]).toEqual([150, 0, 'none']);
    ship.active = true;
    setPlayerState(ship, 'dead');
    ship.invulnTicks = 3;
    updatePlayer(ship, SPEC, intent, camera);
    expect([ship.x, ship.stateTicks, ship.invulnTicks, ship.device]).toEqual([
      150,
      1,
      2,
      'keyboard',
    ]);
  });

  it('picks the kestrel from content, else the first ship, else the built-in default', () => {
    expect(resolvePlayerShip(EMPTY_CONTENT_DB)).toBe(DEFAULT_PLAYER_SHIP);
    const ship = (id: string): Record<string, unknown> => ({
      id,
      name: id.toUpperCase(),
      sprite: `ships/${id}`,
      speeds: [2],
      hurtRadius: 1,
      terrainBox: { hw: 4, hh: 2 },
      pickupBox: { hw: 6, hh: 4 },
      margins: { left: 4, right: 4, top: 4, bottom: 4 },
      enterTicks: 10,
      respawnInvulnTicks: 60,
      bankFrames: 1,
    });
    const load = (...ids: string[]): ReturnType<typeof loadContent>['db'] =>
      loadContent([
        {
          path: 'player/p.player.json',
          data: { formatVersion: 1, kind: 'player', ships: ids.map(ship) },
        },
      ]).db;
    expect(resolvePlayerShip(load('manta', 'kestrel')).id).toBe('kestrel');
    expect(resolvePlayerShip(load('manta', 'heron')).id).toBe('manta');
    expect(resolvePlayerShip(load('manta', 'heron'), 'heron').id).toBe('heron');
  });
});
