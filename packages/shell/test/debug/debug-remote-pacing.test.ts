/**
 * The M3-02b parts of the shell's debug tools, with a fake window and a renderer-like host:
 *
 * - **held-key tracking.** The Samsung remote's auto-repeats are plain `keydown`s with
 *   `repeat === false` (`docs/dev/input-probe-results.md` finding 2), so the tools track the keys
 *   that are physically down themselves: a repeat never advances the unlock sequence and never
 *   re-fires a toggle, a `keyup` makes the key fresh again, a `blur` frees every key (its key-ups
 *   never arrive), and a key is identified by `keyCode` **and** `code` so a browser reporting
 *   `keyCode` 0 still works. The listeners go away with `destroy()`.
 * - **frame pacing.** `endTicks(n)` counts the frame in the 0 / 1 / 2 / 3+ ticks-per-frame
 *   counters, `beginFrame` files the rAF delta in the histogram, and `beforeRender` mirrors the
 *   loop's vsync lock onto the overlay — the three readouts of the on-device check.
 */
import {
  EMPTY_CONTENT_DB,
  createGame,
  createHeadlessPlatform,
  type Game,
  type World,
} from '@shmup/core';
import {
  RAF_BUCKETS,
  createLayerStack,
  rafDeltaBucket,
  type PixiRenderer,
} from '@shmup/render-pixi';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEBUG_GLOBAL,
  DEBUG_UNLOCK_SEQUENCE,
  createDebugTools,
  type DebugTools,
  type DebugToolsOptions,
  type ShmupDebugApi,
} from '../../src/debug/index.js';

/** A controllable clock. */
const clock = { now: 0 };

let win: EventTarget & Record<string, unknown>;
let game: Game;
let shownWorld: World | null;
let unlocks: number;

/**
 * The overlay stats the tools publish on `window.__shmupDebug` (what the on-device check reads).
 *
 * @returns The stats.
 */
function stats(): ShmupDebugApi['stats'] {
  return (win[DEBUG_GLOBAL] as ShmupDebugApi).stats;
}

/** A renderer-like object (no atlas: the overlay exists but draws nothing). */
const renderer = {
  atlas: null,
  layers: createLayerStack(),
  webGLVersion: 2,
  drawCalls: 7,
  particles: null,
} as unknown as PixiRenderer;

/**
 * Creates tools on the fake host.
 *
 * @param options - Tool options.
 * @returns The tools.
 */
function tools(options: DebugToolsOptions = {}): DebugTools {
  return createDebugTools(
    {
      game,
      renderer,
      win: win as unknown as Window,
      now: () => clock.now,
      bootMs: 1,
      sceneId: () => 'game',
      visibleWorld: () => shownWorld,
    },
    { onUnlock: () => unlocks++, ...options },
  );
}

/**
 * Dispatches a `keydown` exactly as it arrives — no implicit `keyup` first.
 *
 * @param keyCode - Legacy key code.
 * @param code - `KeyboardEvent.code`.
 * @param repeat - The `repeat` flag the event carries (the remote always sends `false`).
 * @returns Whether the default was prevented.
 */
function down(keyCode: number, code = '', repeat = false): boolean {
  const event = Object.assign(new Event('keydown', { cancelable: true }), {
    keyCode,
    code,
    repeat,
  });
  win.dispatchEvent(event);
  return event.defaultPrevented;
}

/**
 * Dispatches a `keyup`.
 *
 * @param keyCode - Legacy key code.
 * @param code - `KeyboardEvent.code`.
 */
function up(keyCode: number, code = ''): void {
  win.dispatchEvent(Object.assign(new Event('keyup'), { keyCode, code }));
}

/**
 * A press: `keydown` then `keyup`.
 *
 * @param keyCode - Legacy key code.
 * @param code - `KeyboardEvent.code`.
 * @returns Whether the keydown's default was prevented.
 */
