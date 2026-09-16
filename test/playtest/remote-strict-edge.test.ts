/**
 * Edge cases of the `remote-strict` model and its checker (plan M3-02b), next to
 * `remote-strict.test.ts`: the tap-length band's exact ends, the release-only action's one tick,
 * how a violation is counted and reported, what the model does with a wish it cannot honour, and
 * the invariant that ties the two together — **anything the model emits, the checker accepts**,
 * over a long deterministic stream of arbitrary wishes.
 */
import { Action } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { fourWayBot } from './four-way-bot.js';
import { runStage } from './harness.js';
import {
  REMOTE_BUTTONS,
  REMOTE_DIRECTIONS,
  REMOTE_EDGE_ACTIONS,
  REMOTE_EDGE_TICKS,
  REMOTE_GAP_TICKS,
  REMOTE_PRE_TAP_TICKS,
  REMOTE_TAP_MAX_TICKS,
  REMOTE_TAP_MIN_TICKS,
  REMOTE_TAP_TICKS,
  createRemoteStrictCheck,
  createRemoteStrictModel,
  type RemoteStrictViolation,
} from './remote-strict.js';

/**
 * Runs a mask stream through a fresh checker.
 *
 * @param masks - One mask per tick.
 * @returns The checker after `end()`.
 */
function check(masks: readonly number[]): ReturnType<typeof createRemoteStrictCheck> {
  const checker = createRemoteStrictCheck();
  for (const mask of masks) checker.push(mask);
  checker.end();
  return checker;
}

/**
 * A tap of `length` ticks, with the two empty ticks the thumb needs in front of it.
 *
 * @param button - The button.
 * @param length - Ticks the button is down.
 * @returns The masks.
 */
function tap(button: number, length: number): number[] {
  const masks: number[] = new Array(REMOTE_PRE_TAP_TICKS).fill(0) as number[];
  for (let i = 0; i < length; i++) masks.push(button);
  masks.push(0);
  return masks;
}

/**
 * A deterministic 32-bit pseudo-random generator (no `Math.random`: the suite stays reproducible).
 *
 * @param seed - The seed.
 * @returns A function giving the next integer below its argument.
 */
function rng(seed: number): (limit: number) => number {
  let state = seed >>> 0;
  return (limit: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % limit;
  };
}

describe('remote-strict: the measured constants', () => {
  it('splits the actions into directions, buttons and release-only, with no overlap', () => {
    expect(REMOTE_DIRECTIONS).toBe(Action.Up | Action.Down | Action.Left | Action.Right);
    expect(REMOTE_DIRECTIONS & REMOTE_BUTTONS).toBe(0);
    expect(REMOTE_DIRECTIONS & REMOTE_EDGE_ACTIONS).toBe(0);
    expect(REMOTE_BUTTONS & REMOTE_EDGE_ACTIONS).toBe(0);
  });

  it('keeps the model’s tap inside the measured 7–16-tick band', () => {
    expect(REMOTE_TAP_MIN_TICKS).toBe(7); // 120 ms
    expect(REMOTE_TAP_MAX_TICKS).toBe(16); // 260 ms
    expect(REMOTE_TAP_TICKS).toBeGreaterThanOrEqual(REMOTE_TAP_MIN_TICKS);
    expect(REMOTE_TAP_TICKS).toBeLessThanOrEqual(REMOTE_TAP_MAX_TICKS);
    expect(REMOTE_EDGE_TICKS).toBe(1);
    expect(REMOTE_PRE_TAP_TICKS).toBeGreaterThanOrEqual(1);
    expect(REMOTE_GAP_TICKS).toBeGreaterThanOrEqual(1);
  });
});

describe('remote-strict checker: the exact ends of the tap band', () => {
  it.each([
    ['the shortest allowed tap', REMOTE_TAP_MIN_TICKS, null],
    ['one tick shorter', REMOTE_TAP_MIN_TICKS - 1, 'tap-too-short'],
    ['the longest allowed tap', REMOTE_TAP_MAX_TICKS, null],
    ['one tick longer', REMOTE_TAP_MAX_TICKS + 1, 'tap-too-long'],
  ] as const)('%s', (_label, length, expected) => {
    expect(check(tap(Action.PowerUp, length)).first).toBe(expected);
  });

  it('holds a release-only action to exactly one tick', () => {
    expect(check(tap(Action.Pause, REMOTE_EDGE_TICKS)).violations).toBe(0);
    expect(check(tap(Action.Pause, REMOTE_EDGE_TICKS + 1)).first).toBe('tap-too-long');
  });

  it('needs the full pause before a button, not one tick less', () => {
    const late: number[] = [Action.Right];
    for (let i = 0; i < REMOTE_PRE_TAP_TICKS - 1; i++) late.push(0);
    for (let i = 0; i < REMOTE_TAP_TICKS; i++) late.push(Action.PowerUp);
    expect(check(late).first).toBe('button-without-pause');
    // The same tap with one more empty tick in front of it is fine.
    expect(check([Action.Right, ...tap(Action.PowerUp, REMOTE_TAP_TICKS)]).violations).toBe(0);
  });

  it('starts a run cleanly: a tap in the first ticks needs no history', () => {
    expect(check(tap(Action.Special, REMOTE_TAP_TICKS)).violations).toBe(0);
  });
});

