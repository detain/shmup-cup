/**
 * `core/scenes` — plan M3-01's run replays end to end (`./replays.ts`): runs played through the
 * scene flow on small campaign content and played back by {@link RunReplayPlayback} with every
 * hash compared — the pause menu's FULL POWER and SELF DESTRUCT, a continue, the zone tally and the
 * next zone with its carried players, a bonus stage and the return to its zone, RETRY STAGE — plus
 * the recorder's refusals (a debug jump, too many segments), the playback's desync reports (a
 * changed hash, a start that cannot be applied, an unknown stage), the start state's JSON and its
 * validation, and the regression of an action recorded before a World's first tick.
 */
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB, loadContent, type ContentDb } from '../../src/data/index.js';
import { Action, createInputSnapshot } from '../../src/input/index.js';
import {
  AssistFlag,
  MAX_RUN_SEGMENTS,
  RunAction,
  createReplayHeader,
  decodeRunReplay,
  encodeRunReplay,
  type RunReplay,
  type RunReplayJson,
} from '../../src/replay/index.js';
import {
  RunRecorder,
  RunReplayPlayback,
  SECRET_CODES,
  SecretCode,
  WorldStart,
  prepareWorldStart,
  readWorldStart,
  worldStartJson,
} from '../../src/scenes/index.js';
import { CarryState, captureCarry } from '../../src/scenes/run.js';
import { MAX_SHIELD_PODS } from '../../src/shields/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld } from '../../src/world/index.js';
import { CAMPAIGN, campaignContent, shipped, stage } from '../helpers/campaign.js';
import { FrontEndSession } from '../helpers/front-end-session.js';

/** The campaign content with a long start zone (1 px/tick, its end at x 800). */
const LONG: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      CAMPAIGN,
      stage('t-s', {
        length: 1400,
        camera: [{ x: 0, speed: 1 }],
        events: [{ x: 800, type: 'end' }],
      }),
      stage('t-u'),
      stage('t-l'),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

/** A session with helpers for pause secrets and the quit. */
class RunSession extends FrontEndSession {
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

  /**
   * Holds nothing until player 1's ship is alive and no longer invulnerable.
   *
   * @param limit - Tick limit.
   */
  untilVulnerable(limit = 400): void {
    const ship = (): { state: string; invulnTicks: number } => this.game.world.players[0];
    for (let i = 0; i < limit && (ship().state !== 'alive' || ship().invulnTicks > 0); i++) {
      this.hold(0);
    }
    expect(ship().state).toBe('alive');
  }

  /**
   * Pauses and enters a pause-menu code.
   *
   * @param code - A {@link SecretCode}.
   */
  secret(code: number): void {
    this.press(Action.Pause);
    expect(this.top).toBe('pause');
    for (const direction of SECRET_CODES[code]) this.press(direction);
    expect(this.top).toBe('game');
  }

  /**
   * Opens the pause menu and picks a row (Down presses from RESUME), OK.
   *
   * @param downs - Down presses.
   */
  pauseRow(downs: number): void {
    this.press(Action.Pause);
    this.hold(0, 2);
    for (let i = 0; i < downs; i++) this.press(Action.Down);
    this.press(Action.Confirm);
    this.hold(0, 2);
  }

  /** QUIT TO TITLE, YES. */
  quit(): void {
    this.pauseRow(3);
    expect(this.top).toBe('confirm');
    this.press(Action.Left);
    this.press(Action.Confirm);
    this.hold(0, 2);
    expect(this.top).toBe('title');
  }
}

/**
 * Plays a run replay to its end.
 *
 * @param run - The run.
 * @param db - Its content.
 * @returns The playback.
 */
function playAll(run: RunReplay, db: ContentDb): RunReplayPlayback {
  const playback = new RunReplayPlayback(run, db);
  for (let i = 0; i < 200_000 && playback.step(); i++);
  return playback;
}

/**
 * Plays a run through the flow: FULL POWER, SELF DESTRUCT (the game over), a continue, the zone's
 * clear and tally, the next zone, the quit.
 *
 * @returns The session and the run's replay.
 */
