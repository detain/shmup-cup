/**
 * Two-player co-op with the Samsung remote and a gamepad (plan M2-06 — "remote / keyboard → P1,
 * pads → P2 by default", shmup_feat.md §4 / §16), core + input-web on the shipped content: the
 * scene flow runs zone A through a real `WebInput` fed remote key codes and a fake standard pad,
 * one tick per frame, with the host's per-frame forwarding of `Game.inputContext` and
 * `Game.inputSeats` (what `@shmup/shell` does before the ticks of a frame).
 *
 * - `2 PLAYERS` with the remote; in the game the pad's START takes player 2's seat and joins player
 *   2 without pausing; the pad then flies player 2 and the remote player 1;
 * - player 2's START pauses and the held button is no second press in the pause menu (one seat —
 *   the pad back on player 1's slot); its next START resumes and the held button does not pause
 *   again (two seats);
 * - a seated pad that is unplugged leaves its ship in play (no host-driven leave) and frees the
 *   seat for the next pad's join press;
 * - the co-op continue countdown takes each device's OK for its own player.
 */
import {
  CONTINUE_LOCK_TICKS,
  ENGINE_SPRITES,
  GAME_OVER_DELAY_TICKS,
  KNOWN_SCRIPT_IDS,
  PLAYER_DEAD_TICKS,
  createGame,
  loadContent,
  type ContentDb,
  type Game,
  type Platform,
} from '@shmup/core';
import {
  PAD_SEAT_NONE,
  PAD_SEAT_P2,
  TIZEN_KEY_CODES,
  createWebInput,
  type WebInput,
} from '@shmup/input-web';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';

const STEP = 1000 / 60;

/**
 * The shipped content, validated like the shell does.
 *
 * @returns The DB.
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

/** Standard-mapping button indices. */
const PAD = Object.freeze({ A: 0, Start: 9, Up: 12, Down: 13, Left: 14, Right: 15 });

/** A fake standard-mapping gamepad whose buttons the test sets. */
interface FakePad {
  readonly index: number;
  connected: boolean;
  readonly mapping: string;
  readonly buttons: Array<{ pressed: boolean }>;
  readonly axes: number[];
}

/** A co-op-capable session: the remote (key codes) and up to two pads, one tick per frame. */
class CoopSession {
  readonly game: Game;
  readonly input: WebInput;
  /** The pad slots `getGamepads()` lists. */
  readonly pads: Array<FakePad | null> = [null, null, null, null];
  /** Frames run so far. */
  private frames = 0;
  /** The key target the web input listens to. */
  private readonly keys = new EventTarget();

  /** Creates the session on the title, a pad in slot 0. */
  constructor() {
    this.input = createWebInput({
      keyTarget: this.keys,
      keyDevice: 'remote',
      getGamepads: () => this.pads,
    });
    this.plug(0);
    const platform: Platform = {
      id: 'headless',
      input: this.input,
      storage: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
      audio: { unlock: () => Promise.resolve() },
      lifecycle: { onSuspend: () => {}, onResume: () => {} },
      exit: null,
      display: { cssWidth: 1920, cssHeight: 1080 },
      caps: { gamepad: true, remoteOnly: false, webgl2: false },
    };
    this.game = createGame(platform, { seed: 9, stage: 'zone-a' }, DB, { scenes: 'title' });
    this.game.frame(0);
  }

  /** Scene ids, bottom to top. */
  get ids(): string[] {
    const flow = this.game.scenes!;
    const out: string[] = [];
    for (let i = 0; i < flow.stack.depth; i++) out.push(flow.stack.sceneAt(i)!.id);
    return out;
  }

  /**
   * Connects a pad (no button down).
   *
   * @param index - Pad slot.
   */
  plug(index: number): void {
    const buttons: Array<{ pressed: boolean }> = [];
    for (let i = 0; i < 17; i++) buttons.push({ pressed: false });
    this.pads[index] = { index, connected: true, mapping: 'standard', buttons, axes: [0, 0, 0, 0] };
  }