describe('remote-strict checker: counting and reporting', () => {
  it('counts every violation but keeps only the first, with its tick', () => {
    const masks = [
      Action.Up | Action.Right, // tick 0: two directions
      0,
      Action.PowerUp | Action.Special, // tick 2: two buttons (and a fresh press with a pause)
    ];
    const checker = check(masks);
    expect(checker.violations).toBeGreaterThanOrEqual(2);
    expect(checker.first).toBe('two-directions');
    expect(checker.firstTick).toBe(0);
  });

  it('numbers the ticks from zero, in feed order', () => {
    const masks = [0, 0, 0, Action.Left, Action.Right];
    const checker = check(masks);
    expect(checker.first).toBe('direction-without-gap');
    expect(checker.firstTick).toBe(4);
  });

  it('reports nothing at all for an empty stream', () => {
    const checker = check([]);
    expect([checker.violations, checker.first, checker.firstTick]).toEqual([0, null, -1]);
  });

  it('accepts a direction held for a long time and the same direction after a gap', () => {
    const masks: number[] = new Array(300).fill(Action.Left) as number[];
    masks.push(0);
    for (let i = 0; i < 50; i++) masks.push(Action.Left);
    expect(check(masks).violations).toBe(0);
  });

  it('names every violation kind it can produce', () => {
    const seen = new Set<RemoteStrictViolation>();
    seen.add(check([Action.Up | Action.Down]).first!);
    seen.add(check([0, 0, Action.PowerUp | Action.Speed]).first!);
    seen.add(check([0, 0, Action.Up | Action.Speed]).first!);
    seen.add(check([Action.Up, Action.Up, Action.PowerUp]).first!);
    seen.add(check(tap(Action.PowerUp, 1)).first!);
    seen.add(check(tap(Action.PowerUp, REMOTE_TAP_MAX_TICKS + 5)).first!);
    seen.add(check([Action.Up, Action.Down]).first!);
    expect([...seen].sort()).toEqual([
      'button-without-pause',
      'direction-with-button',
      'direction-without-gap',
      'tap-too-long',
      'tap-too-short',
      'two-buttons',
      'two-directions',
    ]);
  });
});

describe('remote-strict model: wishes it cannot honour', () => {
  it('ignores every wish while a tap is running, including another button', () => {
    const model = createRemoteStrictModel();
    const out: number[] = [];
    // One PowerUp wish, then the bot changes its mind every tick — the hardware does not care.
    out.push(model.filter(Action.PowerUp));
    for (let i = 0; i < REMOTE_PRE_TAP_TICKS + REMOTE_TAP_TICKS - 1; i++) {
      out.push(model.filter(Action.Special | Action.Down));
    }
    expect(out.filter((mask) => mask === Action.PowerUp)).toHaveLength(REMOTE_TAP_TICKS);
    expect(out.filter((mask) => (mask & (Action.Special | Action.Down)) !== 0)).toEqual([]);
    expect(out.slice(0, REMOTE_PRE_TAP_TICKS)).toEqual([0, 0]);
    // Only once the tap is over does the next wish start its own.
    const after: number[] = [];
    for (let i = 0; i < REMOTE_PRE_TAP_TICKS + 1; i++) {
      after.push(model.filter(Action.Special | Action.Down));
    }
    expect(after[REMOTE_PRE_TAP_TICKS]).toBe(Action.Special);
  });

  it('takes the lowest button bit when the bot wishes for several', () => {
    const model = createRemoteStrictModel();
    const wanted = Action.PowerUp | Action.Special | Action.Speed;
    const lowest = wanted & -wanted;
    const out: number[] = [];
    for (let i = 0; i < REMOTE_PRE_TAP_TICKS + 2; i++) out.push(model.filter(wanted));
    expect(out[REMOTE_PRE_TAP_TICKS]).toBe(lowest);
  });

  it('prefers the button over the direction in the same wish', () => {
    const model = createRemoteStrictModel();
    const out: number[] = [];
    for (let i = 0; i < REMOTE_PRE_TAP_TICKS + 2; i++) {
      out.push(model.filter(Action.Left | Action.Pause));
    }
    expect(out.slice(0, REMOTE_PRE_TAP_TICKS)).toEqual([0, 0]);
    expect(out[REMOTE_PRE_TAP_TICKS]).toBe(Action.Pause);
  });

  it('forgets the direction across a tap, so the one after it needs no extra gap', () => {
    const model = createRemoteStrictModel();
    const out: number[] = [model.filter(Action.Right)];
    out.push(model.filter(Action.PowerUp));
    for (let i = 0; i < REMOTE_PRE_TAP_TICKS + REMOTE_TAP_TICKS; i++) out.push(model.filter(0));
    // The arrow was up throughout the tap, so a different direction registers at once.
    out.push(model.filter(Action.Up));
    expect(out[out.length - 1]).toBe(Action.Up);
    expect(check(out).violations).toBe(0);
  });

  it('drops the direction only for the gap tick, then honours it', () => {
    const model = createRemoteStrictModel();
    const out: number[] = [];
    for (const want of [Action.Left, Action.Right, Action.Right, Action.Left, Action.Left]) {
      out.push(model.filter(want));
    }
    expect(out).toEqual([Action.Left, 0, Action.Right, 0, Action.Left]);
    expect(REMOTE_GAP_TICKS).toBe(1);
  });

  it('emits nothing at all for a wish of 0', () => {
    const model = createRemoteStrictModel();
    for (let i = 0; i < 20; i++) expect(model.filter(0)).toBe(0);
  });
});

