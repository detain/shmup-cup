/**
 * The ship select (plan M2-05, shmup_feat.md §5 "ship selection", §17): after the difficulty menu,
 * the content's ships (KESTREL — the meter, then the weapon select —, MANTA — Direct mode, straight
 * into the game), their panel texts, Back to the difficulty menu (and from the weapon select back to
 * the ship select), the chosen ship kept for RETRY and every difficulty, the per-mode session
 * hi-scores, and the skip with a single ship.
 */
import { describe, expect, it } from 'vitest';
import type { GameConfig } from '../../src/config/index.js';
import type { ContentDb } from '../../src/data/index.js';
import { createGame, type Game } from '../../src/game/index.js';
import { createHeadlessPlatform, type HeadlessPlatform } from '../../src/platform/index.js';
import { Action, commitPlayerInput, type ActionMask } from '../../src/input/index.js';
import { DrawOp } from '../../src/presentation/index.js';
import { SHIP_MODE_HINTS, SHIP_MODE_LABELS, type SceneFlow } from '../../src/scenes/index.js';
import { directDb } from '../helpers/direct.js';

/** The shared content: the KESTREL and the MANTA. */
const DB = directDb();

/** A headless session with the scene flow on the title. */
class Session {
  readonly platform: HeadlessPlatform = createHeadlessPlatform();
  readonly game: Game;
  readonly flow: SceneFlow;

  /**
   * Creates the session.
   *
   * @param config - Config overrides (the still stage by default).
   * @param content - The content.
   */
  constructor(config: Partial<GameConfig> = {}, content: ContentDb = DB) {
    this.game = createGame(this.platform, { seed: 3, stage: 'still', ...config }, content, {
      scenes: 'title',
    });
    this.flow = this.game.scenes!;
  }

  /** Scene ids, bottom to top. */
  get ids(): string[] {
    const out: string[] = [];
    for (let i = 0; i < this.flow.stack.depth; i++) out.push(this.flow.stack.sceneAt(i)!.id);
    return out;
  }

  /**
   * Runs ticks with a held mask.
   *
   * @param held - Held actions.
   * @param ticks - Ticks.
   */
  hold(held: ActionMask, ticks = 1): void {
    for (let t = 0; t < ticks; t++) {
      commitPlayerInput(this.platform.snapshot.players[0], held);
      this.game.step();
      this.game.renderFrame();
      this.game.events.clear();
    }
  }

  /**
   * Presses and releases an action.
   *
   * @param action - The action.
   */
  press(action: ActionMask): void {
    this.hold(action);
    this.hold(0);
  }

  /** PRESS OK, START, NORMAL: the ship select opens (its lock run out). */
  openShips(): void {
    this.press(Action.Confirm);
    this.press(Action.Confirm);
    this.hold(0, 2);
    this.press(Action.Confirm);
    this.hold(0, 2);
    expect(this.ids).toEqual(['title', 'difficulty', 'shipSelect']);
  }

  /**
   * The texts of the frame's UI list.
   *
   * @returns Its text commands' strings.
   */
  uiTexts(): string[] {
    const ui = this.game.renderFrame().ui;
    const out: string[] = [];
    for (let i = 0; i < ui.count; i++) {
      if (ui.op[i] === DrawOp.Text) out.push(ui.strings[ui.ref[i]] ?? '');
    }
    return out;
  }
}

