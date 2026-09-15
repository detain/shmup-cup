/**
 * Edge-case suite for the player ship (plan M1-06), beyond `player.test.ts`: SOCD-cancelled
 * directions never get the diagonal scale, diagonals never out-run a straight line (D4) at any
 * speed level, non-direction actions do not move the ship, the intent carries every mask, the
 * exact fly-in curve (camera-relative, riding a vertical scroll, custom lengths, input ignored),
 * the state timer around the fly-in, invulnerability countdown in every state, device tracking,
 * clamping from far outside / with asymmetric margins / into corners, banking limits,
 * `spawnPlayer` resets, `dying` staying put, frozen constants and the per-tick allocation budget.
 */
import { describe, expect, it } from 'vitest';
import { PLAYFIELD_H, PLAYFIELD_W } from '../../src/config/index.js';
import type { PlayerShipSpec } from '../../src/data/index.js';
import { Action } from '../../src/input/index.js';
import { EASINGS } from '../../src/math/index.js';
import {
  DEFAULT_PLAYER_SHIP,
  DIAGONAL_SCALE,
  ENTER_END_X,
  ENTER_START_X,
  PLAYER_STATES,
  SPAWN_Y,
  createPlayer,
  createPlayerIntent,
  playerBankFrame,
  readPlayerIntent,
  setPlayerState,
  spawnPlayer,
  updatePlayer,
  type PlayerIntent,
  type PlayerShip,
} from '../../src/player/index.js';
import type { InputDeviceKind } from '../../src/input/index.js';
import { createShieldState } from '../../src/shields/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

