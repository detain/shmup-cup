/**
 * The `hb-` input watch page body (plan v20x PAGES S3, `src/bench/inputpage.ts`) in Node: the
 * watch driven by a manual frame pump — deliveries latched on the next scheduled frame (the
 * game's poll edge), auto-repeat episodes split by key-ups and silence gaps, the rate measured
 * from the longest episode — plus the wire gate on every record it builds.
 */
import { describe, expect, it } from 'vitest';
import {
  BENCH_INPUT_KEYS,
  INPUT_EPISODE_GAP_MS,
  INPUT_MAX_WATCH_S,
  INPUT_MIN_WATCH_S,
  INPUT_PAGE_ID,
  INPUT_WATCH_S,
  inputWatchSecondsFromSearch,
  measureInputWatch,
  type InputHost,
  type InputWatchKey,
} from '../../src/bench/index.js';
import { harbWireIssues } from './fake-harb-env.js';

/** The pumped host: the test owns the clock and the frame edge. */
interface Pump {
  readonly host: InputHost;
  /** Advances the clock and runs the pending frame callback (if one is armed). */
  tick(ms: number): void;
  /** Delivers a key-down. */
  down(code: number): void;
  /** Delivers a key-up. */
  up(code: number): void;
}

/**
 * Builds the pump.
 *
 * @param options - Gamepad presence.
 * @returns The pump.
 */
function scriptedInput(options?: { readonly gamepad?: boolean }): Pump {
  let t = 0;
  let frame: (() => void) | null = null;
  let downs: ((code: number) => void) | null = null;
  let ups: ((code: number) => void) | null = null;
  const host: InputHost = {
    time: () => t,
    onKeydown: (cb) => {
      downs = cb;
      return () => {
        downs = null;
      };
    },
    onKeyup: (cb) => {
      ups = cb;
      return () => {
        ups = null;
      };
    },
    gamepadPresent: () => options?.gamepad ?? false,
    schedule: (cb) => {
      frame = cb;
    },
    show: () => {},
  };
  return {
    host,
    tick: (ms) => {
      t += ms;
      const run = frame;
      frame = null;
      if (run !== null) run();
    },
    down: (code) => {
      if (downs !== null) downs(code);
    },
    up: (code) => {
      if (ups !== null) ups(code);
    },
  };
}

const TWO_KEYS: readonly InputWatchKey[] = [
  { id: 'A', code: 1 },
  { id: 'B', code: 2 },
];

