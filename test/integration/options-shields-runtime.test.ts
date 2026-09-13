/**
 * The Option types, meter shields and Option Hunter of plan M2-04 end to end on the shipped content
 * (the real `content/` files with the engine's script registry and sprites, the way the shell
 * loads them).
 *
 * - Every Option type × every `?` shield (4 × 5 sessions) flies the shipped `test-range` with the
 *   full loadout, a weaving pilot pressing Special now and then and god mode: after every tick
 *   the Options fly (as many as the loadout owns) at finite positions within the view ± 64 px, the
 *   spread state stays in range, the shield keeps its kind's shape (pods at their orbit, at most
 *   four, `hits` the pods' sum; Reduce's hurt scale matching its hits) and the shield batch draws
 *   one sprite per standing pod or one for a field.
 * - Two zone A sessions per Option type (with a pod shield or Reduce) fed the same weaving input
 *   — Special presses included, which the golden replays' bot never makes — stay in lockstep.
 * - Under a Samsung remote (`tizen-remote-safe`): Ch+ (427) toggles the Formation once per press —
 *   auto-repeats and the fake key-up / key-down pairs some remotes send never toggle again —, and
 *   holding OK spreads the Rotate Options after 15 ticks while the meter equips once.
 * - A recorded session of the `hunter-range` (Snake Options, Free Shield, full loadout, god mode)
 *   plays back into a fresh session without a desync: Option Hunters steal from a replayed run.
 */
import {
  Action,
  ENGINE_SPRITES,
  KNOWN_SCRIPT_IDS,
  MAX_SHIELD_PODS,
  MeterSlot,
  OPTION_CHOICES,
  OPTION_HOLD_TICKS,
  OPTION_SPREAD_TICKS,
  PLAYFIELD_H,
  PLAYFIELD_W,
  SFX_CUES,
  SHIELD_CHOICES,
  SHIELD_CHOICE_SPECS,
  ShieldKind,
  SimEventKind,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  createPlayback,
  createReplayGame,
  createReplayHeader,
  createReplayRecorder,
  hashWorld,
  loadContent,
  reduceHurtScale,
  resolveGameConfig,
  shieldActive,
  type ContentDb,
  type Game,
  type GameConfig,
  type HeadlessPlatform,
  type World,
} from '@shmup/core';
import { INPUT_PROFILES_KIND, createWebInput, loadInputProfiles } from '@shmup/input-web';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';

/**
 * The shipped content with the engine sprites, validated like the shell does.
 *
 * @returns The DB.
 */
function shipped(): ContentDb {
  const { db, issues } = loadContent(readContentFiles(), {
    knownScripts: KNOWN_SCRIPT_IDS,
    extraSprites: ENGINE_SPRITES,
  });
  expect(issues).toEqual([]);
  return db;
}

const DB = shipped();

/** A headless session and the platform feeding it. */
interface Session {
  /** The game (bare gameplay, no scene flow). */
  readonly g: Game;
  /** Its platform (the input snapshot). */
  readonly platform: HeadlessPlatform;
}

/**
 * A headless game (bare gameplay, no scene flow).
 *
 * @param config - Config overrides.
 * @returns The session.
 */
function game(config: Partial<GameConfig>): Session {
  const platform = createHeadlessPlatform();
  return { g: createGame(platform, { seed: 31, ...config }, DB), platform };
}

/**
 * A weaving pilot: up / down every 30 ticks, drifting right then left, Special every 50 ticks
 * (a press: one tick held).
 *
 * @param tick - The tick.
 * @returns The action mask.
 */
function weave(tick: number): number {
  const vertical = (tick / 30) % 2 < 1 ? Action.Up : Action.Down;
  const horizontal = (tick / 90) % 2 < 1 ? Action.Right : Action.Left;
  return vertical | (tick % 3 === 0 ? horizontal : 0) | (tick % 50 === 25 ? Action.Special : 0);
}

/** Collects the first invariant violations (asserted empty once at the end). */
class Violations {
  /** The first violations found (at most 10). */
  readonly list: string[] = [];