function playCampaignRun(): { s: RunSession; run: RunReplay } {
  const s = new RunSession({ db: LONG, config: { continues: 2, startingLives: 1 } });
  s.start();
  s.hold(Action.Shot | Action.Up, 60);
  s.secret(SecretCode.FullPower);
  s.hold(Action.Shot, 20);
  s.untilVulnerable();
  s.secret(SecretCode.SelfDestruct);
  s.until('continue', 400);
  s.hold(0, 40); // the continue screen's lock
  s.press(Action.Confirm);
  expect(s.top).toBe('game');
  s.until('stageClear');
  s.press(Action.Confirm);
  s.until('map');
  s.hold(0, 3);
  s.press(Action.Confirm);
  s.until('game');
  s.hold(Action.Down | Action.Shot, 100);
  s.quit();
  const run = s.flow.lastReplay;
  expect(run).not.toBeNull();
  return { s, run: run! };
}

/**
 * A run replay's document with a change.
 *
 * @param run - The run.
 * @param change - Changes the (fresh) document in place.
 * @returns The changed run.
 */
function edited(
  run: RunReplay,
  change: (doc: RunReplayJson & Record<string, unknown>) => void,
): RunReplay {
  const doc = JSON.parse(JSON.stringify(encodeRunReplay(run))) as RunReplayJson &
    Record<string, unknown>;
  change(doc);
  return decodeRunReplay(doc);
}

describe('core/scenes run replays of whole runs through the flow (M3-01)', () => {
  const { s, run } = playCampaignRun();

  it('records a segment per World with the flow`s actions and plays it back hash for hash', () => {
    expect(run.segments).toHaveLength(2);
    expect(run.mode).toBe('1p');
    expect(run.reached).toBe('U');
    expect(run.assists & AssistFlag.Secret).toBe(AssistFlag.Secret);
    const [first, second] = run.segments;
    const codes: number[] = [];
    for (let k = 1; k < first.actions.length; k += 2) codes.push(first.actions[k] & 0xff);
    expect(codes).toEqual([RunAction.FullPower, RunAction.SelfDestruct, RunAction.Continue]);
    // The second zone starts from the first one's players (the carried state) and its hi-score.
    expect(first.start).toMatchObject({ stageTerm: 1, returnX: -1, checkpoint: -1 });
    expect(second.start).toMatchObject({ stageTerm: 2, carry: { continuesUsed: 1 } });
    expect(second.replay.header.stageId).toBe('t-u');
    const playback = playAll(run, LONG);
    expect(playback.report).toMatchObject({
      ok: true,
      finished: true,
      desyncSegment: -1,
      desyncTick: -1,
    });
    // A hash every 600 ticks and one final hash per segment.
    let expected = 0;
    for (const segment of run.segments) expected += segment.replay.hashes.length + 1;
    expect(playback.report.checked).toBe(expected);
    // The playback ends in the run's last World with the recorded score.
    expect(playback.segment).toBe(1);
    expect(playback.world!.scoring.board.scores[0].score).toBe(run.score);
    expect(playback.world!.scoring.board.scores[0].score).toBe(
      s.game.world.scoring.board.scores[0].score,
    );
    // Over: nothing more happens.
    expect(playback.step()).toBe(false);
    expect(playback.nextStage).toBeNull();
    expect(playback.running).toBe(false);
  });

  it('desyncs when an action is dropped or a hash changed, naming the segment and tick', () => {
    // Without the continue the second segment's start (and the first's final hash) disagree.
    const noContinue = edited(run, (doc) => {
      const segment = doc.segments[0] as unknown as { actions: number[] };
      segment.actions = segment.actions.slice(0, 4);
    });
    const a = playAll(noContinue, LONG);
    expect(a.report.ok).toBe(false);
    expect(a.report.desyncSegment).toBe(0);
    expect(a.report.finished).toBe(false);
    // A changed final hash of the last segment: found at its last tick.
    const lastHash = edited(run, (doc) => {
      const replay = doc.segments[1].replay as unknown as { finalHash: number };
      replay.finalHash = (replay.finalHash + 1) >>> 0;
    });
    const b = playAll(lastHash, LONG);
    expect(b.report).toMatchObject({
      ok: false,
      desyncSegment: 1,
      desyncTick: run.segments[1].replay.ticks,
      finished: false,
    });
    expect(b.step()).toBe(false);
  });

  it('applies an action recorded before a World`s first tick, never blocking the later ones', () => {
    // Regression: a [0, code] pair was never applied, and every action after it waited forever.
    const early = edited(run, (doc) => {
      const segment = doc.segments[0] as unknown as { actions: number[] };
      segment.actions = [0, RunAction.SelfDestruct, ...segment.actions];
    });
    expect(early.segments[0].actions[0]).toBe(0);
    const playback = playAll(early, LONG);
    expect(playback.report).toMatchObject({ ok: true, finished: true });
  });

  it('reports a segment it cannot start as a desync at its tick 0', () => {
    const cases: Array<[string, RunReplay]> = [
      [
        'unknown stage',
        edited(run, (doc) => {
          const header = (doc.segments[1].replay as unknown as { header: Record<string, unknown> })
            .header;
          (header.config as Record<string, unknown>).stage = 'nowhere';
          header.stageId = 'nowhere';
        }),
      ],
      [
        'malformed start',
        edited(run, (doc) => {
          (doc.segments[1] as { start: unknown }).start = { stageTerm: 'two' };
        }),
      ],
      [
        'missing checkpoint',
        edited(run, (doc) => {
          const header = (doc.segments[1].replay as unknown as { header: Record<string, unknown> })
            .header;
          header.checkpoint = 40;
        }),
      ],
    ];
    for (const [name, broken] of cases) {
      const playback = playAll(broken, LONG);
      expect(playback.report, name).toMatchObject({
        ok: false,
        desyncSegment: 1,
        desyncTick: 0,
        finished: false,
      });
      expect(playback.world, name).toBeNull();
    }
  });

  it('names the stage the next step starts, only between segments', () => {
    const playback = new RunReplayPlayback(run, LONG);
    expect(playback.segment).toBe(-1);
    expect(playback.config).toBeNull();
    expect(playback.nextStage).toBe('t-s');
    playback.step();
    expect(playback.nextStage).toBeNull();
    expect(playback.config?.stage).toBe('t-s');
    for (let i = 1; i < run.segments[0].replay.ticks; i++) playback.step();
    expect(playback.nextStage).toBe('t-u');
    playback.step();
    expect([playback.segment, playback.config?.stage, playback.nextStage]).toEqual([
      1,
      't-u',
      null,
    ]);
  });
});

