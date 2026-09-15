/**
 * Edge cases of the M2-15 attract loop through `createGame(…, { scenes })`, beyond
 * `scenes-attract.test.ts`:
 *
 * - the demos take turns (the next round plays the next demo, even after one was cut short), a
 *   demo on a campaign zone's stage shows that zone's card;
 * - a demo that desyncs ends at its first differing hash, a demo that cannot start (its checkpoint
 *   is not on its stage) ends at once, a demo naming a stage the content lacks is left out;
 * - any input from **either** controller returns to the title, a held key keeps the title from
 *   idling, the TV's Back never opens the exit dialog from the attract screens (and the title
 *   under that dialog does not idle into the demo);
 * - the hi-score screen's pages: at most four, in ship × difficulty × mode order, the chosen
 *   difficulty's table first, never twice;
 * - the story crawl at its content limits (eight pages of six lines): every tick draws exactly the
 *   rows inside the panel (no string slot is shared by two rows on screen), the pages' scenes take
 *   over in order, `none` draws no sprites.
 */
import { describe, expect, it } from 'vitest';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { MUSIC_CUES, SimEventKind } from '../../src/events/index.js';
import { Action } from '../../src/input/index.js';
import { DrawOp } from '../../src/presentation/index.js';
import { REPLAY_HASH_INTERVAL, type DemoPlayback, type Replay } from '../../src/replay/index.js';
import { createHiScoreEntry, createSaveStore } from '../../src/save/index.js';
import {
  HI_SCORE_ATTRACT_PAGES,
  HI_SCORE_PAGE_TICKS,
  STORY_HOLD_TICKS,
  STORY_ROW_HEIGHT,
  STORY_SCROLL_TICKS,
  TITLE_ATTRACT_TICKS,
  TitleItem,
} from '../../src/scenes/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
import { demoFile, frontEndFiles, recordTestDemo } from '../helpers/front-end.js';
import { FrontEndSession } from '../helpers/front-end-session.js';

/**
 * Loads content files (no issues expected).
 *
 * @param files - The files.
 * @returns The DB.
 */
function load(files: readonly ContentFile[]): ContentDb {
  const { db, issues } = loadContent(files, { extraSprites: ENGINE_SPRITES });
  expect(issues).toEqual([]);
  return db;
}

/** The front-end content without demos (the recordings are made on it). */
const BASE_FILES = frontEndFiles();
const BASE = load(BASE_FILES);

/** Two demos: `a-open` on the long open stage `t-d`, `b-zone` on the campaign's start zone. */
const TWO_DEMOS = (() => {
  const open = recordTestDemo(BASE, 't-d', 240, 21);
  const zone = recordTestDemo(BASE, 't-s', 240, 22);
  return {
    open,
    zone,
    db: load([...BASE_FILES, demoFile('a-open', open), demoFile('b-zone', zone)]),
  };
})();

/**
 * Content with one demo file made from a replay.
 *
 * @param replay - The replay.
 * @param story - Story pages (default: none).
 * @returns The DB.
 */
function withDemo(replay: Replay, story: boolean | readonly unknown[] = false): ContentDb {
  return load([...frontEndFiles(story), demoFile('only', replay)]);
}

/**
 * Runs idle ticks until the top scene is `id`.
 *
 * @param s - The session.
 * @param id - The scene id.
 * @param max - Most ticks to run.
 * @returns The ticks it took.
 */
function until(s: FrontEndSession, id: string, max: number): number {
  for (let t = 1; t <= max; t++) {
    s.hold(0);
    if (s.top === id) return t;
  }
  throw new Error(`${id} not reached in ${max} ticks (top: ${String(s.top)})`);
}

