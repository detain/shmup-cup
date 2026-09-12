/**
 * Tests for the effects module (plan M1-14): the screen shake's decay sequence (the sim's
 * `shakeAmount`, tick for tick), its pattern and global off switch; the flash looks and the
 * ≤ 3-a-second limiter (1 with reduced flashing); the playfield dim's fade; and the score popups
 * (rise, clamp, blink, expiry, oldest replaced, no allocation).
 */
import {
  FlashKind,
  FLASH_KIND_TICKS,
  PLAYFIELD_W,
  PLAYFIELD_Y,
  ShakeMagnitude,
  createEventQueue,
  createFxState,
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
  DIM_FADE_IN_TICKS,
  FLASH_LIMIT,
  FLASH_LOOKS,
  FLASH_WINDOW_TICKS,
  REDUCED_FLASH_ALPHA,
  SCORE_POPUP_COLOR,
  SCORE_POPUP_SLOTS,
  SCORE_POPUP_TICKS,
  SHAKE_PATTERN_X,
  SHAKE_PATTERN_Y,
  createScorePopups,
  createScreenEffects,
  moduleInfo,
} from '../../src/effects/index.js';
import { createBitmapFont } from '../../src/text/index.js';
import { measureAllocation, pageImages, testManifest } from '../helpers.js';

describe('render-pixi/effects screen shake', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('effects');
    expect(moduleInfo.status).toBe('partial');
    expect(DEFAULT_EFFECT_SETTINGS).toEqual({
      screenShake: true,
      reduceFlashing: false,
      crt: 'off',
    });
  });

  it('decays exactly like the sim shake, tick for tick (one tick per frame)', () => {
    // The sim side: a World-like host whose shake is requested during tick 5.
    const host = { tick: 5, fx: createFxState(), events: createEventQueue(), hitStop: 0 };
    requestShake(host, ShakeMagnitude.Medium, 20);
    const effects = createScreenEffects();
    // The event reaches the presentation after the tick ran; each frame then steps one tick.
    expect(effects.shake(ShakeMagnitude.Medium, 20)).toBe(true);
    const sim: number[] = [];
    const drawn: number[] = [];
    for (let frame = 0; frame < 24; frame++) {
      // Frame 0 ends the request's own tick; every later frame runs the next tick.
      if (frame > 0) host.tick++;
      tickFx(host);
      effects.step(1);
      sim.push(shakeAmount(host.fx));
      drawn.push(effects.shakeAmount);
    }
    expect(drawn).toEqual(sim);
    expect(drawn.slice(0, 3)).toEqual([2, 2, 2]);
    expect(drawn.indexOf(1)).toBe(10);
    expect(drawn.slice(20)).toEqual([0, 0, 0, 0]);
  });

  it('offsets the world by the amplitude along the fixed pattern, and not at all when off', () => {
    const effects = createScreenEffects();
    effects.shake(ShakeMagnitude.Large, 8);
    const offsets: Array<[number, number]> = [];
    for (let k = 0; k < 8; k++) {
      effects.step(1);
      offsets.push([effects.shakeX, effects.shakeY]);
    }
    const expected: Array<[number, number]> = [];
    for (let k = 0; k < 8; k++) {
      const left = k === 0 ? 8 : 8 - k;
      const amp = Math.ceil((4 * left) / 8);
      const phase = k === 0 ? 0 : k;
      expected.push([amp * SHAKE_PATTERN_X[phase] + 0, amp * SHAKE_PATTERN_Y[phase] + 0]);
    }
    expect(offsets).toEqual(expected);
    for (const [x, y] of offsets) {
      expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
    }
    // The global off switch keeps the state but draws nothing.
    effects.shake(ShakeMagnitude.Large, 30);
    effects.settings.screenShake = false;
    effects.step(1);
    expect([effects.shakeX, effects.shakeY]).toEqual([0, 0]);
    expect(effects.shakeAmount).toBe(4);
    effects.settings.screenShake = true;
    expect(Math.abs(effects.shakeX) + Math.abs(effects.shakeY)).toBeGreaterThan(0);
    expect(createScreenEffects({ screenShake: false }).settings.screenShake).toBe(false);
  });

  it('ignores a weaker shake while a stronger one runs, and bad requests', () => {
    const effects = createScreenEffects();
    expect(effects.shake(ShakeMagnitude.Medium, 20)).toBe(true);
    effects.step(1);
    expect(effects.shake(ShakeMagnitude.Small, 20)).toBe(false);
    expect(effects.shake(ShakeMagnitude.Medium, 20)).toBe(false);
    expect(effects.shake(ShakeMagnitude.Large, 20)).toBe(true);
    expect(effects.shake(0, 20)).toBe(false);
    expect(effects.shake(Number.NaN, 20)).toBe(false);
    expect(effects.shake(9, 0)).toBe(false);
    effects.clear();
    expect(effects.shakeAmount).toBe(0);
  });
});

