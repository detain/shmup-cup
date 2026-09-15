/**
 * Edge cases of the M2-15 front-end menus through `createGame(…, { scenes })`, beyond
 * `scenes-front-end.test.ts`:
 *
 * - **name entry:** a co-op game whose player 2 pushed player 1's tenth place out names player 2
 *   only; a co-op game player 2 never joined records one row; both co-op entries time out in
 *   turn, each with its own 30 s; Back never leaves the entry; the seconds count down;
 * - **the result table:** OK / Back locked for a moment, directions never leave, the new rows
 *   blink while the others stay put, the zone column's `-` for a stage outside the campaign;
 *   a single-stage run's `TO BE CONTINUED` leads to the name entry too; co-op and one-player games
 *   play against their own table's best;
 * - **practice select:** LOADOUT wraps both ways, the choices stay for the next visit, a
 *   `CHECKPOINT n` maps to the stage's n-th checkpoint after its start (also on a stage whose first
 *   checkpoint is not at x 0), a practice after a 2 PLAYERS visit is a one-player run;
 * - **sound test:** OK during the open lock and a held OK play nothing more, the choices wrap, the
 *   disabled MUSIC row is skipped, STOP fades the music, Back closes with the title theme;
 * - **continue polish:** the bar turns red for the last three seconds, a co-op countdown shows each
 *   player's continues instead of the score.
 */
import { describe, expect, it } from 'vitest';
import { MUSIC_CUES, SFX_CUES, SFX_CUE_NAMES, SimEventKind } from '../../src/events/index.js';
import { Action } from '../../src/input/index.js';
import { DrawOp } from '../../src/presentation/index.js';
import { createHiScoreEntry, createSaveStore } from '../../src/save/index.js';
import {
  CONTINUE_COUNTDOWN_TICKS,
  CONTINUE_LOCK_TICKS,
  GAME_OVER_DELAY_TICKS,
  HI_SCORE_LOCK_TICKS,
  HI_SCORE_RESULT_TICKS,
  NAME_ENTRY_TIMEOUT_TICKS,
  PracticeItem,
  SFX_TEST_LABELS,
  STAGE_CLEAR_DELAY_TICKS,
  SoundTestItem,
  TitleItem,
} from '../../src/scenes/index.js';
import { addScore } from '../../src/scoring/index.js';
import { UI_COLORS } from '../../src/ui/index.js';
import { frontEndContent } from '../helpers/front-end.js';
import { FrontEndSession, type FrontEndSessionOptions } from '../helpers/front-end-session.js';

const DB = frontEndContent({ demos: false }).db;

/**
 * A session on the front-end content without demos.
 *
 * @param options - Options besides the content.
 * @returns The session.
 */
function session(options: Partial<FrontEndSessionOptions> = {}): FrontEndSession {
  return new FrontEndSession({ db: DB, ...options });
}

/**
 * Enters `A` on an open name entry: OK past the empty letters, OK on END.
 *
 * @param s - The session (on the name entry).
 */
function enterA(s: FrontEndSession): void {
  s.presses([Action.Confirm, Action.Confirm, Action.Confirm, Action.Confirm]);
}

/**
 * The colour of the first text command showing a string.
 *
 * @param s - The session.
 * @param text - The string.
 * @returns Its colour, or -1 when it is not drawn.
 */
function colorOf(s: FrontEndSession, text: string): number {
  const found = s.uiTextColors().find((entry) => entry[0] === text);
  return found === undefined ? -1 : found[1];
}