describe('remote-strict: the model and the checker agree', () => {
  it('produces a stream the checker accepts, whatever the bot wishes for', () => {
    // The invariant that makes the harness's check meaningful: the filter can only ever emit ticks
    // the hardware could produce, so a run recorded through it never fails its own model.
    const next = rng(0x5eed1234);
    const wishes = [
      0,
      Action.Up,
      Action.Down,
      Action.Left,
      Action.Right,
      Action.PowerUp,
      Action.Special,
      Action.Speed,
      Action.Pause,
      Action.Up | Action.Right,
      Action.Left | Action.PowerUp,
      Action.Down | Action.Special | Action.Speed,
      Action.Up | Action.Down | Action.Left | Action.Right,
      Action.Pause | Action.PowerUp | Action.Up,
    ];
    for (let seedRun = 0; seedRun < 8; seedRun++) {
      const model = createRemoteStrictModel();
      const out: number[] = [];
      for (let i = 0; i < 4000; i++) out.push(model.filter(wishes[next(wishes.length)]));
      // Let a tap still running finish, so `end()` measures its whole length.
      for (let i = 0; i < REMOTE_TAP_MAX_TICKS + 4; i++) out.push(model.filter(0));
      const checker = check(out);
      expect(checker.violations, `run ${String(seedRun)}: ${String(checker.first)}`).toBe(0);
      // The stream is not trivially empty: the model really did press buttons and move.
      expect(out.some((mask) => (mask & REMOTE_BUTTONS) !== 0)).toBe(true);
      expect(out.some((mask) => (mask & REMOTE_DIRECTIONS) !== 0)).toBe(true);
      expect(out.some((mask) => (mask & REMOTE_EDGE_ACTIONS) !== 0)).toBe(true);
    }
  });

  it('is deterministic: the same wishes give the same stream', () => {
    const wishes: number[] = [];
    const next = rng(99);
    for (let i = 0; i < 500; i++) wishes.push(next(2) === 0 ? Action.Up : Action.Speed);
    const run = (): number[] => {
      const model = createRemoteStrictModel();
      return wishes.map((want) => model.filter(want));
    };
    expect(run()).toEqual(run());
  });

  it('reset() puts a model mid-tap back to idle', () => {
    const model = createRemoteStrictModel();
    model.filter(Action.PowerUp);
    model.filter(0); // inside the pre-tap pause
    model.reset();
    // Straight back to honouring directions, with no tap left over.
    expect(model.filter(Action.Down)).toBe(Action.Down);
  });
});

describe('the four-way bot and the remote model', () => {
  it('flies without the model when the host asks for the old bot', () => {
    const run = runStage('zone-a', fourWayBot(0, { remote: false }), { godMode: true });
    expect(run.bot).toBe('four-way');
    expect(run.status).toBe('stageClear');
    // Not claiming the model means the harness does not check it.
    expect(run.remoteViolations).toBe(0);
    expect(run.remoteViolation).toBe('');
    expect(run.diagonalTicks).toBe(0);
  });

  it('records a remote-strict run that the checker re-reads without a violation', () => {
    const run = runStage('zone-a', fourWayBot(), { godMode: true });
    expect(run.bot).toBe('four-way (remote)');
    expect(run.remoteViolations, run.remoteViolation).toBe(0);
    expect(run.remoteViolation).toBe('');
  });
});
