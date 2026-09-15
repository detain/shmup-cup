/**
 * `core/scenes` — the secret input codes of plan M3-01 (shmup_feat.md §4 "[P2] Konami-code-style
 * secrets", original sequences of the four directions): the {@link SecretCodeTracker} itself, the
 * title's EXTRA SHIPS (the next games start with seven ships, the run counts as assisted) and
 * EXTRA EDIT (unlocked in the save) codes, and the pause menu's FULL POWER (once per World,
 * recorded as a replay action) and SELF DESTRUCT codes.
 */
import { describe, expect, it } from 'vitest';
import { Action } from '../../src/input/index.js';
import { AssistFlag, RunAction } from '../../src/replay/index.js';
import {
  SECRET_CODES,
  SECRET_CODE_LENGTH,
  SECRET_SHIPS,
  SecretCode,
  SecretCodeTracker,
} from '../../src/scenes/index.js';
import { MainWeapon } from '../../src/weapons/index.js';
import { frontEndContent } from '../helpers/front-end.js';
import { FrontEndSession } from '../helpers/front-end-session.js';

const { db } = frontEndContent({ demos: false });

/**
 * Presses a code's directions one by one (a tick down, a tick up each).
 *
 * @param s - The session.
 * @param code - A {@link SecretCode}.
 */
function enter(s: FrontEndSession, code: number): void {
  for (const direction of SECRET_CODES[code]) s.press(direction);
}

describe('core/scenes SecretCodeTracker (M3-01)', () => {
  it('matches the last eight single-direction presses of the codes a screen accepts', () => {
    expect(SECRET_CODES).toHaveLength(4);
    for (const code of SECRET_CODES) expect(code).toHaveLength(SECRET_CODE_LENGTH);
    // Original sequences: never the ↑↑↓↓←→←→ of another game.
    const konami = [
      Action.Up,
      Action.Up,
      Action.Down,
      Action.Down,
      Action.Left,
      Action.Right,
      Action.Left,
      Action.Right,
    ];
    for (const code of SECRET_CODES) expect(code).not.toEqual(konami);
    const tracker = new SecretCodeTracker();
    // Extra presses before the code do not matter (the history keeps the last eight).
    let found: number = SecretCode.None;
    for (const press of [Action.Left, Action.Left, ...SECRET_CODES[SecretCode.ExtraShips]]) {
      found = tracker.feed(press, SecretCode.ExtraShips, SecretCode.ExtraEdit);
    }
    expect(found).toBe(SecretCode.ExtraShips);
    // A code of another screen is not accepted here.
    for (const press of SECRET_CODES[SecretCode.FullPower]) {
      found = tracker.feed(press, SecretCode.ExtraShips, SecretCode.ExtraEdit);
    }
    expect(found).toBe(SecretCode.None);
    // OK (or two directions at once) starts over.
    const code = SECRET_CODES[SecretCode.ExtraEdit];
    for (let i = 0; i < 4; i++) tracker.feed(code[i], 0, 3);
    tracker.feed(Action.Confirm, 0, 3);
    for (let i = 4; i < 8; i++) found = tracker.feed(code[i], 0, 3);
    expect(found).toBe(SecretCode.None);
    tracker.feed(Action.Up | Action.Left, 0, 3);
    expect(tracker.feed(0, 0, 3)).toBe(SecretCode.None);
    for (const press of code) found = tracker.feed(press, 0, 3);
    expect(found).toBe(SecretCode.ExtraEdit);
  });
});

describe('core/scenes secret codes on the title (M3-01)', () => {
  it('EXTRA SHIPS: the next games start with seven ships, assisted', () => {
    const s = new FrontEndSession({ db });
    s.hold(0, 4);
    const lives = s.flow.gameConfig.startingLives;
    expect(lives).toBeLessThan(SECRET_SHIPS);
    enter(s, SecretCode.ExtraShips);
    expect(s.flow.gameConfig.startingLives).toBe(SECRET_SHIPS);
    expect(s.uiTexts()).toContain(`${SECRET_SHIPS} SHIPS!`);
    s.start();
    expect(s.game.world.players[0].lives).toBe(SECRET_SHIPS);
    expect(s.flow.run.assists & AssistFlag.Secret).toBe(AssistFlag.Secret);
  });

  it('EXTRA EDIT: unlocked in the save for good', () => {
    const s = new FrontEndSession({ db });
    expect(s.save.unlocked('extraEdit')).toBe(false);
    s.press(Action.Confirm); // the codes work on the menu too
    s.hold(0, 4);
    enter(s, SecretCode.ExtraEdit);
    expect(s.save.unlocked('extraEdit')).toBe(true);
    expect(s.save.unlocked('loop2')).toBe(false);
    expect(s.uiTexts()).toContain('EXTRA EDIT UNLOCKED');
  });
});

describe('core/scenes secret codes in the pause menu (M3-01)', () => {
  /**
   * A game in progress with its ship in play.
   *
   * @returns The session.
   */
  const playing = (): FrontEndSession => {
    const s = new FrontEndSession({ db });
    s.start();
    s.hold(0, 60); // the fly-in
    expect(s.game.world.players[0].state).toBe('alive');
    return s;
  };

  it('FULL POWER powers the ship up once per World and resumes; the replay records it', () => {
    const s = playing();
    const world = s.game.world;
    s.press(Action.Pause);
    expect(s.top).toBe('pause');
    enter(s, SecretCode.FullPower);
    expect(s.top).toBe('game');
    const loadout = world.weapons.loadouts[0];
    expect([loadout.main, loadout.missile, loadout.options]).toEqual([MainWeapon.Laser, true, 4]);
    expect(s.flow.run.assists & AssistFlag.Secret).toBe(AssistFlag.Secret);
    const actions = s.flow.recorder.segment;
    expect(actions.actionCount).toBe(1);
    // Once per World: a second code in the same World does nothing (the menu stays).
    loadout.options = 0;
    s.press(Action.Pause);
    enter(s, SecretCode.FullPower);
    expect(s.top).toBe('pause');
    expect(loadout.options).toBe(0);
    expect(RunAction.FullPower).toBe(2);
  });

  it('SELF DESTRUCT destroys the ship on the next tick', () => {
    const s = playing();
    const ship = s.game.world.players[0];
    const lives = ship.lives;
    s.press(Action.Pause);
    enter(s, SecretCode.SelfDestruct);
    expect(s.top).toBe('game');
    s.hold(0, 2);
    expect(ship.state).toBe('dying');
    expect(ship.lives).toBe(lives - 1);
    // Not an assist: the run is not marked.
    expect(s.flow.run.assists & AssistFlag.Secret).toBe(0);
  });
});