describe('core/scenes name entry — edge cases (M2-15)', () => {
  it('names only player 2 when player 2`s row pushed player 1`s tenth place out', () => {
    const save = createSaveStore(null);
    for (let i = 0; i < 9; i++) {
      save.recordScore('meter-normal-2p', createHiScoreEntry(10_000 + i, { name: 'OLD' }));
    }
    const s = session({ save });
    s.start(true);
    const world = s.game.world;
    // A co-op game plays against the co-op table's best, not the one-player session hi-score.
    expect(world.scoring.board.hiScore).toBe(10_008);
    expect(s.flow.hiScore).toBe(0);
    world.players[1].active = true;
    addScore(world, 1, 600);
    s.gameOver(500);
    expect(s.top).toBe('nameEntry');
    expect(s.uiTexts()).toEqual(expect.arrayContaining(['2P', '10TH']));
    expect(s.uiTexts()).not.toContain('1P');
    s.presses([Action.Up, Action.Confirm, Action.Confirm, Action.Confirm, Action.Confirm]); // B
    expect(s.top).toBe('hiScore');
    const table = s.save.hiScores('meter-normal-2p');
    expect(table).toHaveLength(10);
    expect(table[9]).toMatchObject({ name: 'B', score: 600, mode: '2p' });
    expect(table.some((row) => row.score === 500)).toBe(false);
  });

  it('records one row when player 2 never joined the co-op game', () => {
    const s = session();
    s.start(true);
    expect(s.game.world.config.coop).toBe(true);
    expect(s.game.world.players[1].active).toBe(false);
    s.gameOver(1_234);
    expect(s.top).toBe('nameEntry');
    expect(s.uiTexts()).toContain('1P');
    enterA(s);
    expect(s.top).toBe('hiScore');
    expect(s.save.hiScores('meter-normal-2p').map((row) => [row.name, row.score])).toEqual([
      ['A', 1_234],
    ]);
  });

  it('times out each co-op entry in turn, each with its full time', () => {
    const s = session();
    s.start(true);
    s.game.world.players[1].active = true;
    addScore(s.game.world, 1, 900);
    s.gameOver(800);
    const scene = s.flow.nameEntry;
    expect(scene.seconds).toBe(NAME_ENTRY_TIMEOUT_TICKS / 60);
    s.hold(0, 60);
    expect(scene.seconds).toBe(NAME_ENTRY_TIMEOUT_TICKS / 60 - 1);
    s.presses([Action.Up, Action.Up]); // C for player 1
    s.hold(0, NAME_ENTRY_TIMEOUT_TICKS - scene.ticks - 1);
    expect(s.uiTexts()).toContain('1P');
    expect(scene.seconds).toBe(1);
    s.hold(0); // player 1's time is up: player 2's entry
    expect(s.top).toBe('nameEntry');
    expect(s.uiTexts()).toContain('2P');
    expect(scene.entry.name).toBe('A'); // a fresh entry
    expect(scene.ticks).toBe(0);
    expect(scene.seconds).toBe(NAME_ENTRY_TIMEOUT_TICKS / 60);
    s.hold(0, NAME_ENTRY_TIMEOUT_TICKS - 1);
    expect(s.top).toBe('nameEntry');
    s.hold(0);
    expect(s.top).toBe('hiScore');
    expect(s.save.hiScores('meter-normal-2p').map((row) => [row.name, row.score])).toEqual([
      ['A', 900],
      ['C', 800],
    ]);
  });

  it('never leaves the entry with Back (it only goes back a letter)', () => {
    const s = session();
    s.start();
    s.gameOver(700);
    expect(s.top).toBe('nameEntry');
    for (let i = 0; i < 5; i++) s.press(Action.Back);
    expect(s.top).toBe('nameEntry');
    expect(s.flow.nameEntry.entry.cursor).toBe(0);
    s.presses([Action.Right, Action.Right, Action.Back]);
    expect(s.flow.nameEntry.entry.cursor).toBe(1);
    const from = s.events.length;
    s.presses([Action.Confirm, Action.Confirm, Action.Confirm]); // the third letter, END, OK
    expect(s.top).toBe('hiScore');
    expect(s.of(SimEventKind.Sfx, from).map((e) => e[0])).toContain(SFX_CUES.MenuSelect);
    expect(s.save.hiScores('meter-normal')[0].name).toBe('A');
  });
});

