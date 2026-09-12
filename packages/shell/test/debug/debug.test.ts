/**
 * Tests for the shell's debug tools (plan M1-19) with a fake window and a renderer-like host (no
 * WebGL): F1–F8 on the web (defaults prevented, toggles ignore auto-repeat, the step repeats), the
 * TV's Pause, Ch+, Ch+, Ch+ unlock (nothing before it; a wrong key or a slow sequence starts over;
 * the overlay and the unlock callback once; then 1–8 and F1–F8; the sequence again toggles the
 * overlay), `window.__shmupDebug`, and the frame hooks (FPS and the frame graph from rAF times, the
 * tick and render times from the clock, counters and outlines only for a World on screen, the
 * renderer's draw calls and particles), destroy.
 */
import {
  DebugCommand,
  EMPTY_CONTENT_DB,
  createGame,
  createHeadlessPlatform,
  hashWorld,
  type Game,
  type World,
} from '@shmup/core';
import { createLayerStack, type PixiRenderer } from '@shmup/render-pixi';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEBUG_GLOBAL,
  DEBUG_KEYS,
  DEBUG_UNLOCK_SEQUENCE,
  DEBUG_UNLOCK_WINDOW_MS,
  createDebugTools,
  debugToolsFactory,
  moduleInfo,
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
 * A renderer-like object: no atlas (the overlay exists but draws nothing), a layer stack, a
 * WebGL version, draw calls and a particle pool's counters.
 */
const renderer = {
  atlas: null,
  layers: createLayerStack(),
  webGLVersion: 2,
  drawCalls: 23,
  particles: { liveCount: 12, capacity: 256 },
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
      bootMs: 1234.4,
      sceneId: () => 'game',
      visibleWorld: () => shownWorld,
    },
    { onUnlock: () => unlocks++, ...options },
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

beforeEach(() => {
  win = new EventTarget() as EventTarget & Record<string, unknown>;
  game = createGame(createHeadlessPlatform(), {}, EMPTY_CONTENT_DB);
  shownWorld = game.world;
  unlocks = 0;
  clock.now = 0;
});

