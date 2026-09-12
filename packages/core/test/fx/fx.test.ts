/**
 * `core/fx` (plan M1-12): hit-stop, shake and flash requests — the timers they set, the events
 * they push, how the timers count down (and when they do not), clamping of odd requests, and the
 * World's use of them (a hit-stop freezes exactly the requested ticks).
 */
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB } from '../../src/data/index.js';
import { SimEventKind, createEventQueue, type SimEvent } from '../../src/events/index.js';
import {
  FLASH_KIND_TICKS,
  FlashKind,
  MAX_FX_TICKS,
  MAX_HIT_STOP_TICKS,
  ShakeMagnitude,
  createFxState,
  moduleInfo,
  requestFlash,
  requestHitStop,
  requestShake,
  shakeAmount,
  tickFx,
  type HitStopHost,
} from '../../src/fx/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { createWorld, stepWorld } from '../../src/world/index.js';

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

describe('core/fx', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('fx');
    expect(moduleInfo.status).toBe('partial');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });

  it('names three shake magnitudes and the Mega Crash flash (12 ticks)', () => {
    expect([ShakeMagnitude.Small, ShakeMagnitude.Medium, ShakeMagnitude.Large]).toEqual([1, 2, 4]);
    expect(FLASH_KIND_TICKS[FlashKind.MegaCrash]).toBe(12);
    expect(Object.isFrozen(FLASH_KIND_TICKS)).toBe(true);
  });
});

describe('core/fx hit-stop', () => {
  it('raises the counter (never lowers it) and pushes a HitStop event per request', () => {
    const h = host();
    expect(requestHitStop(h, 8)).toBe(8);
    expect(requestHitStop(h, 5)).toBe(8);
    expect(requestHitStop(h, 12)).toBe(12);
    expect(drain(h).map((e) => [e.kind, e.param])).toEqual([
      [SimEventKind.HitStop, 8],
      [SimEventKind.HitStop, 5],
      [SimEventKind.HitStop, 12],
    ]);
  });

  it('ignores 0, negatives and NaN; floors fractions; caps long requests', () => {
    const h = host();
    expect([requestHitStop(h, 0), requestHitStop(h, -3), requestHitStop(h, Number.NaN)]).toEqual([
      0, 0, 0,
    ]);
    expect(drain(h)).toEqual([]);
    expect(requestHitStop(h, 2.9)).toBe(2);
    expect(requestHitStop(h, 1e9)).toBe(MAX_HIT_STOP_TICKS);
  });

  it('counts down only on frozen ticks', () => {
    const h = host();
    requestHitStop(h, 3);
    h.fx.frozen = false; // the request's own tick
    tickFx(h);
    expect(h.hitStop).toBe(3);
    h.fx.frozen = true;
    tickFx(h);
    tickFx(h);
    tickFx(h);
    expect(h.hitStop).toBe(0);
    tickFx(h);
    expect(h.hitStop).toBe(0);
  });

  it('freezes exactly the requested ticks of a World (requested mid-tick or between ticks)', () => {
    const w = createWorld(resolveGameConfig({ seed: 1 }), EMPTY_CONTENT_DB);
    const input = createInputSnapshot();
    w.camera.vx = 1;
    requestHitStop(w, 3); // between ticks: the next three
    const xs: number[] = [];
    for (let i = 0; i < 5; i++) {
      stepWorld(w, input);
      xs.push(w.camera.x);
    }
    expect(xs).toEqual([0, 0, 0, 1, 2]);
    expect(w.tick).toBe(5);
  });
});

describe('core/fx shake and flash', () => {
  it('starts a shake (event id = duration, param = magnitude) that decays to 0 over its ticks', () => {
    const h = host();
    h.tick = 10;
    expect(requestShake(h, ShakeMagnitude.Large, 4)).toBe(true);
    expect(drain(h)).toEqual([{ kind: SimEventKind.Shake, id: 4, x: 0, y: 0, param: 4 }]);
    const amounts = [shakeAmount(h.fx)];
    tickFx(h); // the request's tick: not counted
    amounts.push(shakeAmount(h.fx));
    for (let t = 11; t <= 15; t++) {
      h.tick = t;
      tickFx(h);
      amounts.push(shakeAmount(h.fx));
    }
    expect(amounts).toEqual([4, 4, 3, 2, 1, 0, 0]);
    expect([h.fx.shakeTicks, h.fx.shakeMagnitude]).toEqual([0, 0]);
  });

  it('ignores a shake weaker than the running one, and bad magnitudes or lengths', () => {
    const h = host();
    requestShake(h, ShakeMagnitude.Medium, 10);
    drain(h);
    expect(requestShake(h, ShakeMagnitude.Small, 30)).toBe(false);
    expect(requestShake(h, ShakeMagnitude.Medium, 30)).toBe(false);
    expect(requestShake(h, 0, 10)).toBe(false);
    expect(requestShake(h, Number.NaN, 10)).toBe(false);
    expect(requestShake(h, ShakeMagnitude.Large, 0)).toBe(false);
    expect(drain(h)).toEqual([]);
    expect(requestShake(h, ShakeMagnitude.Large, 1e9)).toBe(true);
    expect(h.fx.shakeTicks).toBe(MAX_FX_TICKS);
  });

  it('starts a flash of a kind (event id = kind, param = its length) and counts it down', () => {
    const h = host();
    h.tick = 3;
    expect(requestFlash(h, FlashKind.MegaCrash)).toBe(true);
    expect(drain(h)).toEqual([
      { kind: SimEventKind.Flash, id: FlashKind.MegaCrash, x: 0, y: 0, param: 12 },
    ]);
    tickFx(h);
    expect(h.fx.flashTicks).toBe(12);
    h.tick = 4;
    tickFx(h);
    expect(h.fx.flashTicks).toBe(11);
    expect([requestFlash(h, -1), requestFlash(h, 1.5), requestFlash(h, 99)]).toEqual([
      false,
      false,
      false,
    ]);
    expect(drain(h)).toEqual([]);
  });

  it('keeps counting shake and flash down while the World is frozen', () => {
    const w = createWorld(resolveGameConfig({ seed: 1 }), EMPTY_CONTENT_DB);
    const input = createInputSnapshot();
    requestShake(w, ShakeMagnitude.Small, 6);
    requestFlash(w, FlashKind.MegaCrash);
    requestHitStop(w, 4);
    for (let i = 0; i < 4; i++) stepWorld(w, input);
    expect(w.hitStop).toBe(0);
    // Requested between ticks at tick 0: that tick is not counted, the next three are.
    expect([w.fx.shakeTicks, w.fx.flashTicks]).toEqual([3, 9]);
  });
});