describe('core/scenes result table — edge cases (M2-15)', () => {
  it('locks OK / Back for a moment, ignores directions, lights the new row only', () => {
    const save = createSaveStore(null);
    save.recordScore('meter-normal', createHiScoreEntry(99_000, { name: 'OLD' }));
    const s = session({ save });
    s.start();
    s.gameOver(5_000);
    s.presses([Action.Up, Action.Right, Action.Up, Action.Right, Action.Up, Action.Right]); // BAA
    s.press(Action.Confirm);
    expect(s.top).toBe('hiScore');
    expect(s.flow.hiScores.ticks).toBeLessThan(16);
    // The new row blinks between the focus and the text colour; the old one stays.
    expect(colorOf(s, 'BAA')).toBe(UI_COLORS.focus);
    expect(colorOf(s, 'OLD')).toBe(UI_COLORS.text);
    s.hold(0, 16 - s.flow.hiScores.ticks);
    expect(colorOf(s, 'BAA')).toBe(UI_COLORS.text);
    s.hold(0, 16);
    expect(colorOf(s, 'BAA')).toBe(UI_COLORS.focus);
    // Back in the lock is ignored — the table was opened a few ticks ago.
    const fresh = session({ save: createSaveStore(null) });
    fresh.start();
    fresh.gameOver(10);
    enterA(fresh);
    expect(fresh.top).toBe('hiScore');
    fresh.press(Action.Back);
    expect(fresh.top).toBe('hiScore');
    for (const action of [Action.Up, Action.Down, Action.Left, Action.Right, Action.Shot]) {
      fresh.hold(0, HI_SCORE_LOCK_TICKS);
      fresh.press(action);
      expect(fresh.top, String(action)).toBe('hiScore');
    }
    fresh.press(Action.Back);
    expect(fresh.top).toBe('title');
  });

  it('times out to the title; the zone column shows `-` for a stage outside the campaign', () => {
    // The long stage t-d is no campaign zone's: a single-stage run, its end is TO BE CONTINUED.
    const s = session({ config: { stage: 't-d' } });
    expect(s.flow.campaign).toBeNull();
    s.start();
    addScore(s.game.world, 0, 3_000);
    s.game.world.status = 'stageClear';
    s.hold(0, STAGE_CLEAR_DELAY_TICKS);
    expect(s.top).toBe('stageClear');
    s.hold(0, 2);
    s.press(Action.Confirm); // skip the tally
    expect(s.uiTexts()).toContain('TO BE CONTINUED');
    s.press(Action.Confirm);
    expect(s.top).toBe('nameEntry');
    enterA(s);
    expect(s.top).toBe('hiScore');
    expect(s.save.hiScores('meter-normal')[0]).toMatchObject({
      name: 'A',
      score: 3_000,
      reached: 't-d',
    });
    const texts = s.uiTexts();
    expect(texts).toEqual(expect.arrayContaining(['A', '-']));
    expect(s.save.data.stats.stagesCleared).toBe(1);
    s.hold(0, HI_SCORE_RESULT_TICKS - s.flow.hiScores.ticks - 1);
    expect(s.top).toBe('hiScore');
    s.hold(0);
    expect(s.top).toBe('title');
  });
});

