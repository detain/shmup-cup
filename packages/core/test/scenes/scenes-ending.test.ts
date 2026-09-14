/**
 * The M2-14 ending screens and credits through the scene flow, headless, on a small campaign
 * (start `S` → upper `U` | lower `L`, both final) whose endings name sprite scenes and epilogues,
 * whose final stages name the ending and credits themes, and whose file has credits:
 *
 * - the ending the run's flags pick (a flawless run's first; a boss's escape; the plain one),
 * - the story: the scene's sprites, the epilogue's lines one every `ENDING_LINE_TICKS`, OK (after
 *   the lock) showing them all, then the result card; the story and the card timing out;
 * - the ending and credits themes (the final stage's `music.ending` / `music.credits` cues),
 * - the credits: the rows scrolling up, titles in the title colour, OK / Back after the lock or the
 *   end of the hold → the title;
 * - the deep's scene: the flagship sinking, or sailing off after an escape; the dawn of a flawless
 *   run in both scenes.
 */
import { describe, expect, it } from 'vitest';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { MUSIC_CUES, SimEventKind } from '../../src/events/index.js';
import { createGame, type Game } from '../../src/game/index.js';
import { Action, commitPlayerInput, type ActionMask } from '../../src/input/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';
import { DrawOp } from '../../src/presentation/index.js';
import {
  CREDITS_HOLD_TICKS,
  CREDITS_LOCK_TICKS,
  CREDITS_ROW_HEIGHT,
  CREDITS_SCROLL_TICKS,
  ENDING_LINE_TICKS,
  ENDING_LOCK_TICKS,
  ENDING_STORY_HOLD_TICKS,
  ENDING_TIMEOUT_TICKS,
  RunFlag,
  type SceneFlow,
} from '../../src/scenes/index.js';
import { UI_COLORS, resolveUiSprites } from '../../src/ui/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
import { shipped, stage } from '../helpers/campaign.js';

/** The campaign: S → U | L, endings with scenes and epilogues, and credits. */
const CAMPAIGN: ContentFile = {
  path: 'campaign/test.campaign.json',
  data: {
    formatVersion: 1,
    kind: 'campaign',
    id: 'test',
    start: 's',
    zones: [
      { id: 's', label: 'S', name: 'START ZONE', stage: 't-s' },
      { id: 'u', label: 'U', name: 'UPPER ZONE', stage: 't-u' },
      { id: 'l', label: 'L', name: 'LOWER ZONE', stage: 't-l' },
    ],
    edges: [
      { from: 's', to: 'u' },
      { from: 's', to: 'l' },
    ],
    endings: [
      {
        id: 'u-dawn',
        name: 'UPPER AT DAWN',
        zone: 'u',
        all: ['noDeath'],
        scene: 'citadel',
        text: ['LINE ONE.', 'LINE TWO.', 'LINE THREE.'],
      },
      { id: 'u', name: 'UPPER END', zone: 'u', scene: 'citadel', text: ['PLAIN.'] },
      {
        id: 'l-escape',
        name: 'IT SAILED OFF',
        zone: 'l',
        all: ['bossEscaped'],
        scene: 'abyss',
        text: ['GONE.'],
      },
      { id: 'l', name: 'LOWER END', zone: 'l', scene: 'abyss' },
    ],
    credits: [{ title: 'TEST CREDITS', lines: ['FIRST ROW', 'SECOND ROW'] }, { title: 'THE END' }],
  },
};

/** The final stages' music: their own ending and credits themes. */
const FINAL_MUSIC = { stage: 'Stage', boss: 'Boss', ending: 'Ending', credits: 'Credits' };

/**
 * The content.
 *
 * @returns The DB.
 */
function content(): ContentDb {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      CAMPAIGN,
      stage('t-s'),
      stage('t-u', { music: FINAL_MUSIC }),
      stage('t-l', { music: FINAL_MUSIC }),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
}

/** A headless campaign session. */
class Session {
  readonly game: Game;
  readonly flow: SceneFlow;
  readonly platform = createHeadlessPlatform();
  /** Drained events: `[kind, id, param]`. */
  readonly events: Array<[number, number, number]> = [];

  /** Starts a game on the start zone (god mode: no ship lost). */
  constructor() {
    this.game = createGame(this.platform, { seed: 11, stage: 't-s' }, content(), {
      scenes: 'game',
    });
    this.flow = this.game.scenes as SceneFlow;
    this.game.debug.godMode = true;
  }

  /** The top scene's id. */
  get top(): string | undefined {
    return this.flow.stack.top?.id;
  }

  /**
   * Runs ticks with a held mask.
   *
   * @param held - Actions held.
   * @param ticks - Ticks.
   */
  hold(held: ActionMask, ticks = 1): void {
    for (let t = 0; t < ticks; t++) {
      commitPlayerInput(this.platform.snapshot.players[0], held);
      this.game.step();
      this.game.events.drain((e) => {
        this.events.push([e.kind, e.id, e.param]);
      });
    }
  }

