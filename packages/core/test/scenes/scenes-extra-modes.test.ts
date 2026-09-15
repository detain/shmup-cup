/**
 * `core/scenes` — plan M3-01's extra modes through the scene flow, on the front-end test content
 * (the S → U | L campaign on tiny open stages) plus a `boss-rush` stage and the Extra Edit weapons:
 *
 * - the title's EXTRA menu (disabled rows without their content), BOSS RUSH on the `boss-rush`
 *   stage, CARAVAN on the chosen zone against the clock (TIME UP, its own table), ARCADE on the
 *   chosen loop (LOOP 2 locked until an ending) looping on after its ending;
 * - an ending unlocking Extra Edit and LOOP 2; the weapon select's EXTRA type skipped until then;
 * - the run replays: the last game in the library, the browser's KEEP / SHARE / DELETE and a
 *   playback to its end in lockstep, fast-forwarded;
 * - the GAME page's assists: the invincibility assist and the game speed mark the run (the hi-score
 *   row and the replay).
 */
import { describe, expect, it } from 'vitest';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { Action } from '../../src/input/index.js';
import { createMemoryStorage } from '../../src/platform/index.js';
import { createSaveStore } from '../../src/save/index.js';
import {
  AssistFlag,
  REPLAY_SLOTS,
  createReplayLibrary,
  runAssisted,
  type ReplayLibrary,
} from '../../src/replay/index.js';
import {
  BOSS_RUSH_STAGE,
  CARAVAN_TICKS,
  ControlsItem,
  ExtraItem,
  GameOptionsItem,
  OptionsItem,
  PauseItem,
  ReplayActionItem,
  TitleItem,
  WeaponSelectItem,
} from '../../src/scenes/index.js';
import { ConfirmChoice } from '../../src/ui/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
import { shipped, stage } from '../helpers/campaign.js';
import { frontEndFiles } from '../helpers/front-end.js';
import { FrontEndSession, type FrontEndSessionOptions } from '../helpers/front-end-session.js';

/**
 * The front-end content plus a boss-rush stage and the Extra Edit weapons.
 *
 * @param bossRush - Include the `boss-rush` stage.
 * @returns The DB.
 */
function extraContent(bossRush = true): ContentDb {
  const files = [...frontEndFiles(false), shipped('weapons/types-extra.weapons.json')];
  if (bossRush) files.push(stage(BOSS_RUSH_STAGE, { events: [{ x: 300, type: 'end' }] }));
  const { db, issues } = loadContent(files, { extraSprites: ENGINE_SPRITES });
  expect(issues).toEqual([]);
  return db;
}

const DB = extraContent();

/** A session with extra helpers for the EXTRA menu. */
class ExtraSession extends FrontEndSession {
  /**
   * Starts on the title.
   *
   * @param options - Session options (the content defaults to the extra content).
   */
  constructor(options: Partial<FrontEndSessionOptions> = {}) {
    super({ db: DB, ...options });
  }

  /** From the title: PRESS OK, EXTRA. */
  openExtra(): void {
    this.press(Action.Confirm);
    this.hold(0, 2);
    for (let i = 0; i < 8 && this.flow.title.menu.focus !== TitleItem.Extra; i++) {
      this.press(Action.Down);
    }
    expect(this.flow.title.menu.focus).toBe(TitleItem.Extra);
    this.press(Action.Confirm);
    expect(this.top).toBe('extra');
    this.hold(0, 2);
  }

  /**
   * Focuses an EXTRA row with Down presses.
   *
   * @param item - An {@link ExtraItem}.
   */
  focusExtra(item: number): void {
    for (let i = 0; i < 8 && this.flow.extra.menu.focus !== item; i++) this.press(Action.Down);
    expect(this.flow.extra.menu.focus).toBe(item);
  }

  /** Confirms the focused EXTRA mode: NORMAL, then the weapon select's START. */
  startMode(): void {
    this.press(Action.Confirm);
    expect(this.top).toBe('difficulty');
    this.presses([Action.Confirm]); // NORMAL
    this.presses([Action.Confirm]); // START
    this.hold(0);
    expect(this.top).toBe('game');
  }

