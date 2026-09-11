/**
 * Cross-package determinism check (core + input-web): a session driven by real browser
 * input (remote keys and a gamepad for player 2) is recorded tick by tick with
 * copyInputSnapshot and replayed into a headless platform. The replay must see exactly
 * the same per-tick input — the contract replays and attract mode will build on
 * (shmup_feat.md §22).
 */
import {
  createGame,
  createHeadlessPlatform,
  createInputSnapshot,
  copyInputSnapshot,
  type InputSnapshot,
  type Platform,
} from '@shmup/core';
import { createWebInput, type GamepadLike } from '@shmup/input-web';
import { describe, expect, it } from 'vitest';

const STEP = 1000 / 60;

/**
 * A standard-mapping pad with the given buttons pressed.
 *
 * @param index - Slot.
 * @param pressed - Pressed button indices.
 */
function pad(index: number, pressed: number[]): GamepadLike {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) }));
  return { index, connected: true, mapping: 'standard', buttons, axes: [0, 0, 0, 0] };
}

/** Flattens a snapshot for comparison. */
const flatten = (snapshot: InputSnapshot) =>
  snapshot.players.map((p) => [p.held, p.pressed, p.released, p.device] as const);

describe('integration: record and replay input', () => {
  it('replays a recorded web-input session tick for tick', () => {
    const keys = new EventTarget();
    let pads: Array<GamepadLike | null> = [null, null];
    const input = createWebInput({ keyTarget: keys, keyDevice: 'remote', getGamepads: () => pads });
    const recorded: InputSnapshot[] = [];
    const live = createHeadlessPlatform();
    const livePlatform: Platform = {
      ...live,
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

    // A scripted session: frame index → action.
    const script = new Map<number, () => void>([
      [2, () => press('keydown', 39)],
      [5, () => (pads = [null, pad(1, [0])])],
      [6, () => press('keyup', 39)],
      [
        7,
        () => {
          press('keydown', 13);
          press('keyup', 13);
        },
      ],
      [9, () => (pads = [null, null])],
      [11, () => press('keydown', 10009)],
      [12, () => press('keyup', 10009)],
    ]);
    const game = createGame(livePlatform);
    game.frame(0);
    for (let frame = 1; frame <= 15; frame++) {
      script.get(frame)?.();
      game.frame(frame * STEP);
    }
    expect(recorded).toHaveLength(15);

    // Replay: feed the recording into a headless game one tick at a time.
    const replayPlatform = createHeadlessPlatform();
    const replay = createGame(replayPlatform);
    const seen: ReturnType<typeof flatten>[] = [];
    for (const snapshot of recorded) {
      copyInputSnapshot(snapshot, replayPlatform.snapshot);
      replay.step();
      seen.push(flatten(replay.state.input ?? createInputSnapshot()));
    }
    expect(replay.state.tick).toBe(game.state.tick);
    expect(seen).toEqual(recorded.map(flatten));

    // Sanity: the session really contained remote and gamepad input on both players.
    const devices = new Set(recorded.flatMap((s) => s.players.map((p) => p.device)));
    expect(devices).toContain('remote');
    expect(devices).toContain('gamepad');
  });
});
