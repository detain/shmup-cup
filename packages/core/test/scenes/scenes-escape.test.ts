/**
 * The final zone's **escape sequence** through the scene flow (plan M3-02, shmup_feat.md §14
 * "[P2] escape sequence (collapsing, fast-scrolling maze after the final boss)"): the final zone's
 * stage clear goes to the zone's `escape` stage instead of the ending, the run carries the players
 * into it (`RunState.inEscape`), its own clear says ESCAPE COMPLETE and *that* one goes to the
 * ending. The escape is **not** a zone of its own: the route, the zone count and the hi-score
 * row's `reached` zone are unchanged by it.
 */
import { describe, expect, it } from 'vitest';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { createGame, type Game } from '../../src/game/index.js';
import { Action, commitPlayerInput, type ActionMask } from '../../src/input/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';
import { createSaveStore, type SaveStore } from '../../src/save/index.js';
import { ENDING_LOCK_TICKS, HI_SCORE_LOCK_TICKS, type SceneFlow } from '../../src/scenes/index.js';
import { DrawOp } from '../../src/presentation/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld } from '../../src/world/index.js';
import { shipped, stage } from '../helpers/campaign.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { resolveGameConfig } from '../../src/config/index.js';

/** The campaign of `helpers/campaign.ts` with an escape stage on both final zones. */
const CAMPAIGN_WITH_ESCAPE: ContentFile = {
  path: 'campaign/test.campaign.json',
  data: {
    formatVersion: 1,
    kind: 'campaign',
    id: 'test',
    name: 'TEST MAP',
    start: 's',
    zones: [
      { id: 's', label: 'S', name: 'START ZONE', stage: 't-s' },
      { id: 'u', label: 'U', name: 'UPPER ZONE', stage: 't-u', escape: 't-esc' },
      { id: 'l', label: 'L', name: 'LOWER ZONE', stage: 't-l', escape: 't-esc' },
    ],
    edges: [
      { from: 's', to: 'u' },
      { from: 's', to: 'l' },
    ],
    endings: [
      { id: 'u', name: 'UPPER END', zone: 'u' },
      { id: 'l', name: 'LOWER END', zone: 'l' },
    ],
  },
};

/**
 * The escape test content.
 *
 * @returns The DB.
 */
function escapeContent(): ContentDb {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      CAMPAIGN_WITH_ESCAPE,
      stage('t-s'),
      stage('t-u'),
      stage('t-l'),
      stage('t-esc'),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
}

const db = escapeContent();

/** A headless campaign session started on the start zone. */
class Session {
  readonly game: Game;
  readonly flow: SceneFlow;
  readonly platform = createHeadlessPlatform();
  readonly save: SaveStore = createSaveStore(null);

  /** Starts the run. */
  constructor() {
    this.game = createGame(this.platform, { seed: 11, stage: 't-s' }, db, {
      scenes: 'game',
      save: this.save,
    });
    this.flow = this.game.scenes as SceneFlow;
    this.game.debug.godMode = true;
  }

  /** The top scene's id. */
  get top(): string | undefined {
    return this.flow.stack.top?.id;
  }

  /** The id of the stage the game World plays. */
  get stageId(): string | null {
    const stage = this.game.world.stage;
    return stage === null ? null : stage.stage.id;
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
      this.game.events.clear();
    }
  }

  /**
   * One press.
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
  until(id: string, limit = 4000): void {
    for (let i = 0; i < limit && this.top !== id; i++) this.hold(0);
    expect(this.top).toBe(id);
  }

  /**
   * The texts of the frame's UI list.
   *
   * @returns The strings.
   */
  uiTexts(): string[] {
    const ui = this.game.renderFrame().ui;
    const out: string[] = [];
    for (let i = 0; i < ui.count; i++) {
      if (ui.op[i] === DrawOp.Text) out.push(ui.strings[ui.ref[i]]);
    }
    return out;
  }

  /** Passes the name entries and the hi-score table. */
  leaveNames(): void {
    if (this.top !== 'nameEntry') return;
    for (let names = 0; names < 2 && this.top === 'nameEntry'; names++) {
      this.hold(0, 2);
      for (let i = 0; i < 4; i++) this.press(Action.Confirm);
    }
    expect(this.top).toBe('hiScore');
    this.hold(0, HI_SCORE_LOCK_TICKS);
    this.press(Action.Confirm);
  }

  /** Clears the start zone and launches the upper (final) zone. */
  toFinalZone(): void {
    this.until('stageClear');
    this.press(Action.Confirm);
    expect(this.top).toBe('map');
    this.hold(0, 3);
    this.press(Action.Confirm); // U — the first exit
    this.until('game');
    expect(this.stageId).toBe('t-u');
  }
}