describe('hb- input watch page (plan v20x PAGES S3)', () => {
  it('latches deliveries on the next frame and validates the row', async () => {
    const pump = scriptedInput();
    const promise = measureInputWatch(pump.host, {
      watchSeconds: 10,
      keys: TWO_KEYS,
      wallClock: () => 1_760_000_000_000,
    });
    pump.tick(10); // the arming frame: nothing pending yet
    pump.down(1); // A lands at t=10
    pump.tick(10); // 20 — A's lag is 10
    pump.down(1); // repeat at 20 (same episode)
    pump.down(2); // B at 20
    pump.tick(5); // 25 — lags A:10, A:5, B:5
    pump.tick(2_000); // 2025 — every key delivered and quiet: the settled watch ends
    const row = await promise;
    expect(row.record).toBe('input');
    expect(row.scenario).toBe(INPUT_PAGE_ID);
    expect(row.gamepadPresent).toBe(false);
    expect(row.keys).toHaveLength(2);
    expect(row.keys[0].id).toBe('A');
    expect(row.keys[0].keyCode).toBe(1);
    expect(row.keys[0].delivered).toBe(true);
    expect(row.keys[0].presses).toBe(1);
    expect(row.keys[0].appliedMs).not.toBeNull();
    expect(row.keys[0].repeatsPerSecond).toBeNull(); // episode too short to count a rate
    expect(row.keys[1].delivered).toBe(true);
    expect(row.error).toBeNull(); // every watched key delivered — the watch ends early
    expect(harbWireIssues(row)).toEqual([]);
  });

  it('splits episodes by key-up and measures the auto-repeat Hz', async () => {
    const pump = scriptedInput({ gamepad: true });
    const promise = measureInputWatch(pump.host, {
      watchSeconds: 30,
      keys: [{ id: 'A', code: 1 }],
      wallClock: () => 1_760_000_000_000,
    });
    for (let i = 0; i < 11; i++) {
      pump.tick(100);
      pump.down(1); // deliveries at 100, 200, … 1100 (11 over 1000 ms)
    }
    pump.up(1); // 1100 — episode 1 holds 11 deliveries over 1000 ms
    pump.tick(1_000); // 2100 — quiet 1000 ms, under the settle: the watch continues
    pump.down(1); // episode 2 (after an explicit key-up)
    pump.tick(2_000); // 4100 — applied and settled: the watch ends
    const row = await promise;
    const key = row.keys[0];
    expect(key.presses).toBe(2);
    expect(key.repeatsPerSecond).not.toBeNull();
    expect(key.repeatsPerSecond).toBeCloseTo(10, 0); // (11 - 1) presses per 1000 ms
    expect(row.gamepadPresent).toBe(true);
    expect(harbWireIssues(row)).toEqual([]);
  });

  it('reports the never-delivered keys honestly when the watch runs out', async () => {
    const pump = scriptedInput();
    const promise = measureInputWatch(pump.host, {
      watchSeconds: 2,
      keys: TWO_KEYS,
      wallClock: () => 1_760_000_000_000,
    });
    pump.tick(10);
    pump.down(1);
    pump.tick(2_000); // elapsed 2010 >= 2000 — the watch ends
    const row = await promise;
    expect(row.keys[0].delivered).toBe(true);
    expect(row.keys[1].delivered).toBe(false);
    expect(row.keys[1].keyCode).toBe(0);
    expect(row.keys[1].presses).toBe(0);
    expect(row.keys[1].appliedMs).toBeNull();
    expect(row.error).toBeNull(); // A arrived: the row is a real (partial) delivery answer
    expect(harbWireIssues(row)).toEqual([]);
  });

  it('notes the empty watch', async () => {
    const pump = scriptedInput();
    const promise = measureInputWatch(pump.host, {
      watchSeconds: 1,
      keys: [{ id: 'A', code: 1 }],
      wallClock: () => 1_760_000_000_000,
    });
    pump.tick(1_100);
    const row = await promise;
    expect(row.error).toContain('no key was delivered');
    expect(row.keys[0].delivered).toBe(false);
    expect(harbWireIssues(row)).toEqual([]);
  });
});

describe('hb- input watch page knobs', () => {
  it('watches the fourteen-key M7 set on the measured codes', () => {
    expect(BENCH_INPUT_KEYS.length).toBe(14);
    const byId: Record<string, number> = {};
    for (let i = 0; i < BENCH_INPUT_KEYS.length; i++)
      byId[BENCH_INPUT_KEYS[i].id] = BENCH_INPUT_KEYS[i].code;
    // docs/dev/input-probe-results.md §5 (the owner's M7 remote) plus the measured channel rocker.
    expect(byId.ColorF0Red).toBe(403);
    expect(byId.ColorF1Green).toBe(404);
    expect(byId.ColorF2Yellow).toBe(405);
    expect(byId.ColorF3Blue).toBe(406);
    expect(byId.MediaPlayPause).toBe(10252);
    expect(byId.Guide).toBe(458);
    expect(byId.Extra).toBe(10253);
    expect(byId.Exit).toBe(10009);
    expect(byId.ChannelUp).toBe(429);
    expect(byId.ChannelDown).toBe(428);
    expect(byId.ArrowUp).toBe(38);
    expect(byId.ArrowRight).toBe(39);
  });

  it('clamps the watch length and knows the episode gap', () => {
    expect(INPUT_WATCH_S).toBe(300);
    expect(INPUT_EPISODE_GAP_MS).toBe(700);
    expect(inputWatchSecondsFromSearch('')).toBe(INPUT_WATCH_S);
    expect(inputWatchSecondsFromSearch('?secs=30')).toBe(30);
    expect(inputWatchSecondsFromSearch('?secs=1')).toBe(INPUT_MIN_WATCH_S);
    expect(inputWatchSecondsFromSearch('?secs=999999')).toBe(INPUT_MAX_WATCH_S);
  });
});
