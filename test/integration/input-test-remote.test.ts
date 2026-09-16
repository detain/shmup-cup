/**
 * The INPUT TEST screen driven by the real Samsung remote (plan M3-02b acceptance: "the INPUT TEST
 * closes with three Back presses on the remote profile"): core's scene flow + `@shmup/input-web`
 * running the shipped `tizen-remote-safe` profile, key codes only (the TV sends no `code`), one
 * tick per frame, the binding context switched the way the shell does.
 *
 * Back (10009) and Play/Pause (10252) arrive as a `keydown` + `keyup` together when the button is
 * *released* (`docs/dev/input-probe-results.md` finding 4) — they can never be held, so the screen's
 * old "hold Pause 60 ticks" exit was unreachable on the hardware. Three presses inside the window
 * are the way out; the profile's `singleKey` model is what makes the rest of the screen honest
 * (OK never lights while an arrow is down).
 */
import {
  Action,
  INPUT_TEST_EXIT_PRESSES,
  INPUT_TEST_EXIT_TICKS,
  INPUT_TEST_EXIT_WINDOW_TICKS,
  DrawOp,
  ENGINE_SPRITES,
  KNOWN_SCRIPT_IDS,
  createGame,
  loadContent,
  type ContentDb,
  type Game,
  type InputContext,
  type Platform,
} from '@shmup/core';
import {
  INPUT_PROFILES_KIND,
  TIZEN_KEY_CODES,
  createWebInput,
  loadInputProfiles,
  type InputProfile,
  type WebInput,
} from '@shmup/input-web';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';

const STEP = 1000 / 60;

const CONTENT = readContentFiles();

/** The shipped content, validated like the shell does. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(CONTENT, {
    knownScripts: KNOWN_SCRIPT_IDS,
    extraSprites: ENGINE_SPRITES,
  });
  expect(issues).toEqual([]);
  return db;
})();

/** The shipped TV profile (`content/input/remote.input-profiles.json`). */
const REMOTE: InputProfile = (() => {
  const { profiles, issues } = loadInputProfiles(
    CONTENT.filter((file) => (file.data as { kind?: unknown }).kind === INPUT_PROFILES_KIND),
  );
  expect(issues).toEqual([]);
  const found = profiles.find((profile) => profile.id === 'tizen-remote-safe');
  if (found === undefined) throw new Error('no tizen-remote-safe profile');
  return found;
})();

/** A game on the title screen, driven by remote key codes through a real `WebInput`. */
class RemoteSession {
  readonly game: Game;
  private readonly input: WebInput;
  private readonly keys = new EventTarget();
  private frames = 0;
  private context: InputContext = 'game';