describe('core/scenes attract loop — the demos (M2-15 edge cases)', () => {
  it('takes the demos in turn, also after one was cut short by a key', () => {
    const s = new FrontEndSession({ db: TWO_DEMOS.db });
    expect(s.flow.demos.map((demo) => demo.header.stageId)).toEqual(['t-d', 't-s']);
    const played: Array<string | null> = [];
    for (let round = 0; round < 3; round++) {
      until(s, 'demo', TITLE_ATTRACT_TICKS + 1);
      const demo = s.flow.demo.demo!;
      expect(demo.replay).toBe(s.flow.demos[round % 2]);
      expect(s.flow.demo.started).toBe(round + 1);
      played.push(demo.replay.header.stageId);
      s.hold(0, 30);
      s.press(Action.Right); // any key: the title
      expect(s.top).toBe('title');
      expect(s.flow.demo.world).toBeNull();
    }
    expect(played).toEqual(['t-d', 't-s', 't-d']);
  });

  it('shows the campaign zone`s card for a demo on a zone`s stage, then hides it', () => {
    const s = new FrontEndSession({ db: TWO_DEMOS.db });
    until(s, 'demo', TITLE_ATTRACT_TICKS + 1);
    expect(s.uiTexts()).toEqual(expect.arrayContaining(['STAGE', 'T-D']));
    s.press(Action.Confirm);
    until(s, 'demo', TITLE_ATTRACT_TICKS + 1);
    expect(s.flow.demo.demo!.replay.header.stageId).toBe('t-s');
    expect(s.uiTexts()).toEqual(expect.arrayContaining(['DEMO PLAY', 'ZONE S', 'START ZONE']));
    s.hold(0, 180);
    const texts = s.uiTexts();
    expect(texts).not.toContain('ZONE S');
    expect(texts).not.toContain('START ZONE');
    // The frame shows the demo World and its HUD while it plays; the title shows neither.
    expect(s.game.renderFrame().world).toBe(s.flow.demo.world!.view);
    expect(s.game.renderFrame().hud.count).toBeGreaterThan(0);
    s.press(Action.Back);
    expect(s.top).toBe('title');
    expect(s.game.renderFrame().world).toBeNull();
    expect(s.game.renderFrame().hud.count).toBe(0);
  });

  it('ends a demo that desyncs at its first differing hash (the tables come early)', () => {
    const replay = recordTestDemo(BASE, 't-d', REPLAY_HASH_INTERVAL + 300, 23);
    const hashes = replay.hashes.slice();
    hashes[0] = (hashes[0] ^ 0x5a5a) >>> 0;
    const s = new FrontEndSession({ db: withDemo({ ...replay, hashes }) });
    until(s, 'demo', TITLE_ATTRACT_TICKS + 1);
    const demo: DemoPlayback = s.flow.demo.demo!;
    s.hold(0, REPLAY_HASH_INTERVAL - 1);
    expect(s.top).toBe('demo');
    expect(demo.running).toBe(true);
    s.hold(0);
    expect(s.top).toBe('hiScore');
    expect(demo.playback.report).toMatchObject({
      ok: false,
      desyncTick: REPLAY_HASH_INTERVAL,
      finished: false,
    });
    expect(demo.world.tick).toBe(REPLAY_HASH_INTERVAL);
  });

  it('ends a demo that cannot start at once (its checkpoint is not on its stage)', () => {
    const replay = recordTestDemo(BASE, 't-d', 120, 24);
    const broken: Replay = { ...replay, header: { ...replay.header, checkpoint: 5 } };
    const s = new FrontEndSession({ db: withDemo(broken) });
    expect(s.flow.demos).toHaveLength(1); // it decodes: only starting it fails
    until(s, 'demo', TITLE_ATTRACT_TICKS + 1);
    expect(s.flow.demo.demo).toBeNull();
    expect(s.flow.demo.world).toBeNull();
    expect(s.flow.demo.started).toBe(1);
    expect(s.game.renderFrame().world).toBeNull();
    expect(s.uiTexts()).toContain('DEMO PLAY'); // no zone card without a demo
    expect(s.uiTexts()).not.toContain('STAGE');
    s.hold(0);
    expect(s.top).toBe('hiScore');
  });

  it('leaves out a demo whose stage the content lacks; the loop starts at the tables', () => {
    const db: ContentDb = {
      ...TWO_DEMOS.db,
      demos: TWO_DEMOS.db.demos.map((demo) => ({ ...demo, stage: 'gone', stageIndex: -1 })),
    };
    const s = new FrontEndSession({ db });
    expect(s.flow.demos).toEqual([]);
    s.hold(0, TITLE_ATTRACT_TICKS);
    expect(s.top).toBe('hiScore');
    expect(s.flow.demo.started).toBe(0);
  });

  it('keeps the demo playing in sync while nothing is pressed, and silent throughout', () => {
    const s = new FrontEndSession({ db: withDemo(TWO_DEMOS.zone) });
    until(s, 'demo', TITLE_ATTRACT_TICKS + 1);
    const demo = s.flow.demo.demo!;
    const from = s.events.length;
    s.hold(0, 239);
    expect(demo.playback.report).toMatchObject({ ok: true, finished: false });
    expect(s.top).toBe('demo');
    s.hold(0);
    expect(demo.playback.report).toMatchObject({ ok: true, finished: true });
    expect(s.top).toBe('hiScore');
    expect(demo.world.tick).toBe(240);
    // Up to the tables' title theme: no sound, no music, no host request from the demo World.
    const kinds = s.events.slice(from).map((e) => e[0]);
    for (const kind of [
      SimEventKind.Sfx,
      SimEventKind.MusicDuck,
      SimEventKind.Rumble,
      SimEventKind.PrepareStage,
      SimEventKind.UserOption,
      SimEventKind.SoundTest,
    ]) {
      expect(kinds, String(kind)).not.toContain(kind);
    }
    expect(s.of(SimEventKind.Music, from).map((m) => m[0])).toEqual([MUSIC_CUES.Title]);
  });
});