describe('core/scenes practice select — edge cases (M2-15)', () => {
  /**
   * Opens the practice select from the title.
   *
   * @param s - The session.
   */
  const openPractice = (s: FrontEndSession): void => {
    s.press(Action.Confirm); // PRESS OK
    s.presses([Action.Down, Action.Down]);
    expect(s.flow.title.menu.focus).toBe(TitleItem.Practice);
    s.press(Action.Confirm);
    expect(s.top).toBe('practice');
    s.hold(0, 2);
  };

  /**
   * From the practice select's START: NORMAL and the weapon select's START.
   *
   * @param s - The session.
   */
  const launch = (s: FrontEndSession): void => {
    s.press(Action.Confirm); // START
    s.presses([Action.Confirm]); // NORMAL
    s.presses([Action.Confirm]); // START
    s.hold(0);
    expect(s.top).toBe('game');
  };

  it('wraps LOADOUT both ways; the choices stay for the next visit (focus back on ZONE)', () => {
    const s = session();
    openPractice(s);
    const practice = s.flow.practiceSelect;
    s.press(Action.Right); // U
    s.press(Action.Down);
    s.press(Action.Down); // LOADOUT
    const loadouts: string[] = [];
    for (const action of [Action.Left, Action.Left, Action.Right, Action.Right]) {
      s.press(action);
      loadouts.push(practice.loadout.label);
    }
    expect(loadouts).toEqual(['FULL POWER', 'STANDARD', 'FULL POWER', 'STANDARD']);
    s.press(Action.Right); // FULL POWER
    s.press(Action.Back);
    expect(s.top).toBe('title');
    expect(s.flow.title.menu.focus).toBe(TitleItem.Practice);
    s.press(Action.Confirm);
    expect(s.top).toBe('practice');
    expect(practice.menu.focus).toBe(PracticeItem.Zone);
    expect([practice.zone.label, practice.loadout.label]).toEqual(['U UPPER ZONE', 'FULL POWER']);
  });

  it('maps CHECKPOINT n to the stage`s n-th checkpoint after its start', () => {
    const db = frontEndContent({
      demos: false,
      // S: a start at x 0 and two more; U: no checkpoint at x 0 at all.
      checkpoints: { 't-s': [0, 50, 100], 't-u': [40, 80] },
    }).db;
    const s = session({ db });
    openPractice(s);
    const practice = s.flow.practiceSelect;
    expect(practice.checkpoints).toEqual([[1, 2], [0, 1], [1]]);
    s.press(Action.Down);
    s.press(Action.Right);
    s.press(Action.Right); // CHECKPOINT 2 of S
    expect(practice.checkpoint.label).toBe('CHECKPOINT 2');
    s.press(Action.Down);
    s.press(Action.Down); // START
    launch(s);
    expect([s.flow.run.stage, s.flow.run.checkpoint]).toEqual(['t-s', 2]);
    expect(s.game.world.camera.x).toBeGreaterThanOrEqual(100);
    // U: CHECKPOINT 1 is the stage's first checkpoint (index 0, x 40); START is its start.
    const t = session({ db });
    openPractice(t);
    t.press(Action.Right); // U
    t.press(Action.Down);
    t.press(Action.Right); // CHECKPOINT 1
    t.press(Action.Down);
    t.press(Action.Down);
    launch(t);
    expect([t.flow.run.stage, t.flow.run.checkpoint]).toEqual(['t-u', 0]);
    expect(t.game.world.camera.x).toBeGreaterThanOrEqual(40);
    expect(t.game.world.camera.x).toBeLessThan(80);
  });

  it('is a one-player run after a visit to 2 PLAYERS; its game over names a practice row', () => {
    const s = session();
    s.press(Action.Confirm);
    s.presses([Action.Down, Action.Confirm]); // 2 PLAYERS
    expect(s.top).toBe('difficulty');
    expect(s.flow.coop).toBe(true);
    s.presses([Action.Back]);
    expect(s.top).toBe('title');
    s.presses([Action.Down, Action.Confirm]); // PRACTICE
    expect(s.top).toBe('practice');
    s.hold(0, 2);
    s.presses([Action.Up]); // START (the menu wraps up from ZONE)
    expect(s.flow.practiceSelect.menu.focus).toBe(PracticeItem.Start);
    launch(s);
    expect(s.flow.coop).toBe(false);
    expect(s.game.world.config.coop).toBe(false);
    expect(s.flow.run.practice).toBe(true);
    expect(s.flow.run.loadout).toBe('default');
    expect(s.flow.modeKey).toBe('meter-normal');
    s.gameOver(2_000);
    expect(s.top).toBe('nameEntry');
    enterA(s);
    expect(s.flow.hiScores.key).toBe('meter-normal-practice');
    expect(s.save.hiScores('meter-normal-2p')).toEqual([]);
    expect(s.save.hiScores('meter-normal')).toEqual([]);
  });
});