  /**
   * Records a violation unless `ok`.
   *
   * @param ok - Whether the invariant holds.
   * @param what - Describes the violation (called only when it does not hold).
   */
  check(ok: boolean, what: () => string): void {
    if (!ok && this.list.length < 10) this.list.push(what());
  }
}

/**
 * Checks the per-tick invariants of player 1's Options and shield.
 *
 * @param w - The world.
 * @param label - The session, for the messages.
 * @param v - Where violations go.
 */
function checkOptionsAndShield(w: World, label: string, v: Violations): void {
  const at = (): string => `${label} tick ${w.tick}`;
  const ship = w.players[0];
  if (ship.state !== 'alive') return;
  const group = w.weapons.options[0];
  const owned = w.weapons.loadouts[0].options;
  v.check(group.count === owned, () => `${at()}: ${group.count} Options fly, ${owned} owned`);
  v.check(
    group.spreadTicks >= 0 && group.spreadTicks <= OPTION_SPREAD_TICKS,
    () => `${at()}: spread ${group.spreadTicks}`,
  );
  const cam = w.camera;
  for (let k = 0; k < group.count; k++) {
    const x = group.x[k] - cam.x;
    const y = group.y[k] - cam.y;
    v.check(
      Number.isFinite(x) && Number.isFinite(y),
      () => `${at()}: Option ${k} at ${String(x)}, ${String(y)}`,
    );
    v.check(
      x >= -64 && x <= PLAYFIELD_W + 64 && y >= -64 && y <= PLAYFIELD_H + 64,
      () => `${at()}: Option ${k} outside the view (${x.toFixed(1)}, ${y.toFixed(1)})`,
    );
  }
  const s = ship.shield;
  if (!shieldActive(s)) {
    v.check(s.podCount === 0, () => `${at()}: ${s.podCount} pods without a shield`);
    v.check(s.hurtScale === 1, () => `${at()}: hurt scale ${s.hurtScale} without a shield`);
    return;
  }
  const podKind =
    s.kind === ShieldKind.Shield ||
    s.kind === ShieldKind.FreeShield ||
    s.kind === ShieldKind.RotateShield;
  if (podKind) {
    v.check(
      s.podCount >= 2 && s.podCount <= MAX_SHIELD_PODS && s.podCount % 2 === 0,
      () => `${at()}: ${s.podCount} pod slots`,
    );
    let sum = 0;
    let standing = 0;
    for (let k = 0; k < s.podCount; k++) {
      sum += s.podHits[k];
      if (s.podHits[k] > 0) standing++;
      const d = Math.sqrt((s.podX[k] - ship.x) ** 2 + (s.podY[k] - ship.y) ** 2);
      v.check(Math.abs(d - s.podOrbit) < 0.01, () => `${at()}: pod ${k} ${d.toFixed(2)} px out`);
    }
    v.check(sum === s.hits, () => `${at()}: pods hold ${sum}, the shield says ${s.hits}`);
    v.check(s.hurtScale === 1, () => `${at()}: pods changed the hurt scale`);
    const drawn = w.powerups.shieldBatch.count;
    v.check(drawn === standing, () => `${at()}: ${drawn} pod sprites, ${standing} standing`);
  } else {
    v.check(s.podCount === 0, () => `${at()}: a field with ${s.podCount} pods`);
    const want = s.kind === ShieldKind.Reduce ? reduceHurtScale(s.hits) : 1;
    v.check(s.hurtScale === want, () => `${at()}: hurt scale ${s.hurtScale}, want ${want}`);
    v.check(w.powerups.shieldBatch.count === 1, () => `${at()}: field sprites drawn`);
  }
}