  /**
   * Holds a pad's buttons (the others up).
   *
   * @param index - Pad slot.
   * @param down - Button indices.
   */
  padHold(index: number, down: number[]): void {
    const pad = this.pads[index];
    if (pad === null || pad === undefined) throw new Error(`no pad ${index}`);
    for (let i = 0; i < pad.buttons.length; i++) pad.buttons[i] = { pressed: down.includes(i) };
  }

  /**
   * Presses and releases a pad button, two frames each.
   *
   * @param index - Pad slot.
   * @param button - Button index.
   */
  padPress(index: number, button: number): void {
    this.padHold(index, [button]);
    this.run(2);
    this.padHold(index, []);
    this.run(2);
  }

  /**
   * Presses and releases a remote key (key code only), two frames each.
   *
   * @param keyCode - The key code.
   */
  press(keyCode: number): void {
    this.key('keydown', keyCode);
    this.run(2);
    this.key('keyup', keyCode);
    this.run(2);
  }

  /**
   * Holds or releases a remote key.
   *
   * @param type - `keydown` / `keyup`.
   * @param keyCode - The key code.
   */
  key(type: 'keydown' | 'keyup', keyCode: number): void {
    this.keys.dispatchEvent(Object.assign(new Event(type), { code: '', keyCode, repeat: false }));
  }

  /**
   * Runs frames (one tick each), forwarding the binding context and the seats first — like the
   * shell's frame loop.
   *
   * @param count - Frames.
   */
  run(count = 1): void {
    for (let i = 0; i < count; i++) {
      if (this.game.inputContext !== this.input.context) {
        this.input.setContext(this.game.inputContext);
      }
      if (this.game.inputSeats !== this.input.seats) this.input.setSeats(this.game.inputSeats);
      this.frames++;
      this.game.frame(this.frames * STEP);
      this.game.events.clear();
    }
  }

  /** The title's `2 PLAYERS` on NORMAL with the KESTREL, all with the remote. */
  startCoop(): void {
    this.press(TIZEN_KEY_CODES.Enter); // PRESS OK
    this.press(TIZEN_KEY_CODES.ArrowDown); // 2 PLAYERS
    this.press(TIZEN_KEY_CODES.Enter);
    this.run(2);
    expect(this.ids).toEqual(['title', 'difficulty']);
    this.press(TIZEN_KEY_CODES.Enter); // NORMAL
    this.run(2);
    this.press(TIZEN_KEY_CODES.Enter); // KESTREL
    this.run(2);
    this.press(TIZEN_KEY_CODES.Enter); // START
    expect(this.ids).toEqual(['game']);
    expect(this.game.world.config.coop).toBe(true);
    expect(this.input.seats).toBe(2);
  }

  /** The pad's START joins player 2; waits until both ships fly. */
  joinWithPad(): void {
    this.padPress(0, PAD.Start);
    expect(this.ids).toEqual(['game']);
    expect(this.input.padSeat(0)).toBe(PAD_SEAT_P2);
    const world = this.game.world;
    expect(world.players[1].active).toBe(true);
    for (let i = 0; i < 300 && world.players[1].state !== 'alive'; i++) this.run();
    world.players[0].invulnTicks = 9999; // zone A's enemies must not end the test early
    world.players[1].invulnTicks = 9999;
  }
}