describe('render-pixi/effects flash and dim', () => {
  it('draws each flash kind in its look, fading linearly over its duration', () => {
    const effects = createScreenEffects();
    effects.flash(FlashKind.MegaCrash, FLASH_KIND_TICKS[FlashKind.MegaCrash]);
    const alphas: number[] = [];
    for (let k = 0; k < 13; k++) {
      effects.step(1);
      alphas.push(effects.flashAlpha);
    }
    expect(effects.flashColor).toBe(0xffffff);
    expect(alphas[0]).toBeCloseTo(FLASH_LOOKS[0].alpha);
    expect(alphas[11]).toBeCloseTo(FLASH_LOOKS[0].alpha / 12);
    expect(alphas[12]).toBe(0);
    for (let k = 1; k < 13; k++) expect(alphas[k]).toBeLessThan(alphas[k - 1]);
    effects.step(60);
    effects.flash(FlashKind.Warning, 8);
    expect(effects.flashColor).toBe(0xf85858);
    effects.step(1);
    expect(effects.flashAlpha).toBeCloseTo(0.35);
    effects.step(60);
    effects.flash(42, 10);
    effects.step(1);
    expect([effects.flashColor, effects.flashAlpha]).toEqual([0xffffff, 0.6]);
    expect(effects.flash(0, 0)).toBe(false);
  });

  it('lets at most three flashes start in any one-second window', () => {
    const effects = createScreenEffects();
    const started: number[] = [];
    // A flash request every 10 ticks for 3 seconds.
    for (let tick = 0; tick < 180; tick++) {
      if (tick % 10 === 0 && effects.flash(FlashKind.Warning, 8)) started.push(tick);
      effects.step(1);
    }
    expect(started).toEqual([0, 10, 20, 60, 70, 80, 120, 130, 140]);
    expect(effects.flashesSuppressed).toBe(18 - 9);
    // Any 60-tick window holds at most FLASH_LIMIT starts.
    for (const start of started) {
      const inWindow = started.filter((t) => t >= start && t < start + FLASH_WINDOW_TICKS);
      expect(inWindow.length).toBeLessThanOrEqual(FLASH_LIMIT);
    }
  });

  it('allows one flash a second, at reduced opacity, with reduced flashing', () => {
    const effects = createScreenEffects({ reduceFlashing: true });
    const started: number[] = [];
    for (let tick = 0; tick < 130; tick++) {
      if (tick % 10 === 0 && effects.flash(FlashKind.BossBlast, 24)) started.push(tick);
      effects.step(1);
      if (tick === 0) expect(effects.flashAlpha).toBe(REDUCED_FLASH_ALPHA);
    }
    expect(started).toEqual([0, 60, 120]);
    effects.clear();
    expect([effects.flashAlpha, effects.flashesSuppressed]).toEqual([0, 0]);
  });

  it('fades the playfield dim in, holds it and fades it back', () => {
    const effects = createScreenEffects();
    effects.dim(0.5, 20);
    const levels: number[] = [];
    for (let k = 0; k < 40; k++) {
      effects.step(1);
      levels.push(Math.round(effects.dimAlpha * 1000) / 1000);
    }
    expect(levels[0]).toBeCloseTo(0.5 / DIM_FADE_IN_TICKS);
    expect(levels[DIM_FADE_IN_TICKS - 1]).toBe(0.5);
    expect(levels[19]).toBe(0.5);
    expect(levels[20]).toBeLessThan(0.5);
    expect(levels[35]).toBe(0);
    effects.dim(2, 30);
    effects.step(DIM_FADE_IN_TICKS);
    expect(effects.dimAlpha).toBe(1);
    effects.dim(0, 0);
    effects.step(1);
    expect(effects.dimAlpha).toBe(0);
  });

  it('never allocates when effects are requested and stepped', () => {
    const effects = createScreenEffects();
    const bytes = measureAllocation(
      (tick) => {
        if (tick % 30 === 0) effects.shake(ShakeMagnitude.Medium, 20);
        if (tick % 45 === 0) effects.flash(tick % 3, 12);
        if (tick % 200 === 0) effects.dim(0.5, 60);
        effects.step(1);
        if (effects.shakeX + effects.shakeY + effects.flashAlpha + effects.dimAlpha < -1000) {
          throw new Error('unreachable');
        }
      },
      10_000,
      20_000,
    );
    expect(bytes).toBeLessThan(64 * 1024);
  });
});

