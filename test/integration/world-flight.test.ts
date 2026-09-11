/**
 * Free flight across the packages (plan M1-06, core + input-web + content + assets): the shipped
 * KESTREL carries the plan's tunables (D3 speeds, 1.5 px hurt radius, 5×3 terrain box, 8×6
 * pickup box, 40-tick fly-in) — the same as the core's built-in `DEFAULT_PLAYER_SHIP` fallback;
 * the atlas has a frame for every bank step the World can show; a Samsung-remote session under
 * the default `tizen-remote-safe` profile flies the ship (fly-in ignores input, 1.5 px/tick
 * afterwards, fake key-up/key-down pairs never stall it, the 2-tick release debounce, the clamp
 * at the left margin); and the recorded session replays into a fresh game with an equal
 * `hashWorld`.
 */
import {
  Action,
  DEFAULT_PLAYER_SHIP,
  ENTER_END_X,
  copyInputSnapshot,
  createGame,
  createHeadlessPlatform,
  createInputSnapshot,
  hashWorld,
  loadContent,
  playerBankFrame,
  type ContentDb,
  type InputSnapshot,
  type Platform,
} from '@shmup/core';
import { INPUT_PROFILES_KIND, createWebInput, loadInputProfiles } from '@shmup/input-web';
import { describe, expect, it } from 'vitest';
import { buildAtlas } from '../../scripts/assets/pipeline.mjs';
import { readContentFiles } from '../../vite.shared.js';

const STEP = 1000 / 60;

/** Remote key codes (Tizen / DOM legacy `keyCode`). */
const KEY = { left: 37, right: 39 } as const;

/**
 * The shipped content DB (core kinds).
 *
 * @returns The DB.
 */
function shippedContent(): ContentDb {
  const { db, issues } = loadContent(readContentFiles());
  expect(issues).toEqual([]);
  return db;
}

describe('integration: the shipped KESTREL', () => {
  it('has the plan tunables, identical to the built-in fallback ship', () => {
    const db = shippedContent();
    const index = db.shipIndex.get('kestrel');
    expect(index).toBeDefined();
    const kestrel = db.ships[index ?? -1];
    expect(kestrel.name).toBe('KESTREL');
    expect(db.sprites.names[kestrel.spriteId]).toBe('ships/kestrel');
    for (const key of [
      'speeds',
      'hurtRadius',
      'terrainBox',
      'pickupBox',
      'margins',
      'enterTicks',
      'respawnInvulnTicks',
      'bankFrames',
    ] as const) {
      expect(kestrel[key], key).toEqual(DEFAULT_PLAYER_SHIP[key]);
    }
    expect(kestrel.speeds).toEqual([1.5, 2, 2.5, 3, 3.5, 4]); // decision D3
  });

  it('has an atlas frame for every bank step the World can draw', () => {
    const db = shippedContent();
    const kestrel = db.ships[db.shipIndex.get('kestrel') ?? -1];
    const { manifest } = buildAtlas();
    const frames = manifest.sprites['ships/kestrel']?.frames ?? [];
    const highest = Math.max(
      playerBankFrame(-kestrel.bankFrames, kestrel.bankFrames),
      playerBankFrame(kestrel.bankFrames, kestrel.bankFrames),
    );
    expect(frames.length).toBeGreaterThan(highest);
  });
});

describe('integration: a remote flies the KESTREL (tizen-remote-safe)', () => {
  const { profiles, issues } = loadInputProfiles(
    readContentFiles().filter(
      (file) => (file.data as { kind?: unknown }).kind === INPUT_PROFILES_KIND,
    ),
  );

  it('moves 1.5 px/tick after the fly-in, rides out fake gaps, stops 2 ticks after release', () => {
    expect(issues).toEqual([]);
    const safe = profiles.find((p) => p.id === 'tizen-remote-safe');
    if (safe === undefined) throw new Error('tizen-remote-safe missing');
    expect(safe.releaseDebounceTicks).toBe(2);
    const keys = new EventTarget();
    const input = createWebInput({ keyTarget: keys, keyDevice: 'remote' });
    input.setProfile(safe);
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
    const press = (type: 'keydown' | 'keyup', keyCode: number): void => {
      keys.dispatchEvent(Object.assign(new Event(type), { code: '', keyCode, repeat: false }));
    };
    const db = shippedContent();
    const game = createGame(platform, { seed: 42 }, db);
    const ship = game.world.players[0];
    const xs: number[] = [];
    game.frame(0);
    let frame = 0;
    /**
     * Runs one displayed frame (one tick at 60 Hz) and records the ship's x.
     *
     * @param before - Key events to send before the frame.
     */
    const tick = (before?: () => void): void => {
      before?.();
      frame++;
      game.frame(frame * STEP);
      xs.push(ship.x);
    };

    // Right held during the fly-in: ignored.
    tick(() => press('keydown', KEY.right));
    for (let i = 1; i < 40; i++) tick();
    expect(ship.state).toBe('alive');
    expect(ship.x).toBe(ENTER_END_X);
    expect(ship.device).toBe('remote');

    // Held: 1.5 px per tick, with a fake key-up/key-down pair (one frame apart) every 6 frames.
    const start = ship.x;
    for (let i = 1; i <= 30; i++) {
      if (i % 6 === 3) tick(() => press('keyup', KEY.right));
      else if (i % 6 === 4) tick(() => press('keydown', KEY.right));
      else tick();
    }
    expect(ship.x).toBe(start + 30 * 1.5); // never stalled

    // Released: the debounce keeps it held for two more ticks, then the ship stops (no inertia).
    const released = ship.x;
    tick(() => press('keyup', KEY.right));
    tick();
    tick();
    const stopped = ship.x;
    tick();
    tick();
    expect(stopped).toBe(released + 2 * 1.5);
    expect(ship.x).toBe(stopped);

    // Hold Left long enough to reach the clamp at the left margin.
    press('keydown', KEY.left);
    for (let i = 0; i < 200; i++) tick();
    expect(ship.x).toBe(game.world.camera.x + db.ships[0].margins.left);

    // The recorded session replays into a fresh game: same world, same hash.
    const replayPlatform = createHeadlessPlatform();
    const replay = createGame(replayPlatform, { seed: 42 }, db);
    for (const snapshot of recorded) {
      copyInputSnapshot(snapshot, replayPlatform.snapshot);
      replay.step();
    }
    expect(replay.world.tick).toBe(game.world.tick);
    expect(hashWorld(replay.world)).toBe(hashWorld(game.world));
    expect(replay.world.players[0].x).toBe(ship.x);
    // The path after the fly-in: never back-tracking while Right was held, then only leftwards
    // until the clamp.
    const peak = xs.indexOf(Math.max(...xs));
    for (let i = 40; i < peak; i++) expect(xs[i + 1]).toBeGreaterThanOrEqual(xs[i]);
    for (let i = peak; i < xs.length - 1; i++) expect(xs[i + 1]).toBeLessThanOrEqual(xs[i]);
    expect(recorded.every((s) => (s.players[0].held & Action.Up) === 0)).toBe(true);
  });
});
