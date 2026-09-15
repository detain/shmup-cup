/**
 * `core/scenes` — edge cases of plan M3-01's screens beyond `scenes-extra-modes.test.ts`: the
 * replay screen ({@link ReplayScene} — ×1 / ×2 / ×4 and back, the pause, Back, the sounds dropped
 * while fast-forwarding, rumble never forwarded, `OUT OF SYNC` for a replay that desyncs and the
 * return to the browser by itself, the `ASSISTED` mark), the replay browser ({@link ReplaysScene} —
 * an empty slot, KEEP for the last game only and refused when the kept replays have no room,
 * SHARE without a host or refused by it, the rows' texts) and the EXTRA menu ({@link ExtraScene} —
 * without the content its modes need, OK on a choice row, the locked LOOP 2 from either side).
 */
import { describe, expect, it } from 'vitest';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { SFX_CUES, SimEventKind } from '../../src/events/index.js';
import { Action } from '../../src/input/index.js';
import { createMemoryStorage } from '../../src/platform/index.js';
import {
  ReplayStoreResult,
  createReplayLibrary,
  type ReplayLibrary,
  type RunReplayJson,
} from '../../src/replay/index.js';
import {
  ExtraItem,
  REPLAY_END_TICKS,
  REPLAY_SPEEDS,
  ReplayActionItem,
  SECRET_CODES,
  SecretCode,
  TitleItem,
} from '../../src/scenes/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
import { CAMPAIGN, shipped, stage } from '../helpers/campaign.js';
import { FrontEndSession, type FrontEndSessionOptions } from '../helpers/front-end-session.js';

/**
 * The KESTREL, Type A and the test campaign with a long start zone (or no campaign at all).
 *
 * @param campaign - Include the campaign.
 * @returns The DB.
 */
function content(campaign = true): ContentDb {
  const files = [
    shipped('player/kestrel.player.json'),
    shipped('weapons/type-a.weapons.json'),
    stage('t-s', { length: 1400, camera: [{ x: 0, speed: 1 }], events: [{ x: 800, type: 'end' }] }),
  ];
  if (campaign) files.push(CAMPAIGN, stage('t-u'), stage('t-l'));
  const { db, issues } = loadContent(files, { extraSprites: ENGINE_SPRITES });
  expect(issues).toEqual([]);
  return db;
}

const DB = content();

/** A session with the EXTRA menu's and the replay screens' helpers. */
class ScreenSession extends FrontEndSession {
  /**
   * Starts on the title.
   *
   * @param options - Session options (the content defaults to {@link DB}).
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
    this.press(Action.Confirm);
    expect(this.top).toBe('extra');
    this.hold(0, 2);
  }

  /**
   * Focuses an EXTRA row.
   *
   * @param item - An {@link ExtraItem}.
   */
  focusExtra(item: number): void {
    for (let i = 0; i < 8 && this.flow.extra.menu.focus !== item; i++) this.press(Action.Down);
    expect(this.flow.extra.menu.focus).toBe(item);
  }

  /** From the title: EXTRA, REPLAYS. */
  openReplays(): void {
    this.openExtra();
    this.focusExtra(ExtraItem.Replays);
    this.press(Action.Confirm);
    expect(this.top).toBe('replays');
    this.hold(0, 2);
  }

  /**
   * On the browser's list: focuses a slot and opens its actions.
   *
   * @param slot - The slot.
   */
  chooseSlot(slot: number): void {
    const menu = this.flow.replaysScreen.menu;
    for (let i = 0; i < 8 && menu.focus !== slot; i++) this.press(Action.Down);
    expect(menu.focus).toBe(slot);
    this.press(Action.Confirm);
    this.hold(0, 2);
  }

  /**
   * On the action row: focuses an action and confirms it.
   *
   * @param action - A {@link ReplayActionItem}.
   */
  act(action: number): void {
    const actions = this.flow.replaysScreen.actions;
    for (let i = 0; i < 8 && actions.focus !== action; i++) this.press(Action.Down);
    expect(actions.focus).toBe(action);
    this.press(Action.Confirm);
  }

