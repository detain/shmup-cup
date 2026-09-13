/**
 * Edge cases of the effects module (plan M1-14) beyond `effects.test.ts`:
 *
 * - shake: a long, seeded sequence of requests (stronger, weaker, equal, capped, fractional, bad)
 *   accepted and decayed exactly like the sim's `requestShake` / `tickFx` / `shakeAmount`, tick for
 *   tick; the 64 px / 600-tick caps; `step(0)` keeping a request fresh; a multi-tick step; the
 *   pattern wrapping every 8 ticks and restarting with a new shake; no `-0` offsets; the off
 *   switch flipped mid-shake;
 * - flash: the sim's flash timer mirrored (alpha > 0 exactly while `flashTicks > 0`); the
 *   limiter's window edge (tick 59 refused, 60 accepted), refused flashes not taking a slot and
 *   not touching the running flash, a 0-tick flash neither counted nor limited, reduced flashing
 *   switched on and off at run time, the reduced opacity cap per look, odd kinds, the 600-tick
 *   cap, `clear` re-opening the window, `step` capped at 600;
 * - dim: level clamping, the hold cap, a fade-out that reaches 0, a weaker request snapping
 *   down, a zero-length hold fading at once; the settings copied from the caller;
 * - score popups: capacity 1, floored points, `step` clamping, expiry at exactly `ticks`, a
 *   custom lifetime (blink window), the top / bottom clamps, the rise rate, numbers longer than a
 *   popup's glyph budget, `liveCount` when replacing, and `destroy`.
 *
 * Regression (found by the event path's allocation guard, shell `dispatch-fx-alloc`): the
 * popups shared one ordered quad pool, so whenever a popup blinked, appeared or expired the
 * glyphs after it moved to other quads — with a gold bonus popup among white ones those quads
 * were re-tinted every such frame, and Pixi's tint setter allocates (~1 MB per 10,000 frames).
 * Each slot now has its own pool.
 */
import {
  FlashKind,
  FLASH_KIND_TICKS,
  PLAYFIELD_H,
  PLAYFIELD_Y,
  ShakeMagnitude,
  createEventQueue,
  createFxState,
  requestFlash,
  requestShake,
  shakeAmount,
  tickFx,
} from '@shmup/core';
import type { Container, Sprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createAtlas } from '../../src/atlas/index.js';
import {
  BONUS_POPUP_COLOR,
  DEFAULT_EFFECT_SETTINGS,
  DEFAULT_FLASH_LOOK,
  DIM_FADE_IN_TICKS,
  DIM_FADE_OUT_TICKS,
  FLASH_LIMIT,
  FLASH_LOOKS,
  FLASH_WINDOW_TICKS,
  REDUCED_FLASH_ALPHA,
  SCORE_POPUP_COLOR,
  SHAKE_PATTERN_X,
  SHAKE_PATTERN_Y,
  createScorePopups,
  createScreenEffects,
} from '../../src/effects/index.js';
import { createBitmapFont } from '../../src/text/index.js';
import { pageImages, testManifest } from '../helpers.js';

/**
 * A small deterministic generator for the request sequences (xorshift32).
 *
 * @param seed - Non-zero seed.
 * @returns A function returning integers in `[0, n)`.
 */
function sequence(seed: number): (n: number) => number {
  let state = seed >>> 0 || 1;
  return (n) => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state % n;
  };
}

/** A World-like host of the sim's fx functions. */
function simHost() {
  return { tick: 0, fx: createFxState(), events: createEventQueue(), hitStop: 0 };
}

