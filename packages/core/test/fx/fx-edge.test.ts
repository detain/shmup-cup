/**
 * Edge cases of `core/fx` (plan M1-12) beyond `fx.test.ts`: the idle state, a stronger shake
 * replacing a weaker one, an equal one accepted once the running shake has decayed below it,
 * magnitude flooring and capping, a one-tick shake, a flash replacing a running one (and keeping
 * its kind after it ends), the hit-stop cap, a longer hit-stop requested while frozen extending
 * the freeze, the counter never going negative, and determinism of the World's fx state (hash
 * equality across two runs with the same requests).
 */
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { SimEventKind, createEventQueue, type SimEvent } from '../../src/events/index.js';
import {
  FLASH_KIND_TICKS,
  FlashKind,
  FxState,
  MAX_HIT_STOP_TICKS,
  ShakeMagnitude,
  createFxState,
  requestFlash,
  requestHitStop,
  requestShake,
  shakeAmount,
  tickFx,
  type HitStopHost,
} from '../../src/fx/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { createWorld, stepWorld, type World } from '../../src/world/index.js';

/**
 * A minimal host: tick, hit-stop counter, timers and an event queue.
 *
 * @returns The host.
 */
function host(): HitStopHost & { tick: number } {
  return { tick: 0, hitStop: 0, fx: createFxState(), events: createEventQueue(16) };
}

/**
 * Drains a host's events.
 *
 * @param h - The host.
 * @returns Copies of the events.
 */
function drain(h: HitStopHost): SimEvent[] {
  const out: SimEvent[] = [];
  h.events.drain((e) => out.push({ ...e }));
  return out;
}

/**
 * Runs one host tick of phase 9 at tick `t`.
 *
 * @param h - The host.
 * @param t - The tick.
 * @param frozen - Whether the tick started frozen.
 */
function fxTick(h: HitStopHost & { tick: number }, t: number, frozen = false): void {
  h.tick = t;
  h.fx.frozen = frozen;
  tickFx(h);
}

describe('core/fx idle state', () => {
  it('starts idle: no shake, no flash, never requested, not frozen', () => {
    const fx = createFxState();
    expect(fx).toBeInstanceOf(FxState);
    expect({ ...fx }).toEqual({
      shakeMagnitude: 0,
      shakeTicks: 0,
      shakeDuration: 0,
      shakeTick: -1,
      flashTicks: 0,
      flashKind: 0,
      flashTick: -1,
      frozen: false,
    });
    expect(shakeAmount(fx)).toBe(0);
    expect(createFxState()).not.toBe(fx);
  });

  it('tickFx on an idle state changes nothing (the counter never goes below 0)', () => {
    const h = host();
    for (let t = 0; t < 5; t++) fxTick(h, t, true);
    expect([h.hitStop, h.fx.shakeTicks, h.fx.flashTicks]).toEqual([0, 0, 0]);
    expect(drain(h)).toEqual([]);
  });
});

describe('core/fx shake edges', () => {
  it('a stronger shake replaces a weaker running one', () => {
    const h = host();
    expect(requestShake(h, ShakeMagnitude.Small, 30)).toBe(true);
    h.tick = 1;
    expect(requestShake(h, ShakeMagnitude.Large, 6)).toBe(true);
    expect([h.fx.shakeMagnitude, h.fx.shakeTicks, h.fx.shakeDuration, h.fx.shakeTick]).toEqual([
      ShakeMagnitude.Large,
      6,
      6,
      1,
    ]);
    expect(drain(h).map((e) => [e.kind, e.id, e.param])).toEqual([
      [SimEventKind.Shake, 30, ShakeMagnitude.Small],
      [SimEventKind.Shake, 6, ShakeMagnitude.Large],
    ]);
  });

  it('an equal magnitude is accepted once the running shake has decayed below it', () => {
    const h = host();
    requestShake(h, ShakeMagnitude.Medium, 4); // amplitudes 2, 2, 1, 1, 0
    fxTick(h, 1);
    fxTick(h, 2);
    expect(shakeAmount(h.fx)).toBe(1);
    h.tick = 3;
    expect(requestShake(h, ShakeMagnitude.Medium, 4)).toBe(true);
    expect([h.fx.shakeTicks, shakeAmount(h.fx)]).toEqual([4, 2]);
  });

  it('floors fractional magnitudes and caps them at 64 px', () => {
    const h = host();
    expect(requestShake(h, 0.9, 10)).toBe(false); // floors to 0
    expect(requestShake(h, 2.7, 10)).toBe(true);
    expect(h.fx.shakeMagnitude).toBe(2);
    expect(requestShake(h, 1e6, 10)).toBe(true);
    expect(h.fx.shakeMagnitude).toBe(64);
    expect(shakeAmount(h.fx)).toBe(64);
  });

  it('a one-tick shake requested during tick t is over at the end of tick t + 1', () => {
    const h = host();
    h.tick = 7;
    requestShake(h, ShakeMagnitude.Small, 1);
    fxTick(h, 7);
    expect(shakeAmount(h.fx)).toBe(1);
    fxTick(h, 8);
    expect([shakeAmount(h.fx), h.fx.shakeMagnitude]).toEqual([0, 0]);
  });

  it('shakeAmount is 0 for a state a tool left without a duration', () => {
    const fx = createFxState();
    fx.shakeMagnitude = 4;
    fx.shakeTicks = 3;
    expect(shakeAmount(fx)).toBe(0);
  });
});

