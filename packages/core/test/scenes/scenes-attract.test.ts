/**
 * Headless tests of the M2-15 front end through `createGame(…, { scenes })`: the attract loop's
 * cycle and its timing (title → demo play → hi-score tables → story crawl → title), the demo
 * played through the replay playback without desync (silent, its visible events forwarded, its
 * World and HUD in the frame), any input returning to the title, and the story crawl's pages.
 */
import { describe, expect, it } from 'vitest';
import type { ContentDb } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { MUSIC_CUES, SimEventKind } from '../../src/events/index.js';
import { createGame, type Game } from '../../src/game/index.js';
import { Action, commitPlayerInput, type ActionMask } from '../../src/input/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';
import { DrawOp } from '../../src/presentation/index.js';
import { playReplay, type Replay } from '../../src/replay/index.js';
import { createHiScoreEntry, createSaveStore, type SaveStore } from '../../src/save/index.js';
import {
  HI_SCORE_PAGE_TICKS,
  STORY_HOLD_TICKS,
  STORY_ROW_HEIGHT,
  STORY_SCROLL_TICKS,
  TITLE_ATTRACT_TICKS,
  type SceneFlow,
} from '../../src/scenes/index.js';
import { DEMO_TEST_TICKS, frontEndContent } from '../helpers/front-end.js';

const CONTENT = frontEndContent();

/** A headless session of the scene flow on the front-end test content. */
class Session {
  readonly platform = createHeadlessPlatform();
  readonly game: Game;
  readonly flow: SceneFlow;
  /** Drained events: `[kind, id, param]`. */
  readonly events: Array<[number, number, number]> = [];

  /**
   * Starts on the title.
   *
   * @param db - The content.
   * @param save - The save.
   */
  constructor(
    db: ContentDb = CONTENT.db,
    readonly save: SaveStore = createSaveStore(null),
  ) {
    this.game = createGame(this.platform, { seed: 3, stage: 't-s' }, db, {
      scenes: 'title',
      save,
    });
    this.flow = this.game.scenes!;
  }

  /** The top scene's id. */
  get top(): string | undefined {
    return this.flow.stack.top?.id;
  }

  /**
   * Runs ticks with a held mask (the frame composed after each), draining the events.
   *
   * @param held - Actions held.
   * @param ticks - Ticks.
   */
  hold(held: ActionMask, ticks = 1): void {
    for (let t = 0; t < ticks; t++) {
      commitPlayerInput(this.platform.snapshot.players[0], held);
      this.game.step();
      this.game.renderFrame();
      this.game.events.drain((e) => {
        this.events.push([e.kind, e.id, e.param]);
      });
    }
  }

  /**
   * The texts of the frame's UI list.
   *
   * @returns The strings of its text commands.
   */
  uiTexts(): string[] {
    const ui = this.game.renderFrame().ui;
    const out: string[] = [];
    for (let i = 0; i < ui.count; i++) {
      if (ui.op[i] === DrawOp.Text) out.push(ui.strings[ui.ref[i]]);
    }
    return out;
  }

  /**
   * Events of a kind drained from an index on.
   *
   * @param kind - A `SimEventKind`.
   * @param from - First event index.
   * @returns Their ids.
   */
  ids(kind: number, from = 0): number[] {
    return this.events.slice(from).flatMap((e) => (e[0] === kind ? [e[1]] : []));
  }
}

/** Ticks the test story takes (two pages, five rows). */
const STORY_TICKS = (5 * STORY_ROW_HEIGHT + 74) * STORY_SCROLL_TICKS + STORY_HOLD_TICKS;

