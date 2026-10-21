/**
 * Edge cases of the M2-14 ending screens and credits (`EndingScene`, `CreditsScene`) beyond
 * `scenes-ending.test.ts`, through the scene flow on small campaigns (start `S` → upper `U` | lower
 * `L`, both final) whose endings, credits and final-stage music vary per test:
 *
 * - an ending with neither scene nor text opens on the result card at once; without credits the
 *   card says `OK: TITLE` and goes to the title;
 * - an epilogue without a scene is centred on the screen with no panel; with a scene it sits in the
 *   panel under it; OK during the lock shows nothing early, OK once every line is shown moves on
 *   at once;
 * - a final stage without `music.ending` / `music.credits` keeps the music playing (no cue);
 * - the citadel scene over time: the dawn sun rising 30 px, the ship gone off the right edge, the
 *   citadel fallen at 480 ticks, the last blasts gone 64 ticks later; the deep's scene: the ship
 *   rising 80 px, the sinking ARK gone under the surface, the escaped one gone off the right edge;
 *   player 2's ship behind player 1's in a co-op run; without the UI sprites nothing is drawn but
 *   the ships (and nothing breaks);
 * - a second ending in the same flow starts from its story again;
 * - the credits: more rows than string slots — every row on screen draws its own text, no slot
 *   shared —, the scroll stopping exactly at `scrollEnd`, Back during the lock ignored.
 */
import { describe, expect, it } from 'vitest';
import {
  FRAME_CX,
  FRAME_CY,
  FRAME_H,
  FRAME_W,
  GLYPH_H,
  GLYPH_W,
  LINE_H,
} from '../../src/config/index.js';
import {
  MAX_CREDITS_LINE_LENGTH,
  MAX_ENDING_LINE_LENGTH,
  MAX_ENDING_TEXT_LINES,
  loadContent,
  type ContentDb,
  type ContentFile,
} from '../../src/data/index.js';
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
  CREDITS_STRING_SLOTS,
  ENDING_LINE_TICKS,
  ENDING_LOCK_TICKS,
  ENDING_TIMEOUT_TICKS,
  RunFlag,
  type SceneFlow,
  HI_SCORE_LOCK_TICKS,
} from '../../src/scenes/index.js';
import { resolveUiSprites, uiPx, type UiSprites } from '../../src/ui/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
import { shipped, stage } from '../helpers/campaign.js';
import {
  ENDING_TEXT_PANEL,
  TEXT_PANEL_INSET,
  epiloguePanelH,
  scenePx,
  scrollPx,
  scrollSteps,
} from '../helpers/scene-layout.js';

/** One ending of a test campaign. */
type Ending = Record<string, unknown>;

/**
 * A campaign file: S → U | L with the given endings and extra fields.
 *
 * @param endings - The endings (every final zone needs one that always matches).
 * @param extra - More fields (credits).
 * @returns The file.
 */
function campaign(endings: readonly Ending[], extra: Record<string, unknown> = {}): ContentFile {
  return {
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
      endings,
      ...extra,
    },
  };
}

/** The final stages' music with their own ending and credits themes. */
const FINAL_MUSIC = { stage: 'Stage', boss: 'Boss', ending: 'Ending', credits: 'Credits' };

/**
 * Loads a test campaign's content.
 *
 * @param file - The campaign file.
 * @param options - `music`: the final stages' music (default with the ending and credits themes);
 *   `sprites`: intern the engine sprites (default `true`).
 * @returns The DB.
 */
function content(
  file: ContentFile,
  options: { music?: Record<string, string>; sprites?: boolean } = {},
): ContentDb {
  const music = options.music ?? FINAL_MUSIC;
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      file,
      stage('t-s'),
      stage('t-u', { music }),
      stage('t-l', { music }),
    ],
    options.sprites === false ? {} : { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
}

/** A headless campaign session on a test DB. */
class Session {
  readonly game: Game;
  readonly flow: SceneFlow;
  readonly platform = createHeadlessPlatform();
  /** Drained events: `[kind, id]`. */
  readonly events: Array<[number, number]> = [];