  /** Plays a game with a death (SELF DESTRUCT) and quits it: the library's last game. */
  recordGame(): void {
    this.start();
    this.hold(Action.Shot | Action.Up, 100);
    const ship = this.game.world.players[0];
    for (let i = 0; i < 400 && (ship.state !== 'alive' || ship.invulnTicks > 0); i++) this.hold(0);
    this.press(Action.Pause);
    for (const direction of SECRET_CODES[SecretCode.SelfDestruct]) this.press(direction);
    this.hold(Action.Shot | Action.Down, 200);
    this.press(Action.Pause);
    this.hold(0, 2);
    for (let i = 0; i < 3; i++) this.press(Action.Down);
    this.press(Action.Confirm);
    this.hold(0, 2);
    this.press(Action.Left);
    this.press(Action.Confirm);
    this.hold(0, 2);
    expect(this.top).toBe('title');
    expect(this.flow.lastReplay).not.toBeNull();
  }
}

/**
 * A session with a library (and optionally a share), with a recorded game in it.
 *
 * @param share - The host's share (default none).
 * @returns The session and its library.
 */
function recorded(share: ((text: string) => boolean) | null = null): {
  s: ScreenSession;
  library: ReplayLibrary;
} {
  const library = createReplayLibrary(createMemoryStorage());
  const s = new ScreenSession({ replays: library, shareReplay: share });
  s.recordGame();
  expect(library.summaries[0]).not.toBeNull();
  return { s, library };
}

describe('core/scenes ReplayScene edges (M3-01)', () => {
  it('goes ×1 → ×4 and back, pauses, drops sounds while fast and never rumbles', () => {
    const { s } = recorded();
    // The game itself rumbled for its death.
    expect(s.of(SimEventKind.Rumble).length).toBeGreaterThan(0);
    s.openReplays();
    s.chooseSlot(0);
    s.act(ReplayActionItem.Play);
    expect(s.top).toBe('replay');
    const screen = s.flow.replayScreen;
    const from = s.events.length;
    expect(s.uiTexts()).toContain('REPLAY  X1');
    // ×1: one recorded tick a tick, with its sounds.
    s.hold(Action.Shot, 1); // (the replay's own input plays, not ours)
    const world = (): number => screen.world!.tick;
    let before = world();
    s.hold(0, 100);
    expect(world() - before).toBe(100);
    expect(s.of(SimEventKind.Sfx, from).length).toBeGreaterThan(0);
    // Right three times: ×4 is the most.
    s.press(Action.Right);
    s.press(Action.Right);
    s.press(Action.Right);
    expect(screen.speed).toBe(REPLAY_SPEEDS.length - 1);
    expect(s.uiTexts()).toContain('REPLAY  X4');
    const fast = s.events.length;
    before = world();
    s.hold(0, 20);
    expect(world() - before).toBe(20 * REPLAY_SPEEDS[REPLAY_SPEEDS.length - 1]);
    // The death came and went in there (its explosion) without a sound.
    expect(screen.world!.players[0].state).not.toBe('alive');
    expect(s.of(SimEventKind.Sfx, fast)).toEqual([]);
    s.press(Action.Left);
    expect(s.uiTexts()).toContain('REPLAY  X2');
    // OK pauses: the World stands still, the status says so.
    s.press(Action.Confirm);
    expect(screen.paused).toBe(true);
    expect(s.uiTexts()).toContain('REPLAY  PAUSED');
    before = world();
    s.hold(0, 20);
    expect(world()).toBe(before);
    s.press(Action.Confirm);
    expect(screen.paused).toBe(false);
    s.hold(0, 5);
    expect(world()).toBeGreaterThan(before);
    // Past the death: its rumble is not forwarded.
    for (let i = 0; i < 600 && screen.endTicks < 0; i++) s.hold(0);
    expect(screen.playback!.report.ok).toBe(true);
    expect(s.of(SimEventKind.Rumble, from)).toEqual([]);
    // Back leaves at once.
    s.press(Action.Back);
    expect(s.top).toBe('replays');
    expect(screen.playback).toBeNull();
  });

  it('shows OUT OF SYNC for a replay that desyncs, then returns to the browser by itself', () => {
    const { s, library } = recorded();
    // A shared copy whose final hash is not this build's, marked assisted.
    const doc = JSON.parse(library.exportText(0)!) as RunReplayJson & Record<string, unknown>;
    const replay = doc.segments[0].replay as unknown as { finalHash: number };
    replay.finalHash = (replay.finalHash + 1) >>> 0;
    const tampered = JSON.stringify({ ...doc, assists: 4 });
    expect(library.importText(tampered)).toBe(ReplayStoreResult.Ok);
    s.openReplays();
    // The kept row is marked assisted, the last game is not.
    const marks = s.uiTexts().filter((t) => t === '*');
    expect(marks).toHaveLength(1);
    s.chooseSlot(1);
    s.act(ReplayActionItem.Play);
    const screen = s.flow.replayScreen;
    expect(s.uiTexts()).toContain('ASSISTED');
    s.press(Action.Right);
    s.press(Action.Right);
    for (let i = 0; i < 600 && screen.endTicks < 0; i++) s.hold(0);
    expect(screen.playback!.report.ok).toBe(false);
    expect(screen.playback!.report.desyncSegment).toBe(0);
    const texts = s.uiTexts();
    expect(texts).toContain('REPLAY OUT OF SYNC');
    expect(texts).not.toContain('REPLAY END');
    s.hold(0, REPLAY_END_TICKS - 2);
    expect(s.top).toBe('replay');
    s.hold(0, 2);
    expect(s.top).toBe('replays');
    // The last game's own replay shows no ASSISTED mark.
    s.hold(0, 2);
    s.chooseSlot(0);
    s.act(ReplayActionItem.Play);
    expect(s.top).toBe('replay');
    expect(s.uiTexts()).not.toContain('ASSISTED');
  });
});