  /** Creates the session with the shipped remote profile applied. */
  constructor() {
    this.input = createWebInput({ keyTarget: this.keys, keyDevice: 'remote' });
    this.input.setProfile(REMOTE);
    const platform: Platform = {
      id: 'headless',
      input: this.input,
      storage: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
      audio: { unlock: () => Promise.resolve() },
      lifecycle: { onSuspend: () => {}, onResume: () => {} },
      exit: null,
      display: { cssWidth: 1920, cssHeight: 1080 },
      caps: { gamepad: false, remoteOnly: true, webgl2: false },
    };
    this.game = createGame(platform, { seed: 3, stage: 'zone-a' }, DB, { scenes: 'title' });
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
   * Runs frames (one tick each), keeping the binding context in step as the shell does.
   *
   * @param count - Frames.
   */
  run(count = 1): void {
    for (let i = 0; i < count; i++) {
      const next = this.game.inputContext;
      if (next !== this.context) {
        this.context = next;
        this.input.setContext(next);
      }
      this.frames++;
      this.game.frame(this.frames * STEP);
    }
  }

  /**
   * Dispatches a key event with an empty `code` and no `repeat` flag — what the TV sends.
   *
   * @param type - `keydown` / `keyup`.
   * @param keyCode - The key code.
   */
  key(type: 'keydown' | 'keyup', keyCode: number): void {
    this.keys.dispatchEvent(Object.assign(new Event(type), { code: '', keyCode, repeat: false }));
  }

  /**
   * A tap: down, a frame, up, a frame (what a D-pad or OK press looks like).
   *
   * @param keyCode - The key code.
   */
  press(keyCode: number): void {
    this.key('keydown', keyCode);
    this.run();
    this.key('keyup', keyCode);
    this.run();
  }

  /**
   * A release-only key (Back, Play/Pause, Mute): the keydown and the keyup arrive together, in
   * the same frame, when the button comes up (finding 4).
   *
   * @param keyCode - The key code.
   */
  release(keyCode: number): void {
    this.key('keydown', keyCode);
    this.key('keyup', keyCode);
    this.run();
  }

  /** The texts of the frame's UI list. */
  uiTexts(): string[] {
    const ui = this.game.renderFrame().ui;
    const out: string[] = [];
    for (let i = 0; i < ui.count; i++) {
      if (ui.op[i] === DrawOp.Text) out.push(ui.strings[ui.ref[i]]);
    }
    return out;
  }

  /**
   * Opens the INPUT TEST overlay on top of the title.
   *
   * @remarks
   * Pushed straight onto the scene stack: the menu route through OPTIONS → CONTROLS is the scene
   * suite's business (`scenes-controls.test.ts`), while this file is about what the *remote* can
   * deliver once the screen is open.
   */
  openInputTest(): void {
    const flow = this.game.scenes!;
    flow.stack.push(flow.inputTest);
    this.run();
    expect(this.ids[this.ids.length - 1]).toBe('inputTest');
  }
}

describe('integration: the INPUT TEST on the real remote (M3-02b)', () => {
  it('the shipped TV profile is the single-key, debounce-free one the probe measured', () => {
    expect(REMOTE.device).toBe('remote');
    expect(REMOTE.releaseDebounceTicks).toBe(0);
    expect(REMOTE.singleKey).toBe(true);
    // Guide (Ch rocker) and Extra (the screen button) are registrable so REBIND can capture them.
    expect(REMOTE.register).toContain('Guide');
    expect(REMOTE.register).toContain('Extra');
    // The volume keys are never registered.
    for (const forbidden of ['VolumeUp', 'VolumeDown']) {
      expect(REMOTE.register).not.toContain(forbidden);
    }
  });

  it.each([
    ['Back', TIZEN_KEY_CODES.Back],
    ['Play/Pause', TIZEN_KEY_CODES.MediaPlayPause],
  ])('closes on three %s presses — each one only a release', (_name, keyCode) => {
    const s = new RemoteSession();
    s.openInputTest();
    expect(s.uiTexts()).toContain('PAUSE X3 OR HOLD TO EXIT');
    for (let i = 1; i < INPUT_TEST_EXIT_PRESSES; i++) {
      s.release(keyCode);
      s.run(3);
      expect(s.ids[s.ids.length - 1], `after press ${String(i)}`).toBe('inputTest');
    }
    s.release(keyCode);
    expect(s.ids).toEqual(['title']);
  });

  it('can never reach the hold exit: a release-only key is one tick, however long it is held', () => {
    const s = new RemoteSession();
    s.openInputTest();
    const test = s.game.scenes!.inputTest;
    // Whatever the thumb does, the remote sends one keydown + keyup together when the button comes
    // up, so the 60-tick hold bar can never fill. Ten of them, spread so the press window lapses
    // in between, leave the screen exactly where it was.
    for (let i = 0; i < 10; i++) {
      s.release(TIZEN_KEY_CODES.Back);
      expect(test.holdTicks, `press ${String(i)}`).toBeLessThan(INPUT_TEST_EXIT_TICKS);
      s.run(INPUT_TEST_EXIT_WINDOW_TICKS + 2);
      expect(test.presses, `press ${String(i)}`).toBe(0);
      expect(s.ids[s.ids.length - 1], `press ${String(i)}`).toBe('inputTest');
    }
    expect(test.holdTicks).toBeLessThan(INPUT_TEST_EXIT_TICKS);
  });

  it('forgets the presses when the gap between two of them is too long', () => {
    const s = new RemoteSession();
    s.openInputTest();
    const test = s.game.scenes!.inputTest;
    s.release(TIZEN_KEY_CODES.Back);
    s.release(TIZEN_KEY_CODES.Back);
    expect(test.presses).toBe(2);
    s.run(INPUT_TEST_EXIT_WINDOW_TICKS + 2);
    expect(test.presses).toBe(0);
    s.release(TIZEN_KEY_CODES.Back);
    expect(s.ids[s.ids.length - 1]).toBe('inputTest');
  });

  it('keeps counting while each press lands inside the window of the one before it', () => {
    const s = new RemoteSession();
    s.openInputTest();
    // The window restarts on every press, so three slow presses still leave.
    for (let i = 1; i < INPUT_TEST_EXIT_PRESSES; i++) {
      s.release(TIZEN_KEY_CODES.Back);
      s.run(INPUT_TEST_EXIT_WINDOW_TICKS - 2);
      expect(s.ids[s.ids.length - 1], `press ${String(i)}`).toBe('inputTest');
    }
    s.release(TIZEN_KEY_CODES.Back);
    expect(s.ids).toEqual(['title']);
  });

  it('lights one action at a time: OK never arrives while an arrow is held', () => {
    const s = new RemoteSession();
    s.openInputTest();
    const test = s.game.scenes!.inputTest;
    s.key('keydown', TIZEN_KEY_CODES.ArrowUp);
    s.run();
    expect(test.lit & Action.Up).toBe(Action.Up);
    // OK during the hold: the hardware delivers nothing, so nothing lights (`singleKey`).
    s.key('keydown', TIZEN_KEY_CODES.Enter);
    s.key('keyup', TIZEN_KEY_CODES.Enter);
    s.run();
    expect(test.lit & Action.PowerUp).toBe(0);
    expect(test.lit & Action.Up).toBe(Action.Up);
    // Once the arrow is up, OK lights normally.
    s.key('keyup', TIZEN_KEY_CODES.ArrowUp);
    s.run(2);
    s.press(TIZEN_KEY_CODES.Enter);
    expect(test.lit & Action.PowerUp).toBe(Action.PowerUp);
  });

  it('holds one arrow through the measured flagless auto-repeat stream', () => {
    const s = new RemoteSession();
    s.openInputTest();
    const test = s.game.scenes!.inputTest;
    s.key('keydown', TIZEN_KEY_CODES.ArrowRight);
    s.run(21); // the first repeat comes after ~355 ms
    let repeats = 0;
    for (let i = 0; i < 8; i++) {
      s.key('keydown', TIZEN_KEY_CODES.ArrowRight); // a repeat: flagless keydown
      repeats++;
      s.run(6 + (i % 3)); // ~6.5 ticks apart, jittery
      expect(test.lit & Action.Right, `repeat ${String(repeats)}`).toBe(Action.Right);
    }
    s.key('keyup', TIZEN_KEY_CODES.ArrowRight);
    s.run(12); // past the press flash
    expect(test.lit & Action.Right).toBe(0);
  });
});