describe('core/scenes run replays: bonus stages and retries (M3-01)', () => {
  it('plays back a bonus stage, a death in it and the return to the zone', () => {
    const s = new RunSession({ db: campaignContent(true) });
    s.start();
    const zone = s.game.world;
    for (let i = 0; i < 2000 && s.game.world === zone; i++) s.hold(Action.Shot);
    expect(s.flow.run.inBonus).toBe(true);
    s.untilVulnerable();
    s.secret(SecretCode.SelfDestruct);
    const bonus = s.game.world;
    for (let i = 0; i < 600 && s.game.world === bonus; i++) s.hold(0);
    expect(s.flow.run.inBonus).toBe(false);
    s.hold(Action.Up, 30);
    s.quit();
    const run = s.flow.lastReplay!;
    expect(run.segments.map((x) => x.replay.header.stageId)).toEqual(['t-s', 't-v', 't-s']);
    // Back in the zone at the entrance, its entrances locked.
    const back = run.segments[2].start!;
    expect(back.returnX as number).toBeGreaterThanOrEqual(0);
    expect(back.locked).toBe(true);
    const playback = playAll(run, campaignContent(true));
    expect(playback.report).toMatchObject({ ok: true, finished: true });
    expect(playback.world!.scoring.board.scores[0].score).toBe(run.score);
  });

  it('a RETRY STAGE ends the World`s segment and starts a new one', () => {
    const s = new RunSession({ db: LONG });
    s.start();
    s.hold(Action.Shot | Action.Right, 150);
    s.pauseRow(2); // RETRY STAGE
    expect(s.top).toBe('game');
    s.hold(Action.Shot | Action.Left, 90);
    s.quit();
    const run = s.flow.lastReplay!;
    expect(run.segments).toHaveLength(2);
    expect(run.segments.map((x) => x.replay.header.stageId)).toEqual(['t-s', 't-s']);
    expect(run.segments[0].replay.ticks).toBeGreaterThanOrEqual(150);
    expect(playAll(run, LONG).report).toMatchObject({ ok: true, finished: true });
  });

  it('a debug jump leaves the run unsaved; the next run is recorded again', () => {
    const s = new RunSession({ db: LONG });
    s.start();
    s.hold(Action.Shot, 30);
    s.flow.noteWorldEdited();
    s.quit();
    expect(s.flow.lastReplay).toBeNull();
    s.start();
    s.hold(Action.Shot, 30);
    s.quit();
    expect(s.flow.lastReplay?.segments).toHaveLength(1);
  });
});