describe('core/scenes the ship select (M2-05)', () => {
  it('lists the content`s ships and describes the focused one', () => {
    const s = new Session();
    s.openShips();
    const select = s.flow.shipSelect;
    expect(s.flow.ships.map((ship) => ship.id)).toEqual(['kestrel', 'manta']);
    expect(select.focused.id).toBe('kestrel');
    let texts = s.uiTexts();
    expect(texts).toContain('SHIP SELECT');
    expect(texts).toContain('KESTREL');
    expect(texts).toContain('MANTA');
    expect(texts).toContain(SHIP_MODE_LABELS[0]);
    for (const hint of SHIP_MODE_HINTS[0]) expect(texts).toContain(hint);
    s.press(Action.Down);
    expect(select.focused.id).toBe('manta');
    texts = s.uiTexts();
    expect(texts).toContain(SHIP_MODE_LABELS[1]);
    for (const hint of SHIP_MODE_HINTS[1]) expect(texts).toContain(hint);
    // The focused ship's picture (frame 0 of its sprite).
    const ui = s.game.renderFrame().ui;
    let pictured = false;
    for (let i = 0; i < ui.count; i++) {
      if (ui.op[i] === DrawOp.Sprite && ui.ref[i] === DB.ships[1].spriteId) pictured = true;
    }
    expect(pictured).toBe(true);
  });

  it('KESTREL opens the weapon select; Back returns to the ship select, then the difficulty menu', () => {
    const s = new Session();
    s.openShips();
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['title', 'difficulty', 'shipSelect', 'weaponSelect']);
    expect(s.flow.gameConfig).toMatchObject({ shipId: 'kestrel', powerUpMode: 'meter' });
    s.hold(0, 2);
    s.press(Action.Back);
    expect(s.ids).toEqual(['title', 'difficulty', 'shipSelect']);
    s.hold(0, 2);
    s.press(Action.Back);
    expect(s.ids).toEqual(['title', 'difficulty']);
  });

  it('MANTA starts the game at once in Direct mode, kept for every difficulty and for RETRY', () => {
    const s = new Session();
    s.openShips();
    s.press(Action.Down);
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['game']);
    expect(s.flow.ship).toEqual({ shipId: 'manta', powerUpMode: 'direct' });
    const world = s.flow.world;
    expect(world.config).toMatchObject({ shipId: 'manta', powerUpMode: 'direct', stage: 'still' });
    expect(world.ship.id).toBe('manta');
    expect(world.powerups.direct && world.weapons.direct).toBe(true);
    expect(s.flow.modeKey).toBe('direct-normal');
    // RETRY STAGE keeps the ship.
    s.press(Action.Pause);
    expect(s.ids).toEqual(['game', 'pause']);
    s.hold(0, 2);
    s.press(Action.Down);
    s.press(Action.Down);
    s.press(Action.Confirm); // RETRY STAGE
    expect(s.ids).toEqual(['game']);
    expect(s.flow.world).not.toBe(world);
    expect(s.flow.world.config.shipId).toBe('manta');
  });

  it('keeps one session hi-score per power-up mode and difficulty', () => {
    const s = new Session();
    s.openShips();
    s.press(Action.Down);
    s.press(Action.Confirm); // MANTA
    s.flow.world.scoring.board.scores[0].score = 12_340;
    s.flow.world.scoring.board.setHiScore(12_340);
    s.flow.setHiScore(12_340);
    expect(s.flow.hiScore).toBe(12_340);
    // Back to the title, then the KESTREL: its own (meter) hi-score.
    s.flow.stack.reset(s.flow.title);
    s.openShips();
    expect(s.flow.shipSelect.focused.id).toBe('manta'); // the last choice
    s.press(Action.Up);
    s.press(Action.Confirm); // KESTREL
    expect(s.flow.modeKey).toBe('meter-normal');
    expect(s.flow.hiScore).toBe(0);
  });

  it('opens focused on the host config`s ship', () => {
    const s = new Session({ shipId: 'manta', powerUpMode: 'direct' });
    s.openShips();
    expect(s.flow.shipSelect.focused.id).toBe('manta');
    expect(s.flow.ship).toBeNull();
  });

  it('is skipped with a single ship: the difficulty menu opens the weapon select (or the game)', () => {
    const single: ContentDb = {
      ...DB,
      ships: [DB.ships[0]],
      shipIndex: new Map([['kestrel', 0]]),
    };
    const meter = new Session({}, single);
    meter.press(Action.Confirm);
    meter.press(Action.Confirm);
    meter.hold(0, 2);
    meter.press(Action.Confirm);
    expect(meter.ids).toEqual(['title', 'difficulty', 'weaponSelect']);
    const direct = new Session({ powerUpMode: 'direct' }, single);
    direct.press(Action.Confirm);
    direct.press(Action.Confirm);
    direct.hold(0, 2);
    direct.press(Action.Confirm);
    expect(direct.ids).toEqual(['game']);
    expect(direct.flow.world.powerups.direct).toBe(true);
  });
});