describe('core/scenes attract loop — input (M2-15 edge cases)', () => {
  it('returns to the title on player 2`s input too (the menus merge both controllers)', () => {
    for (const action of [Action.Confirm, Action.Up, Action.Shot]) {
      const s = new FrontEndSession({ db: TWO_DEMOS.db });
      until(s, 'demo', TITLE_ATTRACT_TICKS + 1);
      s.hold(action, 1, 1);
      expect(s.top, String(action)).toBe('title');
    }
  });

  it('never idles into the demo while a key is held on PRESS OK', () => {
    const s = new FrontEndSession({ db: TWO_DEMOS.db });
    s.hold(Action.Down, TITLE_ATTRACT_TICKS * 2);
    expect([s.top, s.flow.title.menuOpen, s.flow.title.idle]).toEqual(['title', false, 0]);
    s.hold(0, TITLE_ATTRACT_TICKS - 1);
    expect(s.top).toBe('title');
    s.hold(0);
    expect(s.top).toBe('demo');
  });

  it('on the TV: EXIT on the mode select; Back in the attract screens goes to the title', () => {
    const s = new FrontEndSession({ db: TWO_DEMOS.db, canExit: true });
    expect(s.flow.title.menu.items.map((item) => item.label)).toEqual([
      '1 PLAYER',
      '2 PLAYERS',
      'PRACTICE',
      'OPTIONS',
      'SOUND TEST',
      'EXTRA',
      'EXIT',
    ]);
    expect([TitleItem.SoundTest, TitleItem.Extra, TitleItem.Exit]).toEqual([4, 5, 6]);
    for (const screen of ['demo', 'hiScore', 'story']) {
      s.flow.stack.reset(s.flow.title);
      s.hold(0);
      until(s, screen, TITLE_ATTRACT_TICKS + 2000);
      s.press(Action.Back);
      expect(s.ids, screen).toEqual(['title']);
    }
    expect(s.exits).toBe(0);
  });

  it('on the TV: the title under the exit dialog does not idle into the demo', () => {
    const s = new FrontEndSession({ db: TWO_DEMOS.db, canExit: true });
    s.hold(0, TITLE_ATTRACT_TICKS - 100);
    s.press(Action.Back); // on PRESS OK: the exit dialog
    expect(s.ids).toEqual(['title', 'confirm']);
    s.hold(0, TITLE_ATTRACT_TICKS * 2);
    expect(s.ids).toEqual(['title', 'confirm']);
    // NO: the title idles from where it was (Back reset it), then the demo.
    s.presses([Action.Right, Action.Confirm]);
    expect(s.ids).toEqual(['title']);
    expect(s.exits).toBe(0);
    until(s, 'demo', TITLE_ATTRACT_TICKS + 1);
  });
});

