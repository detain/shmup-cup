/**
 * Direct mode and the MANTA of plan M2-05 end to end on the shipped content (the real `content/`
 * files with the engine's script registry and sprites, the way the shell loads them).
 *
 * - The MANTA flies the `direct-range` (god mode, a pilot chasing items, pressing Ch− now and then):
 *   after every tick its levels stay within its families' caps, the family index within the main
 *   families, the speed level within the ship's speeds, the Arm consistent with its blue-item count
 *   (tier, hits, terrain absorption — none left over once it is gone), every item in play is a
 *   colour item or the blue capsule (never a meter capsule) younger than its 600-tick life inside
 *   the playfield's rows, every shot is a direct role, and the plan cursor only moves on — the
 *   carriers hand out every colour and the pilot (going for the nearest item) collects them all.
 * - Zone A: two MANTA sessions fed the same weaving input with Speed presses stay in lockstep, and
 *   differ from the KESTREL's on the same input.
 * - Under a Samsung remote (`tizen-remote-safe`): Ch− (428) toggles the speed once per press —
 *   auto-repeats and the fake key-up / key-down pairs some remotes send never toggle again —, and
 *   OK (the meter's PowerUp) changes nothing in Direct mode.
 * - A recorded MANTA session of the direct range (Speed presses included) plays back into a fresh
 *   session without a desync.
 */
import {
  Action,
  ARM_TIER_HITS,
  DIRECT_ITEM_TICKS,
  DIRECT_POWER_UP_EVENT_BASE,
  ENGINE_SPRITES,
  ItemFlag,
  ItemKind,
  KNOWN_SCRIPT_IDS,
  PLAYFIELD_H,
  ShieldKind,
  ShotFlag,
  SimEventKind,
  WEAPON_ROLE_COUNT,
  armTierOf,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  createPlayback,
  createReplayGame,
  createReplayHeader,
  createReplayRecorder,
  directMaxLevel,
  hashWorld,
  loadContent,
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

/** The MANTA's config fields. */
const MANTA: Partial<GameConfig> = { shipId: 'manta', powerUpMode: 'direct' };

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
  return { g: createGame(platform, { seed: 41, ...config }, DB), platform };
}

/**
 * A weaving pilot: up / down every 40 ticks, drifting right then left, the Speed toggle every 300
 * ticks (a press: one tick held).
 *
 * @param tick - The tick.
 * @returns The action mask.
 */
function weave(tick: number): number {
  const vertical = (tick / 40) % 2 < 1 ? Action.Up : Action.Down;
  const horizontal = (tick / 120) % 2 < 1 ? Action.Right : Action.Left;
  return vertical | (tick % 4 === 0 ? horizontal : 0) | (tick % 300 === 150 ? Action.Speed : 0);
}

/**
 * A pilot that goes for the nearest colour item in play (weaving without one), pressing Speed
 * every 300 ticks.
 *
 * @param w - The world.
 * @param tick - The tick.
 * @returns The action mask.
 */
function chase(w: World, tick: number): number {
  const ship = w.players[0];
  const f = w.powerups.pool.fields;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < w.powerups.pool.count; i++) {
    if ((f.flags[i] & ItemFlag.Dead) !== 0 || f.kind[i] < ItemKind.DirectRed) continue;
    const d = Math.abs(f.x[i] - ship.x) + Math.abs(f.y[i] - ship.y);
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  }
  const speed = tick % 300 === 150 ? Action.Speed : 0;
  if (best < 0) return weave(tick) | speed;
  const dx = f.x[best] - ship.x;
  const dy = f.y[best] - ship.y;
  let held = speed;
  if (dx > 2) held |= Action.Right;
  else if (dx < -2) held |= Action.Left;
  if (dy > 2) held |= Action.Down;
  else if (dy < -2) held |= Action.Up;
  return held;
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
 * Checks the per-tick invariants of a Direct-mode World.
 *
 * @param w - The world.
 * @param v - Where violations go.
 * @param cursor - The plan cursor before the tick.
 */