describe('core/scenes RunRecorder (M3-01)', () => {
  const config = resolveGameConfig({ seed: 4 });
  const start = new WorldStart();

  it('records nothing outside a run and nothing once cancelled', () => {
    const recorder = new RunRecorder();
    const world = createWorld(config, EMPTY_CONTENT_DB);
    const input = createInputSnapshot();
    recorder.beginSegment(world, null, start, null, 'x', false, 0);
    recorder.record(input);
    recorder.action(RunAction.Continue, 1);
    expect(recorder.segment.active).toBe(false);
    expect(recorder.finishRun(world, meta(0))).toBeNull();
    recorder.beginRun();
    recorder.beginSegment(world, null, start, null, 'x', false, 0);
    recorder.record(input);
    stepWorld(world, input);
    recorder.cancel();
    expect([recorder.recording, recorder.valid, recorder.segments.length]).toEqual([
      false,
      false,
      0,
    ]);
    expect(recorder.finishRun(world, meta(0))).toBeNull();
    // A run with no World at all is not saved either.
    recorder.beginRun();
    expect(recorder.finishRun(world, meta(0))).toBeNull();
    expect(recorder.recording).toBe(false);
  });

  it('writes the header`s flags, the start state and the meta into the replay', () => {
    const recorder = new RunRecorder();
    const world = createWorld(config, EMPTY_CONTENT_DB);
    const input = createInputSnapshot();
    recorder.beginRun();
    const s = new WorldStart();
    s.stageTerm = 3;
    recorder.beginSegment(world, null, s, null, 'build-7', true, AssistFlag.Speed);
    for (let t = 0; t < 5; t++) {
      recorder.record(input);
      stepWorld(world, input);
      recorder.check(world);
    }
    const run = recorder.finishRun(world, meta(AssistFlag.Speed | AssistFlag.GodMode))!;
    expect(run).toMatchObject({ buildId: 'b', mode: '1p', label: 'L', score: 10, ticks: 5 });
    const header = run.segments[0].replay.header;
    expect(header).toMatchObject({ buildId: 'build-7', assisted: true });
    // The finished segment carries the run's final flags.
    expect(header.assists).toBe(AssistFlag.Speed | AssistFlag.GodMode);
    expect(run.segments[0].start).toMatchObject({ stageTerm: 3, hiScore: 0 });
    expect(run.segments[0].start).not.toHaveProperty('carry');
    expect(Object.isFrozen(run.segments)).toBe(true);
    expect(recorder.segments).toHaveLength(0);
  });

  it('gives up on a run of more than MAX_RUN_SEGMENTS Worlds or an overflowing one', () => {
    const recorder = new RunRecorder();
    const input = createInputSnapshot();
    recorder.beginRun();
    let previous = null;
    let world = createWorld(config, EMPTY_CONTENT_DB);
    for (let i = 0; i <= MAX_RUN_SEGMENTS; i++) {
      world = createWorld(config, EMPTY_CONTENT_DB);
      recorder.beginSegment(world, previous, start, null, 'x', false, 0);
      recorder.record(input);
      stepWorld(world, input);
      previous = world;
    }
    expect(recorder.segments).toHaveLength(MAX_RUN_SEGMENTS);
    expect(recorder.finishRun(world, meta(0))).toBeNull();
    expect(recorder.valid).toBe(false);
    // An invalidated run stops recording its ticks at once.
    recorder.beginRun();
    recorder.beginSegment(world, null, start, null, 'x', false, 0);
    recorder.invalidate();
    recorder.record(input);
    expect(recorder.segment.ticks).toBe(0);
    expect(recorder.finishRun(world, meta(0))).toBeNull();
  });

  /**
   * A run's meta.
   *
   * @param assists - The flags.
   * @returns The meta.
   */
  function meta(assists: number): {
    buildId: string;
    mode: string;
    label: string;
    score: number;
    reached: string;
    assists: number;
  } {
    return { buildId: 'b', mode: '1p', label: 'L', score: 10, reached: '', assists };
  }
});