describe('render-pixi/effects shake (edges)', () => {
  it('accepts and decays like the sim through a long sequence of mixed requests', () => {
    for (const seed of [1, 7, 1234, 0xbeef]) {
      const next = sequence(seed);
      const host = simHost();
      const effects = createScreenEffects();
      const magnitudes = [0, 1, 2, 4, 3, 2.7, -1, Number.NaN, 99];
      const durations = [0, 1, 5, 20, 40, 7.5, -3, 700];
      for (let tick = 0; tick < 2000; tick++) {
        host.tick = tick;
        // Requests happen during the tick; the presentation sees them before its next step.
        if (next(4) === 0) {
          const m = magnitudes[next(magnitudes.length)];
          const n = durations[next(durations.length)];
          expect(effects.shake(m, n), `seed ${seed} tick ${tick} shake(${m}, ${n})`).toBe(
            requestShake(host, m, n),
          );
        }
        tickFx(host);
        effects.step(1);
        expect(effects.shakeAmount, `seed ${seed} tick ${tick}`).toBe(shakeAmount(host.fx));
      }
      host.events.clear();
    }
  });

  it('caps magnitudes at 64 px and durations at 600 ticks, and floors both', () => {
    const effects = createScreenEffects();
    expect(effects.shake(1000, 5)).toBe(true);
    effects.step(1);
    expect(effects.shakeAmount).toBe(64);
    effects.clear();
    expect(effects.shake(3.9, 10.9)).toBe(true);
    effects.step(1);
    expect(effects.shakeAmount).toBe(3);
    effects.step(10); // 10 ticks after the fresh one: over
    expect(effects.shakeAmount).toBe(0);
    effects.clear();
    effects.shake(1, 100_000);
    effects.step(600);
    expect(effects.shakeAmount).toBe(1);
    effects.step(1);
    expect(effects.shakeAmount).toBe(0);
    // Below one pixel, or a duration below one tick: nothing.
    expect(effects.shake(0.9, 10)).toBe(false);
    expect(effects.shake(2, 0.5)).toBe(false);
    expect(effects.shake(Number.POSITIVE_INFINITY, 10)).toBe(true);
    effects.step(1);
    expect(effects.shakeAmount).toBe(64);
  });

  it('keeps a request fresh through step(0) and counts n − 1 in a multi-tick step', () => {
    const effects = createScreenEffects();
    effects.shake(4, 8);
    effects.step(0);
    effects.step(-1);
    effects.step(Number.NaN);
    effects.step(1); // clears the fresh mark only
    expect(effects.shakeAmount).toBe(4);
    effects.clear();
    effects.shake(4, 8);
    effects.step(5); // fresh + 4 ticks: 4 · 4 / 8
    expect(effects.shakeAmount).toBe(2);
  });

  it('walks the 8-step pattern, wraps it and restarts it with a new shake; never -0', () => {
    const effects = createScreenEffects();
    effects.shake(64, 600);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let k = 0; k < 17; k++) {
      effects.step(1);
      xs.push(effects.shakeX / effects.shakeAmount);
      ys.push(effects.shakeY / effects.shakeAmount);
      expect(Object.is(effects.shakeX, -0) || Object.is(effects.shakeY, -0)).toBe(false);
    }
    const pattern = (table: readonly number[], k: number): number => table[k & 7] + 0;
    expect(xs).toEqual(xs.map((_, k) => pattern(SHAKE_PATTERN_X, k)));
    expect(ys).toEqual(ys.map((_, k) => pattern(SHAKE_PATTERN_Y, k)));
    // A request as strong as the running amplitude is refused; a stronger one restarts phase 0.
    expect(effects.shake(effects.shakeAmount, 10)).toBe(false);
    effects.clear();
    effects.shake(1, 30);
    effects.step(3);
    expect(effects.shake(4, 30)).toBe(true);
    effects.step(1);
    expect([effects.shakeX, effects.shakeY]).toEqual([4 * SHAKE_PATTERN_X[0], 0]);
    // Idle: offsets are plain zeros.
    effects.clear();
    expect([Object.is(effects.shakeX, 0), Object.is(effects.shakeY, 0)]).toEqual([true, true]);
  });

  it('keeps running under the off switch and shows the current step when switched back on', () => {
    const effects = createScreenEffects({ screenShake: false });
    effects.shake(ShakeMagnitude.Large, 16);
    effects.step(5);
    expect([effects.shakeX, effects.shakeY, effects.shakeAmount]).toEqual([0, 0, 3]);
    effects.settings.screenShake = true;
    expect(effects.shakeX).toBe(3 * SHAKE_PATTERN_X[4]);
    expect(effects.shakeY).toBe(3 * SHAKE_PATTERN_Y[4] + 0);
  });
});

