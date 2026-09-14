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
  CREDITS_STRING_SLOTS,
  ENDING_LINE_TICKS,
  ENDING_LOCK_TICKS,
  ENDING_TIMEOUT_TICKS,
  RunFlag,
  type SceneFlow,
} from '../../src/scenes/index.js';
import { resolveUiSprites, type UiSprites } from '../../src/ui/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
import { shipped, stage } from '../helpers/campaign.js';

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
    // Centred: the block's top at 108 − 5 per line, 10 px a line, on the frame's centre.
    expect(plain.map(([, x, y]) => [x, y])).toEqual([
      [192, 88],
      [192, 98],
      [192, 108],
      [192, 118],
    ]);
    expect(s.rectAt(40, 124)).toBe(false);

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
    expect(withScene.texts().map(([, x, y]) => [x, y])).toEqual([
      [192, 129],
      [192, 139],
      [192, 149],
      [192, 159],
    ]);
    expect(withScene.rectAt(40, 124)).toBe(true); // the panel
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
    s.endingAt(100);
    expect(s.spriteAt(sp.endingSun)).toEqual([[292, 118]]);
    expect(s.spriteAt(sp.endingCitadel)).toEqual([[100, 68]]);
    expect(s.spriteAt(ship)).toHaveLength(1);
    s.endingAt(320); // the ship past x 420: gone
    expect(s.spriteAt(ship)).toEqual([]);
    s.endingAt(400);
    expect(s.spriteAt(sp.endingCitadel)).toEqual([[100, 73]]); // sinking since 360
    s.endingAt(430);
    expect(s.spriteAt(sp.endingSun)).toEqual([[292, 88]]); // risen 30 px, no further
    s.endingAt(479);
    expect(s.spriteAt(sp.endingCitadel)).toHaveLength(1);
    s.endingAt(480);
    expect(s.spriteAt(sp.endingCitadel)).toEqual([]); // fallen
    expect(s.spriteAt(sp.endingBlast).length).toBeGreaterThan(0); // the last cluster
    s.endingAt(560);
    expect(s.spriteAt(sp.endingBlast)).toEqual([]);
    expect(s.spriteAt(sp.endingSun)).toEqual([[292, 88]]);
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
    // A flawless run: the dawn above the surface.
    expect(s.spriteAt(sp.endingSun)).toEqual([[300, 0]]);
    expect(s.spriteAt(sp.endingSurface).length).toBe(7);
    s.endingAt(240);
    expect(s.spriteAt(ship)).toEqual([[110, 70]]); // half way up
    expect(s.spriteAt(sp.endingArk)).toEqual([[250, 104]]);
    s.endingAt(304);
    expect(s.spriteAt(sp.endingArk)).toEqual([]); // under
    s.endingAt(480);
    expect(s.spriteAt(ship)).toEqual([[110, 30]]); // at the light
    s.endingAt(490);
    expect(s.spriteAt(ship)).toEqual([[125, 30]]); // then off to the right
    // Player 2 in the run: its ship (its palette swap) a little behind, from the next redraw.
    s.flow.run.carry.players[1].active = true;
    s.hold(0, 2);
    const world = s.game.world;
    const p2 = world.ship.spriteP2Id >= 0 ? world.ship.spriteP2Id : ship;
    expect(s.spriteAt(ship)[0]).toEqual([128, 30]);
    expect(s.spriteAt(p2)).toContainEqual([106, 44]);
    s.flow.run.carry.players[1].active = false;

    const escape = new Session(content(file));
    escape.toEnding(true, RunFlag.BossEscaped);
    expect(escape.flow.run.ending?.id).toBe('l-escape');
    escape.endingAt(836);
    expect(escape.spriteAt(sp.endingArk)).toEqual([[459, 74]]);
    escape.endingAt(840);
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
    for (let t = 0; t < scene.scrollEnd * CREDITS_SCROLL_TICKS; t += 17) {
      s.hold(0, 17);
      if (s.top !== 'credits') break;
      const texts = s.texts();
      most = Math.max(most, texts.length);
      // No two rows on screen share a string slot, and each shows its own row's text.
      expect(new Set(texts.map(([, , , slot]) => slot)).size).toBe(texts.length);
      for (const [text, , y] of texts) {
        const row = Math.round((y - 216 + scene.scroll) / CREDITS_ROW_HEIGHT);
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
    // 216 + 2 rows × 11 − 100.
    expect(scene.scrollEnd).toBe(138);
    s.press(Action.Back);
    expect(s.top).toBe('credits');
    while (scene.ticks < scene.scrollEnd * CREDITS_SCROLL_TICKS - 1) s.hold(0);
    expect(scene.stopped).toBe(false);
    expect(scene.scroll).toBe(scene.scrollEnd - 1);
    s.hold(0);
    expect(scene.stopped).toBe(true);
    expect(scene.scroll).toBe(scene.scrollEnd);
    s.hold(0, 50);
    expect(scene.scroll).toBe(scene.scrollEnd); // held
    // The rows end at the stop line (y 100): the title two rows above it, the blank row under it.
    expect(s.texts()).toEqual([['ONLY', 192, 100 - 2 * CREDITS_ROW_HEIGHT, expect.any(Number)]]);
    s.hold(0, CREDITS_HOLD_TICKS - 52);
    expect(s.top).toBe('credits');
    s.hold(0, 2);
    expect(s.top).toBe('title');
    expect(CREDITS_LOCK_TICKS).toBeLessThan(scene.scrollEnd * CREDITS_SCROLL_TICKS);
  });
});