function press(keyCode: number, code = ''): boolean {
  const prevented = down(keyCode, code);
  up(keyCode, code);
  return prevented;
}

/** The remote's unlock sequence as key codes: Pause, Ch+, Ch+, Ch+. */
const SEQUENCE = [10252, 427, 427, 427];

beforeEach(() => {
  win = new EventTarget() as EventTarget & Record<string, unknown>;
  game = createGame(createHeadlessPlatform(), {}, EMPTY_CONTENT_DB);
  shownWorld = game.world;
  unlocks = 0;
  clock.now = 0;
});

describe('shell/debug: the remote’s flagless auto-repeat (M3-02b)', () => {
  it('matches the sequence this suite uses against the shipped one', () => {
    expect(DEBUG_UNLOCK_SEQUENCE).toHaveLength(SEQUENCE.length);
    SEQUENCE.forEach((keyCode, step) => {
      expect(DEBUG_UNLOCK_SEQUENCE[step].indexOf(keyCode) >= 0, `step ${step}`).toBe(true);
    });
  });

  it('never advances the unlock sequence on a repeat of a held key', () => {
    const t = tools({ unlock: 'sequence' });
    press(10252); // Pause
    // A single Ch+ held down: the hardware sends the first keydown and then repeats, all flagless.
    down(427);
    for (let i = 0; i < 20; i++) down(427); // the measured repeat stream
    expect(t.unlocked).toBe(false);
    expect(unlocks).toBe(0);
    // Letting it go and pressing it twice more completes the sequence.
    up(427);
    press(427);
    press(427);
    expect(t.unlocked).toBe(true);
    expect(unlocks).toBe(1);
    t.destroy();
  });

  it('never re-fires a toggle while the key is down, however many flagless repeats arrive', () => {
    const t = tools();
    expect(down(113, 'F2')).toBe(true); // god mode on
    expect(game.debug.godMode).toBe(true);
    for (let i = 0; i < 9; i++) expect(down(113, 'F2')).toBe(true); // swallowed, no toggle
    expect(game.debug.godMode).toBe(true);
    up(113, 'F2');
    down(113, 'F2');
    expect(game.debug.godMode).toBe(false);
    t.destroy();
  });

  it('still honours the browser’s own repeat flag when a keyboard sets it', () => {
    const t = tools();
    down(113, 'F2');
    expect(game.debug.godMode).toBe(true);
    // A desktop keyboard: the flag is set and no keyup came in between.
    down(113, 'F2', true);
    expect(game.debug.godMode).toBe(true);
    t.destroy();
  });

  it('frees a key on keyup, so its next keydown is a fresh press again', () => {
    const t = tools();
    down(112, 'F1');
    expect(game.debug.overlay).toBe(true);
    down(112, 'F1'); // repeat: ignored
    expect(game.debug.overlay).toBe(true);
    up(112, 'F1');
    down(112, 'F1');
    expect(game.debug.overlay).toBe(false);
    t.destroy();
  });

  it('frees every key on blur — the window’s key-ups never arrive', () => {
    const t = tools();
    down(113, 'F2');
    expect(game.debug.godMode).toBe(true);
    down(113, 'F2');
    expect(game.debug.godMode).toBe(true);
    win.dispatchEvent(new Event('blur'));
    // After the blur nothing is held: the next keydown toggles again.
    down(113, 'F2');
    expect(game.debug.godMode).toBe(false);
    t.destroy();
  });

  it('identifies a key by keyCode and code together (keyCode 0 still works)', () => {
    const t = tools();
    // Two different keys both reported with keyCode 0 — only `code` tells them apart.
    down(0, 'F1');
    expect(game.debug.overlay).toBe(true);
    down(0, 'F2');
    expect(game.debug.godMode).toBe(true);
    // Each is still held on its own: a repeat of either changes nothing.
    down(0, 'F1');
    down(0, 'F2');
    expect(game.debug.overlay).toBe(true);
    expect(game.debug.godMode).toBe(true);
    // Releasing one leaves the other held.
    up(0, 'F1');
    down(0, 'F1');
    expect(game.debug.overlay).toBe(false);
    down(0, 'F2');
    expect(game.debug.godMode).toBe(true);
    t.destroy();
  });

  it('survives more keys held at once than it has slots', () => {
    const t = tools();
    // Nine keys down: the tracker keeps eight. The ninth is untracked, so it repeats as a fresh
    // press — no crash, no lost key-ups for the eight that fit.
    for (let i = 0; i < 9; i++) down(200 + i, `Key${i}`);
    down(113, 'F2'); // no slot left: treated as a new press
    expect(game.debug.godMode).toBe(true);
    for (let i = 0; i < 9; i++) up(200 + i, `Key${i}`);
    down(113, 'F2');
    expect(game.debug.godMode).toBe(false);
    t.destroy();
  });

  it('stops listening to keyup and blur after destroy', () => {
    const t = tools();
    down(113, 'F2');
    expect(game.debug.godMode).toBe(true);
    t.destroy();
    // Destroyed: a keyup, a blur and a keydown all reach nothing.
    up(113, 'F2');
    win.dispatchEvent(new Event('blur'));
    down(113, 'F2');
    expect(game.debug.godMode).toBe(true);
    // A fresh tools instance starts with nothing held.
    const again = tools();
    down(113, 'F2');
    expect(game.debug.godMode).toBe(false);
    again.destroy();
  });
});

