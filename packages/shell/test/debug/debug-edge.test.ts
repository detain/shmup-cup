/**
 * Edge cases of the shell's debug tools (plan M1-19), with a fake window and a renderer-like host:
 *
 * - the TV mode: every number key 1–8 runs its command once unlocked (repeats only for the step),
 *   the sequence's own keys never run a command, the 3-s window is inclusive, a Pause in the middle
 *   restarts the sequence, unlocking works without an `onUnlock` callback;
 * - the web mode: the remote's sequence keys and digits are plain keys, a held F5 queues one step
 *   per repeat, a key matched by `code` or `keyCode` alone;
 * - `window.__shmupDebug` reads live values (scene id, ticks, a new World of the scene flow) and
 *   `destroy()` leaves a newer tools' global in place;
 * - the frame hooks: no FPS or graph entry for a first frame or a timestamp that did not advance,
 *   no particle pool → 0 / 0, draw calls read every frame.
 */
import {
  DebugCommand,
  EMPTY_CONTENT_DB,
  createGame,
  createHeadlessPlatform,
  type Game,
} from '@shmup/core';
import { createLayerStack, type PixiRenderer } from '@shmup/render-pixi';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEBUG_GLOBAL,
  DEBUG_KEYS,
  DEBUG_UNLOCK_WINDOW_MS,
  createDebugTools,
  type DebugTools,
  type DebugToolsOptions,
  type ShmupDebugApi,
} from '../../src/debug/index.js';

/** A controllable clock. */
const clock = { now: 0 };

/** The id the fake host reports as shown. */
let scene = 'title';

let win: EventTarget & Record<string, unknown>;
let game: Game;

/** A renderer-like object (no atlas: the overlay exists but draws nothing). */
const renderer = {
  atlas: null,
  layers: createLayerStack(),
  webGLVersion: 1,
  drawCalls: -1,
  particles: null,
} as unknown as PixiRenderer & { drawCalls: number };

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
      bootMs: 0,
      sceneId: () => scene,
      visibleWorld: () => game.world,
    },
    options,
  );
}

/**
 * Dispatches a keydown on the fake window.
 *
 * @param keyCode - Legacy key code.
 * @param code - `KeyboardEvent.code`.
 * @param repeat - Auto-repeat.
 * @returns Whether the default was prevented.
 */
function key(keyCode: number, code = '', repeat = false): boolean {
  const event = Object.assign(new Event('keydown', { cancelable: true }), {
    keyCode,
    code,
    repeat,
  });
  win.dispatchEvent(event);
  return event.defaultPrevented;
}

/** Enters Pause, Ch+, Ch+, Ch+ on the remote. */
function unlockSequence(): void {
  for (const keyCode of [10252, 427, 427, 427]) key(keyCode);
}

/**
 * The debug switches as a comparable snapshot.
 *
 * @returns The switches.
 */
function switches(): string {
  return JSON.stringify(game.debug);
}

beforeEach(() => {
  win = new EventTarget() as EventTarget & Record<string, unknown>;
  game = createGame(createHeadlessPlatform(), {}, EMPTY_CONTENT_DB);
  clock.now = 0;
  scene = 'title';
  renderer.drawCalls = -1;
});

describe('shell/debug — TV mode edge cases', () => {
  it('runs each of the eight commands from its number key once unlocked', () => {
    const t = tools({ unlock: 'sequence' });
    unlockSequence();
    expect(t.unlocked).toBe(true);
    const ran: number[] = [];
    const run = t.controls.run.bind(t.controls);
    t.controls.run = (command) => {
      ran.push(command);
      return run(command);
    };
    for (const binding of DEBUG_KEYS) expect(key(binding.digitKeyCode), binding.code).toBe(true);
    expect(ran).toEqual(DEBUG_KEYS.map((binding) => binding.command));
    // Digit 9 and 0 are not debug keys.
    expect(key(57)).toBe(false);
    expect(key(48)).toBe(false);
    t.destroy();
  });

  it('ignores a held number key except for the step, which queues one tick per repeat', () => {
    const t = tools({ unlock: 'sequence' });
    unlockSequence();
    key(50); // god mode on
    expect(key(50, '', true)).toBe(true); // swallowed, but no second toggle
    expect(game.debug.godMode).toBe(true);
    game.frame(0);
    key(53); // step: frame advance on, one tick queued
    key(53, '', true);
    key(53, '', true);
    expect(game.frame(16)).toBe(3);
    t.destroy();
  });

  it('never runs a command from the sequence keys themselves', () => {
    const t = tools({ unlock: 'sequence' });
    unlockSequence();
    const before = switches();
    expect(key(427)).toBe(false);
    expect(key(10252)).toBe(false);
    expect(key(19)).toBe(false);
    expect(switches()).toBe(before);
    t.destroy();
  });

  it('accepts a sequence that takes exactly the window, not a millisecond more', () => {
    const exact = tools({ unlock: 'sequence' });
    key(10252);
    clock.now = DEBUG_UNLOCK_WINDOW_MS / 2;
    key(427);
    key(427);
    clock.now = DEBUG_UNLOCK_WINDOW_MS;
    key(427);
    expect(exact.unlocked).toBe(true);
    exact.destroy();

    clock.now = 10_000;
    const late = tools({ unlock: 'sequence' });
    key(10252);
    key(427);
    key(427);
    clock.now = 10_000 + DEBUG_UNLOCK_WINDOW_MS + 1;
    key(427);
    expect(late.unlocked).toBe(false);
    late.destroy();
  });

  it('restarts the sequence from a Pause in the middle', () => {
    const t = tools({ unlock: 'sequence' });
    key(10252);
    key(427);
    key(427);
    key(19); // Pause again: this is step 1 now
    key(427);
    key(427);
    expect(t.unlocked).toBe(false);
    key(427);
    expect(t.unlocked).toBe(true);
    expect(game.debug.overlay).toBe(true);
    t.destroy();
  });

  it('unlocks without an onUnlock callback, and the api reports it', () => {
    const t = tools({ unlock: 'sequence' });
    const api = win[DEBUG_GLOBAL] as ShmupDebugApi;
    expect(api.unlocked).toBe(false);
    // The api runs commands whether unlocked or not (tests and the remote inspector).
    expect(api.run(DebugCommand.Grid)).toBe(true);
    expect(game.debug.showGrid).toBe(true);
    unlockSequence();
    expect(api.unlocked).toBe(true);
    t.destroy();
  });
});