describe('core/scenes session hi-score isolation — edge cases (M2-15, review round 2)', () => {
  /**
   * From the title (PRESS OK showing): PRACTICE with the practice select's defaults, NORMAL, the
   * weapon select's START.
   *
   * @param s - The session.
   */
  const startPractice = (s: FrontEndSession): void => {
    s.press(Action.Confirm);
    s.presses([Action.Down, Action.Down, Action.Confirm]); // PRACTICE
    expect(s.top).toBe('practice');
    s.presses([Action.Up, Action.Confirm]); // START
    s.presses([Action.Confirm]); // NORMAL
    s.presses([Action.Confirm]); // START
    s.hold(0);
    expect([s.top, s.flow.run.practice]).toEqual(['game', true]);
  };

  /**
   * Leaves the result table for the title.
   *
   * @param s - The session (on the result table).
   */
  const leaveTable = (s: FrontEndSession): void => {
    expect(s.top).toBe('hiScore');
    s.hold(0, HI_SCORE_LOCK_TICKS);
    s.press(Action.Confirm);
    expect(s.top).toBe('title');
  };

  it('a one-player best still counts when a practice run follows it; the practice run never does', () => {
    const s = session();
    s.start();
    s.gameOver(7_000);
    enterA(s);
    leaveTable(s);
    expect(s.flow.hiScore).toBe(7_000);
    startPractice(s);
    // The practice World plays against the (empty) practice table, the session keeps 7,000.
    expect(s.game.world.scoring.board.hiScore).toBe(0);
    expect(s.flow.hiScore).toBe(7_000);
    s.gameOver(9_000);
    enterA(s);
    expect(s.flow.hiScores.key).toBe('meter-normal-practice');
    leaveTable(s);
    expect(s.flow.hiScore).toBe(7_000);
    s.start();
    expect(s.game.world.scoring.board.hiScore).toBe(7_000);
    expect(s.flow.hiScore).toBe(7_000);
    expect(s.save.bestScore('meter-normal')).toBe(7_000);
    expect(s.save.bestScore('meter-normal-practice')).toBe(9_000);
  });

  it('a co-op score never reaches the next one-player game`s HI', () => {
    const s = session();
    s.start(true);
    s.gameOver(9_000);
    enterA(s);
    expect(s.flow.hiScores.key).toBe('meter-normal-2p');
    leaveTable(s);
    s.start();
    expect(s.game.world.config.coop).toBe(false);
    expect(s.game.world.scoring.board.hiScore).toBe(0);
    expect(s.flow.hiScore).toBe(0);
    // The co-op table's best is the next co-op game's HI.
    s.gameOver(100);
    enterA(s);
    leaveTable(s);
    s.start(true);
    expect(s.game.world.scoring.board.hiScore).toBe(9_000);
    expect(s.flow.hiScore).toBe(100);
  });

  it('RETRY STAGE in a practice run keeps its score out of the session hi-score', () => {
    const save = createSaveStore(null);
    save.recordScore('meter-normal', createHiScoreEntry(3_000));
    save.recordScore('meter-normal-practice', createHiScoreEntry(4_000));
    const s = session({ save });
    startPractice(s);
    expect(s.game.world.scoring.board.hiScore).toBe(4_000);
    addScore(s.game.world, 0, 60_000);
    const before = s.game.world;
    s.press(Action.Pause);
    expect(s.top).toBe('pause');
    s.presses([Action.Down, Action.Down, Action.Confirm]); // RETRY STAGE
    expect(s.top).toBe('game');
    expect(s.game.world).not.toBe(before);
    expect(s.flow.run.practice).toBe(true);
    expect(s.game.world.scoring.board.hiScore).toBe(4_000);
    expect(s.flow.hiScore).toBe(3_000);
  });
});

describe('core/scenes sound test — edge cases (M2-15)', () => {
  /**
   * Opens the sound test from the title (its 2-tick open lock not yet over).
   *
   * @param s - The session.
   */
  const openSoundTest = (s: FrontEndSession): void => {
    s.press(Action.Confirm);
    s.presses([Action.Down, Action.Down, Action.Down, Action.Down]);
    expect(s.flow.title.menu.focus).toBe(TitleItem.SoundTest);
    s.hold(Action.Confirm);
    expect(s.top).toBe('soundTest');
  };

  it('labels every SFX cue once, in words', () => {
    expect(SFX_TEST_LABELS).toHaveLength(SFX_CUE_NAMES.length);
    expect(new Set(SFX_TEST_LABELS).size).toBe(SFX_TEST_LABELS.length);
    for (const label of SFX_TEST_LABELS) expect(label).toMatch(/^[A-Z0-9]+( [A-Z0-9]+)*$/);
    expect(SFX_TEST_LABELS[SFX_CUES.MenuSelect]).toBe('MENU SELECT');
  });

  it('plays nothing for an OK in the open lock or a held OK; the choice wraps both ways', () => {
    const s = session({ soundTest: { music: ['ONE', 'TWO', 'THREE'] } });
    openSoundTest(s);
    const from = s.events.length;
    s.hold(Action.Confirm, 1); // still locked (the scene just opened)
    s.hold(0, 3);
    expect(s.of(SimEventKind.SoundTest, from)).toEqual([]);
    s.hold(Action.Confirm, 90); // held: one play
    s.hold(0);
    expect(s.of(SimEventKind.SoundTest, from)).toEqual([[0, 0]]);
    const test = s.flow.soundTest;
    s.press(Action.Left); // wraps to the last track
    expect(test.music.label).toBe('THREE');
    s.press(Action.Confirm);
    expect(s.of(SimEventKind.SoundTest, from).slice(-1)).toEqual([[2, 0]]);
    expect(test.music.index).toBe(2); // OK did not step it
    s.press(Action.Right); // wraps to the first
    expect(test.music.label).toBe('ONE');
    s.press(Action.Down); // SFX
    s.press(Action.Left); // wraps to the last cue
    expect(test.sound.index).toBe(SFX_TEST_LABELS.length - 1);
    const sfxFrom = s.events.length;
    s.press(Action.Confirm);
    expect(s.of(SimEventKind.Sfx, sfxFrom)).toEqual([[SFX_TEST_LABELS.length - 1, 0]]);
  });

  it('skips the disabled MUSIC row; STOP fades the music; Back closes with the title theme', () => {
    const s = session();
    openSoundTest(s);
    const test = s.flow.soundTest;
    s.hold(0, 2);
    expect(test.menu.focus).toBe(SoundTestItem.Sfx);
    s.press(Action.Up); // past the disabled MUSIC row: the menu wraps to BACK
    expect(test.menu.focus).toBe(SoundTestItem.Back);
    s.press(Action.Down); // wraps past MUSIC to SFX
    expect(test.menu.focus).toBe(SoundTestItem.Sfx);
    s.press(Action.Down); // STOP
    const stopFrom = s.events.length;
    s.press(Action.Confirm);
    expect(s.of(SimEventKind.Music, stopFrom)).toEqual([[MUSIC_CUES.Silence, 30]]);
    expect(s.of(SimEventKind.Sfx, stopFrom).map((e) => e[0])).toEqual([SFX_CUES.MenuSelect]);
    expect(s.top).toBe('soundTest');
    const backFrom = s.events.length;
    s.press(Action.Back);
    expect(s.top).toBe('title');
    expect(s.of(SimEventKind.Music, backFrom)).toEqual([[MUSIC_CUES.Title, 30]]);
    expect(s.of(SimEventKind.Sfx, backFrom).map((e) => e[0])).toEqual([SFX_CUES.MenuBack]);
    expect(s.of(SimEventKind.SoundTest)).toEqual([]);
    // The title's menu takes input again: SOUND TEST opens once more.
    s.presses([Action.Confirm]);
    expect(s.top).toBe('soundTest');
  });
});