describe('shell/debug: frame pacing counters (M3-02b)', () => {
  it('counts every frame in the 0 / 1 / 2 / 3+ ticks-per-frame buckets', () => {
    const t = tools();
    const counts = stats().tickFrames;
    expect([...counts]).toEqual([0, 0, 0, 0]);
    for (const ticks of [1, 1, 0, 2, 1, 3, 7, 1]) t.endTicks(ticks);
    expect([...counts]).toEqual([1, 4, 1, 2]);
    t.destroy();
  });

  it('defaults to one tick when the host does not say, and clamps a nonsense count', () => {
    const t = tools();
    t.endTicks();
    expect(stats().tickFrames[1]).toBe(1);
    t.endTicks(-3); // never happens; still must not index outside the array
    expect(stats().tickFrames[0]).toBe(1);
    t.endTicks(2.9); // a fractional count truncates towards the 2-tick bucket
    expect(stats().tickFrames[2]).toBe(1);
    expect([...stats().tickFrames].reduce((sum, n) => sum + n, 0)).toBe(3);
    t.destroy();
  });

  it('files each rAF delta in the histogram, and nothing for the first or a stalled frame', () => {
    const t = tools();
    const histogram = stats().rafHistogram;
    expect(histogram).toHaveLength(RAF_BUCKETS);
    t.beginFrame(1000); // the first frame has no delta
    expect([...histogram].reduce((sum, n) => sum + n, 0)).toBe(0);
    t.beginFrame(1016.7);
    t.beginFrame(1033.4);
    t.beginFrame(1066.8); // a dropped frame (33.4 ms)
    t.beginFrame(1066.8); // the clock did not advance: not a frame
    t.beginFrame(1000); // a backwards clock: ignored too
    expect(histogram[rafDeltaBucket(16.7)]).toBe(2);
    expect(histogram[rafDeltaBucket(33.4)]).toBe(1);
    expect([...histogram].reduce((sum, n) => sum + n, 0)).toBe(3);
    t.destroy();
  });

  it('mirrors the loop’s vsync lock onto the overlay stats every frame', () => {
    const t = tools();
    expect(stats().vsyncLock).toBe(false);
    game.setVsyncLock(true);
    expect(stats().vsyncLock).toBe(false); // only `beforeRender` reads it
    t.beforeRender();
    expect(stats().vsyncLock).toBe(true);
    game.setVsyncLock(false);
    t.beforeRender();
    expect(stats().vsyncLock).toBe(false);
    t.destroy();
  });
});