describe('integration: Option types and meter shields on the shipped content (M2-04)', () => {
  it('every Option type × `?` shield flies the test range within its invariants', () => {
    const v = new Violations();
    let sessions = 0;
    for (const optionChoice of OPTION_CHOICES) {
      for (const shieldChoice of SHIELD_CHOICES) {
        const label = `${optionChoice}/${shieldChoice}`;
        const { g, platform } = game({
          stage: 'test-range',
          loadout: 'full',
          optionChoice,
          shieldChoice,
        });
        const w = g.world;
        w.debugFlags.godMode = true;
        expect(w.players[0].shield.kind, label).toBe(SHIELD_CHOICE_SPECS[shieldChoice].kind);
        let spreadSeen = false;
        for (let t = 0; t < 300; t++) {
          commitPlayerInput(platform.snapshot.players[0], weave(t));
          g.step();
          w.events.clear();
          checkOptionsAndShield(w, label, v);
          if (w.weapons.options[0].spreadTicks === OPTION_SPREAD_TICKS) spreadSeen = true;
        }
        // Special toggled the spread out at some point (every type keeps the state).
        v.check(spreadSeen, () => `${label}: never spread`);
        sessions++;
      }
    }
    expect(sessions).toBe(20);
    expect(v.list).toEqual([]);
  });

  it('two zone A sessions per Option type stay in lockstep; the types differ', () => {
    const pairs: [GameConfig['optionChoice'], GameConfig['shieldChoice']][] = [
      ['trail', 'shield'],
      ['snake', 'freeShield'],
      ['formation', 'reduce'],
      ['rotate', 'rotateShield'],
    ];
    const finals: number[] = [];
    for (const [optionChoice, shieldChoice] of pairs) {
      const hashes: number[][] = [];
      for (let k = 0; k < 2; k++) {
        const { g, platform } = game({
          stage: 'zone-a',
          loadout: 'full',
          optionChoice,
          shieldChoice,
        });
        const out: number[] = [];
        for (let t = 0; t < 900; t++) {
          commitPlayerInput(platform.snapshot.players[0], weave(t));
          g.step();
          g.world.events.clear();
          if (t % 150 === 149) out.push(hashWorld(g.world));
        }
        hashes.push(out);
      }
      expect(hashes[0], optionChoice).toEqual(hashes[1]);
      finals.push(hashes[0][hashes[0].length - 1]);
    }
    expect(new Set(finals).size).toBe(pairs.length);
  });
});

/** Remote key codes (Tizen / DOM legacy `keyCode`). */
const KEY = { ok: 13, chPlus: 427 } as const;

/** One displayed frame at 60 Hz (one tick). */
const STEP = 1000 / 60;

/**
 * A free-flight game fed by a remote under `tizen-remote-safe`, after the fly-in, with four
 * Options of a type.
 *
 * @param optionChoice - The Option type.
 * @returns The game, a key sender and a frame runner.
 */
function remoteSession(optionChoice: GameConfig['optionChoice']): {
  game: Game;
  key: (type: 'keydown' | 'keyup', keyCode: number, repeat?: boolean) => void;
  frame: () => void;
} {
  const { profiles, issues } = loadInputProfiles(
    readContentFiles().filter(
      (file) => (file.data as { kind?: unknown }).kind === INPUT_PROFILES_KIND,
    ),
  );
  expect(issues).toEqual([]);
  const safe = profiles.find((p) => p.id === 'tizen-remote-safe');
  if (safe === undefined) throw new Error('tizen-remote-safe missing');
  const keys = new EventTarget();
  const input = createWebInput({ keyTarget: keys, keyDevice: 'remote' });
  input.setProfile(safe);
  const g = createGame(
    { ...createHeadlessPlatform(), input },
    { seed: 42, optionChoice, autofire: true },
    DB,
  );
  let frames = 0;
  g.frame(0);
  const frame = (): void => {
    frames++;
    g.frame(frames * STEP);
    g.world.events.clear();
  };
  while (g.world.players[0].state !== 'alive') frame();
  g.world.weapons.loadouts[0].options = 4;
  frame();
  return {
    game: g,
    key(type, keyCode, repeat = false) {
      keys.dispatchEvent(Object.assign(new Event(type), { code: '', keyCode, repeat }));
    },
    frame,
  };
}