  /**
   * Starts a game on the start zone (god mode).
   *
   * @param db - The content.
   */
  constructor(db: ContentDb) {
    this.game = createGame(this.platform, { seed: 13, stage: 't-s' }, db, { scenes: 'game' });
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
        this.events.push([e.kind, e.id]);
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
   * Passes the name entries of new hi-scores (M2-15) when one is on top: `A`, OK on END (for each
   * row that entered), then the table's OK after its lock — the title.
   */
  leaveNames(): void {
    if (this.top !== 'nameEntry') return;
    // One name per row that entered (both players' in a co-op game).
    for (let names = 0; names < 2 && this.top === 'nameEntry'; names++) {
      this.hold(0, 2);
      for (let i = 0; i < 4; i++) this.press(Action.Confirm);
    }
    expect(this.top).toBe('hiScore');
    this.hold(0, HI_SCORE_LOCK_TICKS);
    this.press(Action.Confirm);
  }

  /**
   * Runs until a scene is on top.
   *
   * @param id - Scene id.
   * @param limit - Tick limit.
   */
  until(id: string, limit = 3000): void {
    for (let i = 0; i < limit && this.top !== id; i++) this.hold(0);
    expect(this.top).toBe(id);
  }

  /**
   * Plays to the ending of a final zone.
   *
   * @param down - Take the lower exit.
   * @param flags - Run flags to add before the final zone's clear.
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
   * The frame's UI list.
   *
   * @returns The list.
   */
  ui(): ReturnType<Game['renderFrame']>['ui'] {
    return this.game.renderFrame().ui;
  }

  /**
   * The text commands of the frame's UI list.
   *
   * @returns `[text, x, y, slot]` per command.
   */
  texts(): Array<[string, number, number, number]> {
    const ui = this.ui();
    const out: Array<[string, number, number, number]> = [];
    for (let i = 0; i < ui.count; i++) {
      if (ui.op[i] === DrawOp.Text) out.push([ui.strings[ui.ref[i]], ui.x[i], ui.y[i], ui.ref[i]]);
    }
    return out;
  }

  /**
   * The strings of the frame's text commands.
   *
   * @returns Them.
   */
  uiTexts(): string[] {
    return this.texts().map(([text]) => text);
  }

  /**
   * The positions of one sprite's commands (none for sprite -1).
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
   * The number of sprite commands in the frame's UI list.
   *
   * @returns Count.
   */
  spriteCount(): number {
    const ui = this.ui();
    let n = 0;
    for (let i = 0; i < ui.count; i++) if (ui.op[i] === DrawOp.Sprite) n++;
    return n;
  }

  /**
   * Whether a rect command starts at a point.
   *
   * @param x - Left.
   * @param y - Top.
   * @returns Whether one does.
   */
  rectAt(x: number, y: number): boolean {
    const ui = this.ui();
    for (let i = 0; i < ui.count; i++) {
      if (ui.op[i] === DrawOp.Rect && ui.x[i] === x && ui.y[i] === y) return true;
    }
    return false;
  }

  /**
   * The music cues since an event index.
   *
   * @param from - First event index.
   * @returns Cues.
   */
  music(from: number): number[] {
    return this.events
      .slice(from)
      .flatMap(([kind, id]) => (kind === SimEventKind.Music ? [id] : []));
  }

  /** The UI sprites of the content. */
  get sprites(): UiSprites {
    return resolveUiSprites(this.game.content);
  }

  /**
   * Runs the ending until its `ticks` count reaches a value.
   *
   * @param ticks - The ending's tick count.
   */
  endingAt(ticks: number): void {
    while (this.flow.ending.ticks < ticks) this.hold(0);
    expect(this.flow.ending.ticks).toBe(ticks);
  }
}

describe('core/scenes ending and credits — edge cases (M2-14 tests)', () => {
  it('opens a bare ending on its result card; without credits OK goes to the title', () => {
    const s = new Session(
      content(
        campaign([
          { id: 'u', name: 'UPPER END', zone: 'u' },
          { id: 'l', name: 'LOWER END', zone: 'l' },
        ]),
      ),
    );
    const from = s.events.length;
    s.toEnding();
    expect(s.flow.run.ending?.id).toBe('u');
    expect(s.flow.ending.phase).toBe(1); // the card at once
    expect(s.flow.ending.scene).toBe(0);
    expect(s.uiTexts()).toEqual(expect.arrayContaining(['ENDING', 'UPPER END', 'S U']));
    // The stages' ending theme still starts (the stage names one).
    expect(s.music(from)).toContain(MUSIC_CUES.Ending);
    s.hold(0, ENDING_LOCK_TICKS);
    expect(s.uiTexts()).toContain('OK: TITLE');
    expect(s.uiTexts()).not.toContain('OK: CREDITS');
    s.press(Action.Confirm);
    s.leaveNames(); // the run's score entered its table (M2-15)
    expect(s.top).toBe('title');
  });

  it('times a bare card out to the title when there are no credits', () => {
    const s = new Session(
      content(
        campaign([
          { id: 'u', name: 'U', zone: 'u' },
          { id: 'l', name: 'L', zone: 'l' },
        ]),
      ),
    );
    s.toEnding(true);
    s.hold(0, ENDING_TIMEOUT_TICKS - 2);
    expect(s.top).toBe('ending');
    s.hold(0, 2);
    s.leaveNames(); // the run's score entered its table (M2-15)
    expect(s.top).toBe('title');
  });

  it('centres an epilogue without a scene, no panel; with a scene it sits in the panel under it', () => {
    const lines = ['ONE.', 'TWO.', 'THREE.', 'FOUR.'];
    const s = new Session(
      content(
        campaign([
          { id: 'u', name: 'U', zone: 'u', text: lines },
          { id: 'l', name: 'L', zone: 'l', scene: 'citadel', text: lines },
        ]),
      ),
    );
    s.toEnding();
    expect(s.flow.ending.scene).toBe(0);
    expect(s.flow.ending.phase).toBe(0);
    s.hold(0, ENDING_LINE_TICKS * 4);
    const plain = s.texts();
    expect(plain.map(([t]) => t)).toEqual(lines);
    // Centred: the block's top at 108 − 5 per line, 10 px a line, on the frame's centre (at
    // 384×216 with the 6×8 font).
    const top = FRAME_CY - ((lines.length * LINE_H) >> 1);
    expect(plain.map(([, x, y]) => [x, y])).toEqual(
      lines.map((_, i) => [FRAME_CX, top + i * LINE_H]),
    );
    expect(s.rectAt(TEXT_PANEL_INSET, ENDING_TEXT_PANEL.y)).toBe(false);

    const withScene = new Session(
      content(
        campaign([
          { id: 'u', name: 'U', zone: 'u', text: lines },
          { id: 'l', name: 'L', zone: 'l', scene: 'citadel', text: lines },
        ]),
      ),
    );
    withScene.toEnding(true);
    expect(withScene.flow.ending.scene).toBe(1);
    withScene.hold(0, ENDING_LINE_TICKS * 4);
    // In the panel under the scene: from 5 px under its top (129 at 384×216), a line apart.
    expect(withScene.texts().map(([, x, y]) => [x, y])).toEqual(
      lines.map((_, i) => [FRAME_CX, ENDING_TEXT_PANEL.lineY + i * LINE_H]),
    );
    expect(withScene.rectAt(TEXT_PANEL_INSET, ENDING_TEXT_PANEL.y)).toBe(true); // the panel
  });

  it('fits an epilogue line and a credits line of the campaign caps, and no glyph more', () => {
    // `core/data`'s caps are what the scenes draw them in, in glyph cells (R1-01, R2-01): an
    // epilogue line of MAX_ENDING_LINE_LENGTH fits the panel under the scene with 32 px clear a
    // side, a credits line of MAX_CREDITS_LINE_LENGTH the frame with 12 px clear a side — and a
    // glyph more would not.
    const line = 'E'.repeat(MAX_ENDING_LINE_LENGTH);
    const title = 'C'.repeat(MAX_CREDITS_LINE_LENGTH);
    const s = new Session(
      content(
        campaign(
          [
            { id: 'u', name: 'U', zone: 'u', scene: 'citadel', text: [line] },
            { id: 'l', name: 'L', zone: 'l' },
          ],
          { credits: [{ title }] },
        ),
      ),
    );
    s.toEnding();
    s.hold(0, ENDING_LINE_TICKS);
    /**
     * The left and right edges of a centred text command.
     *
     * @param text - Its string.
     * @returns `[x0, x1]`.
     */
    const span = (text: string): [number, number] => {
      const found = s.texts().filter(([t]) => t === text);
      expect(found).toHaveLength(1);
      expect(found[0][1]).toBe(FRAME_CX);
      const x0 = Math.round(FRAME_CX - (text.length * GLYPH_W) / 2);
      return [x0, x0 + text.length * GLYPH_W];
    };
    const ui = s.ui();
    let panel = -1;
    for (let i = 0; i < ui.count && panel < 0; i++) {
      if (ui.op[i] === DrawOp.Rect && ui.x[i] === TEXT_PANEL_INSET) panel = i;
    }
    expect(panel).toBeGreaterThanOrEqual(0);
    expect(ui.y[panel]).toBe(ENDING_TEXT_PANEL.y);
    // The panel fits this one-line epilogue (R4-03.C7's one text-panel rule), and the most lines
    // a campaign may write still fit the room under the scene.
    expect(ui.h[panel]).toBe(epiloguePanelH(1));
    expect(epiloguePanelH(MAX_ENDING_TEXT_LINES)).toBeLessThanOrEqual(
      FRAME_H - uiPx(4) - ENDING_TEXT_PANEL.y,
    );
    const left = ui.x[panel];
    const w = ui.w[panel];
    const pad = uiPx(32);
    const [x0, x1] = span(line);
    expect(x0).toBeGreaterThanOrEqual(left + pad);
    expect(x1).toBeLessThanOrEqual(left + w - pad);
    expect((MAX_ENDING_LINE_LENGTH + 1) * GLYPH_W).toBeGreaterThan(w - 2 * pad);
    // On to the card, then the credits; the title row scrolls up into the frame.
    s.press(Action.Confirm);
    expect(s.flow.ending.phase).toBe(1);
    s.hold(0, ENDING_LOCK_TICKS);
    s.press(Action.Confirm);
    expect(s.top).toBe('credits');
    s.hold(0, scrollSteps(2 * LINE_H) * CREDITS_SCROLL_TICKS);
    const margin = uiPx(12);
    const [c0, c1] = span(title);
    expect(c0).toBeGreaterThanOrEqual(margin);
    expect(c1).toBeLessThanOrEqual(FRAME_W - margin);
    expect((MAX_CREDITS_LINE_LENGTH + 1) * GLYPH_W).toBeGreaterThan(FRAME_W - 2 * margin);
  });

  it('ignores OK during the lock; once every line is shown OK moves on at once', () => {
    const s = new Session(
      content(
        campaign([
          { id: 'u', name: 'U', zone: 'u', scene: 'abyss', text: ['A.', 'B.'] },
          { id: 'l', name: 'L', zone: 'l' },
        ]),
      ),
    );
    s.toEnding();
    s.press(Action.Confirm); // inside the lock
    expect(s.flow.ending.shown).toBe(0);
    expect(s.flow.ending.phase).toBe(0);
    s.hold(0, ENDING_LINE_TICKS * 2);
    expect(s.flow.ending.shown).toBe(2);
    expect(s.flow.ending.phase).toBe(0); // still holding the story
    s.press(Action.Confirm); // every line is shown: the card, no reveal step
    expect(s.flow.ending.phase).toBe(1);
    expect(s.uiTexts()).toContain('ENDING');
  });

  it('keeps the music playing when the final stage names no ending or credits theme', () => {
    const s = new Session(
      content(
        campaign(
          [
            { id: 'u', name: 'U', zone: 'u', scene: 'citadel' },
            { id: 'l', name: 'L', zone: 'l' },
          ],
          { credits: [{ title: 'ROLL', lines: ['A'] }] },
        ),
        { music: { stage: 'Stage', boss: 'Boss' } },
      ),
    );
    s.toEnding();
    const from = s.events.length;
    s.hold(0, ENDING_LOCK_TICKS + 1);
    s.press(Action.Confirm); // the story
    s.hold(0, ENDING_LOCK_TICKS + 1);
    s.press(Action.Confirm); // the card
    expect(s.top).toBe('credits');
    s.hold(0, 30);
    expect(s.music(from)).toEqual([]);
  });

  it('plays the citadel scene out: the sun rises 30 px, the ship leaves, the citadel falls, the blasts end', () => {
    const s = new Session(
      content(
        campaign([
          { id: 'u', name: 'U', zone: 'u', scene: 'citadel' },
          { id: 'l', name: 'L', zone: 'l' },
        ]),
      ),
    );
    s.toEnding();
    expect(s.flow.run.endingFlags & RunFlag.NoDeath).toBe(RunFlag.NoDeath);
    const sp = s.sprites;
    const ship = s.game.world.ship.spriteId;
    // The v2 scene composes on the frame (R4-05.E4): the fortress left of centre, its 108-px art
    // standing on the ground line, the dawn sun centre-right.
    const sun = FRAME_CX + uiPx(96);
    const sunY = uiPx(118);
    const citadel = FRAME_CX - uiPx(80);
    const citadelY = uiPx(104) - uiPx(36);
    s.endingAt(100);
    expect(s.spriteAt(sp.endingSun)).toEqual([[sun, sunY]]); // 464, 177
    expect(s.spriteAt(sp.endingCitadel)).toEqual([[citadel, citadelY]]); // 200, 102
    expect(s.spriteAt(ship)).toHaveLength(1);
    // The ship accelerates away from x 290 and is gone past `FRAME_W + 36` (t 332 at 640×360).
    const exit = FRAME_W + uiPx(36);
    const shipX = FRAME_CX - uiPx(20);
    let gone = 60;
    while (shipX + scenePx(Math.floor(((gone - 60) * (gone - 60)) / 240)) < exit) gone++;
    gone += gone & 1; // the scene redraws on even ticks
    expect(gone).toBeLessThan(400);
    s.endingAt(gone - 2);
    expect(s.spriteAt(ship)).toHaveLength(1);
    s.endingAt(gone);
    expect(s.spriteAt(ship)).toEqual([]);
    s.endingAt(400);
    // Sinking since 360: 5 px by 400.
    expect(s.spriteAt(sp.endingCitadel)).toEqual([[citadel, citadelY + scenePx(5)]]);
    s.endingAt(430);
    // Risen 30 px, no further.
    expect(s.spriteAt(sp.endingSun)).toEqual([[sun, sunY - scenePx(30)]]);
    s.endingAt(479);
    expect(s.spriteAt(sp.endingCitadel)).toHaveLength(1);
    s.endingAt(480);
    expect(s.spriteAt(sp.endingCitadel)).toEqual([]); // fallen
    expect(s.spriteAt(sp.endingBlast).length).toBeGreaterThan(0); // the last cluster
    s.endingAt(560);
    expect(s.spriteAt(sp.endingBlast)).toEqual([]);
    expect(s.spriteAt(sp.endingSun)).toEqual([[sun, sunY - scenePx(30)]]);
  });

  it("plays the deep's scene out: the ship rises 80 px, the ARK sinks away or sails off; player 2 behind", () => {
    const file = campaign([
      { id: 'u', name: 'U', zone: 'u' },
      { id: 'l-escape', name: 'ESC', zone: 'l', all: ['bossEscaped'], scene: 'abyss' },
      { id: 'l', name: 'L', zone: 'l', scene: 'abyss' },
    ]);
    const s = new Session(content(file));
    s.toEnding(true);
    const sp = s.sprites;
    const ship = s.game.world.ship.spriteId;
    // A flawless run: the dawn above the surface; the surface tiled across the frame (eight
    // 96-px tiles at 640×360).
    expect(s.spriteAt(sp.endingSun)).toEqual([[FRAME_CX + uiPx(120), 0]]); // 500
    expect(s.spriteAt(sp.endingSurface).length).toBe(Math.ceil(FRAME_W / uiPx(64)) + 1);
    // The ship starts at (165, 165), the ARK at (395, 111) — the v2 frame composition.
    const shipX = uiPx(110);
    const shipY = uiPx(110);
    const ark = FRAME_CX + uiPx(50);
    const arkY = uiPx(74);
    s.endingAt(240);
    expect(s.spriteAt(ship)).toEqual([[shipX, shipY - scenePx(40)]]); // half way up
    expect(s.spriteAt(sp.endingArk)).toEqual([[ark, arkY + scenePx(120)]]); // 0.75 px a tick
    s.endingAt(388);
    expect(s.spriteAt(sp.endingArk)).toEqual([]); // sunk past the frame's bottom edge
    s.endingAt(480);
    expect(s.spriteAt(ship)).toEqual([[shipX, shipY - scenePx(80)]]); // at the light
    s.endingAt(490);
    // Then off to the right, 1.5 px a tick.
    expect(s.spriteAt(ship)).toEqual([[shipX + scenePx(15), shipY - scenePx(80)]]);
    // Player 2 in the run: its ship (its palette swap) a little behind, from the next redraw.
    s.flow.run.carry.players[1].active = true;
    s.hold(0, 2);
    const world = s.game.world;
    const p2 = world.ship.spriteP2Id >= 0 ? world.ship.spriteP2Id : ship;
    const p1At = [shipX + scenePx(18), shipY - scenePx(80)];
    expect(s.spriteAt(ship)[0]).toEqual(p1At); // 128, 30
    expect(s.spriteAt(p2)).toContainEqual([p1At[0] - uiPx(22), p1At[1] + uiPx(14)]); // 106, 44
    s.flow.run.carry.players[1].active = false;

    const escape = new Session(content(file));
    escape.toEnding(true, RunFlag.BossEscaped);
    expect(escape.flow.run.ending?.id).toBe('l-escape');
    // It sails off right, 1 px every 4 ticks, and is gone past `FRAME_W + 76` (t 957 at 640×360).
    let sailed = 0;
    while (ark + scenePx(sailed >> 2) < FRAME_W + uiPx(76)) sailed++;
    escape.endingAt(sailed - 4);
    expect(escape.spriteAt(sp.endingArk)).toEqual([[ark + scenePx((sailed - 4) >> 2), arkY]]);
    escape.endingAt(sailed);
    expect(escape.spriteAt(sp.endingArk)).toEqual([]); // sailed off the edge
  });

  it('draws only the ships without the UI sprites, and still plays the story', () => {
    const s = new Session(
      content(
        campaign([
          { id: 'u', name: 'U', zone: 'u', scene: 'citadel', text: ['LINE.'] },
          { id: 'l', name: 'L', zone: 'l' },
        ]),
        { sprites: false },
      ),
    );
    s.toEnding();
    expect(s.sprites.endingCitadel).toBe(-1);
    s.endingAt(ENDING_LINE_TICKS + 1);
    const ship = s.game.world.ship.spriteId;
    expect(s.spriteCount()).toBe(ship >= 0 ? 1 : 0);
    expect(s.uiTexts()).toEqual(['LINE.']);
  });

  it('starts a second ending in the same flow from its story again', () => {
    const s = new Session(
      content(
        campaign([
          { id: 'u', name: 'U', zone: 'u', scene: 'abyss', text: ['ONE.'] },
          { id: 'l', name: 'L', zone: 'l' },
        ]),
      ),
    );
    s.toEnding();
    s.hold(0, ENDING_LOCK_TICKS + 1);
    s.press(Action.Confirm);
    s.press(Action.Confirm);
    s.hold(0, ENDING_LOCK_TICKS + 1);
    s.press(Action.Confirm);
    s.leaveNames(); // the run's score entered its table (M2-15)
    expect(s.top).toBe('title');
    // The next run from the title: START, the menus, the zone — then the same ending.
    s.flow.stack.reset(s.flow.ending);
    s.hold(0);
    expect(s.top).toBe('ending');
    expect([s.flow.ending.phase, s.flow.ending.shown]).toEqual([0, 0]);
    expect(s.flow.ending.ticks).toBeLessThanOrEqual(1);
  });

  it('scrolls more rows than string slots: every row on screen draws its own text', () => {
    const lines = Array.from({ length: 16 }, (_, i) => 'ROW ' + String(i + 1));
    const credits = [
      { title: 'FIRST', lines },
      { title: 'SECOND', lines },
      { title: 'THIRD', lines: lines.slice(0, 4) },
    ];
    const s = new Session(
      content(
        campaign(
          [
            { id: 'u', name: 'U', zone: 'u' },
            { id: 'l', name: 'L', zone: 'l' },
          ],
          { credits },
        ),
      ),
    );
    s.toEnding();
    s.hold(0, ENDING_LOCK_TICKS + 1);
    s.press(Action.Confirm);
    expect(s.top).toBe('credits');
    const scene = s.flow.credits;
    expect(scene.rows.length).toBeGreaterThan(CREDITS_STRING_SLOTS);
    expect(scene.rows).toHaveLength(18 + 18 + 6);
    let most = 0;
    for (let t = 0; t < scrollSteps(scene.scrollEnd) * CREDITS_SCROLL_TICKS; t += 17) {
      s.hold(0, 17);
      if (s.top !== 'credits') break;
      const texts = s.texts();
      most = Math.max(most, texts.length);
      // No two rows on screen share a string slot, and each shows its own row's text.
      expect(new Set(texts.map(([, , , slot]) => slot)).size).toBe(texts.length);
      for (const [text, , y] of texts) {
        const row = Math.round((y - FRAME_H + scene.scroll) / CREDITS_ROW_HEIGHT);
        expect(scene.rows[row]).toBe(text);
      }
    }
    expect(most).toBeGreaterThan(12);
    expect(most).toBeLessThanOrEqual(CREDITS_STRING_SLOTS);
  });

  it('stops the scroll exactly at scrollEnd; Back during the lock is ignored', () => {
    const s = new Session(
      content(
        campaign(
          [
            { id: 'u', name: 'U', zone: 'u' },
            { id: 'l', name: 'L', zone: 'l' },
          ],
          { credits: [{ title: 'ONLY' }] },
        ),
      ),
    );
    s.toEnding();
    s.hold(0, ENDING_LOCK_TICKS + 1);
    s.press(Action.Confirm);
    const scene = s.flow.credits;
    expect(scene.rows).toEqual(['ONLY', '']);
    // From under the screen to the stop line: 216 + 2 rows × 11 − 100 at 384×216.
    const stopY = FRAME_CY - GLYPH_H;
    expect(scene.scrollEnd).toBe(FRAME_H + 2 * CREDITS_ROW_HEIGHT - stopY);
    s.press(Action.Back);
    expect(s.top).toBe('credits');
    // `ART_SCALE` px a step: the last step before the stop is short of it.
    const steps = scrollSteps(scene.scrollEnd);
    while (scene.ticks < steps * CREDITS_SCROLL_TICKS - 1) s.hold(0);
    expect(scene.stopped).toBe(false);
    expect(scene.scroll).toBe(scrollPx(steps - 1));
    expect(scene.scroll).toBeLessThan(scene.scrollEnd);
    s.hold(0);
    expect(scene.stopped).toBe(true);
    expect(scene.scroll).toBe(scene.scrollEnd);
    s.hold(0, 50);
    expect(scene.scroll).toBe(scene.scrollEnd); // held
    // The rows end at the stop line (y 100): the title two rows above it, the blank row under it.
    expect(s.texts()).toEqual([
      ['ONLY', FRAME_CX, stopY - 2 * CREDITS_ROW_HEIGHT, expect.any(Number)],
    ]);
    s.hold(0, CREDITS_HOLD_TICKS - 52);
    expect(s.top).toBe('credits');
    s.hold(0, 2);
    s.leaveNames(); // the run's score entered its table (M2-15)
    expect(s.top).toBe('title');
    expect(CREDITS_LOCK_TICKS).toBeLessThan(steps * CREDITS_SCROLL_TICKS);
  });
});
