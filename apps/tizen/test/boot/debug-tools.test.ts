/**
 * The TV app's debug tools (plan M1-19): `tizenDebugTools(win, buildId)` gives the shell's tools
 * the remote unlock (nothing works until Pause, Ch+, Ch+, Ch+), registers the remote's number keys
 * 1–8 ({@link DEBUG_REMOTE_KEYS}) with `tvinputdevice` exactly once — on the unlock, never before
 * — and then the number keys run the eight commands. Outside a TV (no `window.tizen`) the unlock
 * still works. Also: the key names match the shell's digit key codes.
 */
import {
  DebugCommand,
  EMPTY_CONTENT_DB,
  createGame,
  createHeadlessPlatform,
  type Game,
} from '@shmup/core';
import { createLayerStack, type PixiRenderer } from '@shmup/render-pixi';
import { DEBUG_KEYS, type DebugTools } from '@shmup/shell';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEBUG_REMOTE_KEYS, tizenDebugTools } from '../../src/boot/index.js';

/** A renderer-like object (no atlas: the overlay exists but draws nothing). */
const renderer = {
  atlas: null,
  layers: createLayerStack(),
  webGLVersion: 1,
  drawCalls: -1,
  particles: null,
} as unknown as PixiRenderer;

/** A window with `keydown` events and, optionally, the Tizen key registration API. */
class FakeWindow extends EventTarget {
  readonly registered: string[][] = [];
  tizen?: unknown;

  /**
   * @param withTizen - Provide `window.tizen.tvinputdevice`.
   */
  constructor(withTizen: boolean) {
    super();
    if (withTizen) {
      this.tizen = {
        tvinputdevice: {
          registerKey: (name: string) => this.registered.push([name]),
          registerKeyBatch: (names: string[]) => this.registered.push(names.slice()),
        },
      };
    }
  }

  /**
   * Dispatches a remote keydown (key code only, like the Samsung remote).
   *
   * @param keyCode - Legacy key code.
   * @returns Whether the default was prevented.
   */
  key(keyCode: number): boolean {
    const event = Object.assign(new Event('keydown', { cancelable: true }), {
      keyCode,
      code: '',
      repeat: false,
    });
    this.dispatchEvent(event);
    return event.defaultPrevented;
  }

  /** Enters Pause, Ch+, Ch+, Ch+. */
  unlock(): void {
    for (const keyCode of [10252, 427, 427, 427]) this.key(keyCode);
  }
}

let game: Game;

/**
 * Creates the TV tools on a fake window.
 *
 * @param win - The window.
 * @returns The tools.
 */
function create(win: FakeWindow): DebugTools {
  return tizenDebugTools(
    win as unknown as Window,
    'tv1234',
  )({
    game,
    renderer,
    win: win as unknown as Window,
    now: () => 0,
    bootMs: 900,
    sceneId: () => 'game',
    visibleWorld: () => game.world,
  });
}

beforeEach(() => {
  game = createGame(createHeadlessPlatform(), {}, EMPTY_CONTENT_DB);
});

describe('tizen/boot debug tools (M1-19)', () => {
  it('names the remote number keys 1–8, matching the shell’s digit key codes', () => {
    expect(DEBUG_REMOTE_KEYS).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(Object.isFrozen(DEBUG_REMOTE_KEYS)).toBe(true);
    expect(DEBUG_REMOTE_KEYS.map((name) => name.charCodeAt(0))).toEqual(
      DEBUG_KEYS.map((binding) => binding.digitKeyCode),
    );
  });

  it('registers the number keys once, on the unlock, then runs the commands from them', () => {
    const win = new FakeWindow(true);
    const tools = create(win);
    expect(tools.unlocked).toBe(false);
    expect(tools.api.buildId).toBe('tv1234');
    // Locked: a number key does nothing and nothing is registered.
    expect(win.key(50)).toBe(false);
    expect(game.debug.godMode).toBe(false);
    expect(win.registered).toEqual([]);
    win.unlock();
    expect(tools.unlocked).toBe(true);
    expect(game.debug.overlay).toBe(true);
    expect(win.registered).toEqual([[...DEBUG_REMOTE_KEYS]]);
    expect(win.key(50)).toBe(true);
    expect(game.debug.godMode).toBe(true);
    // The sequence again: the overlay toggles, the keys are not registered twice.
    win.unlock();
    expect(game.debug.overlay).toBe(false);
    expect(win.registered).toHaveLength(1);
    tools.destroy();
  });

  it('unlocks outside a TV too (no window.tizen), without registering anything', () => {
    const win = new FakeWindow(false);
    const tools = create(win);
    win.unlock();
    expect(tools.unlocked).toBe(true);
    expect(win.key(52)).toBe(true); // 4 = frame advance
    expect(game.debug.frameAdvance).toBe(true);
    expect(tools.api.run(DebugCommand.FrameAdvance)).toBe(true);
    expect(game.debug.frameAdvance).toBe(false);
    tools.destroy();
  });
});
