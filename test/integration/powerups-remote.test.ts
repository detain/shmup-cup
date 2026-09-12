/**
 * The power meter under a Samsung remote (plan M1-11, shmup_feat.md §4 rule 4: OK = equip, a rare
 * non-urgent press), across the packages: real `keydown` / `keyup` events go through
 * `@shmup/input-web` with the shipped `tizen-remote-safe` profile (game context: OK 13 =
 * PowerUp, 2-tick release debounce) into a game built from the shipped content.
 *
 * - One OK press equips the highlighted slot once; holding OK — auto-repeat `keydown`s and the
 *   fake `keyup` / `keydown` pairs some remotes send while a key is held — never equips again;
 *   releasing and pressing again does.
 * - OK pressed while an arrow is held equips and the ship keeps moving (input probe question 2:
 *   the core must not drop the arrow).
 * - A press on an empty slot is denied (`SFX PowerUpDenied`) and changes nothing.
 * - The recorded session replays into a fresh game with the same meter, loadout and `hashWorld`.
 */
import {
  Action,
  ENGINE_SPRITES,
  KNOWN_SCRIPT_IDS,
  MainWeapon,
  MeterSlot,
  SFX_CUES,
  SimEventKind,
  copyInputSnapshot,
  createGame,
  createHeadlessPlatform,
  createInputSnapshot,
  hashWorld,
  loadContent,
  type ContentDb,
  type Game,
  type InputSnapshot,
  type Platform,
} from '@shmup/core';
import { INPUT_PROFILES_KIND, createWebInput, loadInputProfiles } from '@shmup/input-web';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';

/** One displayed frame at 60 Hz (one tick). */
const STEP = 1000 / 60;

/** Remote key codes (Tizen / DOM legacy `keyCode`). */
const KEY = { ok: 13, up: 38, right: 39 } as const;

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

/** A remote-driven game and its helpers. */
interface RemoteSession {
  /** The game. */
  readonly game: Game;
  /** Every polled snapshot, copied (for the replay). */
  readonly recorded: InputSnapshot[];
  /**
   * Sends a key event.
   *
   * @param type - `keydown` or `keyup`.
   * @param keyCode - Remote key code.
   * @param repeat - Auto-repeat flag.
   */
  key(type: 'keydown' | 'keyup', keyCode: number, repeat?: boolean): void;
  /**
   * Runs one displayed frame (one tick) and returns the PowerUp / denied events of it.
   *
   * @returns Counts of the tick's equips and denials.
   */
  frame(): { equips: number; denied: number };
}

/**
 * A free-flight game fed by a remote under `tizen-remote-safe`, after the 40-tick fly-in.
 *
 * @returns The session.
 */
function remoteSession(): RemoteSession {
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
  expect(input.context).toBe('game');
  const recorded: InputSnapshot[] = [];
  const platform: Platform = {
    ...createHeadlessPlatform(),
    input: {
      poll: () => {
        const snapshot = input.poll();
        const copy = createInputSnapshot();
        copyInputSnapshot(snapshot, copy);
        recorded.push(copy);
        return snapshot;
      },
    },
  };
  const game = createGame(platform, { seed: 42 }, DB);
  let frames = 0;
  game.frame(0);
  const session: RemoteSession = {
    game,
    recorded,
    key(type, keyCode, repeat = false) {
      keys.dispatchEvent(Object.assign(new Event(type), { code: '', keyCode, repeat }));
    },
    frame() {
      frames++;
      game.frame(frames * STEP);
      let equips = 0;
      let denied = 0;
      game.world.events.drain((e) => {
        if (e.kind === SimEventKind.PowerUp) equips++;
        if (e.kind === SimEventKind.Sfx && e.id === SFX_CUES.PowerUpDenied) denied++;
      });
      return { equips, denied };
    },
  };
  while (game.world.players[0].state !== 'alive') session.frame();
  return session;
}