describe('shell/debug keys (web)', () => {
  it('describes itself and binds F1–F8 to the eight commands', () => {
    expect(moduleInfo.name).toBe('debug');
    expect(DEBUG_KEYS.map((k) => k.code)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']);
    expect(DEBUG_KEYS.map((k) => k.keyCode)).toEqual([112, 113, 114, 115, 116, 117, 118, 119]);
    expect(new Set(DEBUG_KEYS.map((k) => k.command)).size).toBe(8);
  });

  it('runs the commands on F1–F8 (by code or key code) and prevents their default', () => {
    const t = tools();
    expect(t.unlocked).toBe(true);
    expect(key(112, 'F1')).toBe(true);
    expect(game.debug.overlay).toBe(true);
    expect(key(113)).toBe(true); // key code only
    expect(game.debug.godMode).toBe(true);
    key(0, 'F3');
    expect(game.debug.showHitboxes).toBe(true);
    key(117, 'F6');
    expect(game.debug.slowMo).toBe(2);
    // F5 steps (frame advance on); a held F5 keeps stepping, a held F2 does not toggle again.
    key(116, 'F5');
    key(116, 'F5', true);
    expect(game.debug.frameAdvance).toBe(true);
    expect(key(113, 'F2', true)).toBe(true);
    expect(game.debug.godMode).toBe(true);
    game.frame(0);
    expect(game.frame(16)).toBe(0); // the steps were queued before the switch settled
    game.requestStep(2);
    expect(game.frame(33)).toBe(2);
    // Other keys pass through untouched; digits are not debug keys on the web.
    expect(key(38, 'ArrowUp')).toBe(false);
    expect(key(49, 'Digit1')).toBe(false);
    expect(game.debug.overlay).toBe(true);
    t.destroy();
  });

  it('publishes window.__shmupDebug and removes it (and the keys) on destroy', () => {
    const t = tools({ buildId: 'cafe123' });
    const api = win[DEBUG_GLOBAL] as ShmupDebugApi;
    expect(api).toBe(t.api);
    expect(api.sceneId).toBe('game');
    expect(api.buildId).toBe('cafe123');
    expect(api.flags).toBe(game.debug);
    expect(api.game).toBe(game);
    game.step();
    expect([api.tick, api.worldTick]).toEqual([1, 1]);
    expect(api.run(DebugCommand.GodMode)).toBe(true);
    expect(game.debug.godMode).toBe(true);
    t.destroy();
    t.destroy();
    expect(DEBUG_GLOBAL in win).toBe(false);
    expect(key(112, 'F1')).toBe(false);
    expect(game.debug.overlay).toBe(false);
    expect(
      renderer.layers.layers.some((layer) => layer.children.includes(t.overlay.container)),
    ).toBe(false);
  });

  it('the factory creates the same tools', () => {
    const factory = debugToolsFactory({ buildId: 'x' });
    const t = factory({
      game,
      renderer,
      win: win as unknown as Window,
      now: () => 0,
      bootMs: 0,
      sceneId: () => 'title',
      visibleWorld: () => null,
    });
    expect(t.api.buildId).toBe('x');
    expect(t.api.sceneId).toBe('title');
    t.destroy();
  });
});

describe('shell/debug unlock sequence (TV)', () => {
  /** Enters Pause, Ch+, Ch+, Ch+. */
  const sequence = (): void => {
    for (const step of DEBUG_UNLOCK_SEQUENCE) key(step[0]);
  };

  it('does nothing before Pause, Ch+, Ch+, Ch+; then 1–8 and F1–F8 work', () => {
    const t = tools({ unlock: 'sequence' });
    expect(t.unlocked).toBe(false);
    expect(t.api.unlocked).toBe(false);
    expect(key(112, 'F1')).toBe(false);
    expect(key(50)).toBe(false);
    expect([game.debug.overlay, game.debug.godMode]).toEqual([false, false]);
    // The sequence keys are never swallowed (Pause still pauses the game).
    expect(key(10252)).toBe(false);
    expect(key(427)).toBe(false);
    key(427);
    expect(key(427)).toBe(false);
    expect(t.unlocked).toBe(true);
    expect(game.debug.overlay).toBe(true);
    expect(unlocks).toBe(1);
    expect(key(50)).toBe(true); // 2 = god mode
    expect(game.debug.godMode).toBe(true);
    expect(key(115, 'F4')).toBe(true);
    expect(game.debug.frameAdvance).toBe(true);
    // The sequence again toggles the overlay (and never calls the unlock again).
    sequence();
    expect(game.debug.overlay).toBe(false);
    expect(unlocks).toBe(1);
    t.destroy();
  });

  it('starts over on a wrong key, accepts a keyboard Pause, and must finish within 3 s', () => {
    const t = tools({ unlock: 'sequence' });
    key(10252);
    key(427);
    key(38); // a wrong key
    key(427);
    key(427);
    expect(t.unlocked).toBe(false);
    key(19); // Pause on a keyboard
    key(427);
    key(427);
    clock.now = DEBUG_UNLOCK_WINDOW_MS + 1;
    key(427); // too late: this Ch+ starts nothing
    expect(t.unlocked).toBe(false);
    key(10252);
    key(10252); // Pause again restarts the sequence
    key(427);
    key(427);
    key(427, '', true); // an auto-repeat does not count
    expect(t.unlocked).toBe(false);
    key(427);
    expect(t.unlocked).toBe(true);
    t.destroy();
  });
});

describe('shell/debug frame hooks', () => {
  it('measures FPS, tick and render times and fills the overlay from the World on screen', () => {
    const t = tools();
    const stats = t.overlay.stats;
    expect([stats.webGLVersion, stats.bootMs]).toEqual([2, 1234.4]);
    for (let i = 0; i < 120; i++) {
      clock.now = i * 20;
      t.beginFrame(1000 + i * (1000 / 60));
      clock.now += 2;
      t.endTicks();
      t.beforeRender();
      clock.now += 5;
      t.afterRender();
    }
    expect(stats.fps).toBeCloseTo(60, 3);
    expect(stats.tickMs).toBeCloseTo(2, 3);
    expect(stats.renderMs).toBeCloseTo(5, 3);
    expect(t.overlay.graph.count).toBe(60);
    expect(stats.drawCalls).toBe(23);
    expect([stats.particles, stats.particleCapacity]).toEqual([12, 256]);
    expect(t.counters.hashTick).toBe(0);
    expect(t.counters.stateHash).toBe(hashWorld(game.world));
    // No World on screen: the counters stay as they were.
    shownWorld = null;
    game.step();
    t.beforeRender();
    expect(t.counters.tick).toBe(0);
    t.destroy();
  });
});