  /**
   * Runs until a scene is on top.
   *
   * @param id - The scene id.
   * @param limit - Tick limit.
   */
  until(id: string, limit = 4000): void {
    for (let i = 0; i < limit && this.top !== id; i++) this.hold(0);
    expect(this.top).toBe(id);
  }

  /** Quits the game in progress: the pause menu's QUIT, YES. */
  quit(): void {
    this.press(Action.Pause);
    expect(this.top).toBe('pause');
    this.hold(0, 2);
    for (let i = 0; i < 3; i++) this.press(Action.Down);
    expect(this.flow.pause.menu.focus).toBe(PauseItem.Quit);
    this.press(Action.Confirm);
    expect(this.top).toBe('confirm');
    this.hold(0, 2);
    this.press(Action.Left);
    expect(this.flow.confirm.prompt.focus).toBe(ConfirmChoice.Yes);
    this.press(Action.Confirm);
    this.hold(0, 2);
  }

  /** Leaves a name entry and the hi-score table (if one is up) back to the title. */
  leaveNames(): void {
    for (let names = 0; names < 2 && this.top === 'nameEntry'; names++) {
      this.hold(0, 2);
      for (let i = 0; i < 4; i++) this.press(Action.Confirm);
    }
    if (this.top === 'hiScore') {
      this.hold(0, 200);
      this.press(Action.Confirm);
    }
  }
}

