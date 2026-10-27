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
  VERTICAL_RAMP_TICKS,
  VERTICAL_HOLD_TICKS,
  VERTICAL_START_SCALE,
  createPlayer,
  createPlayerIntent,
  flyOutPlayer,
  killPlayer,
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

/**
 * Walks the vertical ease-in ramp (w15-MOVE) to its cap: 60 up ticks, each immediately undone by
 * the test so the height never reaches a margin. After it the ship steps vertically at the full
 * speed, and {@link PlayerShip.verticalTicks} holds {@link VERTICAL_RAMP_TICKS}.
 *
 * @param ship - The ship (alive).
 * @param intent - Reused intent (held up during the walk, neutralised at the end).
 * @param camera - The static camera.
 */
function saturateVertical(ship: PlayerShip, intent: PlayerIntent, camera: TestCamera): void {
  hold(intent, Action.Up);
  for (let t = 0; t < VERTICAL_RAMP_TICKS; t++) {
    const y0 = ship.y;
    updatePlayer(ship, SPEC, intent, camera);
    ship.y = y0;
  }
  hold(intent, 0);
}

describe('core/player', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('player');
    expect(moduleInfo.status).toBe('implemented');
    // M2-10 appended the stage-clear fly-out.
    expect(PLAYER_STATES).toEqual(['entering', 'alive', 'dying', 'dead', 'respawning', 'leaving']);
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
    'moves speeds[%i] = %f px/tick on one axis at speed level %i (after the vertical ramp)',
    (level, speed) => {
      const { ship, camera, intent } = aliveShip();
      ship.speedLevel = level;
      hold(intent, Action.Right);
      updatePlayer(ship, SPEC, intent, camera);
      expect([ship.x, ship.y]).toEqual([150 + speed, 100]);
      hold(intent, Action.Up);
      updatePlayer(ship, SPEC, intent, camera);
      // The first vertical tick from the held ramp of 0 eases in at VERTICAL_START_SCALE.
      expect([ship.x, ship.y]).toEqual([150 + speed, 100 - speed * VERTICAL_START_SCALE]);
      expect(ship.moving).toBe(true);
      // A standstill at the grace restarts the ramp; held to and past the cap, the step is the
      // full speed again (measured downward: the level speeds fly up farther than the top margin
      // leaves).
      hold(intent, 0);
      for (let t = 1; t < VERTICAL_HOLD_TICKS; t++) updatePlayer(ship, SPEC, intent, camera);
      expect(ship.verticalTicks).toBe(1); // under the grace the charge holds
      updatePlayer(ship, SPEC, intent, camera); // the tick that crosses it resets
      expect(ship.verticalTicks).toBe(0);
      hold(intent, Action.Down);
      for (let t = 1; t <= VERTICAL_RAMP_TICKS; t++) updatePlayer(ship, SPEC, intent, camera);
      expect(ship.verticalTicks).toBe(VERTICAL_RAMP_TICKS);
      const full = ship.y;
      updatePlayer(ship, SPEC, intent, camera);
      expect(ship.y - full).toBeCloseTo(speed, 12);
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
    saturateVertical(ship, intent, camera);
    const y0 = ship.y;
    hold(intent, Action.Down | Action.Right);
    updatePlayer(ship, SPEC, intent, camera);
    expect(DIAGONAL_SCALE).toBe(0.7071);
    expect(ship.x).toBe(150 + 1.5 * 0.7071);
    expect(ship.y).toBe(y0 + 1.5 * 0.7071);
    hold(intent, Action.Up | Action.Left);
    updatePlayer(ship, SPEC, intent, camera);
    expect(ship.x).toBeCloseTo(150, 12);
    expect(ship.y).toBeCloseTo(y0, 12);
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

  it('4-way-only input walks the diagonal by alternating axes (vertical ramps, horizontal does not)', () => {
    const { ship, camera, intent } = aliveShip(100, 100);
    // A remote that cannot hold two arrows: right, up, right, up … never a diagonal. The
    // horizontal axis is untouched by the ease-in; the vertical one ramps (w15-MOVE), every up
    // tick charging it the while (a horizontal-only tick holds the ramp — that is what keeps the
    // zig-zag on its way to full speed, unlike a reset on intent).
    for (let i = 0; i < 20; i++) {
      hold(intent, i % 2 === 0 ? Action.Right : Action.Up);
      updatePlayer(ship, SPEC, intent, camera);
    }
    expect(ship.x).toBe(100 + 10 * 1.5);
    // Σ over ten up ticks of ease(c) at c = 0…9 = 10·0.5 + (0.5/60)·(0+…+9) = 5.375.
    expect(ship.y).toBeCloseTo(100 - 1.5 * 5.375, 9);
    expect(ship.verticalTicks).toBe(10);
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

  describe('the vertical ease-in ramp (w15-MOVE, owner improvement)', () => {
    it('freezes the shape: one second of vertical movement from half speed', () => {
      expect(VERTICAL_RAMP_TICKS).toBe(60);
      expect(VERTICAL_START_SCALE).toBe(0.5);
      expect(VERTICAL_HOLD_TICKS).toBe(20); // a standstill under a third of a second is a tap
    });

    it('starts a vertical move from a stop eased, horizontal from a stop full', () => {
      const { ship, camera, intent } = aliveShip();
      hold(intent, Action.Up);
      updatePlayer(ship, SPEC, intent, camera);
      expect(ship.y).toBe(100 - 1.5 * VERTICAL_START_SCALE);
      expect(ship.verticalTicks).toBe(1);
      const right = aliveShip();
      hold(right.intent, Action.Right);
      updatePlayer(right.ship, SPEC, right.intent, right.camera);
      expect(right.ship.x).toBe(150 + 1.5); // no ramp on the horizontal axis
      expect(right.ship.verticalTicks).toBe(0); // horizontal-only never charges it
    });

    it('rises every tick and reaches the full speed at the cap', () => {
      const { ship, camera, intent } = aliveShip();
      hold(intent, Action.Down); // downward: the roomier direction at the top speeds
      let previous = ship.y;
      let lastDelta = -1;
      for (let t = 1; t <= VERTICAL_RAMP_TICKS + 1; t++) {
        updatePlayer(ship, SPEC, intent, camera);
        const delta = ship.y - previous;
        expect(ship.verticalTicks, `tick ${t}`).toBe(Math.min(t, VERTICAL_RAMP_TICKS));
        expect(delta, `tick ${t}`).toBeGreaterThan(lastDelta);
        lastDelta = delta;
        previous = ship.y;
      }
      expect(lastDelta).toBeCloseTo(1.5, 12); // the first tick at the cap steps at full speed
      // Σ of the ease at c = 0…60: 61·0.5 + (0.5/60)·(0+…+60) = 30.5 + 15.25 = 45.75.
      expect(ship.y).toBeCloseTo(100 + 1.5 * 45.75, 9);
    });

    it('eases the same up and down from a stop (stop-to-stop symmetry)', () => {
      const up = aliveShip();
      const down = aliveShip();
      hold(up.intent, Action.Up);
      hold(down.intent, Action.Down);
      for (let t = 0; t < VERTICAL_RAMP_TICKS + 1; t++) {
        updatePlayer(up.ship, SPEC, up.intent, up.camera);
        updatePlayer(down.ship, SPEC, down.intent, down.camera);
      }
      expect(100 - up.ship.y).toBeCloseTo(down.ship.y - 100, 9);
      expect(up.ship.verticalTicks).toBe(down.ship.verticalTicks);
    });

    it('restarts a standstill only at the grace — a shorter stop is a tap that holds', () => {
      const { ship, camera, intent } = aliveShip();
      hold(intent, Action.Up);
      for (let t = 0; t < 30; t++) updatePlayer(ship, SPEC, intent, camera);
      expect(ship.verticalTicks).toBe(30);
      hold(intent, 0);
      for (let t = 1; t < VERTICAL_HOLD_TICKS; t++) updatePlayer(ship, SPEC, intent, camera);
      expect([ship.verticalTicks, ship.verticalIdle]).toEqual([30, VERTICAL_HOLD_TICKS - 1]);
      hold(intent, Action.Up);
      const y0 = ship.y;
      updatePlayer(ship, SPEC, intent, camera);
      // ease(30): the dodge taps under the grace cost nothing — quick release keeps full speed.
      expect(y0 - ship.y).toBeCloseTo(1.5 * (0.5 + 0.5 * (30 / 60)), 12);
      hold(intent, 0);
      for (let t = 1; t <= VERTICAL_HOLD_TICKS; t++) updatePlayer(ship, SPEC, intent, camera);
      expect(ship.verticalTicks).toBe(0); // at the grace the standstill resets the ramp
      hold(intent, Action.Up);
      const y1 = ship.y;
      updatePlayer(ship, SPEC, intent, camera);
      expect(y1 - ship.y).toBe(1.5 * VERTICAL_START_SCALE); // and the push eases in from half
    });

    it('holds the ramp while the ship moves on the horizontal axis (zig-zag parity, D4)', () => {
      const { ship, camera, intent } = aliveShip();
      hold(intent, Action.Up);
      for (let t = 0; t < 10; t++) updatePlayer(ship, SPEC, intent, camera);
      expect(ship.verticalTicks).toBe(10);
      hold(intent, Action.Right);
      const y0 = ship.y;
      for (let t = 0; t < 100; t++) {
        ship.x = 150; // loop at the left end of the view instead of flying out of it
        updatePlayer(ship, SPEC, intent, camera);
      }
      expect(ship.verticalTicks).toBe(10); // horizontal flight neither charges nor drains
      expect(ship.y).toBe(y0);
      hold(intent, Action.Up);
      updatePlayer(ship, SPEC, intent, camera);
      expect(y0 - ship.y).toBeCloseTo(1.5 * (0.5 + 0.5 * (10 / 60)), 12); // continues at ease(10)
    });

    it('counts a margin-pinned direction as stopped: reversing off the wall eases in', () => {
      const { ship, camera, intent } = aliveShip(150, SPEC.margins.top); // pinned at the top
      hold(intent, Action.Up);
      for (let t = 0; t < 100; t++) updatePlayer(ship, SPEC, intent, camera);
      expect([ship.y, ship.verticalTicks]).toEqual([SPEC.margins.top, 0]);
      hold(intent, Action.Down);
      updatePlayer(ship, SPEC, intent, camera);
      expect(ship.y).toBe(SPEC.margins.top + 1.5 * VERTICAL_START_SCALE);
      expect(ship.verticalTicks).toBe(1);
    });

    it('counts a sideways hold into the margin as stopped too (the reset arm, RV F2)', () => {
      const { ship, camera, intent } = aliveShip(PLAYFIELD_W - SPEC.margins.right, 100);
      hold(intent, Action.Right); // already at the right wall: held nowhere at all
      ship.verticalTicks = 20; // charged flight first — the standstill must drain it
      for (let t = 1; t < VERTICAL_HOLD_TICKS; t++) updatePlayer(ship, SPEC, intent, camera);
      expect(ship.verticalTicks).toBe(20); // under the grace even a pin only taps: charge holds
      updatePlayer(ship, SPEC, intent, camera); // the tick that crosses the grace
      expect([ship.x, ship.verticalTicks]).toEqual([PLAYFIELD_W - SPEC.margins.right, 0]);
      hold(intent, Action.Up);
      const y0 = ship.y;
      updatePlayer(ship, SPEC, intent, camera);
      expect(y0 - ship.y).toBe(1.5 * VERTICAL_START_SCALE); // and Up eases in from half again
      expect(ship.verticalTicks).toBe(1);
    });

    it('keeps a charged ramp through a mid-air reversal (a moving vy is not a stop)', () => {
      const { ship, camera, intent } = aliveShip();
      saturateVertical(ship, intent, camera);
      expect(ship.verticalTicks).toBe(VERTICAL_RAMP_TICKS);
      hold(intent, Action.Up);
      const y0 = ship.y;
      updatePlayer(ship, SPEC, intent, camera);
      expect(y0 - ship.y).toBeCloseTo(1.5, 12); // the reversal itself steps at full speed…
      hold(intent, Action.Down);
      const y1 = ship.y;
      updatePlayer(ship, SPEC, intent, camera);
      expect(ship.y - y1).toBeCloseTo(1.5, 12); // …and so does every tick after it
    });

    it('rides the camera scroll without charging (the ramp counts screen movement only)', () => {
      const { ship, camera, intent } = aliveShip(150, 100);
      hold(intent, 0);
      for (let t = 0; t < 50; t++) {
        camera.y += 2;
        camera.dy = 2;
        updatePlayer(ship, SPEC, intent, camera);
      }
      expect([ship.verticalTicks, ship.y]).toEqual([0, 100 + 100]); // riding, never ramping
      hold(intent, Action.Up);
      const y0 = ship.y;
      updatePlayer(ship, SPEC, intent, camera); // the ride holds; the eased step rides on top
      expect(ship.y - y0).toBeCloseTo(2 - 1.5 * VERTICAL_START_SCALE, 12);
      expect(ship.verticalTicks).toBe(1);
    });

    it('ramps the vertical axis of a diagonal only', () => {
      const { ship, camera, intent } = aliveShip();
      hold(intent, Action.Up | Action.Right);
      updatePlayer(ship, SPEC, intent, camera);
      expect(ship.x).toBe(150 + 1.5 * DIAGONAL_SCALE); // the normalised step, full from tick one
      expect(ship.y).toBe(100 - 1.5 * DIAGONAL_SCALE * VERTICAL_START_SCALE); // eased
    });

    it('resets with spawn, death and fly-out, so control returns eased', () => {
      const { ship, camera } = aliveShip();
      const intent = createPlayerIntent();
      ship.verticalTicks = 42;
      spawnPlayer(ship, camera);
      expect(ship.verticalTicks).toBe(0);
      ship.verticalTicks = 42;
      killPlayer(ship);
      expect(ship.verticalTicks).toBe(0);
      ship.verticalTicks = 42;
      flyOutPlayer(ship);
      expect(ship.verticalTicks).toBe(0);
      setPlayerState(ship, 'alive');
      hold(intent, Action.Up);
      const y0 = ship.y;
      updatePlayer(ship, SPEC, intent, camera);
      expect(y0 - ship.y).toBe(1.5 * VERTICAL_START_SCALE);
    });
  });
});
