/**
 * Headless tests of the M2-15 front end's menus through `createGame(…, { scenes })`: the mode
 * select, the name entry after a game (the four directions and OK only; both players of a co-op
 * game), the hi-score table that follows it, the practice select and the isolation of practice
 * scores (their own table, the session hi-score untouched), the sound test's events and the
 * polished continue countdown.
 */
import { describe, expect, it } from 'vitest';
import { PLAYFIELD_W } from '../../src/config/index.js';
import type { ContentDb } from '../../src/data/index.js';
import { MUSIC_CUES, SFX_CUES, SimEventKind } from '../../src/events/index.js';
import { createGame, type Game } from '../../src/game/index.js';
import { Action, commitPlayerInput, type ActionMask } from '../../src/input/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';
import { DrawOp } from '../../src/presentation/index.js';
import { createHiScoreEntry, createSaveStore, type SaveStore } from '../../src/save/index.js';
import {
  CONTINUE_LOCK_TICKS,
  GAME_OVER_DELAY_TICKS,
  GAME_OVER_LOCK_TICKS,
  HI_SCORE_LOCK_TICKS,
  HI_SCORE_RESULT_TICKS,
  NAME_ENTRY_TIMEOUT_TICKS,
  PRACTICE_LOADOUT_LABELS,
  PracticeItem,
  SFX_TEST_LABELS,
  SoundTestItem,
  TitleItem,
  type SceneFlow,
  type SoundTestSetup,
} from '../../src/scenes/index.js';
import { addScore } from '../../src/scoring/index.js';
import { frontEndContent } from '../helpers/front-end.js';

const DB = frontEndContent({ demos: false }).db;

/** A headless session of the scene flow. */
class Session {
  readonly platform = createHeadlessPlatform();
  readonly game: Game;
  readonly flow: SceneFlow;
  /** Drained events: `[kind, id, param, x]`. */
  readonly events: Array<[number, number, number, number]> = [];

  /**
   * Starts on the title (campaign mode: the host stage is the start zone's).
   *
   * @param options - Content, save, config, sound test.
   * @param options.db - The content.
   * @param options.save - The save.
   * @param options.coop - A co-op game.
   * @param options.continues - Continues (default 0).
   * @param options.soundTest - The host's music titles.
   */
  constructor(
    options: {
      db?: ContentDb;
      save?: SaveStore;
      coop?: boolean;
      continues?: number;
      soundTest?: SoundTestSetup | null;
    } = {},
  ) {
    this.save = options.save ?? createSaveStore(null);
    this.game = createGame(
      this.platform,
      { seed: 9, stage: 't-s', continues: options.continues ?? 0, coop: options.coop ?? false },
      options.db ?? DB,
      { scenes: 'title', save: this.save, soundTest: options.soundTest ?? null },
    );
    this.flow = this.game.scenes!;
  }

  /** The save. */
  readonly save: SaveStore;

  /** The top scene's id. */
  get top(): string | undefined {
    return this.flow.stack.top?.id;
  }

  /**
   * Runs ticks with a held mask, draining the events.
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
        this.events.push([e.kind, e.id, e.param, e.x]);
      });
    }
  }

  /**
   * A press (a tick down, a tick up).
   *
   * @param action - The action.
   */
  press(action: ActionMask): void {
    this.hold(action);
    this.hold(0);
  }

  /**
   * Presses a sequence (a 2-tick pause first, for a menu that just opened).
   *
   * @param actions - The actions.
   */
  presses(actions: readonly ActionMask[]): void {
    this.hold(0, 2);
    for (const action of actions) this.press(action);
  }

  /**
   * Starts a game from the title (1 PLAYER or 2 PLAYERS, NORMAL, the weapon select's START).
   *
   * @param coop - 2 PLAYERS.
   */
  start(coop = false): void {
    this.press(Action.Confirm); // PRESS OK
    this.presses(coop ? [Action.Down, Action.Confirm] : [Action.Confirm]); // 1 / 2 PLAYERS
    this.presses([Action.Confirm]); // NORMAL
    this.presses([Action.Confirm]); // START (one ship: no ship select)
    this.hold(0);
    expect(this.top).toBe('game');
  }

