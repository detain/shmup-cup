/**
 * Tests for the fx gallery (`?scene=fx-gallery`, plan M1-14): its stations (every preset, then
 * the shakes, flashes, the dim and the popups), bursts three times per station from the game's
 * tick (never skipped by a multi-tick frame, frozen while the tick stands still), the station
 * label swapped only on a change, the screen effects it starts, and no allocation per frame.
 */
import { LayerId, createDrawList, type RenderFrame, type ScreenView } from '@shmup/core';
import {
  createScreenEffects,
  type FxContent,
  type ParticleSystem,
  type ScorePopups,
} from '@shmup/render-pixi';
import { describe, expect, it } from 'vitest';
import {
  FX_GALLERY_EXTRAS,
  FX_GALLERY_SPRITES,
  FX_GALLERY_STATION_TICKS,
  createFxGallery,
  moduleInfo,
} from '../../src/fx-gallery/index.js';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';

/** Fake particles with two presets and a call log. */
function fakeFx() {
  const calls: unknown[][] = [];
  const content = {
    presets: [{ id: 'explosion.small' }, { id: 'spark' }],
    triggers: [],
  } as unknown as FxContent;
  const particles = {
    content,
    emit: (...args: unknown[]) => {
      calls.push(['emit', ...args]);
      return 1;
    },
  } as unknown as ParticleSystem;
  const popups = {
    show: (...args: unknown[]) => {
      calls.push(['show', ...args]);
      return true;
    },
  } as unknown as ScorePopups;
  return { calls, particles, popups, effects: createScreenEffects() };
}

/** A game frame at a tick. */
function source(tick: number): RenderFrame & { tick: number } {
  const screen: ScreenView = { shakeX: 0, shakeY: 0, flash: 0, dim: 0 };
  return { tick, alpha: 0, world: null, hud: createDrawList(1), ui: createDrawList(1), screen };
}

describe('shell/fx-gallery', () => {
  it('describes itself and lists every preset, then the screen effects', () => {
    expect(moduleInfo.name).toBe('fx-gallery');
    expect(moduleInfo.status).toBe('implemented');
    const gallery = createFxGallery(fakeFx());
    expect(gallery.stations).toEqual(['explosion.small', 'spark', ...FX_GALLERY_EXTRAS]);
    expect(gallery.spriteNames).toBe(FX_GALLERY_SPRITES);
    expect(gallery.station).toBe(-1);
    expect(gallery.world.batches.map((batch) => batch.layer)).toEqual([
      LayerId.BgFar,
      LayerId.BgMid,
    ]);
    expect(gallery.world.camera).toEqual({ x: 0, y: 0 });
  });

  it('bursts each preset three times per station, from the tick, without skipping', () => {
    const fx = fakeFx();
    const gallery = createFxGallery(fx);
    // Frames of 3 ticks: every pulse (each 20 ticks) still fires once.
    for (let tick = 0; tick < 2 * FX_GALLERY_STATION_TICKS; tick += 3) {
      gallery.update(source(tick));
    }
    expect(fx.calls).toEqual([
      ['emit', 0, 192, 100, 1],
      ['emit', 0, 192, 100, 1],
      ['emit', 0, 192, 100, 1],
      ['emit', 1, 192, 100, 1],
      ['emit', 1, 192, 100, 1],
      ['emit', 1, 192, 100, 1],
    ]);
    expect(gallery.station).toBe(1);
    // A paused game (the same tick) fires nothing.
    for (let i = 0; i < 10; i++) gallery.update(source(119));
    expect(fx.calls).toHaveLength(6);
  });

  it('names the station in the UI list, rebuilding it only when the station changes', () => {
    const gallery = createFxGallery(fakeFx());
    gallery.update(source(0));
    const ui = gallery.frame.ui;
    expect(ui.strings[0]).toBe(`1/${gallery.stations.length}  EXPLOSION.SMALL`);
    const revision = ui.revision;
    gallery.update(source(20));
    gallery.update(source(40));
    expect(ui.revision).toBe(revision);
    gallery.update(source(60));
    expect(ui.strings[0]).toBe(`2/${gallery.stations.length}  SPARK`);
    expect(ui.revision).toBeGreaterThan(revision);
  });

  it('runs the shake, flash, dim and popup stations on the renderer effects', () => {
    const fx = fakeFx();
    const gallery = createFxGallery(fx);
    const at = (name: string): number => gallery.stations.indexOf(name) * FX_GALLERY_STATION_TICKS;
    gallery.update(source(at('shake.large')));
    fx.effects.step(1);
    expect(fx.effects.shakeAmount).toBe(4);
    gallery.update(source(at('flash.warning')));
    fx.effects.step(1);
    expect(fx.effects.flashColor).toBe(0xf85858);
    gallery.update(source(at('dim')));
    fx.effects.step(8);
    expect(fx.effects.dimAlpha).toBeCloseTo(0.5);
    fx.calls.length = 0;
    gallery.update(source(at('popups')));
    expect(fx.calls.map((call) => call[0])).toEqual(['show', 'show']);
    // The frame copies the game's tick and screen.
    const game = source(at('popups') + 1);
    expect(gallery.update(game).screen).toBe(game.screen);
    expect(gallery.frame.tick).toBe(game.tick);
    // It wraps around to the first preset.
    fx.calls.length = 0;
    gallery.update(source(gallery.stations.length * FX_GALLERY_STATION_TICKS));
    expect(fx.calls).toEqual([['emit', 0, 192, 100, 1]]);
  });

  it('works without particles or popups (a renderer with no atlas)', () => {
    const gallery = createFxGallery({
      particles: null,
      popups: null,
      effects: createScreenEffects(),
    });
    expect(gallery.stations).toEqual(FX_GALLERY_EXTRAS);
    for (let tick = 0; tick < FX_GALLERY_EXTRAS.length * FX_GALLERY_STATION_TICKS; tick++) {
      gallery.update(source(tick));
    }
    expect(gallery.station).toBe(FX_GALLERY_EXTRAS.length - 1);
  });

  it('allocates nothing per frame', () => {
    const fx = fakeFx();
    const gallery = createFxGallery({ ...fx, particles: { ...fx.particles, emit: () => 0 } });
    const frame = source(0);
    const growth = measureHeapGrowth(
      (tick) => {
        frame.tick = tick;
        gallery.update(frame);
      },
      10_000,
      20_000,
    );
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });
});