describe('shell/debug — web mode edge cases', () => {
  it('treats the remote’s sequence keys and digits as plain keys', () => {
    const t = tools();
    const before = switches();
    unlockSequence();
    for (const binding of DEBUG_KEYS) expect(key(binding.digitKeyCode)).toBe(false);
    expect(switches()).toBe(before);
    t.destroy();
  });

  it('queues one step per F5 auto-repeat', () => {
    const t = tools();
    game.frame(0);
    key(116, 'F5');
    for (let i = 0; i < 4; i++) expect(key(116, 'F5', true)).toBe(true);
    expect(game.frame(16)).toBe(5);
    expect(game.frame(33)).toBe(0);
    t.destroy();
  });

  it('matches a key by code alone or by key code alone', () => {
    const t = tools();
    expect(key(0, 'F4')).toBe(true);
    expect(game.debug.frameAdvance).toBe(true);
    expect(key(115, '')).toBe(true);
    expect(game.debug.frameAdvance).toBe(false);
    // A keyboard layout that reports another code for keyCode 112 still gets F1 by key code.
    expect(key(112, 'Unidentified')).toBe(true);
    expect(game.debug.overlay).toBe(true);
    t.destroy();
  });
});

describe('shell/debug — the published api', () => {
  it('reads live values: scene id, ticks and the World of a new game', () => {
    const flow = createGame(createHeadlessPlatform(), {}, EMPTY_CONTENT_DB, { scenes: 'game' });
    game = flow;
    const t = tools();
    const api = win[DEBUG_GLOBAL] as ShmupDebugApi;
    expect(api.sceneId).toBe('title');
    scene = 'game';
    expect(api.sceneId).toBe('game');
    for (let i = 0; i < 5; i++) flow.step();
    expect(api.tick).toBe(5);
    expect(api.worldTick).toBe(flow.world.tick);
    expect(api.counters).toBe(t.counters);
    expect(api.stats).toBe(t.overlay.stats);
    t.destroy();
  });

  it('destroy() leaves another tools’ global alone', () => {
    const first = tools();
    const second = tools();
    expect(win[DEBUG_GLOBAL]).toBe(second.api);
    first.destroy();
    expect(win[DEBUG_GLOBAL]).toBe(second.api);
    // The first tools' keys are gone; the second's still work.
    key(113, 'F2');
    expect(game.debug.godMode).toBe(true);
    second.destroy();
    expect(DEBUG_GLOBAL in win).toBe(false);
  });
});

describe('shell/debug — frame hooks edge cases', () => {
  it('records no frame time for the first frame or a timestamp that did not advance', () => {
    const t = tools();
    t.beginFrame(1000);
    expect([t.overlay.graph.count, t.overlay.stats.fps]).toEqual([0, 0]);
    t.beginFrame(1000);
    t.beginFrame(990);
    expect(t.overlay.graph.count).toBe(0);
    t.beginFrame(1010);
    expect(t.overlay.graph.count).toBe(1);
    expect(t.overlay.stats.fps).toBeCloseTo(50, 5);
    t.destroy();
  });

  it('reports no particles without a pool, and the draw calls of every frame', () => {
    const t = tools();
    renderer.drawCalls = 7;
    t.beforeRender();
    expect([t.overlay.stats.particles, t.overlay.stats.particleCapacity]).toEqual([0, 0]);
    expect(t.overlay.stats.drawCalls).toBe(7);
    renderer.drawCalls = 9;
    t.beforeRender();
    expect(t.overlay.stats.drawCalls).toBe(9);
    t.destroy();
  });

  it('smooths the tick and render times towards the new measurement', () => {
    const t = tools();
    clock.now = 0;
    t.beginFrame(1);
    clock.now = 10;
    t.endTicks();
    expect(t.overlay.stats.tickMs).toBeCloseTo(1, 10); // 10 % of the first 10 ms
    t.beforeRender();
    clock.now = 30;
    t.afterRender();
    expect(t.overlay.stats.renderMs).toBeCloseTo(2, 10);
    t.destroy();
  });
});