describe('core/scenes ReplaysScene edges (M3-01)', () => {
  it('an empty slot cannot be chosen; the rows say what each slot holds; Back leaves', () => {
    const library = createReplayLibrary(null);
    const s = new ScreenSession({ replays: library });
    s.openReplays();
    const texts = s.uiTexts();
    expect(texts).toEqual(
      expect.arrayContaining(['REPLAYS', 'LAST GAME', 'SAVED 1', 'SAVED 3', 'NO REPLAY']),
    );
    const from = s.events.length;
    s.press(Action.Confirm);
    expect(s.flow.replaysScreen.choosing).toBe(false);
    expect(s.of(SimEventKind.Sfx, from)).toContainEqual([SFX_CUES.PowerUpDenied, 0]);
    s.press(Action.Back);
    expect(s.top).toBe('extra');
    // With a game recorded, the row names its ship, difficulty and zone.
    const { s: t } = recorded();
    t.openReplays();
    expect(t.uiTexts()).toContain('KESTREL NORMAL  ZONE S');
  });

  it('KEEP is for the last game only and says when the kept replays have no room', () => {
    const { s, library } = recorded();
    const text = library.exportText(0)!;
    for (let i = 0; i < 3; i++) expect(library.importText(text)).toBe(ReplayStoreResult.Ok);
    s.openReplays();
    s.chooseSlot(0);
    const actions = s.flow.replaysScreen.actions;
    expect(actions.enabled(ReplayActionItem.Keep)).toBe(true);
    expect(actions.enabled(ReplayActionItem.Share)).toBe(false); // no host share
    s.act(ReplayActionItem.Keep);
    expect(s.uiTexts()).toContain('NO FREE SLOT: DELETE ONE FIRST');
    expect(s.flow.replaysScreen.choosing).toBe(false);
    // A kept replay offers no KEEP.
    s.hold(0, 2);
    s.chooseSlot(2);
    expect(actions.enabled(ReplayActionItem.Keep)).toBe(false);
    // Back on the action row returns to the list, the slot still focused.
    s.press(Action.Back);
    expect(s.flow.replaysScreen.choosing).toBe(false);
    expect(s.flow.replaysScreen.menu.focus).toBe(2);
    // DELETE frees a slot; KEEP then works and says where.
    s.hold(0, 2);
    s.press(Action.Confirm);
    s.hold(0, 2);
    s.act(ReplayActionItem.Delete);
    expect(s.uiTexts()).toContain('REPLAY DELETED');
    expect(library.summaries[2]).toBeNull();
    s.hold(0, 2);
    s.chooseSlot(0);
    s.act(ReplayActionItem.Keep);
    expect(s.uiTexts()).toContain('KEPT IN SAVED 2');
  });

  it('SHARE says when the host could not take the text', () => {
    const offered: string[] = [];
    const { s, library } = recorded((text) => {
      offered.push(text);
      return false;
    });
    s.openReplays();
    s.chooseSlot(0);
    expect(s.flow.replaysScreen.actions.enabled(ReplayActionItem.Share)).toBe(true);
    s.act(ReplayActionItem.Share);
    expect(offered).toEqual([library.exportText(0)]);
    expect(s.uiTexts()).toContain('COULD NOT SHARE');
  });
});