describe('render-pixi/effects flash (edges)', () => {
  it('mirrors the sim flash timer: visible exactly while flashTicks > 0, fading to it', () => {
    const host = simHost();
    const effects = createScreenEffects();
    const requests = new Map<number, number>([
      [3, FlashKind.MegaCrash],
      [40, FlashKind.Warning],
      [100, FlashKind.BossBlast],
      [110, FlashKind.Warning], // replaces the boss blast mid-fade
      [200, FlashKind.MegaCrash],
    ]);
    for (let tick = 0; tick < 260; tick++) {
      host.tick = tick;
      const kind = requests.get(tick);
      if (kind !== undefined) {
        requestFlash(host, kind);
        expect(effects.flash(kind, FLASH_KIND_TICKS[kind])).toBe(true);
      }
      tickFx(host);
      effects.step(1);
      const ticks = host.fx.flashTicks;
      expect(effects.flashAlpha > 0, `tick ${tick}`).toBe(ticks > 0);
      if (ticks > 0) {
        const look = FLASH_LOOKS[host.fx.flashKind];
        expect(effects.flashAlpha).toBeCloseTo(
          (look.alpha * ticks) / FLASH_KIND_TICKS[host.fx.flashKind],
          12,
        );
        expect(effects.flashColor).toBe(look.color);
      }
    }
  });

  it('refuses a fourth start until the oldest is a full window old (tick 59 no, 60 yes)', () => {
    const effects = createScreenEffects();
    for (let i = 0; i < FLASH_LIMIT; i++) expect(effects.flash(FlashKind.Warning, 8)).toBe(true);
    expect(effects.flash(FlashKind.Warning, 8)).toBe(false);
    effects.step(FLASH_WINDOW_TICKS - 1);
    expect(effects.flash(FlashKind.MegaCrash, 12)).toBe(false);
    expect(effects.flashesSuppressed).toBe(2);
    effects.step(1);
    expect(effects.flash(FlashKind.MegaCrash, 12)).toBe(true);
    // Only one slot freed up (all three started on the same tick, so all three free now).
    expect(effects.flash(FlashKind.MegaCrash, 12)).toBe(true);
    expect(effects.flash(FlashKind.MegaCrash, 12)).toBe(true);
    expect(effects.flash(FlashKind.MegaCrash, 12)).toBe(false);
  });

  it('leaves the running flash alone when refusing one, and a refusal takes no slot', () => {
    const effects = createScreenEffects();
    effects.flash(FlashKind.BossBlast, 24);
    effects.flash(FlashKind.BossBlast, 24);
    effects.flash(FlashKind.BossBlast, 24);
    effects.step(4);
    const alpha = effects.flashAlpha;
    expect(effects.flash(FlashKind.Warning, 8)).toBe(false);
    expect([effects.flashColor, effects.flashAlpha]).toEqual([0xffffff, alpha]);
    // Refusals every tick do not push the window forward.
    for (let i = 4; i < FLASH_WINDOW_TICKS - 1; i++) {
      effects.flash(FlashKind.Warning, 8);
      effects.step(1);
    }
    expect(effects.flash(FlashKind.Warning, 8)).toBe(false); // clock 59
    effects.step(1);
    expect(effects.flash(FlashKind.Warning, 8)).toBe(true); // clock 60
  });

  it('ignores a 0-tick flash entirely (not counted, no slot) and caps durations at 600', () => {
    const effects = createScreenEffects();
    for (const ticks of [0, -5, Number.NaN, 0.5]) expect(effects.flash(0, ticks)).toBe(false);
    expect(effects.flashesSuppressed).toBe(0);
    expect(effects.flash(FlashKind.MegaCrash, 10_000)).toBe(true);
    effects.step(600);
    expect(effects.flashAlpha).toBeGreaterThan(0);
    effects.step(1);
    expect(effects.flashAlpha).toBe(0);
    expect(effects.flash(FlashKind.MegaCrash, 2.9)).toBe(true);
    effects.step(1);
    expect(effects.flashAlpha).toBeCloseTo(FLASH_LOOKS[0].alpha);
    effects.step(2);
    expect(effects.flashAlpha).toBe(0);
  });

  it('shows the peak at once and draws odd kinds in the default look', () => {
    const effects = createScreenEffects();
    effects.flash(FlashKind.Warning, 8);
    expect(effects.flashAlpha).toBeCloseTo(0.35); // before any step
    effects.clear();
    for (const kind of [-1, 1.5, Number.NaN, FLASH_LOOKS.length]) {
      effects.clear();
      effects.flash(kind, 8);
      expect([effects.flashColor, effects.flashAlpha], String(kind)).toEqual([
        DEFAULT_FLASH_LOOK.color,
        DEFAULT_FLASH_LOOK.alpha,
      ]);
    }
    // One look per core flash kind.
    expect(FLASH_LOOKS).toHaveLength(FLASH_KIND_TICKS.length);
  });

  it('caps the opacity with reduced flashing for every look brighter than the cap', () => {
    const effects = createScreenEffects({ reduceFlashing: true });
    for (const kind of [0, 1, 2, 99]) {
      effects.clear();
      effects.flash(kind, 8);
      const look = FLASH_LOOKS[kind] ?? DEFAULT_FLASH_LOOK;
      expect(effects.flashAlpha, String(kind)).toBe(Math.min(look.alpha, REDUCED_FLASH_ALPHA));
    }
  });

  it('applies reduced flashing switched on or off at run time to the next request', () => {
    const effects = createScreenEffects();
    effects.flash(FlashKind.Warning, 8); // clock 0
    effects.step(10);
    effects.flash(FlashKind.Warning, 8); // clock 10
    effects.step(20);
    effects.settings.reduceFlashing = true;
    // One a second: the last start (10) is only 20 ticks old.
    expect(effects.flash(FlashKind.Warning, 8)).toBe(false);
    effects.step(40); // clock 70
    expect(effects.flash(FlashKind.Warning, 8)).toBe(true);
    expect(effects.flashAlpha).toBe(REDUCED_FLASH_ALPHA);
    effects.step(1); // clock 71
    effects.settings.reduceFlashing = false;
    expect(effects.flash(FlashKind.Warning, 8)).toBe(true); // starts 10, 70, 71
    expect(effects.flash(FlashKind.Warning, 8)).toBe(true); // 70, 71, 71
    expect(effects.flash(FlashKind.Warning, 8)).toBe(false);
    expect(effects.flashAlpha).toBeCloseTo(0.35);
  });

  it('re-opens the window on clear, and caps a step at 600 ticks of the limiter clock', () => {
    const effects = createScreenEffects();
    for (let i = 0; i < FLASH_LIMIT; i++) effects.flash(0, 12);
    effects.clear();
    for (let i = 0; i < FLASH_LIMIT; i++) expect(effects.flash(0, 12)).toBe(true);
    effects.step(1e9);
    expect(effects.flash(0, 12)).toBe(true); // 600 ≥ one window
  });
});

