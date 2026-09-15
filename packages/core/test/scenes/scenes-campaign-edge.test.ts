/**
 * Edge cases of the M2-10 campaign flow (`core/scenes`) beyond `scenes-campaign.test.ts`, headless:
 *
 * - the zone map: Back → YES quits to the title, `LAUNCH` blinks while the next zone is prepared,
 *   exits sorted top to bottom whatever the edge order, the node layout, a map without a campaign
 *   (OK / Back → title), a final zone's map (nothing to launch), the shipped nine-zone map and the
 *   largest map the validation accepts drawn without dropping a UI command (review finding of this
 *   pass: the largest maps overflowed the UI list — fixed by `MapScene.edgeDots`);
 * - the zone tally: co-op lines, the final zone's tally going on to the ending by itself;
 * - the ending: its time-out, the flag lines (a bonus stage cleared, a boss escaped), both
 *   players' scores, `THE END` without an ending;
 * - game over and continues in a campaign run: the run recorded with the zone reached, a continue
 *   costing the `NoContinue` flag, a practice game over recording nothing;
 * - practice plumbing: refused checkpoints, no campaign, practice from a single-stage session
 *   (a campaign World for one zone, then single stages again), no `PrepareStage` for the stage
 *   already prepared;
 * - hidden bonus stages: RETRY STAGE inside one restarts the zone (lock lifted), an entrance that
 *   opens right before the zone's clear never warps, a single-stage run's bonus stage ends on the
 *   M1 stage clear.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { SimEventKind } from '../../src/events/index.js';
import { createGame, type Game } from '../../src/game/index.js';
import { Action, commitPlayerInput, type ActionMask } from '../../src/input/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';
import { PlayerHitCause, playerHit } from '../../src/player/index.js';
import { DrawOp } from '../../src/presentation/index.js';
import { createSaveStore, type SaveStore } from '../../src/save/index.js';
import {
  BONUS_WARP_TICKS,
  ENDING_LOCK_TICKS,
  ENDING_TIMEOUT_TICKS,
  MAP_LAUNCH_TICKS,
  RunFlag,
  ZONE_TALLY_TICKS,
  type SceneFlow,
  HI_SCORE_LOCK_TICKS,
} from '../../src/scenes/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
import { CAMPAIGN, campaignContent as content, shipped, stage } from '../helpers/campaign.js';

/** A headless campaign session (the game scene first, god mode on). */
class Session {
  readonly game: Game;
  readonly flow: SceneFlow;
  readonly platform = createHeadlessPlatform();
  readonly save: SaveStore = createSaveStore(null);
  /** Drained events: `[kind, id]`. */
  readonly events: Array<[number, number]> = [];