describe('core/scenes attract loop (M2-15)', () => {
  it('cycles title → demo → hi-scores → story → title on exact timings', () => {
    const s = new Session();
    expect(s.top).toBe('title');
    s.hold(0, TITLE_ATTRACT_TICKS - 1);
    expect(s.top).toBe('title');
    s.hold(0);
    expect(s.top).toBe('demo');
    const demo = s.flow.demo;
    expect(demo.world).not.toBeNull();
    // The demo plays its recording, then the tables follow.
    s.hold(0, DEMO_TEST_TICKS - 1);
    expect(s.top).toBe('demo');
    expect(demo.demo!.playback.report.ok).toBe(true);
    s.hold(0);
    expect(s.top).toBe('hiScore');
    // One table (the chosen ship and difficulty's, empty) for its page time, then the story.
    expect(s.flow.hiScores.pages).toEqual(['meter-normal']);
    s.hold(0, HI_SCORE_PAGE_TICKS - 1);
    expect(s.top).toBe('hiScore');
    s.hold(0);
    expect(s.top).toBe('story');
    expect(s.flow.story.duration).toBe(STORY_TICKS);
    s.hold(0, STORY_TICKS - 1);
    expect(s.top).toBe('story');
    s.hold(0);
    expect(s.top).toBe('title');
    expect(s.flow.title.menuOpen).toBe(false);
    // Again: the next demo after the title's idle time.
    s.hold(0, TITLE_ATTRACT_TICKS);
    expect(s.top).toBe('demo');
    expect(s.flow.demo.started).toBe(2);
  });

  it('plays the demo in sync with its recording: the same states as the bare replay', () => {
    const s = new Session();
    s.hold(0, TITLE_ATTRACT_TICKS);
    const demo = s.flow.demo.demo!;
    const replay = CONTENT.demo as Replay;
    expect(demo.replay).toBe(s.flow.demos[0]);
    // The frame shows the demo's World and its HUD.
    const frame = s.game.renderFrame();
    expect(frame.world).toBe(demo.world.view);
    expect(frame.hud.count).toBeGreaterThan(0);
    s.hold(0, DEMO_TEST_TICKS - 1);
    expect(demo.playback.report).toMatchObject({ ok: true, finished: false });
    s.hold(0);
    expect(demo.playback.report).toMatchObject({ ok: true, finished: true, checked: 1 });
    // The final state is the bare replay's (the golden path: a bare-gameplay session).
    const bare = playReplay(replay, CONTENT.db);
    expect(bare.report.ok).toBe(true);
    expect(hashWorld(demo.world)).toBe(hashWorld(bare.game.world));
    expect(demo.world.tick).toBe(DEMO_TEST_TICKS);
    expect(s.flow.demo.world).toBeNull(); // dropped with the scene
  });

  it('keeps the demo silent but forwards what the screen shows', () => {
    const s = new Session();
    s.hold(0, TITLE_ATTRACT_TICKS);
    // The demo shows its label and, at first, the zone card of its stage.
    s.hold(0);
    expect(s.uiTexts()).toEqual(expect.arrayContaining(['DEMO PLAY', 'STAGE', 'T-D']));
    const from = s.events.length;
    s.hold(0, 200);
    const kinds = s.events.slice(from).map((e) => e[0]);
    expect(kinds).not.toContain(SimEventKind.Sfx);
    expect(kinds).not.toContain(SimEventKind.MusicDuck);
    // The only music is the fade the demo started with (none of the demo World's own).
    const music = s.ids(SimEventKind.Music);
    expect(music[music.length - 1]).toBe(MUSIC_CUES.Silence);
    expect(s.ids(SimEventKind.Music, from)).toEqual([]);
    expect(s.uiTexts()).not.toContain('T-D'); // the card is gone
  });

  it('returns to the title on any input in every attract screen', () => {
    for (const [screen, ticks] of [
      ['demo', TITLE_ATTRACT_TICKS],
      ['hiScore', TITLE_ATTRACT_TICKS + DEMO_TEST_TICKS],
      ['story', TITLE_ATTRACT_TICKS + DEMO_TEST_TICKS + HI_SCORE_PAGE_TICKS],
    ] as const) {
      for (const action of [Action.Confirm, Action.Back, Action.Down, Action.Pause]) {
        const s = new Session();
        s.hold(0, ticks);
        expect(s.top).toBe(screen);
        s.hold(action);
        expect(s.top, `${screen} ${action}`).toBe('title');
      }
    }
  });

  it('any press on the title resets its idle time; the open menu never goes to the demo', () => {
    const s = new Session();
    s.hold(0, TITLE_ATTRACT_TICKS - 10);
    s.hold(Action.Down);
    s.hold(0, TITLE_ATTRACT_TICKS - 1);
    expect(s.top).toBe('title');
    s.hold(0);
    expect(s.top).toBe('demo');
    const t = new Session();
    t.hold(Action.Confirm);
    t.hold(0, TITLE_ATTRACT_TICKS * 2);
    expect([t.top, t.flow.title.menuOpen]).toEqual(['title', true]);
  });

  it('skips what the content lacks: no demos → tables; no story → title', () => {
    const s = new Session(frontEndContent({ demos: false, story: false }).db);
    s.hold(0, TITLE_ATTRACT_TICKS);
    expect(s.top).toBe('hiScore');
    s.hold(0, HI_SCORE_PAGE_TICKS);
    expect(s.top).toBe('title');
    // A demo that does not decode is left out.
    const broken: ContentDb = {
      ...CONTENT.db,
      demos: [{ ...CONTENT.db.demos[0], document: { kind: 'replay' } }],
    };
    expect(new Session(broken).flow.demos).toEqual([]);
  });

  it('shows the tables of every mode with scores, the chosen one first', () => {
    const save = createSaveStore(null);
    save.recordScore('meter-normal-2p', createHiScoreEntry(5000, { name: 'TWO', reached: 't-u' }));
    save.recordScore('meter-hard', createHiScoreEntry(700, { name: 'HRD', reached: 't-s' }));
    save.recordScore('direct-easy-practice', createHiScoreEntry(90, { name: 'PRA' }));
    const s = new Session(CONTENT.db, save);
    s.hold(0, TITLE_ATTRACT_TICKS + DEMO_TEST_TICKS);
    expect(s.flow.hiScores.pages).toEqual([
      'meter-normal',
      'meter-normal-2p',
      'meter-hard',
      'direct-easy-practice',
    ]);
    expect(s.uiTexts()).toEqual(expect.arrayContaining(['HI-SCORES', 'KESTREL  NORMAL  1 PLAYER']));
    s.hold(0, HI_SCORE_PAGE_TICKS);
    const texts = s.uiTexts();
    expect(texts).toEqual(
      expect.arrayContaining(['KESTREL  NORMAL  2 PLAYERS', 'TWO', 'U', '1ST', '10TH', '---']),
    );
    s.hold(0, HI_SCORE_PAGE_TICKS * 2);
    // The Direct-mode tables name the power-up model (no Direct-mode ship in this content).
    expect(s.uiTexts()).toEqual(expect.arrayContaining(['DIRECT  EASY  PRACTICE', 'PRA', '-']));
    s.hold(0, HI_SCORE_PAGE_TICKS);
    expect(s.top).toBe('story');
  });

  it('crawls the story rows up through its panel over each page`s scene', () => {
    const s = new Session();
    s.hold(0, TITLE_ATTRACT_TICKS + DEMO_TEST_TICKS + HI_SCORE_PAGE_TICKS);
    const story = s.flow.story;
    expect(story.rows).toEqual(['FIRST LINE', 'SECOND LINE', '', 'THIRD LINE', '']);
    expect(story.page).toBe(0);
    expect(s.uiTexts()).toEqual([]); // nothing has come in yet
    s.hold(0, 12 * STORY_SCROLL_TICKS);
    expect(s.uiTexts()).toEqual(['FIRST LINE']);
    s.hold(0, 11 * STORY_SCROLL_TICKS);
    expect(s.uiTexts()).toEqual(['FIRST LINE', 'SECOND LINE']);
    // The dawn's pieces (the sun, the sea's surface) while the first page crawls.
    const sprites = (): number => {
      const ui = s.game.renderFrame().ui;
      let n = 0;
      for (let i = 0; i < ui.count; i++) if (ui.op[i] === DrawOp.Sprite) n++;
      return n;
    };
    expect(sprites()).toBeGreaterThan(0);
    // The second page's scene takes over once its first row (row 3: 33 px) has crawled half-way
    // up the panel (37 px more) — 70 px in all.
    s.hold(0, (70 - 23) * STORY_SCROLL_TICKS - 1);
    expect(story.page).toBe(0);
    s.hold(0, 1);
    expect(story.page).toBe(1);
    // The launch scene's ships come in (the content's KESTREL sprite).
    s.hold(0, 60);
    expect(sprites()).toBeGreaterThan(0);
    // After the last row the panel goes; the scene holds alone, then the title.
    s.hold(0, story.duration - story.ticks - 10);
    expect(s.uiTexts()).toEqual([]);
    let rects = 0;
    const ui = s.game.renderFrame().ui;
    for (let i = 0; i < ui.count; i++) if (ui.op[i] === DrawOp.Rect && ui.w[i] === 304) rects++;
    expect(rects).toBe(0);
  });
});