describe('core/scenes worldStartJson / readWorldStart (M3-01)', () => {
  /**
   * A carried state captured from a powered-up World.
   *
   * @returns The state.
   */
  function carried(): CarryState {
    const world = createWorld(
      resolveGameConfig({ seed: 2, loadout: 'full', coop: true }),
      EMPTY_CONTENT_DB,
    );
    const input = createInputSnapshot();
    for (let t = 0; t < 30; t++) stepWorld(world, input);
    return captureCarry(world, new CarryState());
  }

  it('round-trips the start state and the carried players through JSON', () => {
    const start = new WorldStart();
    start.stageTerm = 4;
    start.returnX = 120;
    start.locked = true;
    const carry = carried();
    const json = JSON.parse(JSON.stringify(worldStartJson(start, carry, 77_000))) as Record<
      string,
      unknown
    >;
    const back = readWorldStart(json);
    expect(back.start).toEqual(start);
    expect(back.hiScore).toBe(77_000);
    expect(back.carry).not.toBeNull();
    expect(back.carry!.valid).toBe(true);
    expect(worldStartJson(back.start, back.carry, back.hiScore)).toEqual(json);
    const p = back.carry!.players[0];
    expect([p.options, p.missile, p.active]).toEqual([carry.players[0].options, true, true]);
    // Without a carry (or an invalid one): the start fields only.
    expect(worldStartJson(start, null, 5)).not.toHaveProperty('carry');
    expect(worldStartJson(start, new CarryState(), 5)).not.toHaveProperty('carry');
    // null: a fresh World at its stage start.
    const fresh = readWorldStart(null);
    expect(fresh).toMatchObject({ carry: null, hiScore: 0 });
    expect(fresh.start).toEqual(new WorldStart());
  });

  it('refuses a malformed start state', () => {
    const good = JSON.parse(JSON.stringify(worldStartJson(new WorldStart(), carried(), 0))) as {
      carry: { players: Array<Record<string, unknown> & { shield: Record<string, unknown> }> };
    } & Record<string, unknown>;
    /**
     * A copy of the good state with a change.
     *
     * @param change - Changes the copy.
     * @returns The copy.
     */
    const variant = (change: (doc: typeof good) => void): Record<string, unknown> => {
      const doc = JSON.parse(JSON.stringify(good)) as typeof good;
      change(doc);
      return doc;
    };
    const bad: Array<[string, Record<string, unknown>]> = [
      ['stageTerm', variant((d) => delete d.stageTerm)],
      ['returnX NaN', variant((d) => (d.returnX = null))],
      ['locked', variant((d) => (d.locked = 1))],
      ['hiScore', variant((d) => (d.hiScore = '0'))],
      ['carry array', variant((d) => ((d as Record<string, unknown>).carry = []))],
      [
        'carry continues',
        variant((d) => ((d.carry as Record<string, unknown>).continuesUsed = 'x')),
      ],
      ['one player', variant((d) => d.carry.players.pop())],
      ['player null', variant((d) => ((d.carry.players as unknown[])[1] = null))],
      ['player lives', variant((d) => delete d.carry.players[0].lives)],
      ['player active', variant((d) => (d.carry.players[0].active = 'yes'))],
      [
        'shield missing',
        variant((d) => delete (d.carry.players[0] as Record<string, unknown>).shield),
      ],
      ['shield kind', variant((d) => (d.carry.players[0].shield.kind = Infinity))],
      ['shield terrain', variant((d) => (d.carry.players[0].shield.absorbsTerrain = 0))],
      ['pods short', variant((d) => (d.carry.players[0].shield.podHits = [0]))],
      [
        'pod value',
        variant(
          (d) =>
            (d.carry.players[1].shield.podAngle = new Array<string>(MAX_SHIELD_PODS).fill('0')),
        ),
      ],
    ];
    for (const [name, doc] of bad) expect(() => readWorldStart(doc), name).toThrow(RangeError);
  });

  it('is what a segment`s playback applies before its first tick', () => {
    // A header of a fresh World and a hand-made start: the playback's World gets its rank term.
    const config = resolveGameConfig({ seed: 6, stage: null });
    const world = createWorld(config, EMPTY_CONTENT_DB);
    const recorder = new RunRecorder();
    recorder.beginRun();
    const start = new WorldStart();
    start.stageTerm = 5;
    // The recording World gets the same start first (as the flow's prepareRunWorld does).
    prepareWorldStart(world, start, null);
    recorder.beginSegment(world, null, start, null, 'x', false, 0);
    const header = createReplayHeader(config);
    expect(header.stageId).toBeNull();
    const input = createInputSnapshot();
    for (let t = 0; t < 3; t++) {
      recorder.record(input);
      stepWorld(world, input);
    }
    const run = recorder.finishRun(world, {
      buildId: 'b',
      mode: '1p',
      label: 'L',
      score: 0,
      reached: '',
      assists: 0,
    })!;
    const playback = new RunReplayPlayback(run, EMPTY_CONTENT_DB);
    expect(playback.nextSegment()).toBe(true);
    expect(playback.world!.rankInputs.stage).toBe(5);
    for (let t = 0; t < 3; t++) playback.step();
    expect(playback.report).toMatchObject({ ok: true, finished: true });
  });
});