describe('core/scenes ExtraScene edges (M3-01)', () => {
  it('offers only what the content has: EXTRA itself needs a mode or the replays', () => {
    // No campaign, no boss-rush stage, no library: the title's EXTRA row is disabled.
    const bare = new ScreenSession({ db: content(false) });
    bare.hold(0, 2);
    expect(bare.flow.title.menu.enabled(TitleItem.Extra)).toBe(false);
    // The replays alone open it: the three modes are disabled, the focus lands on REPLAYS.
    const s = new ScreenSession({ db: content(false), replays: createReplayLibrary(null) });
    expect(s.flow.title.menu.enabled(TitleItem.Extra)).toBe(true);
    s.openExtra();
    const menu = s.flow.extra.menu;
    for (const item of [ExtraItem.BossRush, ExtraItem.Caravan, ExtraItem.Arcade]) {
      expect(menu.enabled(item), String(item)).toBe(false);
    }
    expect(menu.focus).toBe(ExtraItem.Replays);
    expect(s.uiTexts()).toContain('WATCH, KEEP AND SHARE YOUR RUNS');
    s.press(Action.Down);
    expect(menu.focus).toBe(ExtraItem.Back);
    s.press(Action.Confirm);
    expect(s.top).toBe('title');
  });

  it('OK on a choice row starts its mode as chosen; LOOP 2 stays locked from either side', () => {
    const s = new ScreenSession();
    s.openExtra();
    s.focusExtra(ExtraItem.Caravan);
    expect(s.uiTexts()).toContain('SCORE ATTACK: THREE MINUTES');
    expect(s.flow.extra.zone.index).toBe(0);
    s.focusExtra(ExtraItem.Arcade);
    expect(s.uiTexts()).toContain('THE CAMPAIGN LOOPS, EACH LOOP HARDER');
    s.press(Action.Left); // wraps to LOOP 2: locked
    expect(s.flow.extra.loop.index).toBe(0);
    s.press(Action.Right);
    expect(s.flow.extra.loop.index).toBe(0);
    // Unlocked: either side reaches it; OK then starts that loop without stepping the choice.
    s.save.unlock('loop2');
    s.press(Action.Left);
    expect(s.flow.extra.loop.index).toBe(1);
    s.press(Action.Confirm);
    expect(s.top).toBe('difficulty');
    expect(s.flow.extra.loop.index).toBe(1);
    s.presses([Action.Confirm]); // NORMAL
    s.presses([Action.Confirm]); // START
    s.hold(0);
    expect(s.top).toBe('game');
    expect([s.flow.run.mode, s.game.world.config.loop]).toEqual(['arcade', 2]);
    // Back on the EXTRA menu from the difficulty menu.
    const again = new ScreenSession();
    again.openExtra();
    again.focusExtra(ExtraItem.Caravan);
    again.press(Action.Confirm);
    expect(again.top).toBe('difficulty');
    again.hold(0, 2);
    again.press(Action.Back);
    expect(again.top).toBe('extra');
    expect(again.flow.extra.zone.index).toBe(0);
  });
});