describe('integration: co-op with the remote and a gamepad (M2-06)', () => {
  it('joins player 2 with the pad`s START; the pad flies player 2, the remote player 1', () => {
    const s = new CoopSession();
    s.startCoop();
    s.run(10);
    expect(s.game.world.players[1].active).toBe(false);
    s.joinWithPad();
    const [p1, p2] = s.game.world.players;
    expect(p2.state).toBe('alive');
    const camera = (): number => s.game.world.camera.x;
    let x1 = p1.x - camera();
    let x2 = p2.x - camera();
    s.padHold(0, [PAD.Right]);
    s.run(20);
    s.padHold(0, []);
    s.run();
    expect(p2.x - camera()).toBeGreaterThan(x2 + 10);
    expect(Math.abs(p1.x - camera() - x1)).toBeLessThan(2);
    x1 = p1.x - camera();
    x2 = p2.x - camera();
    s.key('keydown', TIZEN_KEY_CODES.ArrowRight);
    s.run(20);
    s.key('keyup', TIZEN_KEY_CODES.ArrowRight);
    s.run();
    expect(p1.x - camera()).toBeGreaterThan(x1 + 10);
    expect(Math.abs(p2.x - camera() - x2)).toBeLessThan(2);
  });

  it('pauses on player 2`s START without the held button resuming, and resumes without re-pausing', () => {
    const s = new CoopSession();
    s.startCoop();
    s.joinWithPad();
    s.run(5);
    s.padHold(0, [PAD.Start]);
    s.run(1);
    expect(s.ids).toEqual(['game', 'pause']);
    s.run(10); // START still held: one seat now, the pad on player 1's slot
    expect(s.ids).toEqual(['game', 'pause']);
    expect(s.input.seats).toBe(1);
    s.padHold(0, []);
    s.run(3);
    s.padHold(0, [PAD.Start]); // START in the pause menu: resume
    s.run(1);
    expect(s.ids).toEqual(['game']);
    s.run(10); // still held: two seats again, the pad on player 2's slot
    expect(s.ids).toEqual(['game']);
    expect(s.input.seats).toBe(2);
    s.padHold(0, []);
    s.run(2);
    expect(s.ids).toEqual(['game']);
  });

  it('keeps an unplugged pad`s ship in play and frees its seat for the next pad', () => {
    const s = new CoopSession();
    s.startCoop();
    s.joinWithPad();
    s.pads[0] = null;
    s.run(5);
    expect(s.input.padSeat(0)).toBe(PAD_SEAT_NONE);
    expect(s.game.world.players[1].active).toBe(true);
    expect(s.ids).toEqual(['game']);
    s.plug(1);
    s.run(2);
    expect(s.input.padSeat(1)).toBe(PAD_SEAT_NONE);
    s.padPress(1, PAD.A);
    expect(s.input.padSeat(1)).toBe(PAD_SEAT_P2);
    const p2 = s.game.world.players[1];
    const x = p2.x - s.game.world.camera.x;
    s.padHold(1, [PAD.Right]);
    s.run(20);
    expect(p2.x - s.game.world.camera.x).toBeGreaterThan(x + 10);
  });

  it('continues each player on its own device`s OK in the co-op countdown', () => {
    const s = new CoopSession();
    s.startCoop();
    s.joinWithPad();
    const world = s.game.world;
    for (const ship of world.players) {
      ship.invulnTicks = 0;
      ship.state = 'dead';
      ship.stateTicks = PLAYER_DEAD_TICKS + 5;
      ship.lives = 0;
    }
    s.run(GAME_OVER_DELAY_TICKS + 1);
    expect(s.ids).toEqual(['game', 'continue']);
    expect(s.input.seats).toBe(2);
    s.run(CONTINUE_LOCK_TICKS);
    s.padPress(0, PAD.A); // the pad's OK: player 2 continues
    expect(s.ids).toEqual(['game']);
    expect(world.players.map((p) => p.lives)).toEqual([0, world.config.startingLives]);
    expect(world.scoring.board.scores.map((b) => b.continues)).toEqual([0, 1]);
    s.run(5);
    s.press(TIZEN_KEY_CODES.Enter); // the remote's OK (in the game: player 1's join press)
    expect(s.ids).toEqual(['game']);
    expect(world.players[0].lives).toBe(world.config.startingLives);
    expect(world.scoring.board.scores[0].continues).toBe(1);
  });
});