describe('core/scenes EXTRA menu (M3-01)', () => {
  it('offers the modes whose content exists', () => {
    const s = new ExtraSession();
    s.openExtra();
    const menu = s.flow.extra.menu;
    expect(menu.enabled(ExtraItem.BossRush)).toBe(true);
    expect(menu.enabled(ExtraItem.Caravan)).toBe(true);
    expect(menu.enabled(ExtraItem.Arcade)).toBe(true);
    expect(menu.enabled(ExtraItem.Replays)).toBe(false); // no library
    expect(s.uiTexts()).toEqual(
      expect.arrayContaining(['EXTRA', 'BOSS RUSH', 'CARAVAN', 'ARCADE', 'REPLAYS', 'BACK']),
    );
    s.press(Action.Back);
    expect(s.top).toBe('title');
    // Without the boss-rush stage its row is disabled, the menu opens on CARAVAN.
    const bare = new ExtraSession({ db: extraContent(false) });
    bare.openExtra();
    expect(bare.flow.extra.menu.enabled(ExtraItem.BossRush)).toBe(false);
    expect(bare.flow.extra.menu.focus).toBe(ExtraItem.Caravan);
  });

  it('BOSS RUSH plays the boss-rush stage into its own table', () => {
    const s = new ExtraSession();
    s.openExtra();
    s.startMode();
    const world = s.game.world;
    expect(world.stage?.stage.id).toBe(BOSS_RUSH_STAGE);
    expect(s.flow.run.mode).toBe('bossRush');
    expect(s.flow.run.campaign).toBeNull();
    s.gameOver(12_340);
    s.leaveNames();
    expect(s.save.data.hiScores['meter-normal-bossrush']?.[0]?.score).toBe(12_340);
    expect(s.save.data.hiScores['meter-normal']).toBeUndefined();
  });

  it('CARAVAN plays the chosen zone against the clock: TIME UP, its own table, the title', () => {
    const s = new ExtraSession();
    s.openExtra();
    s.focusExtra(ExtraItem.Caravan);
    s.press(Action.Right); // the next zone: U
    expect(s.flow.extra.zone.index).toBe(1);
    s.startMode();
    const world = s.game.world;
    expect(world.stage?.stage.id).toBe('t-u');
    expect(world.config.timeLimit).toBe(CARAVAN_TICKS);
    expect(world.timeLeft).toBeGreaterThan(CARAVAN_TICKS - 10);
    expect(s.flow.run.mode).toBe('caravan');
    s.hold(0, 30);
    expect(world.timeLeft).toBeLessThan(CARAVAN_TICKS);
    world.timeLeft = 2;
    s.until('stageClear');
    expect(world.timeUp).toBe(true);
    expect(s.uiTexts()).toContain('TIME UP');
    s.press(Action.Confirm);
    s.leaveNames();
    expect(s.top).toBe('title');
    expect(s.save.data.hiScores['meter-normal-caravan']).toHaveLength(1);
  });

  it('ARCADE: LOOP 2 locked until an ending, which unlocks it and Extra Edit; the loop goes on', () => {
    const s = new ExtraSession();
    s.openExtra();
    s.focusExtra(ExtraItem.Arcade);
    s.press(Action.Right);
    expect(s.flow.extra.loop.index).toBe(0); // LOOP 2 is locked
    s.startMode();
    expect([s.flow.run.mode, s.flow.run.loop, s.game.world.config.loop]).toEqual(['arcade', 1, 1]);
    // Zone S, then U: the final zone's clear is an ending.
    s.until('stageClear');
    s.press(Action.Confirm);
    s.until('map');
    s.hold(0, 3);
    s.press(Action.Confirm);
    s.until('game');
    expect(s.save.unlocked('extraEdit')).toBe(false);
    s.until('stageClear');
    s.press(Action.Confirm);
    expect(s.top).toBe('ending');
    expect(s.save.unlocked('extraEdit')).toBe(true);
    expect(s.save.unlocked('loop2')).toBe(true);
    // No hi-score yet: the run goes on. The ending's OK starts loop 2 on the first zone.
    s.until('ending');
    for (let i = 0; i < 20 && s.top === 'ending'; i++) {
      s.hold(0, 30);
      s.press(Action.Confirm);
    }
    expect(s.top).toBe('game');
    expect([s.flow.run.loop, s.game.world.config.loop]).toEqual([2, 2]);
    expect(s.game.world.stage?.stage.id).toBe('t-s');
    expect(s.game.world.rankInputs.loop).toBe(2);
    // Game over: the ARCADE table.
    s.gameOver(9000);
    s.leaveNames();
    expect(s.save.data.hiScores['meter-normal-arcade']?.[0]?.score).toBeGreaterThanOrEqual(9000);
    // Back on the EXTRA menu, LOOP 2 can be chosen now.
    const again = new ExtraSession({ save: s.save });
    again.openExtra();
    again.focusExtra(ExtraItem.Arcade);
    again.press(Action.Right);
    expect(again.flow.extra.loop.index).toBe(1);
    again.startMode();
    expect(again.game.world.config.loop).toBe(2);
  });

  it('the weapon select`s EXTRA type is skipped until Extra Edit is unlocked', () => {
    const s = new ExtraSession();
    s.press(Action.Confirm);
    s.presses([Action.Confirm]); // 1 PLAYER
    s.presses([Action.Confirm]); // NORMAL
    s.hold(0, 2);
    const select = s.flow.weaponSelect;
    expect(s.top).toBe('weaponSelect');
    const labels = select.type.labels;
    expect(labels[labels.length - 1]).toBe('EXTRA');
    expect(labels[labels.length - 2]).toBe('EDIT');
    // Up to TYPE, then Left: the wrap lands past EXTRA on EDIT.
    for (let i = 0; i < 12 && select.menu.focus !== WeaponSelectItem.Type; i++) s.press(Action.Up);
    expect(select.menu.focus).toBe(WeaponSelectItem.Type);
    s.press(Action.Left);
    expect(labels[select.type.index]).toBe('EDIT');
    s.press(Action.Right);
    expect(select.type.index).toBe(0);
    // Unlocked: EXTRA offers the Extra Edit weapons.
    s.save.unlock('extraEdit');
    s.press(Action.Left);
    expect(labels[select.type.index]).toBe('EXTRA');
    expect(select.extra).toBe(true);
    s.press(Action.Down); // MISSILE
    const names = new Set<string>();
    for (let i = 0; i < 12; i++) {
      names.add(select.missile.labels[select.missile.index]);
      s.press(Action.Right);
    }
    expect([...names]).toEqual(expect.arrayContaining(['CONTROL MISSILE', 'HAWK WIND']));
  });
});