function checkDirect(w: World, v: Violations, cursor: number): void {
  const at = (): string => `tick ${w.tick}`;
  const loadout = w.weapons.loadouts[0];
  const mains = w.weapons.mainFamilies;
  v.check(
    loadout.family >= 0 && loadout.family < mains.length,
    () => `${at()}: family ${loadout.family}`,
  );
  const top = directMaxLevel(mains[loadout.family]);
  v.check(loadout.shot >= 0 && loadout.shot <= top, () => `${at()}: shot ${loadout.shot}`);
  const subTop = directMaxLevel(w.weapons.subFamily);
  v.check(loadout.sub >= 0 && loadout.sub <= subTop, () => `${at()}: sub ${loadout.sub}`);
  const ship = w.players[0];
  v.check(
    ship.speedLevel >= 0 && ship.speedLevel < w.ship.speeds.length,
    () => `${at()}: speed level ${ship.speedLevel}`,
  );
  const s = ship.shield;
  if (shieldActive(s)) {
    v.check(s.kind === ShieldKind.Arm, () => `${at()}: shield kind ${s.kind}`);
    v.check(s.tier === armTierOf(s.charge), () => `${at()}: tier ${s.tier} for ${s.charge} blue`);
    v.check(s.maxHits === ARM_TIER_HITS[s.tier], () => `${at()}: ${s.maxHits} hits at ${s.tier}`);
    v.check(s.hits >= 1 && s.hits <= s.maxHits, () => `${at()}: Arm hits ${s.hits}`);
    v.check(s.absorbsTerrain, () => `${at()}: an Arm that lets terrain through`);
  } else {
    v.check(s.tier === 0 && s.charge === 0, () => `${at()}: tier ${s.tier} without an Arm`);
  }
  const items = w.powerups.pool;
  const f = items.fields;
  for (let i = 0; i < items.count; i++) {
    if ((f.flags[i] & ItemFlag.Dead) !== 0) continue;
    const kind = f.kind[i];
    const colour = kind >= ItemKind.DirectRed && kind <= ItemKind.DirectOctagon;
    v.check(
      colour || kind === ItemKind.BlueCapsule,
      () => `${at()}: item kind ${kind} in Direct mode`,
    );
    if (!colour) continue;
    v.check(f.age[i] < DIRECT_ITEM_TICKS, () => `${at()}: item ${i} aged ${f.age[i]}`);
    const y = f.y[i] - w.camera.y;
    v.check(y >= -1 && y <= PLAYFIELD_H + 1, () => `${at()}: item ${i} at view y ${y.toFixed(1)}`);
  }
  const shots = w.weapons.pool;
  for (let i = 0; i < shots.count; i++) {
    if ((shots.fields.flags[i] & ShotFlag.Dead) !== 0) continue;
    v.check(
      shots.fields.role[i] >= WEAPON_ROLE_COUNT,
      () => `${at()}: a meter role ${shots.fields.role[i]} fired`,
    );
  }
  v.check(w.powerups.planCursor >= cursor, () => `${at()}: the plan cursor went back`);
}