describe('integration: the power meter under a Samsung remote (tizen-remote-safe)', () => {
  it('equips once per OK press; holding OK (repeats, fake gaps) never re-equips', () => {
    const s = remoteSession();
    const w = s.game.world;
    const meter = w.powerups.meters[0];
    const ship = w.players[0];
    meter.cursor = MeterSlot.Speed;
    s.key('keydown', KEY.ok);
    let totals = s.frame();
    expect(totals.equips).toBe(1);
    expect([ship.speedLevel, meter.cursor]).toEqual([1, -1]);
    // Keep holding for 60 frames while the cursor sits on Speed again.
    meter.cursor = MeterSlot.Speed;
    for (let i = 1; i <= 60; i++) {
      if (i % 5 === 0) s.key('keydown', KEY.ok, true); // auto-repeat
      if (i % 7 === 3) s.key('keyup', KEY.ok); // a fake release …
      if (i % 7 === 4) s.key('keydown', KEY.ok); // … cancelled one frame later
      const tick = s.frame();
      totals = { equips: totals.equips + tick.equips, denied: totals.denied + tick.denied };
    }
    expect(totals).toEqual({ equips: 1, denied: 0 });
    expect([ship.speedLevel, meter.cursor]).toEqual([1, MeterSlot.Speed]);
    // Release (past the debounce), press again: equips.
    s.key('keyup', KEY.ok);
    for (let i = 0; i < 4; i++) s.frame();
    s.key('keydown', KEY.ok);
    expect(s.frame().equips).toBe(1);
    s.key('keyup', KEY.ok);
    expect([ship.speedLevel, meter.cursor]).toEqual([2, -1]);
  });

  it('equips with OK while an arrow is held, and the ship keeps moving', () => {
    const s = remoteSession();
    const w = s.game.world;
    const ship = w.players[0];
    s.key('keydown', KEY.up);
    for (let i = 0; i < 5; i++) s.frame();
    w.powerups.meters[0].cursor = MeterSlot.Missile;
    const y0 = ship.y;
    s.key('keydown', KEY.ok);
    expect(s.frame().equips).toBe(1);
    expect(w.intents[0].held & Action.Up).toBe(Action.Up);
    expect(ship.y).toBeLessThan(y0);
    const y1 = ship.y;
    s.key('keyup', KEY.ok);
    for (let i = 0; i < 5; i++) s.frame();
    expect(ship.y).toBeLessThan(y1);
    expect(w.weapons.loadouts[0].missile).toBe(true);
    s.key('keyup', KEY.up);
  });

  it('denies OK on an empty meter and replays the session to the same state', () => {
    const s = remoteSession();
    const w = s.game.world;
    s.key('keydown', KEY.ok);
    expect(s.frame()).toEqual({ equips: 0, denied: 1 });
    s.key('keyup', KEY.ok);
    for (let i = 0; i < 4; i++) s.frame();
    // A short session: capsules land on the ship, OK equips, an arrow wanders.
    const ship = w.players[0];
    const spawnTicks: number[] = [];
    for (let k = 0; k < 3; k++) {
      spawnTicks.push(w.tick);
      w.powerups.spawnItem(0, ship.x, ship.y);
      s.frame();
    }
    expect(w.powerups.meters[0].cursor).toBe(MeterSlot.Double);
    s.key('keydown', KEY.right);
    s.key('keydown', KEY.ok);
    s.frame();
    s.key('keyup', KEY.ok);
    for (let i = 0; i < 20; i++) s.frame();
    s.key('keyup', KEY.right);
    for (let i = 0; i < 5; i++) s.frame();
    expect(w.weapons.loadouts[0].main).toBe(MainWeapon.Double);
    // Replay the recorded input; the capsules the test dropped are dropped at the same ticks.
    const replayPlatform = createHeadlessPlatform();
    const replay = createGame(replayPlatform, { seed: 42 }, DB);
    const rw = replay.world;
    for (const snapshot of s.recorded) {
      if (spawnTicks.includes(rw.tick)) {
        rw.powerups.spawnItem(0, rw.players[0].x, rw.players[0].y);
      }
      copyInputSnapshot(snapshot, replayPlatform.snapshot);
      replay.step();
    }
    expect(rw.tick).toBe(w.tick);
    expect(rw.weapons.loadouts[0].main).toBe(w.weapons.loadouts[0].main);
    expect(rw.powerups.meters[0].cursor).toBe(w.powerups.meters[0].cursor);
    expect(hashWorld(rw)).toBe(hashWorld(w));
  });
});