  /**
   * Starts a game.
   *
   * @param db - The content.
   * @param stageId - The host config's stage.
   * @param coop - A co-op game.
   */
  constructor(db: ContentDb = content(), stageId = 't-s', coop = false) {
    this.game = createGame(this.platform, { seed: 13, stage: stageId, coop }, db, {
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
    const s = this.game.world.stage;
    return s === null ? null : s.stage.id;
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
   * The PrepareStage ids drained so far (from an index on).
   *
   * @param from - First event index.
   * @returns The stage indices.
   */
  prepared(from = 0): number[] {
    return this.events
      .slice(from)
      .flatMap((e) => (e[0] === SimEventKind.PrepareStage ? [e[1]] : []));
  }

  /** From the first zone's clear to the map, past its open lock. */
  toMap(): void {
    this.until('map');
    this.hold(0, 3);
  }
}

/**
 * Loads test content.
 *
 * @param files - The files (the KESTREL and Type A are added).
 * @returns The DB.
 */
function db(files: ContentFile[]): ContentDb {
  const { db: out, issues } = loadContent(
    [shipped('player/kestrel.player.json'), shipped('weapons/type-a.weapons.json'), ...files],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return out;
}

/** The test campaign's stages (the start zone `t-s` plain). */
const STAGES = [stage('t-s'), stage('t-u'), stage('t-l')];

/**
 * The test campaign with other fields.
 *
 * @param over - Fields over the test campaign's.
 * @returns The file.
 */
function campaign(over: Record<string, unknown>): ContentFile {
  return { path: CAMPAIGN.path, data: { ...(CAMPAIGN.data as Record<string, unknown>), ...over } };
}

describe('core/scenes campaign edges: the zone map (M2-10)', () => {
  it('Back then YES quits to the title; the run is not recorded', () => {
    const s = new Session();
    s.toMap();
    s.press(Action.Back);
    expect(s.top).toBe('confirm');
    s.hold(0, 3);
    s.press(Action.Up); // YES
    s.press(Action.Confirm);
    expect(s.top).toBe('title');
    expect(s.save.hiScores('meter-normal')).toEqual([]);
  });

  it('blinks LAUNCH every 8 ticks while the next zone is prepared, then plays it', () => {
    const s = new Session();
    s.toMap();
    const from = s.events.length;
    s.press(Action.Confirm); // launch 0 → 1 after the release tick
    const seen: boolean[] = [];
    for (let t = 0; t < 32; t++) {
      seen.push(s.uiTexts().includes('LAUNCH'));
      s.hold(0);
    }
    // launch counts 1, 2, …: shown while (launch >> 3) is even.
    const launch0 = s.flow.map.launch - 32;
    for (let t = 0; t < 32; t++) {
      expect(seen[t], 'launch ' + String(launch0 + t)).toBe((((launch0 + t) >> 3) & 1) === 0);
    }
    // Only one preparation, and input during the launch changes nothing.
    s.press(Action.Down);
    s.press(Action.Confirm);
    expect(s.prepared(from)).toEqual([s.game.content.stageIndex.get('t-u')]);
    s.hold(0, MAP_LAUNCH_TICKS);
    expect(s.top).toBe('game');
    expect(s.stageId).toBe('t-u');
  });

  it('sorts the exits top to bottom whatever the edge order; lays the nodes out by depth / row', () => {
    const reversed = db([
      campaign({
        edges: [
          { from: 's', to: 'l' },
          { from: 's', to: 'u' },
        ],
      }),
      ...STAGES,
    ]);
    const s = new Session(reversed);
    const map = s.flow.map;
    // Zone order: s (depth 0), u (depth 1, row 0), l (depth 1, row 1).
    expect(s.flow.campaign?.zones[0].exits).toEqual([2, 1]); // edge order
    expect(map.exits[0]).toEqual([1, 2]); // the map's order: top to bottom
    expect([...map.nodeX]).toEqual([40, 344, 344]);
    expect([...map.nodeY]).toEqual([88, 64, 112]);
    expect(map.edgeDots).toBe(7);
    s.toMap();
    expect(map.focusedZone).toBe(1); // the top one first
    s.press(Action.Down);
    expect(map.focusedZone).toBe(2);
  });

  it('draws an empty map when the content has no campaign: OK or Back → title', () => {
    const plain = db([stage('t-s')]);
    const s = new Session(plain);
    expect(s.flow.campaign).toBeNull();
    expect(s.flow.map.campaign).toBeNull();
    expect(s.flow.map.stringSlots).toBe(11);
    expect(s.flow.startPractice('s')).toBe(false);
    s.flow.stack.reset(s.flow.map);
    s.hold(0);
    expect(s.flow.map.focusedZone).toBe(-1);
    expect(s.uiTexts()).toEqual(['ZONE MAP']);
    s.press(Action.Confirm);
    expect(s.top).toBe('title');
    s.flow.stack.reset(s.flow.map);
    s.hold(0);
    s.press(Action.Back);
    expect(s.top).toBe('title');
  });

  it('a final zone`s map has nothing to launch: OK does nothing, Back still asks', () => {
    const s = new Session();
    s.flow.run.zone = 2; // L: final
    s.flow.stack.reset(s.flow.map);
    s.hold(0, 3);
    expect(s.flow.map.focusedZone).toBe(-1);
    const from = s.events.length;
    s.press(Action.Confirm);
    s.hold(0, MAP_LAUNCH_TICKS + 2);
    expect(s.top).toBe('map');
    expect(s.flow.map.launch).toBe(-1);
    expect(s.prepared(from)).toEqual([]);
    s.press(Action.Back);
    expect(s.top).toBe('confirm');
  });

  it('draws the shipped nine-zone map without dropping a UI command (route lit, dialog on top)', () => {
    const data = JSON.parse(
      readFileSync(
        new URL('../../../../content/campaign/main.campaign.json', import.meta.url),
        'utf8',
      ),
    ) as { zones: Array<{ stage: string }> };
    const nine = db([
      { path: 'campaign/main.campaign.json', data },
      ...data.zones.map((z) => stage(z.stage)),
    ]);
    const s = new Session(nine, 'zone-a');
    expect(s.flow.campaign?.routes).toBe(16);
    expect(s.flow.map.edgeDots).toBe(7);
    // The run reached D through B: the map after D's clear.
    s.flow.run.route.push(1, 3);
    s.flow.run.zone = 3;
    s.flow.stack.reset(s.flow.map);
    s.hold(0, 3);
    expect(s.flow.map.focusedZone).toBe(5); // F, the top exit of D
    const frame = s.game.renderFrame();
    expect(frame.ui.dropped).toBe(0);
    const texts = s.uiTexts();
    for (const label of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'])
      expect(texts).toContain(label);
    expect(texts).toContain('CELL VAULT');
    s.press(Action.Back);
    expect(s.top).toBe('confirm');
    expect(s.game.renderFrame().ui.dropped).toBe(0);
  });

  it('draws the largest map the validation accepts without dropping a UI command (fix)', () => {
    // 32 zones in layers of up to four, every zone of a layer leading to every zone of the next.
    const zones: Array<Record<string, unknown>> = [];
    const edges: Array<{ from: string; to: string }> = [];
    let previous = ['z0'];
    zones.push({
      id: 'z0',
      label: 'Z0',
      name: 'ZONE 0',
      stage: 't-s',
      preview: ['A.', 'B.', 'C.'],
    });
    let n = 1;
    while (n < 32) {
      const layer: string[] = [];
      for (let k = 0; k < 4 && n < 32; k++, n++) {
        const id = 'z' + String(n);
        layer.push(id);
        zones.push({ id, label: String(n % 100), name: 'ZONE ' + String(n), stage: 't-u' });
      }
      for (const a of previous) for (const b of layer) edges.push({ from: a, to: b });
      previous = layer;
    }
    const big = db([
      {
        path: 'campaign/big.campaign.json',
        data: {
          formatVersion: 1,
          kind: 'campaign',
          id: 'big',
          start: 'z0',
          zones,
          edges,
          endings: previous.map((z) => ({ id: 'e-' + z, name: 'END', zone: z })),
        },
      },
      stage('t-s'),
      stage('t-u'),
    ]);
    expect(big.campaign?.zones).toHaveLength(32);
    const s = new Session(big);
    const map = s.flow.map;
    expect(map.edgeDots).toBe(1);
    s.flow.run.route.push(1, 5);
    s.flow.run.zone = 5;
    s.flow.stack.reset(s.flow.map);
    s.hold(0, 3);
    const frame = s.game.renderFrame();
    expect(frame.ui.dropped).toBe(0);
    expect(s.uiTexts()).toContain('ZONE 9'); // the focused exit's preview
    // With the "quit to title?" dialog over it, too.
    s.press(Action.Back);
    expect(s.game.renderFrame().ui.dropped).toBe(0);
    expect(s.uiTexts()).toContain('QUIT TO TITLE?');
  });
});

describe('core/scenes campaign edges: tally and ending (M2-10)', () => {
  it('shows both players in a co-op zone tally', () => {
    const s = new Session(content(), 't-s', true);
    s.game.world.players[1].active = true;
    s.until('stageClear');
    const texts = s.uiTexts();
    expect(texts).toEqual(expect.arrayContaining(['ZONE S CLEAR', '1P', '2P', 'KILLS']));
    expect(texts).not.toContain('SCORE');
    expect(s.flow.run.carry.players[1].active).toBe(true);
  });

  it('goes on from a final zone`s tally to the ending by itself', () => {
    const s = new Session();
    s.toMap();
    s.press(Action.Confirm);
    s.until('game');
    s.until('stageClear');
    s.hold(0, ZONE_TALLY_TICKS);
    expect(s.top).toBe('ending');
  });

  it('times the ending out to the title; shows the flag lines, both scores and THE END', () => {
    const s = new Session(content(true), 't-s', true);
    s.game.world.players[1].active = true;
    // Through the bonus stage (its clear is the zone's), then the upper zone.
    s.until('stageClear');
    expect(s.flow.run.flags & RunFlag.Bonus).toBe(RunFlag.Bonus);
    s.press(Action.Confirm);
    s.hold(0, 3);
    s.press(Action.Confirm);
    s.until('game');
    s.until('stageClear');
    s.press(Action.Confirm);
    expect(s.top).toBe('ending');
    expect(s.flow.run.ending?.id).toBe('u-bonus');
    let texts = s.uiTexts();
    expect(texts).toEqual(
      expect.arrayContaining(['UPPER WITH BONUS', '1P', '2P', 'BONUS STAGE CLEARED', 'NO MISS']),
    );
    expect(texts).not.toContain('A BOSS ESCAPED');
    // The flags are read as the card is drawn: an escaped boss adds its line.
    s.flow.run.flags |= RunFlag.BossEscaped;
    s.flow.run.ending = null;
    s.flow.ending.uiRevision++;
    s.hold(0);
    texts = s.uiTexts();
    expect(texts).toEqual(expect.arrayContaining(['THE END', 'A BOSS ESCAPED']));
    s.hold(0, ENDING_TIMEOUT_TICKS - 3);
    expect(s.top).toBe('ending');
    s.hold(0, 2);
    s.leaveNames(); // the run's score entered its table (M2-15)
    expect(s.top).toBe('title');
    expect(ENDING_TIMEOUT_TICKS).toBeGreaterThan(ENDING_LOCK_TICKS);
  });
});

describe('core/scenes campaign edges: game over, continues and practice (M2-10)', () => {
  /** The test campaign on longer stages (they end at x 2000: time for a game over). */
  const LONG = db([
    CAMPAIGN,
    stage('t-s', { length: 2400, events: [{ x: 2000, type: 'end' }] }),
    stage('t-u', { length: 2400, events: [{ x: 2000, type: 'end' }] }),
    stage('t-l', { length: 2400, events: [{ x: 2000, type: 'end' }] }),
  ]);

  /**
   * Loses player 1's last ship.
   *
   * @param s - The session.
   */
  function loseLastShip(s: Session): void {
    s.game.debug.godMode = false;
    for (let i = 0; i < 200 && s.game.world.players[0].state !== 'alive'; i++) s.hold(0);
    const world = s.game.world;
    world.players[0].lives = 1;
    playerHit(world.players[0], PlayerHitCause.Bullet, world.tick, world.debugFlags);
  }

  it('records a campaign run that ends in a game over with the zone it reached', () => {
    const s = new Session(LONG);
    s.toMap();
    s.press(Action.Down);
    s.press(Action.Confirm);
    s.until('game');
    loseLastShip(s);
    s.until('continue');
    s.hold(0, 40);
    s.press(Action.Back); // no continue
    expect(s.top).toBe('gameOver');
    const table = s.save.hiScores('meter-normal');
    expect(table).toHaveLength(1);
    expect(table[0]).toMatchObject({ reached: 't-l' });
    expect(table[0].score).toBeGreaterThanOrEqual(10_000); // the start zone's tally carried in
  });

  it('a continue in a zone costs the run its NoContinue flag', () => {
    const s = new Session(LONG);
    loseLastShip(s);
    s.until('continue');
    s.hold(0, 40);
    s.press(Action.Confirm); // continue
    expect(s.top).toBe('game');
    s.game.debug.godMode = true;
    s.until('stageClear');
    expect(s.flow.run.continues).toBe(1);
    expect(s.flow.run.endingFlags & RunFlag.NoContinue).toBe(0);
    expect(s.flow.run.carry.continuesUsed).toBe(1);
  });

  it('a practice game over records nothing', () => {
    const s = new Session(LONG);
    expect(s.flow.startPractice('u')).toBe(true);
    s.hold(0);
    loseLastShip(s);
    s.until('continue');
    s.hold(0, 40);
    s.press(Action.Back);
    expect(s.top).toBe('gameOver');
    expect(s.save.hiScores('meter-normal')).toEqual([]);
  });

  it('refuses checkpoints that are not whole numbers from -1 on', () => {
    const s = new Session();
    for (const checkpoint of [-2, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 2]) {
      expect(s.flow.startPractice('u', checkpoint), String(checkpoint)).toBe(false);
    }
    expect(s.top).toBe('game');
    expect(s.flow.run.practice).toBe(false);
    expect(s.flow.startPractice('u', -1)).toBe(true);
    expect(s.flow.startPractice('u', 1)).toBe(true);
    const games = s.save.data.stats.gamesStarted;
    s.hold(0);
    expect(s.flow.run.checkpoint).toBe(1);
    expect(s.save.data.stats.gamesStarted).toBe(games); // counted by startPractice, not again
  });

  it('practises a campaign zone from a single-stage session, then plays single stages again', () => {
    const s = new Session(content(), 't-l');
    expect(s.flow.campaign).toBeNull();
    expect(s.flow.startPractice('u')).toBe(true);
    s.hold(0);
    expect(s.stageId).toBe('t-u');
    expect(s.uiTexts()).toEqual(['ZONE U', 'UPPER ZONE']);
    s.until('stageClear');
    expect(s.uiTexts()).toContain('ZONE U CLEAR');
    s.press(Action.Confirm);
    s.leaveNames(); // the run's score entered its table (M2-15)
    expect(s.top).toBe('title');
    // The next game is a single-stage run of the host stage again.
    s.flow.stack.reset(s.flow.game);
    s.hold(0);
    expect(s.flow.run.campaign).toBeNull();
    expect(s.stageId).toBe('t-l');
    expect(s.uiTexts()).toEqual([]);
  });

  it('prepares nothing for a practice of the stage already prepared (the host`s)', () => {
    const s = new Session();
    expect(s.flow.startPractice('s', 1)).toBe(true);
    s.hold(0);
    expect(s.stageId).toBe('t-s');
    expect(s.prepared()).toEqual([]);
  });
});

describe('core/scenes campaign edges: hidden bonus stages (M2-10)', () => {
  /**
   * Runs until the bonus stage plays.
   *
   * @param s - The session.
   */
  function toBonus(s: Session): void {
    for (let i = 0; i < 300 && s.stageId !== 't-v'; i++) s.hold(0);
    expect(s.stageId).toBe('t-v');
  }

  it('RETRY STAGE in a bonus stage starts the zone over, its entrances open again', () => {
    const s = new Session(content(true));
    toBonus(s);
    s.hold(0, 10);
    s.press(Action.Pause);
    expect(s.top).toBe('pause');
    s.press(Action.Down);
    s.press(Action.Down);
    s.press(Action.Confirm); // RETRY STAGE
    expect(s.top).toBe('game');
    expect(s.stageId).toBe('t-s');
    expect(s.flow.run.inBonus).toBe(false);
    expect(s.flow.run.bonusLocked).toBe(false);
    expect(s.game.world.bonus.locked).toBe(false);
    expect(s.game.world.camera.x).toBeLessThan(40); // before the entrance (x 40)
    // Its entrance opens again.
    toBonus(s);
  });

  it('an entrance that opens right before the zone`s clear never warps', () => {
    const late = db([
      CAMPAIGN,
      stage('t-s', {
        events: [
          { x: 196, type: 'bonus', stage: 't-v', entrance: 'digit', digit: 0, place: 10 },
          { x: 200, type: 'end' },
        ],
      }),
      stage('t-u'),
      stage('t-l'),
      stage('t-v', { type: 'bonus', events: [{ x: 300, type: 'end' }] }),
    ]);
    const s = new Session(late);
    const zone = s.game.world;
    for (let i = 0; i < 200 && zone.bonus.entered < 0; i++) s.hold(0);
    expect(zone.bonus.entered).toBe(0);
    s.hold(0, BONUS_WARP_TICKS + 5);
    expect(s.game.world).toBe(zone);
    expect(s.flow.run.inBonus).toBe(false);
    s.until('stageClear');
    expect(s.uiTexts()).toContain('ZONE S CLEAR');
    expect(s.flow.run.flags & RunFlag.Bonus).toBe(0);
  });

  it('a single-stage run`s bonus stage ends on the M1 stage clear', () => {
    const single = db([
      stage('t-s', {
        events: [
          { x: 40, type: 'bonus', stage: 't-v', entrance: 'digit', digit: 0, place: 10 },
          { x: 200, type: 'end' },
        ],
      }),
      stage('t-v', { type: 'bonus', events: [{ x: 300, type: 'end' }] }),
    ]);
    const s = new Session(single);
    expect(s.flow.campaign).toBeNull();
    toBonus(s);
    expect(s.flow.run.inBonus).toBe(true);
    expect(s.uiTexts()).toEqual([]); // no title card outside a campaign
    s.until('stageClear');
    expect(s.uiTexts()).toEqual(['STAGE CLEAR', 'SCORE', 'HI']);
    s.press(Action.Confirm);
    expect(s.uiTexts()).toContain('TO BE CONTINUED');
  });
});