describe('render-pixi/effects dim and settings (edges)', () => {
  it('clamps the level to 0…1 (NaN = 0) and the hold to 600 ticks', () => {
    const effects = createScreenEffects();
    effects.dim(-0.5, 20);
    effects.step(DIM_FADE_IN_TICKS);
    expect(effects.dimAlpha).toBe(0);
    effects.dim(Number.NaN, 20);
    effects.step(DIM_FADE_IN_TICKS);
    expect(effects.dimAlpha).toBe(0);
    effects.dim(1, 100_000);
    effects.step(600);
    expect(effects.dimAlpha).toBe(1);
    effects.step(1);
    expect(effects.dimAlpha).toBeLessThan(1);
  });

  it('fades out all the way to 0 (no lingering sliver), for awkward levels too', () => {
    for (const level of [0.5, 0.35, 0.3, 0.07, 1]) {
      const effects = createScreenEffects();
      effects.dim(level, 10);
      effects.step(10);
      expect(effects.dimAlpha, String(level)).toBeCloseTo(level, 12);
      let steps = 0;
      while (effects.dimAlpha > 0 && steps < 100) {
        effects.step(1);
        steps++;
      }
      expect(effects.dimAlpha).toBe(0);
      expect(steps, String(level)).toBeLessThanOrEqual(DIM_FADE_OUT_TICKS + 1);
      expect(steps).toBeGreaterThanOrEqual(DIM_FADE_OUT_TICKS);
    }
  });

  it('snaps down to a weaker request and fades at once after a zero-length hold', () => {
    const effects = createScreenEffects();
    effects.dim(0.8, 60);
    effects.step(DIM_FADE_IN_TICKS);
    expect(effects.dimAlpha).toBeCloseTo(0.8, 12);
    effects.dim(0.4, 60);
    effects.step(1);
    expect(effects.dimAlpha).toBe(0.4);
    effects.dim(0.4, 0);
    effects.step(1);
    expect(effects.dimAlpha).toBeCloseTo(0.4 - 0.4 / DIM_FADE_OUT_TICKS, 12);
    // A clear dim (level 0) ends it on the next step.
    effects.dim(0, 30);
    effects.step(1);
    expect(effects.dimAlpha).toBe(0);
  });

  it('copies the caller settings and keeps the defaults frozen', () => {
    const mine = { screenShake: false };
    const effects = createScreenEffects(mine);
    mine.screenShake = true;
    expect(effects.settings.screenShake).toBe(false);
    expect(effects.settings).not.toBe(DEFAULT_EFFECT_SETTINGS);
    expect(Object.isFrozen(DEFAULT_EFFECT_SETTINGS)).toBe(true);
    expect(createScreenEffects({ crt: 'full' }).settings).toEqual({
      screenShake: true,
      reduceFlashing: false,
      crt: 'full',
      rasterEffects: true,
    });
    const idle = createScreenEffects();
    expect([idle.shakeX, idle.shakeY, idle.flashAlpha, idle.dimAlpha]).toEqual([0, 0, 0, 0]);
  });
});