/** A mutable camera for the tests. */
interface TestCamera {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

const SPEC = DEFAULT_PLAYER_SHIP;

/**
 * An active ship in the `alive` state at a position, a static camera at the origin and an intent.
 *
 * @param x - World x.
 * @param y - World y.
 * @returns Ship, camera and intent.
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
 * Fills an intent from a held mask.
 *
 * @param intent - Intent.
 * @param held - Held actions.
 * @param device - Device kind.
 */
function hold(intent: PlayerIntent, held: number, device: InputDeviceKind = 'keyboard'): void {
  readPlayerIntent(intent, { held, pressed: 0, released: 0, device });
}

describe('core/player edge cases — movement', () => {
  it('SOCD: a cancelled axis leaves a straight move at full speed, not a scaled diagonal', () => {
    const { ship, camera, intent } = aliveShip();
    hold(intent, Action.Left | Action.Right | Action.Up);
    updatePlayer(ship, SPEC, intent, camera);
    expect([ship.x, ship.y]).toEqual([150, 100 - 1.5]);
    hold(intent, Action.Up | Action.Down | Action.Right);
    updatePlayer(ship, SPEC, intent, camera);
    expect([ship.x, ship.y]).toEqual([150 + 1.5, 100 - 1.5]);
    // All four arrows: no movement and not "moving" (the option trail does not record).
    hold(intent, Action.Up | Action.Down | Action.Left | Action.Right);
    updatePlayer(ship, SPEC, intent, camera);
    expect([ship.x, ship.y, ship.moving]).toEqual([150 + 1.5, 100 - 1.5, false]);
  });

  it('a diagonal step never out-runs the straight speed (D4), at every speed level', () => {
    for (let level = 0; level < SPEC.speeds.length; level++) {
      const speed = SPEC.speeds[level];
      for (const held of [
        Action.Up | Action.Left,
        Action.Up | Action.Right,
        Action.Down | Action.Left,
        Action.Down | Action.Right,
      ]) {
        const { ship, camera, intent } = aliveShip(200, 100);
        ship.speedLevel = level;
        hold(intent, held);
        updatePlayer(ship, SPEC, intent, camera);
        const dx = ship.x - 200;
        const dy = ship.y - 100;
        expect(Math.abs(dx)).toBeCloseTo(speed * DIAGONAL_SCALE, 12);
        expect(Math.abs(dy)).toBeCloseTo(speed * DIAGONAL_SCALE, 12);
        const step = Math.sqrt(dx * dx + dy * dy);
        expect(step).toBeLessThanOrEqual(speed);
        expect(step).toBeGreaterThan(speed * 0.9999);
      }
    }
  });

  it('fire, power-up and menu actions alone do not move the ship', () => {
    const { ship, camera, intent } = aliveShip();
    const nonDirections = Action.Shot | Action.Sub | Action.PowerUp | Action.Pause;
    hold(intent, nonDirections);
    expect([intent.moveX, intent.moveY]).toEqual([0, 0]);
    updatePlayer(ship, SPEC, intent, camera);
    expect([ship.x, ship.y, ship.moving, ship.bank]).toEqual([150, 100, false, 0]);
  });

  it('the intent copies held, pressed, released and device verbatim', () => {
    const intent = createPlayerIntent();
    expect(intent).toEqual({
      held: 0,
      pressed: 0,
      released: 0,
      device: 'none',
      moveX: 0,
      moveY: 0,
    });
    readPlayerIntent(intent, {
      held: Action.Down | Action.Left,
      pressed: Action.Down,
      released: Action.Shot,
      device: 'remote',
    });
    expect(intent).toEqual({
      held: Action.Down | Action.Left,
      pressed: Action.Down,
      released: Action.Shot,
      device: 'remote',
      moveX: -1,
      moveY: 1,
    });
  });

  it('clamps a ship that is far outside the view back in, even without input', () => {
    const { ship, camera, intent } = aliveShip(-5000, 9000);
    updatePlayer(ship, SPEC, intent, camera);
    expect([ship.x, ship.y]).toEqual([SPEC.margins.left, PLAYFIELD_H - SPEC.margins.bottom]);
    expect(ship.moving).toBe(false);
  });

  it('clamps with asymmetric margins and holds a corner under a diagonal', () => {
    const spec: PlayerShipSpec = {
      ...SPEC,
      speeds: [4],
      margins: { left: 2, right: 30, top: 11, bottom: 1 },
    };
    const { ship, camera, intent } = aliveShip();
    hold(intent, Action.Down | Action.Right);
    for (let i = 0; i < 200; i++) updatePlayer(ship, spec, intent, camera);
    expect([ship.x, ship.y]).toEqual([PLAYFIELD_W - 30, PLAYFIELD_H - 1]);
    hold(intent, Action.Up | Action.Left);
    for (let i = 0; i < 200; i++) updatePlayer(ship, spec, intent, camera);
    expect([ship.x, ship.y]).toEqual([2, 11]);
    // Pushing into the corner keeps "moving" true (input is held) but the position fixed.
    updatePlayer(ship, spec, intent, camera);
    expect([ship.x, ship.y, ship.moving]).toEqual([2, 11, true]);
  });

  it('rides a vertical scroll and clamps against the moving view', () => {
    const { ship, camera, intent } = aliveShip(100, 100);
    camera.dy = -2;
    for (let i = 0; i < 10; i++) {
      camera.y -= 2;
      updatePlayer(ship, SPEC, intent, camera);
    }
    expect(ship.y).toBe(80); // same screen y
    // Riding a downward scroll keeps the screen position; holding Down then reaches the clamp.
    camera.dy = 5;
    const screenY = (): number => ship.y - camera.y;
    for (let i = 0; i < 100; i++) {
      camera.y += 5;
      updatePlayer(ship, SPEC, intent, camera);
    }
    expect(screenY()).toBe(100);
    hold(intent, Action.Down);
    for (let i = 0; i < 200; i++) {
      camera.y += 5;
      updatePlayer(ship, SPEC, intent, camera);
    }
    expect(screenY()).toBe(PLAYFIELD_H - SPEC.margins.bottom);
  });

  it('a speed table with one entry serves every level', () => {
    const spec: PlayerShipSpec = { ...SPEC, speeds: [2.25] };
    const { ship, camera, intent } = aliveShip();
    ship.speedLevel = 3;
    hold(intent, Action.Right);
    updatePlayer(ship, spec, intent, camera);
    expect(ship.x).toBe(152.25);
  });
});

describe('core/player edge cases — fly-in and state', () => {
  it('follows the cubic ease-out exactly, camera-relative, while the camera scrolls', () => {
    const ship = createPlayer(0, 3);
    ship.active = true;
    const camera: TestCamera = { x: 0, y: 40, dx: 0.5, dy: -0.25 };
    spawnPlayer(ship, camera);
    const intent = createPlayerIntent();
    hold(intent, Action.Up | Action.Right);
    for (let tick = 1; tick <= SPEC.enterTicks; tick++) {
      camera.x += camera.dx;
      camera.y += camera.dy;
      updatePlayer(ship, SPEC, intent, camera);
      const eased = EASINGS.outCubic(tick / SPEC.enterTicks);
      expect(ship.x - camera.x).toBeCloseTo(
        ENTER_START_X + (ENTER_END_X - ENTER_START_X) * eased,
        12,
      );
      // It rides the vertical scroll: same screen y as the spawn.
      expect(ship.y - camera.y).toBeCloseTo(SPAWN_Y, 12);
      // Input is ignored during the fly-in.
      expect([ship.bank, ship.moving]).toEqual([0, false]);
    }
    expect(ship.state).toBe('alive');
    expect(ship.x - camera.x).toBe(ENTER_END_X);
  });

  it('runs exactly enterTicks ticks for a custom length and restarts the state timer', () => {
    const spec: PlayerShipSpec = { ...SPEC, enterTicks: 7 };
    const ship = createPlayer(0, 3);
    ship.active = true;
    const camera: TestCamera = { x: 0, y: 0, dx: 0, dy: 0 };
    spawnPlayer(ship, camera, 'respawning');
    const intent = createPlayerIntent();
    const states: string[] = [];
    const timers: number[] = [];
    for (let i = 0; i < 9; i++) {
      updatePlayer(ship, spec, intent, camera);
      states.push(ship.state);
      timers.push(ship.stateTicks);
    }
    expect(states).toEqual([
      'respawning',
      'respawning',
      'respawning',
      'respawning',
      'respawning',
      'respawning',
      'alive',
      'alive',
      'alive',
    ]);
    // The tick that ends the fly-in resets the timer; the ship is controllable from the next.
    expect(timers).toEqual([1, 2, 3, 4, 5, 6, 0, 1, 2]);
  });

  it('a negative enterTicks behaves like 0: alive after one update', () => {
    const ship = createPlayer(0, 3);
    ship.active = true;
    const camera: TestCamera = { x: 10, y: 0, dx: 0, dy: 0 };
    spawnPlayer(ship, camera);
    updatePlayer(ship, { ...SPEC, enterTicks: -5 }, createPlayerIntent(), camera);
    expect([ship.state, ship.x]).toEqual(['alive', 10 + ENTER_END_X]);
  });

  it('spawnPlayer resets position, bank, motion and timer but keeps lives, speed and invuln', () => {
    const { ship } = aliveShip(300, 20);
    ship.bank = -1;
    ship.moving = true;
    ship.stateTicks = 77;
    ship.speedLevel = 4;
    ship.invulnTicks = 50;
    ship.lives = 2;
    ship.device = 'gamepad';
    spawnPlayer(ship, { x: 1000, y: -8 }, 'respawning');
    expect(ship).toMatchObject({
      x: 1000 + ENTER_START_X,
      y: -8 + SPAWN_Y,
      bank: 0,
      moving: false,
      stateTicks: 0,
      state: 'respawning',
      speedLevel: 4,
      invulnTicks: 50,
      lives: 2,
      device: 'gamepad',
      active: true,
    });
  });

  it('counts invulnerability down in every state and stops at 0', () => {
    for (const state of PLAYER_STATES) {
      const { ship, camera, intent } = aliveShip();
      setPlayerState(ship, state);
      ship.invulnTicks = 2;
      updatePlayer(ship, SPEC, intent, camera);
      updatePlayer(ship, SPEC, intent, camera);
      updatePlayer(ship, SPEC, intent, camera);
      expect(ship.invulnTicks, state).toBe(0);
    }
  });

  it("keeps the last device while the intent's device is 'none'", () => {
    const { ship, camera, intent } = aliveShip();
    hold(intent, Action.Right, 'remote');
    updatePlayer(ship, SPEC, intent, camera);
    expect(ship.device).toBe('remote');
    hold(intent, 0, 'none');
    updatePlayer(ship, SPEC, intent, camera);
    expect(ship.device).toBe('remote');
    hold(intent, 0, 'gamepad');
    updatePlayer(ship, SPEC, intent, camera);
    expect(ship.device).toBe('gamepad');
  });

  it('a dying ship stays where it was hit: no input, no scroll riding, no clamp', () => {
    const { ship, camera, intent } = aliveShip(-50, 500); // outside the view on purpose
    setPlayerState(ship, 'dying');
    camera.dx = 3;
    camera.x = 3;
    hold(intent, Action.Right);
    for (let i = 0; i < 5; i++) updatePlayer(ship, SPEC, intent, camera);
    expect([ship.x, ship.y, ship.stateTicks, ship.moving]).toEqual([-50, 500, 5, false]);
  });

  it('createPlayer starts dead, inactive, off-screen, with the given lives', () => {
    expect(createPlayer(1, 5)).toEqual({
      slot: 1,
      active: false,
      x: 0,
      y: 0,
      state: 'dead',
      stateTicks: 0,
      speedLevel: 0,
      invulnTicks: 0,
      bank: 0,
      device: 'none',
      lives: 5,
      moving: false,
      hitCause: 0,
      hitTick: -1,
      hits: 0,
      shield: createShieldState(),
      // M3-01: the invincibility assist (off unless the config asks for it).
      invincible: false,
      // M3-02: the bomb stock and the death-bomb window.
      bombs: 0,
      bombTicks: 0,
    });
    expect(createPlayer(0, 3, true).invincible).toBe(true);
  });
});

describe('core/player edge cases — banking and constants', () => {
  it('bankFrames 0 never banks (frame 0 only)', () => {
    const { ship, camera, intent } = aliveShip();
    const spec: PlayerShipSpec = { ...SPEC, bankFrames: 0 };
    hold(intent, Action.Up);
    for (let i = 0; i < 5; i++) updatePlayer(ship, spec, intent, camera);
    expect(ship.bank).toBe(0);
    expect(playerBankFrame(ship.bank, 0)).toBe(0);
  });

  it('reverses from full up to full down one step per tick (2·bankFrames ticks)', () => {
    const { ship, camera, intent } = aliveShip();
    const spec: PlayerShipSpec = { ...SPEC, bankFrames: 3 };
    hold(intent, Action.Up);
    for (let i = 0; i < 10; i++) updatePlayer(ship, spec, intent, camera);
    expect(ship.bank).toBe(-3);
    hold(intent, Action.Down);
    const banks: number[] = [];
    for (let i = 0; i < 7; i++) {
      updatePlayer(ship, spec, intent, camera);
      banks.push(ship.bank);
    }
    expect(banks).toEqual([-2, -1, 0, 1, 2, 3, 3]);
    // Frames: level 0, up 1…3, down 4…6.
    expect([-3, -2, -1, 0, 1, 2, 3].map((b) => playerBankFrame(b, 3))).toEqual([
      3, 2, 1, 0, 4, 5, 6,
    ]);
  });

  it('levels out under horizontal-only input; banks even when pinned at a margin', () => {
    const { ship, camera, intent } = aliveShip(150, SPEC.margins.top);
    hold(intent, Action.Up);
    updatePlayer(ship, SPEC, intent, camera);
    expect([ship.y, ship.bank]).toEqual([SPEC.margins.top, -1]); // pinned, still banking
    hold(intent, Action.Left);
    updatePlayer(ship, SPEC, intent, camera);
    expect(ship.bank).toBe(0);
  });

  it('keeps its constants and default ship frozen', () => {
    expect(Object.isFrozen(PLAYER_STATES)).toBe(true);
    expect(Object.isFrozen(DEFAULT_PLAYER_SHIP)).toBe(true);
    expect(Object.isFrozen(DEFAULT_PLAYER_SHIP.speeds)).toBe(true);
    expect(Object.isFrozen(DEFAULT_PLAYER_SHIP.margins)).toBe(true);
    // D3 speeds and the plan's KESTREL boxes.
    expect(DEFAULT_PLAYER_SHIP.speeds).toEqual([1.5, 2, 2.5, 3, 3.5, 4]);
    expect([
      DEFAULT_PLAYER_SHIP.hurtRadius,
      DEFAULT_PLAYER_SHIP.terrainBox,
      DEFAULT_PLAYER_SHIP.pickupBox,
      DEFAULT_PLAYER_SHIP.enterTicks,
    ]).toEqual([1.5, { hw: 5, hh: 3 }, { hw: 8, hh: 6 }, 40]);
    expect(SPAWN_Y).toBe(PLAYFIELD_H / 2);
    expect(ENTER_START_X).toBeLessThan(0); // starts off-screen
    expect(ENTER_END_X).toBeGreaterThan(SPEC.margins.left); // ends inside the clamp area
  });
});

describe('core/player allocation', () => {
  it('readPlayerIntent + updatePlayer stay within the per-tick allocation budget', () => {
    const { ship, camera, intent } = aliveShip();
    const input = { held: 0, pressed: 0, released: 0, device: 'keyboard' as InputDeviceKind };
    const masks = [Action.Up, Action.Up | Action.Right, Action.Right, 0, Action.Down | Action.Left];
    camera.dx = 0.25;
    const growth = measureHeapGrowth(
      (i) => {
        input.held = masks[(i >> 4) % masks.length];
        camera.x += camera.dx;
        if ((i & 1023) === 0) spawnPlayer(ship, camera, 'respawning');
        readPlayerIntent(intent, input);
        updatePlayer(ship, SPEC, intent, camera);
      },
      10_000,
      20_000,
    );
    // The plan's budget (< 256 KB per 10,000 ticks) for this slice of the tick alone. A long
    // warm-up lets TurboFan settle first: V8's lower tiers box double temporaries.
    expect(growth.bytes).toBeLessThan(256 * 1024);
  });

  it('does not box the speed when straight and diagonal ticks alternate (regression)', () => {
    // Regression: `diagonal ? speeds[l] * DIAGONAL_SCALE : speeds[l]` merged the bare array
    // element (a tagged heap number for the frozen DEFAULT_PLAYER_SHIP table) with a computed
    // double, so V8 allocated a 16-byte heap number on every diagonal tick (~8 B/tick here).
    const { ship, camera, intent } = aliveShip(192, 100);
    const straight = { held: Action.Right, pressed: 0, released: 0, device: 'keyboard' as const };
    const diagonal = {
      held: Action.Left | Action.Up,
      pressed: 0,
      released: 0,
      device: 'keyboard' as const,
    };
    const growth = measureHeapGrowth(
      (i) => {
        readPlayerIntent(intent, (i & 1) === 0 ? straight : diagonal);
        updatePlayer(ship, SPEC, intent, camera);
        if ((i & 255) === 0) {
          ship.x = 192;
          ship.y = 100;
        }
      },
      40_000,
      40_000,
    );
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });
});