describe('render-pixi/effects score popups', () => {
  const manifest = testManifest();
  const atlas = createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
  const font = createBitmapFont(atlas);

  /**
   * The visible glyph quads.
   *
   * @param container - The popups' container.
   * @returns `[x, y, tint]` per visible quad.
   */
  const quads = (container: Container) =>
    (container.children as Container[])
      .flatMap((pool) => pool.children as Sprite[])
      .filter((s) => s.visible)
      .map((s) => [s.x, s.y, s.tint]);

  it('rises from the scoring point, blinks at the end and disappears after 40 ticks', () => {
    const popups = createScorePopups({ atlas, font });
    expect([popups.capacity, popups.ticks]).toEqual([SCORE_POPUP_SLOTS, SCORE_POPUP_TICKS]);
    expect(popups.show(300, 200, 100, SCORE_POPUP_COLOR)).toBe(true);
    popups.sync({ x: 0, y: 0 });
    // Three 6-px digits centred on x = 200; top = 100 + PLAYFIELD_Y − 3 (half the 6-px cell).
    expect(quads(popups.container)).toEqual([
      [191, 100 + PLAYFIELD_Y - 3, SCORE_POPUP_COLOR],
      [197, 100 + PLAYFIELD_Y - 3, SCORE_POPUP_COLOR],
      [203, 100 + PLAYFIELD_Y - 3, SCORE_POPUP_COLOR],
    ]);
    popups.step(8);
    popups.sync({ x: 0, y: 0 });
    expect(quads(popups.container)[0][1]).toBe(100 + PLAYFIELD_Y - 3 - 2);
    const shown: number[] = [];
    for (let age = 9; age < 42; age++) {
      popups.step(1);
      popups.sync({ x: 0, y: 0 });
      shown.push(quads(popups.container).length);
    }
    // Ages 30…39 blink (hidden when bit 1 is set); age 40 is gone.
    expect(shown.slice(0, 21).every((n) => n === 3)).toBe(true);
    expect(shown.slice(21, 31)).toEqual([0, 0, 3, 3, 0, 0, 3, 3, 0, 0]);
    expect(shown.slice(31)).toEqual([0, 0]);
    expect(popups.liveCount).toBe(0);
  });

  it('converts with the camera and keeps the number inside the playfield', () => {
    const popups = createScorePopups({ atlas, font });
    popups.show(1000, 1005, 0, BONUS_POPUP_COLOR);
    popups.sync({ x: 1000, y: 0 });
    const [first] = quads(popups.container);
    expect(first[0]).toBe(12 - 12);
    expect(first[1]).toBe(PLAYFIELD_Y);
    expect(first[2]).toBe(BONUS_POPUP_COLOR);
    popups.clear();
    popups.show(5, 900, 999, SCORE_POPUP_COLOR);
    popups.sync({ x: 0, y: 0 });
    const [only] = quads(popups.container);
    expect(only[0]).toBe(PLAYFIELD_W - 12 - 3);
    expect(popups.show(0.5, 0, 0, 0)).toBe(false);
    expect(popups.show(Number.NaN, 0, 0, 0)).toBe(false);
  });

  it('replaces the oldest popup when all slots are in use', () => {
    const popups = createScorePopups({ atlas, font, capacity: 2 });
    popups.show(1, 100, 50, SCORE_POPUP_COLOR);
    popups.step(1);
    popups.show(2, 150, 50, SCORE_POPUP_COLOR);
    popups.show(3, 200, 50, SCORE_POPUP_COLOR);
    expect(popups.liveCount).toBe(2);
    popups.sync({ x: 0, y: 0 });
    expect(quads(popups.container).map(([x]) => x + 3)).toEqual([200, 150]);
    expect(() => createScorePopups({ atlas, font, capacity: 0 })).toThrow(RangeError);
    expect(() => createScorePopups({ atlas, font, ticks: 1.5 })).toThrow(RangeError);
  });

  it('shows, ages and draws popups without allocating', () => {
    const popups = createScorePopups({ atlas, font });
    const camera = { x: 0, y: 0 };
    const bytes = measureAllocation(
      (tick) => {
        if (tick % 5 === 0) popups.show(100 * (1 + (tick % 7)), 50 + (tick % 300), 90, 0xf8f8f8);
        popups.step(1);
        camera.x = tick % 3;
        popups.sync(camera);
      },
      10_000,
      20_000,
    );
    expect(bytes).toBeLessThan(256 * 1024);
  });
});