describe('core/scenes continue polish — edge cases (M2-15)', () => {
  /**
   * The continue bar's fill: the last 3-px-high rect (drawn over its track).
   *
   * @param s - The session.
   * @returns The fill's width and colour, or `null` when only the track is drawn.
   */
  const fill = (s: FrontEndSession): { w: number; color: number } | null => {
    const ui = s.game.renderFrame().ui;
    let found: { w: number; color: number } | null = null;
    for (let i = 0; i < ui.count; i++) {
      if (ui.op[i] === DrawOp.Rect && ui.h[i] === 3 && ui.color[i] !== UI_COLORS.track) {
        found = { w: ui.w[i], color: ui.color[i] };
      }
    }
    return found;
  };

  it('turns the bar red for the last three seconds, draining to its last pixel', () => {
    const s = session({ config: { continues: 2 } });
    s.start();
    s.game.world.status = 'gameOver';
    s.hold(0, GAME_OVER_DELAY_TICKS);
    expect(s.top).toBe('continue');
    expect(fill(s)).toMatchObject({ color: UI_COLORS.title });
    const scene = s.flow.continueScreen;
    s.hold(0, CONTINUE_COUNTDOWN_TICKS - 180 - scene.ticks - 1);
    expect(scene.seconds).toBe(3);
    expect(fill(s)?.color).toBe(UI_COLORS.title);
    s.hold(0);
    expect(scene.seconds).toBe(2);
    expect(fill(s)).toEqual({ w: 36, color: UI_COLORS.alert });
    // The bar is redrawn every 6 ticks: its last look before time runs out is 1 px.
    s.hold(0, CONTINUE_COUNTDOWN_TICKS - 6 - scene.ticks);
    expect(scene.seconds).toBe(0);
    expect(fill(s)).toEqual({ w: 1, color: UI_COLORS.alert });
    s.hold(0, 5);
    expect(s.top).toBe('continue');
    s.hold(0);
    expect(s.top).toBe('gameOver');
  });

  it('shows each player`s continues in a co-op countdown, not the score', () => {
    const s = session({ config: { continues: 2 } });
    s.start(true);
    s.game.world.players[1].active = true;
    s.game.world.status = 'gameOver';
    s.hold(0, GAME_OVER_DELAY_TICKS + CONTINUE_LOCK_TICKS + 1);
    expect(s.top).toBe('continue');
    const texts = s.uiTexts();
    expect(texts).toEqual(expect.arrayContaining(['CONTINUE?', '1P', '2P', 'BACK: GIVE UP']));
    expect(texts).not.toContain('SCORE');
    expect(texts).not.toContain('CREDITS');
  });
});