describe('core/scenes attract loop — hi-score pages (M2-15 edge cases)', () => {
  it('shows at most four tables: the chosen one first, then ship × difficulty × mode order', () => {
    const save = createSaveStore(null);
    for (const key of [
      'direct-arcade-2p',
      'meter-arcade-2p',
      'meter-hard',
      'meter-easy-practice',
      'direct-easy',
      'meter-easy',
      'meter-normal',
    ]) {
      save.recordScore(key, createHiScoreEntry(100, { name: 'X' }));
    }
    const db = load(frontEndFiles(false));
    const s = new FrontEndSession({ db, save });
    s.hold(0, TITLE_ATTRACT_TICKS);
    expect(s.top).toBe('hiScore');
    expect(HI_SCORE_ATTRACT_PAGES).toBe(4);
    expect(s.flow.hiScores.pages).toEqual([
      'meter-normal',
      'meter-easy',
      'meter-easy-practice',
      'meter-hard',
    ]);
    const titles: string[] = [];
    for (let p = 0; p < HI_SCORE_ATTRACT_PAGES; p++) {
      expect(s.flow.hiScores.page).toBe(p);
      titles.push(s.uiTexts()[1]);
      s.hold(0, HI_SCORE_PAGE_TICKS);
    }
    expect(titles).toEqual([
      'KESTREL  NORMAL  1 PLAYER',
      'KESTREL  EASY  1 PLAYER',
      'KESTREL  EASY  PRACTICE',
      'KESTREL  HARD  1 PLAYER',
    ]);
    expect(s.top).toBe('title'); // no demos, no story
  });

  it('opens on the table of the difficulty chosen last under START', () => {
    const db = load(frontEndFiles(false));
    const s = new FrontEndSession({ db });
    s.press(Action.Confirm); // PRESS OK
    s.presses([Action.Confirm]); // 1 PLAYER
    expect(s.top).toBe('difficulty');
    s.presses([Action.Down, Action.Confirm]); // HARD
    expect(s.top).toBe('weaponSelect');
    expect(s.flow.difficulty).toBe('hard');
    s.presses([Action.Back]); // the difficulty menu
    s.presses([Action.Back]); // the mode select
    s.presses([Action.Back]); // PRESS OK (no exit on this platform)
    expect([s.top, s.flow.title.menuOpen]).toEqual(['title', false]);
    until(s, 'hiScore', TITLE_ATTRACT_TICKS + 1);
    expect(s.flow.hiScores.pages).toEqual(['meter-hard']);
    expect(s.uiTexts()).toEqual(expect.arrayContaining(['KESTREL  HARD  1 PLAYER', '---']));
  });

  it('shows every empty row as `---` and every rank label', () => {
    const db = load(frontEndFiles(false));
    const s = new FrontEndSession({ db });
    s.hold(0, TITLE_ATTRACT_TICKS);
    const texts = s.uiTexts();
    expect(texts.filter((text) => text === '---')).toHaveLength(10);
    for (const rank of ['1ST', '2ND', '3RD', '4TH', '10TH']) expect(texts).toContain(rank);
  });
});