describe('core/fx flash edges', () => {
  it('a new flash restarts a running one; the kind stays after it ends', () => {
    const h = host();
    requestFlash(h, FlashKind.MegaCrash);
    for (let t = 1; t <= 5; t++) fxTick(h, t);
    expect(h.fx.flashTicks).toBe(FLASH_KIND_TICKS[FlashKind.MegaCrash] - 5);
    h.tick = 6;
    expect(requestFlash(h, FlashKind.MegaCrash)).toBe(true);
    expect([h.fx.flashTicks, h.fx.flashTick]).toEqual([12, 6]);
    fxTick(h, 6); // its own tick: not counted
    for (let t = 7; t <= 30; t++) fxTick(h, t);
    expect([h.fx.flashTicks, h.fx.flashKind]).toEqual([0, FlashKind.MegaCrash]);
    expect(ofKinds(drain(h))).toEqual([SimEventKind.Flash, SimEventKind.Flash]);
  });

  it('rejects NaN and Infinity kinds', () => {
    const h = host();
    expect([requestFlash(h, Number.NaN), requestFlash(h, Infinity)]).toEqual([false, false]);
    expect(h.fx.flashTicks).toBe(0);
  });
});

/**
 * The kinds of some events.
 *
 * @param events - Events.
 * @returns Their kinds.
 */
function ofKinds(events: readonly SimEvent[]): number[] {
  return events.map((e) => e.kind);
}

describe('core/fx hit-stop edges', () => {
  it('accepts exactly MAX_HIT_STOP_TICKS and pushes the capped request', () => {
    const h = host();
    expect(requestHitStop(h, MAX_HIT_STOP_TICKS)).toBe(MAX_HIT_STOP_TICKS);
    expect(requestHitStop(h, MAX_HIT_STOP_TICKS + 1)).toBe(MAX_HIT_STOP_TICKS);
    expect(drain(h).map((e) => e.param)).toEqual([MAX_HIT_STOP_TICKS, MAX_HIT_STOP_TICKS]);
  });

  it('a longer request while frozen extends the freeze; a shorter one does not shorten it', () => {
    const w = createWorld(resolveGameConfig({ seed: 1 }), EMPTY_CONTENT_DB);
    const input = createInputSnapshot();
    w.camera.vx = 1;
    requestHitStop(w, 3);
    stepWorld(w, input); // frozen, 2 left
    expect(w.hitStop).toBe(2);
    requestHitStop(w, 1);
    expect(w.hitStop).toBe(2);
    requestHitStop(w, 5);
    const xs: number[] = [];
    for (let i = 0; i < 7; i++) {
      stepWorld(w, input);
      xs.push(w.camera.x);
    }
    expect(xs).toEqual([0, 0, 0, 0, 0, 1, 2]);
  });

  it('is deterministic: two Worlds with the same requests hash equal every tick', () => {
    const play = (): number[] => {
      const w: World = createWorld(resolveGameConfig({ seed: 9 }), EMPTY_CONTENT_DB);
      const input = createInputSnapshot();
      w.camera.vx = 0.5;
      const hashes: number[] = [];
      for (let t = 0; t < 200; t++) {
        if (t % 37 === 0) requestHitStop(w, 1 + (t % 9));
        if (t % 23 === 0) requestShake(w, 1 + (t % 4), 5 + (t % 17));
        if (t % 41 === 0) requestFlash(w, FlashKind.MegaCrash);
        stepWorld(w, input);
        w.events.clear();
        hashes.push(hashWorld(w));
      }
      return hashes;
    };
    const a = play();
    expect(play()).toEqual(a);
    expect(new Set(a).size).toBeGreaterThan(100);
  });
});