describe('render-pixi/effects score popups (edges)', () => {
  const manifest = testManifest();
  const atlas = createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
  const font = createBitmapFont(atlas);

  /**
   * The visible glyph quads.
   *
   * @param container - The popups' container.
   * @returns `[x, y]` per visible quad.
   */
  const quads = (container: Container) =>
    (container.children as Container[])
      .flatMap((pool) => pool.children as Sprite[])
      .filter((s) => s.visible)
      .map((s) => [s.x, s.y]);

  it('capacity 1 replaces its only popup; points are floored', () => {
    const popups = createScorePopups({ atlas, font, capacity: 1 });
    expect(popups.show(99.9, 100, 50, SCORE_POPUP_COLOR)).toBe(true);
    popups.sync({ x: 0, y: 0 });
    expect(quads(popups.container)).toHaveLength(2); // "99"
    expect(popups.show(5, 200, 50, SCORE_POPUP_COLOR)).toBe(true);
    expect(popups.liveCount).toBe(1);
    popups.sync({ x: 0, y: 0 });
    expect(quads(popups.container)).toEqual([[197, 50 + PLAYFIELD_Y - 3]]);
    expect(popups.show(Number.POSITIVE_INFINITY, 0, 0, 0)).toBe(true);
    expect(() => popups.sync({ x: 0, y: 0 })).not.toThrow();
  });

  it('ignores steps of 0, negative or NaN and expires at exactly `ticks`', () => {
    const popups = createScorePopups({ atlas, font });
    popups.show(100, 100, 100, SCORE_POPUP_COLOR);
    for (const ticks of [0, -4, Number.NaN, 0.5]) popups.step(ticks);
    expect(popups.liveCount).toBe(1);
    popups.step(39.9); // floored: 39 → age 39
    expect(popups.liveCount).toBe(1);
    popups.step(1);
    expect(popups.liveCount).toBe(0);
    popups.show(100, 100, 100, SCORE_POPUP_COLOR);
    popups.step(1000);
    expect(popups.liveCount).toBe(0);
    popups.sync({ x: 0, y: 0 });
    expect(quads(popups.container)).toEqual([]);
  });

  it('blinks in the last 10 ticks of a custom lifetime (all blinking when shorter)', () => {
    const popups = createScorePopups({ atlas, font, ticks: 12 });
    expect(popups.ticks).toBe(12);
    popups.show(7, 100, 100, SCORE_POPUP_COLOR);
    const shown: number[] = [];
    for (let age = 0; age < 13; age++) {
      popups.sync({ x: 0, y: 0 });
      shown.push(quads(popups.container).length);
      popups.step(1);
    }
    // Ages 0–1 steady, 2–11 blink on bit 1 of the age, 12 gone.
    expect(shown).toEqual([1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0]);
    const short = createScorePopups({ atlas, font, ticks: 4 });
    short.show(7, 100, 100, SCORE_POPUP_COLOR);
    const brief: number[] = [];
    for (let age = 0; age < 4; age++) {
      short.sync({ x: 0, y: 0 });
      brief.push(quads(short.container).length);
      short.step(1);
    }
    expect(brief).toEqual([1, 1, 0, 0]);
  });

  it('rises one pixel every 4 ticks and stays between the playfield top and bottom', () => {
    const popups = createScorePopups({ atlas, font });
    popups.show(1, 100, 100, SCORE_POPUP_COLOR);
    const ys: number[] = [];
    for (let age = 0; age < 13; age++) {
      popups.sync({ x: 0, y: 0 });
      ys.push(quads(popups.container)[0][1]);
      popups.step(1);
    }
    const top = 100 + PLAYFIELD_Y - 3;
    expect(ys).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3].map((d) => top - d));
    popups.clear();
    popups.show(1, 100, -500, SCORE_POPUP_COLOR);
    popups.show(1, 150, 5000, SCORE_POPUP_COLOR);
    popups.sync({ x: 0, y: 0 });
    const [high, low] = quads(popups.container).map(([, y]) => y);
    expect(high).toBe(PLAYFIELD_Y);
    expect(low).toBe(PLAYFIELD_Y + PLAYFIELD_H - font.cellHeight);
    // With a custom offset (a scene drawing world row 0 at screen row 0).
    const flat = createScorePopups({ atlas, font, offsetY: 0 });
    flat.show(1, 100, 50, SCORE_POPUP_COLOR);
    flat.sync({ x: 0, y: 20 });
    expect(quads(flat.container)[0][1]).toBe(50 - 20 - 3);
  });

  it('draws up to 8 digits a popup (MAX_SCORE) and never lets a long number eat a neighbour', () => {
    const popups = createScorePopups({ atlas, font, capacity: 2 });
    popups.show(1_234_567_890, 190, 100, SCORE_POPUP_COLOR); // 10 digits: the first 8 drawn
    popups.show(99_999_990, 190, 140, SCORE_POPUP_COLOR);
    popups.sync({ x: 0, y: 0 });
    const pools = popups.container.children as Container[];
    expect(pools).toHaveLength(2);
    expect(pools.map((pool) => pool.children.filter((q) => q.visible).length)).toEqual([8, 8]);
  });

  it('never re-tints a quad between shows, with white and gold popups mixed (regression)', () => {
    // One shared quad pool re-tinted quads whenever a popup before them blinked, appeared or
    // expired — Pixi's tint setter allocates, ~100 bytes a frame with a gold bonus on screen.
    const popups = createScorePopups({ atlas, font, capacity: 4 });
    popups.show(100, 60, 60, SCORE_POPUP_COLOR);
    popups.step(20);
    popups.show(5000, 120, 60, BONUS_POPUP_COLOR);
    popups.step(5);
    popups.show(300, 180, 60, SCORE_POPUP_COLOR);
    popups.sync({ x: 0, y: 0 });
    let writes = 0;
    // Every quad under the container, whatever its grouping.
    const all: Sprite[] = [];
    const walk = (node: Container): void => {
      if (node.children.length === 0) all.push(node as Sprite);
      for (const child of node.children) walk(child);
    };
    walk(popups.container);
    expect(all).toHaveLength(4 * 8);
    for (const quad of all) {
      let proto: object | null = Object.getPrototypeOf(quad) as object | null;
      let descriptor: PropertyDescriptor | undefined;
      while (proto !== null && descriptor === undefined) {
        descriptor = Object.getOwnPropertyDescriptor(proto, 'tint');
        proto = Object.getPrototypeOf(proto) as object | null;
      }
      const accessor = descriptor;
      if (accessor?.get === undefined || accessor.set === undefined) {
        throw new Error('no tint accessor');
      }
      Object.defineProperty(quad, 'tint', {
        configurable: true,
        get(this: Sprite) {
          return accessor.get?.call(this) as number;
        },
        set(this: Sprite, value: number) {
          writes++;
          accessor.set?.call(this, value);
        },
      });
    }
    // 30 frames: the first popup blinks and expires, the gold one and the last one blink.
    for (let i = 0; i < 30; i++) {
      popups.step(1);
      popups.sync({ x: i % 5, y: 0 });
    }
    expect(writes).toBe(0);
    expect(popups.liveCount).toBe(2);
    // A new popup of the other colour in a used slot re-tints its quads once, then never again.
    popups.show(7000, 100, 80, BONUS_POPUP_COLOR);
    popups.sync({ x: 0, y: 0 });
    const afterShow = writes;
    expect(afterShow).toBeGreaterThan(0);
    for (let i = 0; i < 20; i++) {
      popups.step(1);
      popups.sync({ x: 0, y: 0 });
    }
    expect(writes).toBe(afterShow);
  });

  it('keeps liveCount at the capacity while replacing, and reuses cleared slots', () => {
    const popups = createScorePopups({ atlas, font, capacity: 3 });
    for (let i = 0; i < 10; i++) popups.show(10 + i, 20 * i, 50, SCORE_POPUP_COLOR);
    expect(popups.liveCount).toBe(3);
    popups.clear();
    expect(popups.liveCount).toBe(0);
    popups.show(1, 100, 50, SCORE_POPUP_COLOR);
    popups.step(20);
    popups.show(2, 100, 50, SCORE_POPUP_COLOR);
    popups.step(20); // the first expires (age 40), the second is 20
    expect(popups.liveCount).toBe(1);
    popups.show(3, 100, 50, SCORE_POPUP_COLOR);
    expect(popups.liveCount).toBe(2);
  });

  it('destroys its quads', () => {
    const popups = createScorePopups({ atlas, font, capacity: 1 });
    const container = popups.container;
    popups.destroy();
    expect(container.destroyed).toBe(true);
  });
});