describe('core/scenes — the escape sequence (M3-02)', () => {
  it('flies the escape stage between the final zone and the ending', () => {
    const s = new Session();
    s.toFinalZone();
    const route = [...s.flow.run.route];
    const score = s.game.world.scoring.board.scores[0].score;
    s.until('stageClear');
    // The final zone's clear does not go to the ending: the way out comes first.
    expect(s.flow.run.finalZone).toBe(true);
    expect(s.flow.run.inEscape).toBe(false);
    s.press(Action.Confirm);
    expect(s.top).toBe('game');
    expect(s.stageId).toBe('t-esc');
    expect(s.flow.run.inEscape).toBe(true);
    expect(s.flow.run.escapeStage).toBe('t-esc');
    // Not a zone of its own: the route and the zone are untouched, and the players carried in.
    expect(s.flow.run.route).toEqual(route);
    expect(s.game.world.scoring.board.scores[0].score).toBeGreaterThanOrEqual(score);
    // The escape has no caravan clock.
    expect(s.game.world.config.timeLimit).toBe(0);
    // Its own clear ends the run.
    s.until('stageClear');
    // The escape's own clear says so — it is not "ZONE U CLEAR" a second time.
    expect(s.uiTexts()).toContain('ESCAPE COMPLETE');
    expect(s.uiTexts()).not.toContain('ZONE U CLEAR');
    s.press(Action.Confirm);
    expect(s.top).toBe('ending');
    expect(s.flow.run.ending).not.toBeNull();
  });

  it('records the zone the run reached, not the escape stage', () => {
    const s = new Session();
    s.toFinalZone();
    s.until('stageClear');
    s.press(Action.Confirm); // into the escape
    expect(s.stageId).toBe('t-esc');
    s.until('stageClear');
    s.press(Action.Confirm);
    expect(s.top).toBe('ending');
    s.hold(0, ENDING_LOCK_TICKS);
    s.press(Action.Confirm);
    s.leaveNames();
    const rows = s.save.hiScores('meter-normal');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].reached).toBe('t-u');
  });

  it('a zone without an escape goes straight to the ending', () => {
    const plain = loadContent(
      [
        shipped('player/kestrel.player.json'),
        shipped('weapons/type-a.weapons.json'),
        {
          ...CAMPAIGN_WITH_ESCAPE,
          data: {
            ...(CAMPAIGN_WITH_ESCAPE.data as Record<string, unknown>),
            zones: [
              { id: 's', label: 'S', name: 'START ZONE', stage: 't-s' },
              { id: 'u', label: 'U', name: 'UPPER ZONE', stage: 't-u' },
              { id: 'l', label: 'L', name: 'LOWER ZONE', stage: 't-l' },
            ],
          },
        },
        stage('t-s'),
        stage('t-u'),
        stage('t-l'),
        stage('t-esc'),
      ],
      { extraSprites: ENGINE_SPRITES },
    );
    expect(plain.issues).toEqual([]);
    const platform = createHeadlessPlatform();
    const game = createGame(platform, { seed: 11, stage: 't-s' }, plain.db, {
      scenes: 'game',
      save: createSaveStore(null),
    });
    const flow = game.scenes as SceneFlow;
    game.debug.godMode = true;
    const step = (held: ActionMask, ticks = 1): void => {
      for (let t = 0; t < ticks; t++) {
        commitPlayerInput(platform.snapshot.players[0], held);
        game.step();
        game.events.clear();
      }
    };
    const until = (id: string): void => {
      for (let i = 0; i < 4000 && flow.stack.top?.id !== id; i++) step(0);
      expect(flow.stack.top?.id).toBe(id);
    };
    until('stageClear');
    step(Action.Confirm);
    step(0);
    until('map');
    step(0, 3);
    step(Action.Confirm);
    step(0);
    until('game');
    until('stageClear');
    expect(flow.run.inEscape).toBe(false);
    step(Action.Confirm);
    step(0);
    expect(flow.stack.top?.id).toBe('ending');
  });

  it('the escape stage is a plain World: its config resolves and it runs', () => {
    const w = createWorld(resolveGameConfig({ seed: 3, stage: 't-esc' }), db);
    const input = createInputSnapshot();
    for (let i = 0; i < 60; i++) stepWorld(w, input);
    expect(w.tick).toBe(60);
    expect(w.status).toBe('playing');
  });
});