  /**
   * One press (a tick down, a tick up).
   *
   * @param action - The action.
   */
  press(action: ActionMask): void {
    this.hold(action);
    this.hold(0);
  }

  /**
   * Runs until a scene is on top (or a limit).
   *
   * @param id - Scene id.
   * @param limit - Tick limit.
   */
  until(id: string, limit = 3000): void {
    for (let i = 0; i < limit && this.top !== id; i++) this.hold(0);
    expect(this.top).toBe(id);
  }

  /**
   * Plays to the ending of a final zone: the start zone, its tally, the map's exit (0 = upper),
   * the final zone and its tally.
   *
   * @param down - Take the lower exit.
   * @param flags - Run flags to add before the final zone's clear (a boss's escape).
   */
  toEnding(down = false, flags = 0): void {
    this.until('stageClear');
    this.press(Action.Confirm);
    this.until('map');
    this.hold(0, 3);
    if (down) this.press(Action.Down);
    this.press(Action.Confirm);
    this.until('game');
    this.flow.run.flags |= flags;
    this.until('stageClear');
    this.press(Action.Confirm);
    expect(this.top).toBe('ending');
  }

  /**
   * The frame's UI list, refreshed.
   *
   * @returns The list.
   */
  ui(): ReturnType<Game['renderFrame']>['ui'] {
    return this.game.renderFrame().ui;
  }

  /**
   * The texts of the frame's UI list.
   *
   * @returns The strings of its text commands.
   */
  uiTexts(): string[] {
    const ui = this.ui();
    const out: string[] = [];
    for (let i = 0; i < ui.count; i++) {
      if (ui.op[i] === DrawOp.Text) out.push(ui.strings[ui.ref[i]]);
    }
    return out;
  }

  /**
   * The positions of one sprite's commands in the frame's UI list.
   *
   * @param sprite - Sprite id.
   * @returns `[x, y]` per command.
   */
  spriteAt(sprite: number): Array<[number, number]> {
    const ui = this.ui();
    const out: Array<[number, number]> = [];
    for (let i = 0; i < ui.count; i++) {
      if (ui.op[i] === DrawOp.Sprite && ui.ref[i] === sprite) out.push([ui.x[i], ui.y[i]]);
    }
    return out;
  }

  /**
   * The music events since an index.
   *
   * @param from - First event index.
   * @returns Their cues.
   */
  music(from = 0): number[] {
    return this.events.slice(from).flatMap((e) => (e[0] === SimEventKind.Music ? [e[1]] : []));
  }
}