describe('integration: Direct mode on the shipped content (M2-05)', () => {
  it('the MANTA flies the direct range within its invariants, collecting every colour', () => {
    const { g, platform } = game({ ...MANTA, stage: 'direct-range' });
    const w = g.world;
    w.debugFlags.godMode = true;
    expect(w.ship.id).toBe('manta');
    // Mid-level volleys, so the pincer waves fall and red / green items still have levels to add.
    w.weapons.loadouts[0].shot = 5;
    w.weapons.loadouts[0].sub = 5;
    const v = new Violations();
    const effects = new Set<number>();
    const handedOut = new Set<number>();
    let toggles = 0;
    for (let t = 0; t < 3600 && w.status === 'playing'; t++) {
      const cursor = w.powerups.planCursor;
      const speed = w.players[0].speedLevel;
      commitPlayerInput(platform.snapshot.players[0], chase(w, t));
      g.step();
      w.events.drain((e) => {
        if (e.kind === SimEventKind.PowerUp) effects.add(e.id - DIRECT_POWER_UP_EVENT_BASE);
      });
      if (w.players[0].speedLevel !== speed) toggles++;
      for (let k = cursor; k < w.powerups.planCursor; k++) {
        handedOut.add(w.powerups.plan[k % w.powerups.plan.length]);
      }
      checkDirect(w, v, cursor);
    }
    expect(v.list).toEqual([]);
    expect([...handedOut].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    // The pilot collected every colour: each one's effect happened at least once.
    expect([...effects].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(toggles).toBeGreaterThan(3);
  });

  it('two zone A MANTA sessions stay in lockstep and differ from the KESTREL`s', () => {
    const run = (config: Partial<GameConfig>): number[] => {
      const { g, platform } = game({ ...config, stage: 'zone-a' });
      const out: number[] = [];
      for (let t = 0; t < 1200; t++) {
        commitPlayerInput(platform.snapshot.players[0], weave(t));
        g.step();
        g.world.events.clear();
        if (t % 200 === 199) out.push(hashWorld(g.world));
      }
      return out;
    };
    const a = run(MANTA);
    const b = run(MANTA);
    expect(a).toEqual(b);
    const kestrel = run({});
    expect(kestrel[kestrel.length - 1]).not.toBe(a[a.length - 1]);
  });
});

/** Remote key codes (Tizen / DOM legacy `keyCode`). */
const KEY = { ok: 13, chMinus: 428 } as const;

/** One displayed frame at 60 Hz (one tick). */
const STEP = 1000 / 60;

/**
 * A free-flight MANTA game fed by a remote under `tizen-remote-safe`, after the fly-in.
 *
 * @returns The game, a key sender and a frame runner.
 */
function remoteSession(): {
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
  const g = createGame({ ...createHeadlessPlatform(), input }, { seed: 42, ...MANTA }, DB);
  let frames = 0;
  g.frame(0);
  const frame = (): void => {
    frames++;
    g.frame(frames * STEP);
    g.world.events.clear();
  };
  while (g.world.players[0].state !== 'alive') frame();
  return {
    game: g,
    key(type, keyCode, repeat = false) {
      keys.dispatchEvent(Object.assign(new Event(type), { code: '', keyCode, repeat }));
    },
    frame,
  };
}

describe('integration: the Speed toggle under a Samsung remote (tizen-remote-safe)', () => {
  it('Ch− toggles once per press; repeats and fake gaps never toggle again', () => {
    const s = remoteSession();
    const ship = s.game.world.players[0];
    expect(ship.speedLevel).toBe(1);
    s.key('keydown', KEY.chMinus);
    s.frame();
    expect(ship.speedLevel).toBe(2);
    for (let i = 1; i <= 60; i++) {
      if (i % 5 === 0) s.key('keydown', KEY.chMinus, true); // auto-repeat
      if (i % 7 === 3) s.key('keyup', KEY.chMinus); // a fake release …
      if (i % 7 === 4) s.key('keydown', KEY.chMinus); // … cancelled one frame later
      s.frame();
    }
    expect(ship.speedLevel).toBe(2);
    // Released past the debounce, pressed again: the next speed, wrapping to the slowest.
    s.key('keyup', KEY.chMinus);
    for (let i = 0; i < 4; i++) s.frame();
    s.key('keydown', KEY.chMinus);
    s.frame();
    s.key('keyup', KEY.chMinus);
    expect(ship.speedLevel).toBe(0);
    for (let i = 0; i < 4; i++) s.frame();
    // The MANTA moves at the toggled speed.
    const w = s.game.world;
    expect(w.ship.speeds[ship.speedLevel]).toBe(1.75);
  });

  it('OK changes nothing in Direct mode (no meter to equip)', () => {
    const s = remoteSession();
    const w = s.game.world;
    const loadout = w.weapons.loadouts[0];
    const before = [loadout.shot, loadout.sub, loadout.family, w.players[0].speedLevel];
    for (let k = 0; k < 3; k++) {
      s.key('keydown', KEY.ok);
      for (let i = 0; i < 20; i++) s.frame();
      s.key('keyup', KEY.ok);
      for (let i = 0; i < 4; i++) s.frame();
    }
    expect([loadout.shot, loadout.sub, loadout.family, w.players[0].speedLevel]).toEqual(before);
    expect(w.powerups.meters[0].cursor).toBe(-1);
  });
});

describe('integration: the direct range recorded and replayed (M2-05)', () => {
  it('a MANTA run with Speed presses and colour items plays back without a desync', () => {
    const config = resolveGameConfig({ seed: 19, stage: 'direct-range', ...MANTA });
    const header = createReplayHeader(config, { buildId: 'test', assisted: false });
    const platform = createHeadlessPlatform();
    const recorder = createReplayRecorder(platform.input, header);
    const g = createReplayGame({ ...platform, input: recorder }, header, DB);
    for (let t = 0; t < 2400 && g.world.status === 'playing'; t++) {
      commitPlayerInput(platform.snapshot.players[0], weave(t));
      g.step();
      g.world.events.clear();
      recorder.check(g.world);
    }
    const replay = recorder.finish(g.world);
    expect(g.world.powerups.planCursor).toBeGreaterThan(0);
    expect(replay.header.config).toMatchObject(MANTA);
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
    expect(hashWorld(again.world)).toBe(hashWorld(g.world));
    const [a, b] = [again.world.weapons.loadouts[0], g.world.weapons.loadouts[0]];
    expect([a.shot, a.sub, a.family]).toEqual([b.shot, b.sub, b.family]);
    expect(again.world.powerups.planCursor).toBe(g.world.powerups.planCursor);
  });
});