/** Eight pages of six unique lines, the scenes in turn. */
const FULL_STORY = Array.from({ length: 8 }, (_, p) => ({
  scene: (['dawn', 'invasion', 'launch', 'none'] as const)[p % 4],
  lines: Array.from({ length: 6 }, (_, l) => `PAGE ${p + 1} LINE ${l + 1}`),
}));

/** Top and bottom of the story's window (rows are drawn while their y is in it). */
const WINDOW_TOP = 132;
const WINDOW_BOTTOM = 206;

describe('core/scenes attract loop — the story at its limits (M2-15 edge cases)', () => {
  it('draws exactly the rows inside its panel on every tick of an eight-page story', () => {
    const s = new FrontEndSession({ db: load(frontEndFiles(FULL_STORY)) });
    s.hold(0, TITLE_ATTRACT_TICKS + HI_SCORE_PAGE_TICKS);
    expect(s.top).toBe('story');
    const story = s.flow.story;
    expect(story.rows).toHaveLength(8 * 7);
    expect(story.duration).toBe(
      (8 * 7 * STORY_ROW_HEIGHT + (WINDOW_BOTTOM - WINDOW_TOP)) * STORY_SCROLL_TICKS +
        STORY_HOLD_TICKS,
    );
    const pages: number[] = [];
    let mismatches = 0;
    let most = 0;
    const duration = story.duration;
    for (let t = 0; t < duration - 1; t++) {
      const scroll = story.scroll;
      const expected: string[] = [];
      for (let r = 0; r < story.rows.length; r++) {
        const y = WINDOW_BOTTOM + r * STORY_ROW_HEIGHT - scroll;
        if (y < WINDOW_TOP || y > WINDOW_BOTTOM - 8 || story.rows[r] === '') continue;
        expected.push(story.rows[r]);
      }
      const texts = s.uiTexts();
      if (JSON.stringify(texts) !== JSON.stringify(expected)) mismatches++;
      if (texts.length > most) most = texts.length;
      if (pages[pages.length - 1] !== story.page) pages.push(story.page);
      s.hold(0);
    }
    expect(mismatches).toBe(0);
    expect(most).toBeGreaterThanOrEqual(6);
    expect(pages).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(s.top).toBe('story');
    s.hold(0);
    expect(s.top).toBe('title');
  });

  it('a `none` page draws no sprites; an `invasion` page draws its blasts', () => {
    const quiet = new FrontEndSession({
      db: load(frontEndFiles([{ scene: 'none', lines: ['QUIET'] }])),
    });
    quiet.hold(0, TITLE_ATTRACT_TICKS + HI_SCORE_PAGE_TICKS);
    expect(quiet.top).toBe('story');
    let sprites = 0;
    while (quiet.top === 'story') {
      sprites += quiet.uiCount(DrawOp.Sprite);
      quiet.hold(0);
    }
    expect(sprites).toBe(0);
    const war = new FrontEndSession({
      db: load(frontEndFiles([{ scene: 'invasion', lines: ['WAR'] }])),
    });
    war.hold(0, TITLE_ATTRACT_TICKS + HI_SCORE_PAGE_TICKS);
    const early = war.uiCount(DrawOp.Sprite);
    war.hold(0, 120);
    expect(war.uiCount(DrawOp.Sprite)).toBeGreaterThan(early); // the blasts after 60 ticks
  });

  it('a story without lines still crawls its blank rows, then the title', () => {
    const s = new FrontEndSession({ db: load(frontEndFiles([{ scene: 'dawn' }])) });
    expect(s.flow.story.rows).toEqual(['']);
    s.hold(0, TITLE_ATTRACT_TICKS + HI_SCORE_PAGE_TICKS);
    expect(s.top).toBe('story');
    s.hold(0, 60);
    expect(s.uiTexts()).toEqual([]);
    s.hold(0, s.flow.story.duration - 60);
    expect(s.top).toBe('title');
  });
});
