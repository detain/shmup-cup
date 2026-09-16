/**
 * Cross-package check of the shipped input profiles (plan M1-05, core + input-web): every
 * key and button a profile of `content/input/` binds, pressed through a real `WebInput` in
 * each binding context, reaches the core's `InputSnapshot` as exactly the actions the file
 * names — the compiled tables, the keyboard source, the gamepad reader, the direction policies
 * and the snapshot agree. A remote session with fake key-up/key-down pairs, recorded tick by
 * tick with `tizen-remote-safe`, replays identically into a headless game and never shows the
 * fake gaps to the simulation.
 */
import {
  Action,
  INPUT_CONTEXTS,
  copyInputSnapshot,
  createGame,
  createHeadlessPlatform,
  createInputSnapshot,
  type ActionName,
  type InputSnapshot,
  type Platform,
} from '@shmup/core';
import {
  INPUT_PROFILES_KIND,
  createWebInput,
  loadInputProfiles,
  type GamepadLike,
  type InputProfile,
} from '@shmup/input-web';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';

const STEP = 1000 / 60;

const files = readContentFiles().filter(
  (file) => (file.data as { kind?: unknown }).kind === INPUT_PROFILES_KIND,
);
const { profiles, issues } = loadInputProfiles(files);

/**
 * ORs action names.
 *
 * @param names - Action names.
 */
const maskOf = (names: readonly ActionName[]): number =>
  names.reduce((bits, name) => bits | Action[name], 0);

/**
 * A key event object for `WebInput.keyboard.handleEvent`.
 *
 * @param type - Event type.
 * @param code - `KeyboardEvent.code`.
 * @param keyCode - Legacy key code.
 */
const keyEvent = (type: 'keydown' | 'keyup', code: string, keyCode: number) => ({
  type,
  code,
  keyCode,
  repeat: false,
  preventDefault() {},
});

/**
 * A standard pad with some buttons pressed.
 *
 * @param pressed - Button indices.
 */
function pad(pressed: readonly number[]): GamepadLike {
  const buttons = Array.from({ length: 32 }, (_, i) => ({ pressed: pressed.includes(i) }));
  return { index: 0, connected: true, mapping: 'standard', buttons, axes: [0, 0] };
}

describe('integration: shipped input profiles reach the core', () => {
  it('the content has input profiles and they validate', () => {
    expect(files.map((file) => file.path)).toEqual(['input/remote.input-profiles.json']);
    expect(issues).toEqual([]);
    expect(profiles.length).toBeGreaterThanOrEqual(5);
  });

  it.each(profiles.filter((p) => p.device !== 'gamepad').map((p) => [p.id, p] as const))(
    '%s: every bound key presses exactly its actions in both contexts',
    (_id, profile: InputProfile) => {
      for (const context of INPUT_CONTEXTS) {
        const bindings = profile.context[context];
        const cases: Array<[string, number, readonly ActionName[]]> = [
          ...Object.entries(bindings.byCode).map(
            ([code, names]) => [code, 0, names] as [string, number, readonly ActionName[]],
          ),
          ...Object.entries(bindings.byKeyCode).map(
            ([keyCode, names]) =>
              ['', Number(keyCode), names] as [string, number, readonly ActionName[]],
          ),
        ];
        expect(cases.length).toBeGreaterThan(0);
        for (const [code, keyCode, names] of cases) {
          const input = createWebInput({ keyTarget: null });
          input.setProfile(profile);
          input.setContext(context);
          input.keyboard.handleEvent(keyEvent('keydown', code, keyCode));
          const player = input.poll().players[0];
          const label = `${profile.id}.${context}.${code || String(keyCode)}`;
          expect(player?.pressed, label).toBe(maskOf(names));
          expect(player?.held, label).toBe(maskOf(names));
          expect(player?.device, label).toBe(profile.device);
          input.keyboard.handleEvent(keyEvent('keyup', code, keyCode));
          for (let i = 0; i <= profile.releaseDebounceTicks; i++) input.poll();
          expect(input.poll().players[0]?.held, `${label} released`).toBe(0);
        }
      }
    },
  );

  it.each(profiles.filter((p) => p.device === 'gamepad').map((p) => [p.id, p] as const))(
    '%s: every bound button presses exactly its actions in both contexts',
    (_id, profile: InputProfile) => {
      for (const context of INPUT_CONTEXTS) {
        for (const [button, names] of Object.entries(profile.context[context].buttons ?? {})) {
          let pads: Array<GamepadLike | null> = [pad([])];
          const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
          input.setProfile(profile);
          input.setContext(context);
          input.poll();
          pads = [pad([Number(button)])];
          const player = input.poll().players[0];
          const label = `${profile.id}.${context}.button${button}`;
          expect(player?.pressed, label).toBe(maskOf(names));
          expect(player?.device, label).toBe('gamepad');
        }
      }
    },
  );
});

describe('integration: a remote session under tizen-remote-safe', () => {
  /** Flattens a snapshot for comparison. */
  const flatten = (snapshot: InputSnapshot) =>
    snapshot.players.map((p) => [p.held, p.pressed, p.released, p.device] as const);

  it('hides fake key-up/key-down pairs from the simulation and replays tick for tick', () => {
    const safe = profiles.find((p) => p.id === 'tizen-remote-safe');
    if (safe === undefined) throw new Error('tizen-remote-safe missing');
    const keys = new EventTarget();
    const input = createWebInput({ keyTarget: keys, keyDevice: 'remote' });
    input.setProfile(safe);
    const recorded: InputSnapshot[] = [];
    const live = createHeadlessPlatform();
    const platform: Platform = {
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
    // Right held from frame 2 to 40 through the remote's flagless auto-repeats (a plain `keydown`
    // of a key that is already down, the first ~21 ticks in and then every ~6.5 — M3-02b finding
    // 2); a tap of OK at frame 44, once the arrow is up (the remote delivers one key at a time).
    const script = new Map<number, () => void>();
    script.set(2, () => press('keydown', 39));
    for (let frame = 23; frame < 40; frame += 7) script.set(frame, () => press('keydown', 39));
    script.set(40, () => press('keyup', 39));
    script.set(44, () => {
      press('keydown', 13);
      press('keyup', 13);
    });
    const game = createGame(platform);
    game.frame(0);
    for (let frame = 1; frame <= 50; frame++) {
      script.get(frame)?.();
      game.frame(frame * STEP);
    }
    expect(recorded).toHaveLength(50);

    const p1 = recorded.map((snapshot) => snapshot.players[0]);
    const rightPresses = p1.filter((p) => ((p?.pressed ?? 0) & Action.Right) !== 0).length;
    const rightReleases = p1.filter((p) => ((p?.released ?? 0) & Action.Right) !== 0).length;
    expect(rightPresses).toBe(1);
    expect(rightReleases).toBe(1);
    expect(p1.filter((p) => ((p?.pressed ?? 0) & Action.PowerUp) !== 0)).toHaveLength(1);
    expect(p1.some((p) => ((p?.pressed ?? 0) & Action.Confirm) !== 0)).toBe(false);

    const replayPlatform = createHeadlessPlatform();
    const replay = createGame(replayPlatform);
    const seen: ReturnType<typeof flatten>[] = [];
    for (const snapshot of recorded) {
      copyInputSnapshot(snapshot, replayPlatform.snapshot);
      replay.step();
      seen.push(flatten(replay.state.input ?? createInputSnapshot()));
    }
    expect(seen).toEqual(recorded.map(flatten));
    expect(replay.state.tick).toBe(game.state.tick);
  });
});