describe('core/scenes run replays and assists (M3-01)', () => {
  /**
   * A session with a replay library (and a share that records the text).
   *
   * @returns The session, its library and the shared texts.
   */
  function withLibrary(): { s: ExtraSession; library: ReplayLibrary; shared: string[] } {
    const library = createReplayLibrary(createMemoryStorage());
    const shared: string[] = [];
    const s = new ExtraSession({
      replays: library,
      shareReplay: (text) => {
        shared.push(text);
        return true;
      },
    });
    return { s, library, shared };
  }

  it('records the last game; the browser keeps, shares, plays (fast-forwarded) and deletes it', () => {
    const { s, library, shared } = withLibrary();
    s.start();
    s.hold(Action.Up | Action.Shot, 50);
    s.hold(Action.Down | Action.Right, 50);
    const score = s.game.world.scoring.board.scores[0].score;
    s.quit();
    expect(s.top).toBe('title');
    const last = s.flow.lastReplay;
    expect(last).not.toBeNull();
    expect(last!.segments).toHaveLength(1);
    expect(library.summaries[0]?.score).toBe(score);
    expect(library.summaries[0]?.assisted).toBe(false);
    // EXTRA → REPLAYS → LAST GAME → KEEP.
    s.openExtra();
    s.focusExtra(ExtraItem.Replays);
    s.press(Action.Confirm);
    expect(s.top).toBe('replays');
    s.hold(0, 2);
    const browser = s.flow.replaysScreen;
    s.press(Action.Confirm);
    expect(browser.choosing).toBe(true);
    s.hold(0, 2);
    s.press(Action.Down); // KEEP
    s.press(Action.Confirm);
    expect(library.summaries[1]).not.toBeNull();
    // SHARE the kept one.
    s.hold(0, 2);
    s.press(Action.Down);
    s.press(Action.Confirm);
    s.hold(0, 2);
    s.press(Action.Down); // SHARE (KEEP is for the last game only)
    expect(browser.actions.focus).toBe(ReplayActionItem.Share);
    s.press(Action.Confirm);
    expect(shared).toHaveLength(1);
    expect(shared[0]).toBe(library.exportText(1));
    // PLAY it, fast-forwarded, to the end in lockstep.
    s.hold(0, 2);
    s.press(Action.Confirm);
    s.hold(0, 2);
    s.press(Action.Confirm); // PLAY
    expect(s.top).toBe('replay');
    const screen = s.flow.replayScreen;
    s.press(Action.Right);
    s.press(Action.Right);
    expect(screen.speed).toBe(2);
    const playback = screen.playback!;
    for (let i = 0; i < 2000 && screen.endTicks < 0; i++) s.hold(0);
    expect(playback.running).toBe(false);
    expect(playback.report.ok).toBe(true);
    expect(s.uiTexts()).toContain('REPLAY END');
    s.press(Action.Confirm);
    expect(s.top).toBe('replays');
    // DELETE the kept one.
    s.hold(0, 2);
    s.press(Action.Confirm);
    s.hold(0, 2);
    s.press(Action.Up);
    s.press(Action.Up); // PLAY → BACK → DELETE
    expect(browser.actions.focus).toBe(ReplayActionItem.Delete);
    s.press(Action.Confirm);
    expect(library.summaries[1]).toBeNull();
    expect(library.summaries.length).toBe(REPLAY_SLOTS);
  });

  it('the invincibility assist and the game speed mark the run`s row and replay', () => {
    const library = createReplayLibrary(null);
    const save = createSaveStore(null);
    save.setOptions({
      ...save.options,
      play: { ...save.options.play, invincible: true, speed: 50 },
    });
    const s = new ExtraSession({ replays: library, save });
    s.start();
    expect(s.game.world.config.invincible).toBe(true);
    expect(s.game.world.players[0].invincible).toBe(true);
    s.hold(0, 30);
    s.gameOver(700);
    s.leaveNames();
    // (The forced game over is no input: only the recorded flags are checked, not a playback.)
    const assists = s.flow.lastReplay!.assists;
    expect(assists & AssistFlag.Invincible).toBe(AssistFlag.Invincible);
    expect(assists & AssistFlag.Speed).toBe(AssistFlag.Speed);
    expect(runAssisted(assists)).toBe(true);
    expect(library.summaries[0]?.assisted).toBe(true);
    const row = s.save.data.hiScores['meter-normal']?.find((entry) => entry.score === 700);
    expect(row?.assisted).toBe(true);
  });

  it('the game speed slows the game scene`s clock, never the menus', () => {
    const save = createSaveStore(null);
    save.setOptions({ ...save.options, play: { ...save.options.play, speed: 50 } });
    const s = new ExtraSession({ save });
    let now = 1000;
    /**
     * Runs 120 frames at 60 Hz.
     *
     * @returns The ticks they ran.
     */
    const frames = (): number => {
      let ticks = 0;
      for (let i = 0; i < 120; i++) {
        now += 1000 / 60;
        ticks += s.game.frame(now);
      }
      return ticks;
    };
    expect(s.flow.speedPercent).toBe(100);
    expect(Math.abs(frames() - 120)).toBeLessThanOrEqual(2);
    s.start();
    expect(s.flow.speedPercent).toBe(50);
    expect(Math.abs(frames() - 60)).toBeLessThanOrEqual(2);
    expect(s.flow.run.assists & AssistFlag.Speed).toBe(AssistFlag.Speed);
    // Paused: full speed again for the menu.
    s.press(Action.Pause);
    expect(s.top).toBe('pause');
    expect(s.flow.speedPercent).toBe(100);
  });

  it('the GAME page sets the assists and option recovery, the CONTROLS page the rumble', () => {
    const s = new ExtraSession();
    s.press(Action.Confirm);
    s.hold(0, 2);
    for (let i = 0; i < 8 && s.flow.title.menu.focus !== TitleItem.Options; i++) {
      s.press(Action.Down);
    }
    s.press(Action.Confirm);
    expect(s.top).toBe('options');
    s.hold(0, 2);
    const optionsFocus = (): number => s.flow.options.menu.focus;
    while (optionsFocus() !== OptionsItem.Game) s.press(Action.Down);
    s.press(Action.Confirm);
    s.hold(0, 2);
    const page = s.flow.gameOptionsPage;
    expect(s.top).toBe('gameOptions');
    const focus = (item: number): void => {
      for (let i = 0; i < 12 && page.menu.focus !== item; i++) s.press(Action.Down);
      expect(page.menu.focus).toBe(item);
    };
    focus(GameOptionsItem.OptionRecovery);
    s.press(Action.Right);
    focus(GameOptionsItem.Speed);
    s.press(Action.Right);
    expect(s.uiTexts()).toContain('75%');
    expect(s.uiTexts()).toContain('ASSISTS MARK SCORES AND REPLAYS');
    focus(GameOptionsItem.Invincible);
    s.press(Action.Right);
    s.press(Action.Back);
    expect(s.top).toBe('options');
    expect(s.save.options.play).toMatchObject({
      speed: 75,
      invincible: true,
      optionRecovery: true,
    });
    expect(s.flow.gameConfig).toMatchObject({ invincible: true, optionRecovery: true });
    // CONTROLS: RUMBLE off.
    s.hold(0, 2);
    while (optionsFocus() !== OptionsItem.Controls) s.press(Action.Up);
    s.press(Action.Confirm);
    s.hold(0, 2);
    const controls = s.flow.controlsPage;
    for (let i = 0; i < 12 && controls.menu.focus !== ControlsItem.Rumble; i++) {
      s.press(Action.Down);
    }
    expect(controls.menu.focus).toBe(ControlsItem.Rumble);
    expect(controls.rumble.value).toBe(true);
    s.press(Action.Left);
    s.press(Action.Back);
    expect(s.save.options.play.rumble).toBe(false);
  });
});