  /**
   * Ends the game on its game-over screen with a score and leaves it.
   *
   * @param score - Player 1's score.
   */
  gameOver(score: number): void {
    addScore(this.game.world, 0, score);
    this.game.world.status = 'gameOver';
    this.hold(0, GAME_OVER_DELAY_TICKS + GAME_OVER_LOCK_TICKS + 1);
    expect(this.top).toBe('gameOver');
    this.press(Action.Confirm);
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
   * @returns `[id, param]` pairs.
   */
  of(kind: number, from = 0): Array<[number, number]> {
    return this.events.slice(from).flatMap((e) => (e[0] === kind ? [[e[1], e[2]]] : []));
  }

  /**
   * The x positions of a kind's events drained from an index on.
   *
   * @param kind - A `SimEventKind`.
   * @param from - First event index.
   * @returns Their x.
   */
  xOf(kind: number, from = 0): number[] {
    return this.events.slice(from).flatMap((e) => (e[0] === kind ? [e[3]] : []));
  }
}

/** Only the remote's four directions and OK. */
const FOUR_WAY = Action.Up | Action.Down | Action.Left | Action.Right | Action.Confirm;

describe('core/scenes name entry and hi-score table (M2-15)', () => {
  it('names a new hi-score with the four directions and OK only, then shows the table', () => {
    const s = new Session();
    s.start();
    s.gameOver(12_300);
    expect(s.top).toBe('nameEntry');
    expect(s.uiTexts()).toEqual(expect.arrayContaining(['NEW HI-SCORE!', '1P', '1ST']));
    expect(s.save.hiScores('meter-normal')[0]).toMatchObject({ name: '---', score: 12_300 });
    // B (Up from A), Right, O (Up × 15 on the empty letter), Right, B (Up × 2), Right → END.
    const keys: number[] = [Action.Up, Action.Right];
    for (let i = 0; i < 15; i++) keys.push(Action.Up);
    keys.push(Action.Right, Action.Up, Action.Up, Action.Right);
    s.presses(keys);
    for (const key of keys) expect(key & ~FOUR_WAY).toBe(0);
    expect(s.flow.nameEntry.entry.name).toBe('BOB');
    // Left goes back to edit: O → N, then Right, Right to END again.
    s.presses([Action.Left, Action.Left, Action.Down, Action.Right, Action.Right]);
    expect(s.flow.nameEntry.entry.name).toBe('BNB');
    s.press(Action.Confirm); // OK on END
    expect(s.top).toBe('hiScore');
    expect(s.save.hiScores('meter-normal')[0]).toMatchObject({ name: 'BNB', score: 12_300 });
    expect(s.flow.hiScores.key).toBe('meter-normal');
    expect(s.uiTexts()).toEqual(expect.arrayContaining(['HI-SCORES', 'BNB', 'S']));
    // OK is locked for a moment, then leaves to the title.
    s.press(Action.Confirm);
    expect(s.top).toBe('hiScore');
    s.hold(0, HI_SCORE_LOCK_TICKS);
    s.press(Action.Confirm);
    expect(s.top).toBe('title');
  });

  it('takes the name as it stands after the timeout; the table then times out too', () => {
    const s = new Session();
    s.start();
    s.gameOver(500);
    s.presses([Action.Up, Action.Up]); // C
    s.hold(0, NAME_ENTRY_TIMEOUT_TICKS);
    expect(s.top).toBe('hiScore');
    expect(s.save.hiScores('meter-normal')[0].name).toBe('C');
    s.hold(0, HI_SCORE_RESULT_TICKS);
    expect(s.top).toBe('title');
  });

  it('goes straight to the title when the score did not enter the table', () => {
    const save = createSaveStore(null);
    for (let i = 0; i < 10; i++) save.recordScore('meter-normal', createHiScoreEntry(90_000 + i));
    const s = new Session({ save });
    s.start();
    s.gameOver(100);
    expect(s.top).toBe('title');
  });

  it('names both players of a co-op game, each row in the co-op table', () => {
    const s = new Session();
    s.start(true);
    const world = s.game.world;
    world.players[1].active = true;
    addScore(world, 1, 7_000);
    s.gameOver(4_000);
    expect(s.top).toBe('nameEntry');
    expect(s.uiTexts()).toContain('1P');
    s.presses([Action.Confirm, Action.Confirm, Action.Confirm, Action.Confirm]); // A
    expect(s.top).toBe('nameEntry');
    expect(s.uiTexts()).toContain('2P');
    s.presses([Action.Up, Action.Confirm, Action.Confirm, Action.Confirm, Action.Confirm]); // B
    expect(s.top).toBe('hiScore');
    expect(s.flow.hiScores.key).toBe('meter-normal-2p');
    expect(s.save.hiScores('meter-normal-2p').map((r) => [r.name, r.score, r.mode])).toEqual([
      ['B', 7_000, '2p'],
      ['A', 4_000, '2p'],
    ]);
    expect(s.save.hiScores('meter-normal')).toEqual([]);
    // Co-op scores never raise the one-player session hi-score.
    s.hold(0, HI_SCORE_LOCK_TICKS);
    s.press(Action.Confirm);
    expect(s.flow.hiScore).toBe(0);
  });
});

describe('core/scenes practice select (M2-15)', () => {
  it('chooses zone, checkpoint and loadout, then the difficulty and weapon select', () => {
    const s = new Session();
    s.press(Action.Confirm);
    s.presses([Action.Down, Action.Down]); // PRACTICE
    expect(s.flow.title.menu.focus).toBe(TitleItem.Practice);
    s.press(Action.Confirm);
    expect(s.top).toBe('practice');
    const practice = s.flow.practiceSelect;
    expect(practice.zone.labels).toEqual(['S START ZONE', 'U UPPER ZONE', 'L LOWER ZONE']);
    expect(practice.checkpoint.labels).toEqual(['START', 'CHECKPOINT 1']);
    expect(practice.loadout.labels).toEqual(PRACTICE_LOADOUT_LABELS);
    s.presses([Action.Right]); // U
    s.press(Action.Down);
    s.press(Action.Right); // CHECKPOINT 1
    expect(practice.checkpoint.label).toBe('CHECKPOINT 1');
    s.press(Action.Right); // wraps to START (one checkpoint after the start)
    expect(practice.checkpoint.label).toBe('START');
    s.press(Action.Left); // back to CHECKPOINT 1
    s.press(Action.Down);
    s.press(Action.Right); // FULL POWER
    s.press(Action.Down);
    expect(practice.menu.focus).toBe(PracticeItem.Start);
    s.press(Action.Confirm);
    expect(s.top).toBe('difficulty');
    // Back returns to the practice select; START again, then NORMAL and the weapon select.
    s.presses([Action.Back]);
    expect(s.top).toBe('practice');
    s.presses([Action.Confirm]);
    s.presses([Action.Confirm]); // NORMAL
    expect(s.top).toBe('weaponSelect');
    s.presses([Action.Confirm]); // START
    s.hold(0);
    expect(s.top).toBe('game');
    const run = s.flow.run;
    expect([run.practice, run.stage, run.checkpoint, run.loadout]).toEqual([
      true,
      't-u',
      1,
      'full',
    ]);
    const world = s.game.world;
    expect(world.config.loadout).toBe('full');
    expect(world.weapons.loadouts[0].options).toBeGreaterThan(0);
    expect(world.camera.x).toBeGreaterThanOrEqual(100);
  });

  it('wraps CHECKPOINT within the focused zone`s checkpoints both ways', () => {
    // S has two checkpoints after its start, U three (the choice's labels run to three), L none.
    const db = frontEndContent({
      demos: false,
      checkpoints: { 't-s': [0, 50, 100], 't-u': [0, 40, 80, 120], 't-l': [0] },
    }).db;
    const s = new Session({ db });
    s.press(Action.Confirm);
    s.presses([Action.Down, Action.Down, Action.Confirm]); // PRACTICE
    expect(s.top).toBe('practice');
    const practice = s.flow.practiceSelect;
    expect(practice.checkpoint.labels).toEqual([
      'START',
      'CHECKPOINT 1',
      'CHECKPOINT 2',
      'CHECKPOINT 3',
    ]);
    s.presses([Action.Down]); // CHECKPOINT (zone S)
    const labels = (): string[] => {
      const out: string[] = [];
      for (const action of [Action.Left, Action.Left, Action.Left, Action.Right, Action.Right]) {
        s.press(action);
        out.push(practice.checkpoint.label);
      }
      return out;
    };
    // Left from START wraps to the zone's last, Right from its last wraps to START.
    expect(labels()).toEqual([
      'CHECKPOINT 2',
      'CHECKPOINT 1',
      'START',
      'CHECKPOINT 1',
      'CHECKPOINT 2',
    ]);
    s.press(Action.Right);
    expect(practice.checkpoint.label).toBe('START');
    // U: the choice's full range.
    s.press(Action.Up);
    s.press(Action.Right);
    s.press(Action.Down);
    expect(practice.checkpoint.label).toBe('START');
    s.press(Action.Left);
    expect(practice.checkpoint.label).toBe('CHECKPOINT 3');
    // A zone with fewer takes its last; L (none) keeps START both ways.
    s.press(Action.Up);
    s.press(Action.Left);
    expect([practice.zone.index, practice.checkpoint.label]).toEqual([0, 'CHECKPOINT 2']);
    s.press(Action.Left); // L (wraps)
    expect([practice.zone.index, practice.checkpoint.label]).toEqual([2, 'START']);
    s.press(Action.Down);
    s.press(Action.Left);
    expect(practice.checkpoint.label).toBe('START');
    s.press(Action.Right);
    expect(practice.checkpoint.label).toBe('START');
  });

  it('keeps practice scores in their own table and out of the session hi-score', () => {
    const save = createSaveStore(null);
    save.recordScore('meter-normal', createHiScoreEntry(3_000, { name: 'TOP' }));
    save.recordScore('meter-normal-practice', createHiScoreEntry(8_000, { name: 'OLD' }));
    const s = new Session({ save });
    expect(s.flow.startPractice('l', -1, 'default')).toBe(true);
    s.hold(0);
    // The HUD's HI is the practice table's best, not the game's.
    expect(s.game.world.scoring.board.hiScore).toBe(8_000);
    s.gameOver(5_000);
    expect(s.top).toBe('nameEntry');
    s.presses([Action.Confirm, Action.Confirm, Action.Confirm, Action.Confirm]);
    expect(s.flow.hiScores.key).toBe('meter-normal-practice');
    expect(save.hiScores('meter-normal-practice').map((r) => [r.name, r.score, r.mode])).toEqual([
      ['OLD', 8_000, ''],
      ['A', 5_000, 'practice'],
    ]);
    expect(save.hiScores('meter-normal').map((r) => r.score)).toEqual([3_000]);
    expect(s.flow.hiScore).toBe(3_000);
    // Practice counts no game over in the stats.
    expect(save.data.stats.gameOvers).toBe(0);
  });

  it('is disabled without a campaign; Back closes it and a normal start follows', () => {
    const plain = frontEndContent({ demos: false });
    const noCampaign: ContentDb = { ...plain.db, campaign: null };
    const s = new Session({ db: noCampaign });
    expect(s.flow.title.menu.enabled(TitleItem.Practice)).toBe(false);
    const t = new Session();
    t.press(Action.Confirm);
    t.presses([Action.Down, Action.Down, Action.Confirm]);
    expect(t.top).toBe('practice');
    t.presses([Action.Back]);
    expect(t.top).toBe('title');
    // A normal start afterwards is no practice run.
    t.presses([Action.Up, Action.Up, Action.Confirm]); // 1 PLAYER
    t.presses([Action.Confirm]); // NORMAL
    t.presses([Action.Confirm]); // START
    t.hold(0);
    expect([t.top, t.flow.run.practice, t.flow.run.stage]).toEqual(['game', false, 't-s']);
  });
});

describe('core/scenes sound test (M2-15)', () => {
  it('plays the host`s tracks and every SFX cue, stops the music, BACK brings the title theme', () => {
    const s = new Session({ soundTest: { music: ['FIRST SONG', 'SECOND SONG'] } });
    s.press(Action.Confirm);
    s.presses([Action.Down, Action.Down, Action.Down, Action.Down]); // SOUND TEST
    expect(s.flow.title.menu.focus).toBe(TitleItem.SoundTest);
    s.press(Action.Confirm);
    expect(s.top).toBe('soundTest');
    const test = s.flow.soundTest;
    expect(test.music.labels).toEqual(['FIRST SONG', 'SECOND SONG']);
    expect(test.sound.labels).toEqual(SFX_TEST_LABELS);
    expect(SFX_TEST_LABELS[SFX_CUES.PlayerShot]).toBe('PLAYER SHOT');
    expect(SFX_TEST_LABELS[SFX_CUES.EnemyExplodeSmall]).toBe('ENEMY EXPLODE SMALL');
    const from = s.events.length;
    s.hold(0, 2);
    s.press(Action.Right); // SECOND SONG
    s.press(Action.Confirm); // plays it (OK does not step the choice)
    expect(test.music.index).toBe(1);
    expect(s.of(SimEventKind.SoundTest, from)).toEqual([[1, 0]]);
    s.press(Action.Confirm); // again
    expect(s.of(SimEventKind.SoundTest, from)).toHaveLength(2);
    s.press(Action.Down); // SFX
    s.press(Action.Right);
    s.press(Action.Right);
    const sfxFrom = s.events.length;
    s.press(Action.Confirm);
    expect(s.of(SimEventKind.Sfx, sfxFrom)).toEqual([[SFX_CUES.LaserHum, 0]]);
    // At the playfield's centre: a positional cue pans to the middle.
    expect(s.xOf(SimEventKind.Sfx, sfxFrom)).toEqual([PLAYFIELD_W / 2]);
    s.press(Action.Down); // STOP
    expect(test.menu.focus).toBe(SoundTestItem.Stop);
    const stopFrom = s.events.length;
    s.press(Action.Confirm);
    expect(s.of(SimEventKind.Music, stopFrom).map((m) => m[0])).toEqual([MUSIC_CUES.Silence]);
    s.press(Action.Down); // BACK
    const backFrom = s.events.length;
    s.press(Action.Confirm);
    expect(s.top).toBe('title');
    expect(s.of(SimEventKind.Music, backFrom).map((m) => m[0])).toEqual([MUSIC_CUES.Title]);
  });

  it('has no MUSIC row without the host`s titles; Back closes it', () => {
    const s = new Session();
    s.press(Action.Confirm);
    s.presses([Action.Down, Action.Down, Action.Down, Action.Down, Action.Confirm]);
    expect(s.top).toBe('soundTest');
    const test = s.flow.soundTest;
    expect(test.menu.enabled(SoundTestItem.Music)).toBe(false);
    expect(test.menu.focus).toBe(SoundTestItem.Sfx);
    const from = s.events.length;
    s.presses([Action.Confirm]);
    expect(s.of(SimEventKind.Sfx, from)).toEqual([[SFX_CUES.PlayerShot, 0]]);
    expect(s.xOf(SimEventKind.Sfx, from)).toEqual([PLAYFIELD_W / 2]);
    s.press(Action.Back);
    expect(s.top).toBe('title');
    expect(s.of(SimEventKind.SoundTest)).toEqual([]);
  });
});

describe('core/scenes continue countdown polish (M2-15)', () => {
  it('shows the score, a draining bar and PRESS OK once OK counts', () => {
    const s = new Session({ continues: 2 });
    s.start();
    addScore(s.game.world, 0, 2_500);
    s.game.world.status = 'gameOver';
    s.hold(0, GAME_OVER_DELAY_TICKS);
    expect(s.top).toBe('continue');
    expect(s.uiTexts()).toEqual(expect.arrayContaining(['CONTINUE?', 'SCORE', 'CREDITS']));
    expect(s.uiTexts()).not.toContain('PRESS OK'); // not yet: OK is locked
    // The time bar: its 120-px track, then the fill drawn over it (the last 3-px rect).
    const bar = (): number => {
      const ui = s.game.renderFrame().ui;
      let width = -1;
      for (let i = 0; i < ui.count; i++) {
        if (ui.op[i] === DrawOp.Rect && ui.h[i] === 3) width = ui.w[i];
      }
      return width;
    };
    const full = bar();
    expect(full).toBeGreaterThan(110);
    s.hold(0, CONTINUE_LOCK_TICKS + 2);
    expect(bar()).toBeLessThan(full);
    expect(s.uiTexts()).toEqual(expect.arrayContaining(['PRESS OK', 'BACK: GIVE UP']));
  });
});