describe('core/scenes ending screens and credits (M2-14)', () => {
  it('plays the flawless ending: its scene, the epilogue line by line, the card, the credits, the title', () => {
    const s = new Session();
    const from = s.events.length;
    s.toEnding();
    expect(s.flow.run.ending?.id).toBe('u-dawn');
    expect(s.flow.run.endingFlags & RunFlag.NoDeath).toBe(RunFlag.NoDeath);
    // The final stage's ending theme.
    expect(s.music(from)).toContain(MUSIC_CUES.Ending);
    const sprites = resolveUiSprites(s.game.content);
    expect(sprites.endingCitadel).toBeGreaterThanOrEqual(0);
    // The citadel scene: the fortress, the dawn sun (a flawless run), the ship.
    expect(s.spriteAt(sprites.endingCitadel)).toHaveLength(1);
    expect(s.spriteAt(sprites.endingSun)).toHaveLength(1);
    expect(s.spriteAt(s.game.world.ship.spriteId).length).toBe(1);
    // No line yet; one every ENDING_LINE_TICKS.
    expect(s.uiTexts()).not.toContain('LINE ONE.');
    s.hold(0, ENDING_LINE_TICKS);
    expect(s.uiTexts()).toContain('LINE ONE.');
    expect(s.uiTexts()).not.toContain('LINE TWO.');
    s.hold(0, ENDING_LINE_TICKS);
    expect(s.uiTexts()).toEqual(expect.arrayContaining(['LINE ONE.', 'LINE TWO.']));
    // Blasts go off over the citadel as the scene plays.
    expect(s.spriteAt(sprites.endingBlast).length).toBeGreaterThan(0);
    // OK (past the lock) shows every line at once, OK again the result card.
    s.press(Action.Confirm);
    expect(s.uiTexts()).toEqual(expect.arrayContaining(['LINE ONE.', 'LINE TWO.', 'LINE THREE.']));
    s.press(Action.Confirm);
    expect(s.top).toBe('ending');
    expect(s.flow.ending.phase).toBe(1);
    expect(s.uiTexts()).toEqual(
      expect.arrayContaining(['ENDING', 'UPPER AT DAWN', 'ROUTE', 'S U', 'NO MISS']),
    );
    expect(s.uiTexts()).not.toContain('OK: CREDITS'); // locked
    s.press(Action.Confirm);
    expect(s.top).toBe('ending');
    s.hold(0, ENDING_LOCK_TICKS);
    expect(s.uiTexts()).toContain('OK: CREDITS');
    const before = s.events.length;
    s.press(Action.Confirm);
    expect(s.top).toBe('credits');
    expect(s.music(before)).toContain(MUSIC_CUES.Credits);
    // The rows start below the screen and scroll up.
    expect(s.uiTexts()).toEqual([]);
    s.hold(0, CREDITS_SCROLL_TICKS * 6);
    expect(s.uiTexts()).toEqual(['TEST CREDITS']);
    s.hold(0, CREDITS_SCROLL_TICKS * CREDITS_ROW_HEIGHT * 3);
    expect(s.uiTexts()).toEqual(['TEST CREDITS', 'FIRST ROW', 'SECOND ROW']);
    // Titles in the title colour, lines in the text colour.
    const ui = s.ui();
    for (let i = 0; i < ui.count; i++) {
      if (ui.op[i] !== DrawOp.Text) continue;
      const title = ui.strings[ui.ref[i]] === 'TEST CREDITS';
      expect(ui.color[i]).toBe(title ? UI_COLORS.title : UI_COLORS.text);
    }
    s.press(Action.Confirm); // past the lock by now
    expect(s.top).toBe('title');
  });

  it('times the story, the card and the credits out: to the credits, then the title', () => {
    const s = new Session();
    s.game.debug.godMode = false;
    s.hold(0, 20);
    // A ship lost on the way: the plain ending of the upper zone (one line).
    s.game.world.players[0].hits = 1;
    s.toEnding();
    expect(s.flow.run.ending?.id).toBe('u');
    // The ending ticked once already (the tally's OK released on its first tick).
    expect(s.flow.ending.ticks).toBe(1);
    s.hold(0, ENDING_LINE_TICKS * 1 + ENDING_STORY_HOLD_TICKS - 2);
    expect(s.flow.ending.phase).toBe(0);
    expect(s.uiTexts()).toEqual(['PLAIN.']);
    s.hold(0, 1);
    expect(s.flow.ending.phase).toBe(1);
    s.hold(0, ENDING_TIMEOUT_TICKS - 1);
    expect(s.top).toBe('ending');
    s.hold(0, 1);
    expect(s.top).toBe('credits');
    const credits = s.flow.credits;
    expect(credits.rows).toEqual(['TEST CREDITS', 'FIRST ROW', 'SECOND ROW', '', 'THE END', '']);
    expect(credits.stopped).toBe(false);
    // Scrolls until the last row stands in the middle of the screen, holds, then the title.
    const total = credits.scrollEnd * CREDITS_SCROLL_TICKS + CREDITS_HOLD_TICKS;
    s.hold(0, total - 2);
    expect(credits.stopped).toBe(true);
    expect(s.top).toBe('credits');
    s.hold(0, 2);
    expect(s.top).toBe('title');
  });

  it('ignores OK in the credits during their lock, Back skips them after it', () => {
    const s = new Session();
    s.toEnding();
    s.hold(0, ENDING_LOCK_TICKS + 1);
    s.press(Action.Confirm); // every line
    s.press(Action.Confirm); // the card
    s.hold(0, ENDING_LOCK_TICKS + 1);
    s.press(Action.Confirm);
    expect(s.top).toBe('credits');
    s.press(Action.Confirm);
    s.press(Action.Back);
    expect(s.top).toBe('credits');
    s.hold(0, CREDITS_LOCK_TICKS);
    s.press(Action.Back);
    expect(s.top).toBe('title');
  });

  it("the deep's scene: the flagship sinks after a plain run, sails off after an escape", () => {
    const plain = new Session();
    plain.game.world.players[0].hits = 1; // not flawless: no dawn
    plain.toEnding(true);
    expect(plain.flow.run.ending?.id).toBe('l');
    const sprites = resolveUiSprites(plain.game.content);
    expect(plain.spriteAt(sprites.endingSun)).toEqual([]);
    const sinking = plain.spriteAt(sprites.endingArk)[0];
    plain.hold(0, 120);
    const sunk = plain.spriteAt(sprites.endingArk)[0];
    expect(sunk[0]).toBe(sinking[0]);
    expect(sunk[1]).toBeGreaterThan(sinking[1]);
    expect(plain.spriteAt(sprites.endingBubble).length).toBeGreaterThan(4);
    // No epilogue: the story is the scene alone, then the card.
    expect(plain.uiTexts()).toEqual([]);

    const escape = new Session();
    escape.game.world.players[0].hits = 1;
    escape.toEnding(true, RunFlag.BossEscaped);
    expect(escape.flow.run.ending?.id).toBe('l-escape');
    const sailing = escape.spriteAt(sprites.endingArk)[0];
    escape.hold(0, 120);
    const sailed = escape.spriteAt(sprites.endingArk)[0];
    expect(sailed[1]).toBe(sailing[1]);
    expect(sailed[0]).toBeGreaterThan(sailing[0]);
  });
});
