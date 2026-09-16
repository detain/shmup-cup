/**
 * The `remote-strict` input model of plan M3-02b: what the Samsung Smart Remote can really deliver
 * (`docs/dev/input-probe-results.md` findings 1–4), the checker that reads a recorded run back
 * against it, and the four-way bot flying under it.
 */
import { Action } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { fourWayBot } from './four-way-bot.js';
import { runStage } from './harness.js';
import {
  REMOTE_EDGE_TICKS,
  REMOTE_PRE_TAP_TICKS,
  REMOTE_TAP_MAX_TICKS,
  REMOTE_TAP_MIN_TICKS,
  REMOTE_TAP_TICKS,
  createRemoteStrictCheck,
  createRemoteStrictModel,
} from './remote-strict.js';

/**
 * Feeds a list of wished masks through a fresh model.
 *
 * @param wants - One wish per tick.
 * @returns What the remote would deliver, per tick.
 */
function through(wants: readonly number[]): number[] {
  const model = createRemoteStrictModel();
  return wants.map((want) => model.filter(want));
}

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

describe('remote-strict model', () => {
  it('holds one direction as long as the bot wants it', () => {
    expect(through([Action.Right, Action.Right, Action.Right])).toEqual([
      Action.Right,
      Action.Right,
      Action.Right,
    ]);
  });

  it('costs one empty tick to change direction (the held arrow must come up first)', () => {
    expect(through([Action.Right, Action.Up, Action.Up, Action.Up])).toEqual([
      Action.Right,
      0,
      Action.Up,
      Action.Up,
    ]);
  });

  it('turns a button wish into two empty ticks and a tap with no direction', () => {
    const wants: number[] = [Action.Right, Action.Right | Action.PowerUp];
    // Only the one tick wishes for the button; the model owns the timing from there.
    for (let i = 0; i < 16; i++) wants.push(Action.Right);
    const out = through(wants);
    expect(out[0]).toBe(Action.Right);
    for (let i = 1; i <= REMOTE_PRE_TAP_TICKS; i++) expect(out[i]).toBe(0);
    for (let i = 0; i < REMOTE_TAP_TICKS; i++) {
      expect(out[1 + REMOTE_PRE_TAP_TICKS + i]).toBe(Action.PowerUp);
    }
    expect(out[1 + REMOTE_PRE_TAP_TICKS + REMOTE_TAP_TICKS]).toBe(Action.Right);
    // The measured tap band (7–16 ticks) contains the length the model produces.
    expect(REMOTE_TAP_TICKS).toBeGreaterThanOrEqual(REMOTE_TAP_MIN_TICKS);
    expect(REMOTE_TAP_TICKS).toBeLessThanOrEqual(REMOTE_TAP_MAX_TICKS);
  });

  it('delivers Pause for a single tick (Back / Play-Pause arrive on release)', () => {
    const out = through([Action.Pause, Action.Pause, Action.Pause, Action.Pause, Action.Pause]);
    expect(out.slice(0, REMOTE_PRE_TAP_TICKS)).toEqual([0, 0]);
    expect(out[REMOTE_PRE_TAP_TICKS]).toBe(Action.Pause);
    expect(out.filter((mask) => mask === Action.Pause)).toHaveLength(REMOTE_EDGE_TICKS);
  });

  it('never lets a direction and a button share a tick', () => {
    const wants: number[] = [];
    for (let i = 0; i < 40; i++) wants.push(Action.Up | Action.Special);
    for (const mask of through(wants)) {
      expect(mask & Action.Up && mask & Action.Special).toBeFalsy();
    }
  });

  it('reset() forgets the tap and the direction held', () => {
    const model = createRemoteStrictModel();
    expect(model.filter(Action.Right)).toBe(Action.Right);
    model.reset();
    // Without the reset this would be the empty gap tick.
    expect(model.filter(Action.Up)).toBe(Action.Up);
  });

  it('produces a stream the checker accepts', () => {
    const model = createRemoteStrictModel();
    const wants = [Action.Right, Action.Up, Action.PowerUp, Action.Down, Action.Pause];
    const out: number[] = [];
    for (let i = 0; i < 200; i++) out.push(model.filter(wants[i % wants.length]));
    // Let the tap that is still running finish, so `end()` sees its full length.
    for (let i = 0; i < 20; i++) out.push(model.filter(0));
    const checker = check(out);
    expect(checker.violations).toBe(0);
    expect(checker.first).toBeNull();
    expect(checker.firstTick).toBe(-1);
  });
});

describe('remote-strict checker', () => {
  it('rejects two directions at once', () => {
    expect(check([Action.Up | Action.Right]).first).toBe('two-directions');
  });

  it('rejects two buttons at once', () => {
    expect(check([0, 0, Action.PowerUp | Action.Special]).first).toBe('two-buttons');
  });

  it('rejects a direction held while a button is down', () => {
    expect(check([0, 0, Action.Up | Action.PowerUp]).first).toBe('direction-with-button');
  });

  it('rejects a button pressed straight out of a direction', () => {
    const masks = [Action.Right, Action.Right];
    for (let i = 0; i < REMOTE_TAP_TICKS; i++) masks.push(Action.PowerUp);
    expect(check(masks).first).toBe('button-without-pause');
  });

  it('rejects a tap shorter than the measured band', () => {
    const masks = [0, 0];
    for (let i = 0; i < REMOTE_TAP_MIN_TICKS - 1; i++) masks.push(Action.PowerUp);
    masks.push(0);
    expect(check(masks).first).toBe('tap-too-short');
  });

  it('rejects a tap longer than the measured band', () => {
    const masks = [0, 0];
    for (let i = 0; i < REMOTE_TAP_MAX_TICKS + 1; i++) masks.push(Action.Special);
    masks.push(0);
    expect(check(masks).first).toBe('tap-too-long');
  });

  it('rejects a direction change with no empty tick between', () => {
    expect(check([Action.Left, Action.Right]).first).toBe('direction-without-gap');
    expect(check([Action.Left, 0, Action.Right]).violations).toBe(0);
  });

  it('checks a tap still running when the stream ends', () => {
    const masks = [0, 0, Action.PowerUp, Action.PowerUp];
    expect(check(masks).first).toBe('tap-too-short');
  });
});

describe('the four-way bot under the remote model', () => {
  it('flies zone A to the stage clear without a single impossible tick', () => {
    const run = runStage('zone-a', fourWayBot(), { godMode: true });
    expect(run.bot).toBe('four-way (remote)');
    expect(run.status).toBe('stageClear');
    expect(run.remoteViolations, run.remoteViolation).toBe(0);
    expect(run.diagonalTicks).toBe(0);
    expect(run.remoteViolations, run.remoteViolation).toBe(0);
    // It still equips: the tap costs movement, not the power-up itself.
    expect(run.equips.reduce((sum, count) => sum + count, 0)).toBeGreaterThan(0);
  });
});