describe('integration: the Option spread under a Samsung remote (tizen-remote-safe)', () => {
  it('Ch+ toggles the Formation once per press; repeats and fake gaps never toggle again', () => {
    const s = remoteSession('formation');
    const group = s.game.world.weapons.options[0];
    s.key('keydown', KEY.chPlus);
    s.frame();
    expect([group.toggled, group.spreadTicks]).toEqual([true, 1]);
    for (let i = 1; i <= 60; i++) {
      if (i % 5 === 0) s.key('keydown', KEY.chPlus, true); // auto-repeat
      if (i % 7 === 3) s.key('keyup', KEY.chPlus); // a fake release …
      if (i % 7 === 4) s.key('keydown', KEY.chPlus); // … cancelled one frame later
      s.frame();
    }
    expect([group.toggled, group.spreadTicks]).toEqual([true, OPTION_SPREAD_TICKS]);
    // Released past the debounce, pressed again: back in.
    s.key('keyup', KEY.chPlus);
    for (let i = 0; i < 4; i++) s.frame();
    s.key('keydown', KEY.chPlus);
    s.frame();
    s.key('keyup', KEY.chPlus);
    expect(group.toggled).toBe(false);
    for (let i = 0; i < OPTION_SPREAD_TICKS + 4; i++) s.frame();
    expect(group.spreadTicks).toBe(0);
  });

  it('holding OK spreads the Rotate Options after 15 ticks; the meter equips once', () => {
    const s = remoteSession('rotate');
    const w = s.game.world;
    const group = w.weapons.options[0];
    const ship = w.players[0];
    w.powerups.meters[0].cursor = MeterSlot.Speed;
    const speed = ship.speedLevel;
    s.key('keydown', KEY.ok);
    for (let i = 0; i < OPTION_HOLD_TICKS - 1; i++) {
      if (i % 5 === 4) s.key('keydown', KEY.ok, true);
      s.frame();
    }
    expect(group.spreadTicks).toBe(0);
    for (let i = 0; i < OPTION_SPREAD_TICKS + 2; i++) s.frame();
    expect(group.spreadTicks).toBe(OPTION_SPREAD_TICKS);
    expect(ship.speedLevel).toBe(speed + 1);
    s.key('keyup', KEY.ok);
    for (let i = 0; i < OPTION_SPREAD_TICKS + 4; i++) s.frame();
    expect([group.spreadTicks, group.holdTicks]).toEqual([0, 0]);
  });
});

describe('integration: the hunter range recorded and replayed (M2-04)', () => {
  it('a Snake / Free Shield run with Option Hunters plays back without a desync', () => {
    const config = resolveGameConfig({
      seed: 17,
      stage: 'hunter-range',
      loadout: 'full',
      optionChoice: 'snake',
      shieldChoice: 'freeShield',
    });
    const header = createReplayHeader(config, { buildId: 'test', assisted: true });
    const platform = createHeadlessPlatform();
    const recorder = createReplayRecorder(platform.input, header);
    const game = createReplayGame({ ...platform, input: recorder }, header, DB);
    let stolen = 0;
    let alarms = 0;
    for (let t = 0; t < 2600 && game.world.status === 'playing'; t++) {
      commitPlayerInput(platform.snapshot.players[0], weave(t) & ~Action.Left);
      game.step();
      game.world.events.drain((e) => {
        if (e.kind !== SimEventKind.Sfx) return;
        if (e.id === SFX_CUES.OptionStolen) stolen++;
        if (e.id === SFX_CUES.OptionHunter) alarms++;
      });
      recorder.check(game.world);
    }
    const replay = recorder.finish(game.world);
    expect(alarms).toBeGreaterThan(0);
    expect(stolen).toBeGreaterThan(0);
    expect(replay.header.config).toMatchObject({
      optionChoice: 'snake',
      shieldChoice: 'freeShield',
    });
    const playback = createPlayback(replay, { buildId: 'test' });
    const again = createReplayGame(
      { ...createHeadlessPlatform(), input: playback },
      replay.header,
      DB,
    );
    while (!playback.done) {
      again.step();
      again.events.clear();
      playback.check(again.world);
    }
    expect(playback.report).toMatchObject({ ok: true, finished: true, buildMatches: true });
    expect(hashWorld(again.world)).toBe(hashWorld(game.world));
    expect(again.world.weapons.options[0].stolen).toBe(game.world.weapons.options[0].stolen);
  });
});
