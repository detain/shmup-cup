/**
 * Edge cases of the fx gallery (`?scene=fx-gallery`, plan M1-14) beyond `fx-gallery.test.ts`:
 *
 * - timing: frames of up to `maxTicksPerFrame` (4) ticks never skip a burst over a whole cycle;
 *   a gallery joined mid-way starts at that station and runs its screen effect at once; a tick
 *   counter that goes back (a new session) restarts the cycle; the screen stations act on their
 *   first pulse only, the popup station on all three (rising points, spread across the screen);
 * - content: every station has a label `i/n  NAME`; the flash stations use the core's
 *   `FLASH_KIND_TICKS`; the starfield covers the playfield for any tile size;
 * - the real particle system with the shipped presets: every preset station spawns particles.
 */
import {
  DEFAULT_GAME_CONFIG,
  FLASH_KIND_TICKS,
  FlashKind,
  PLAYFIELD_H,
  PLAYFIELD_W,
  createDrawList,
  type RenderFrame,
  type ScreenView,
} from '@shmup/core';
import {
  BONUS_POPUP_COLOR,
  SCORE_POPUP_COLOR,
  createAtlas,
  createParticleSystem,
  createScreenEffects,
  loadFxContent,
  type FxContent,
  type ParticleSystem,
  type ScorePopups,
  type ScreenEffects,
} from '@shmup/render-pixi';
import { describe, expect, it } from 'vitest';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import { readContentFiles } from '../../../../vite.shared.js';
import {
  FX_GALLERY_EXTRAS,
  FX_GALLERY_STATION_TICKS,
  createFxGallery,
} from '../../src/fx-gallery/index.js';

/** Fake particles with `n` presets, fake popups and a call log; real screen effects (spied). */
function fakeFx(n = 2) {
  const calls: unknown[][] = [];
  const content = {
    presets: Array.from({ length: n }, (_, i) => ({ id: `preset-${i}` })),
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
  const real = createScreenEffects();
  const effects = {
    get settings() {
      return real.settings;
    },
    shake: (...args: [number, number]) => {
      calls.push(['shake', ...args]);
      return real.shake(...args);
    },
    flash: (...args: [number, number]) => {
      calls.push(['flash', ...args]);
      return real.flash(...args);
    },
    dim: (...args: [number, number]) => {
      calls.push(['dim', ...args]);
      real.dim(...args);
    },
  } as unknown as ScreenEffects;
  return { calls, particles, popups, effects };
}

/**
 * A game frame at a tick.
 *
 * @param tick - The tick.
 * @returns The frame.
 */
function source(tick: number): RenderFrame & { tick: number } {
  const screen: ScreenView = { shakeX: 0, shakeY: 0, flash: 0, dim: 0 };
  return { tick, alpha: 0, world: null, hud: createDrawList(1), ui: createDrawList(1), screen };
}

describe('shell/fx-gallery (edges)', () => {
  it('never skips a burst with frames of up to maxTicksPerFrame ticks, over a whole cycle', () => {
    const fx = fakeFx(3);
    const gallery = createFxGallery(fx);
    const cycle = gallery.stations.length * FX_GALLERY_STATION_TICKS;
    const steps = [1, 4, 2, 3, 4, 4, 1];
    let tick = 0;
    for (let i = 0; tick < cycle; i++) {
      gallery.update(source(tick));
      tick += steps[i % steps.length];
    }
    expect(DEFAULT_GAME_CONFIG.maxTicksPerFrame).toBeLessThanOrEqual(4);
    const kinds = (kind: string): number => fx.calls.filter((call) => call[0] === kind).length;
    // Three bursts per preset, the three shakes, the three flashes, one dim, 3 × 2 popups.
    expect(kinds('emit')).toBe(3 * 3);
    expect(kinds('shake')).toBe(3);
    expect(kinds('flash')).toBe(3);
    expect(kinds('dim')).toBe(1);
    expect(kinds('show')).toBe(6);
  });

  it('joins mid-way at the station of the tick, running its screen effect at once', () => {
    const fx = fakeFx(2);
    const gallery = createFxGallery(fx);
    const station = gallery.stations.indexOf('flash.boss-blast');
    // The last pulse of the station.
    gallery.update(source(station * FX_GALLERY_STATION_TICKS + 45));
    expect(gallery.station).toBe(station);
    expect(fx.calls).toEqual([
      ['flash', FlashKind.BossBlast, FLASH_KIND_TICKS[FlashKind.BossBlast]],
    ]);
    expect(gallery.frame.ui.strings[0]).toBe(
      `${station + 1}/${gallery.stations.length}  FLASH.BOSS-BLAST`,
    );
  });

  it('restarts the cycle when the tick counter goes back', () => {
    const fx = fakeFx(2);
    const gallery = createFxGallery(fx);
    gallery.update(source(5 * FX_GALLERY_STATION_TICKS));
    fx.calls.length = 0;
    gallery.update(source(0));
    expect(gallery.station).toBe(0);
    expect(fx.calls).toEqual([['emit', 0, PLAYFIELD_W / 2, PLAYFIELD_H / 2, 1]]);
  });

  it('acts on the first pulse of a screen station only, and on every pulse of the popups', () => {
    const fx = fakeFx(0);
    const gallery = createFxGallery(fx);
    const at = (name: string): number => gallery.stations.indexOf(name) * FX_GALLERY_STATION_TICKS;
    for (const name of ['shake.medium', 'flash.warning', 'dim']) {
      fx.calls.length = 0;
      for (let t = 0; t < FX_GALLERY_STATION_TICKS; t++) gallery.update(source(at(name) + t));
      expect(fx.calls, name).toHaveLength(1);
    }
    fx.calls.length = 0;
    for (let t = 0; t < FX_GALLERY_STATION_TICKS; t++) gallery.update(source(at('popups') + t));
    const cx = PLAYFIELD_W / 2;
    const cy = PLAYFIELD_H / 2;
    expect(fx.calls).toEqual([
      ['show', 100, cx - 96, cy, SCORE_POPUP_COLOR],
      ['show', 1000, cx - 96, cy + 32, BONUS_POPUP_COLOR],
      ['show', 200, cx, cy, SCORE_POPUP_COLOR],
      ['show', 2000, cx, cy + 32, BONUS_POPUP_COLOR],
      ['show', 300, cx + 96, cy, SCORE_POPUP_COLOR],
      ['show', 3000, cx + 96, cy + 32, BONUS_POPUP_COLOR],
    ]);
  });

  it('labels every station "i/n  NAME" in order', () => {
    const fx = fakeFx(2);
    const gallery = createFxGallery(fx);
    const labels: string[] = [];
    for (let i = 0; i < gallery.stations.length; i++) {
      gallery.update(source(i * FX_GALLERY_STATION_TICKS));
      labels.push(gallery.frame.ui.strings[0] ?? '');
    }
    const n = gallery.stations.length;
    expect(n).toBe(2 + FX_GALLERY_EXTRAS.length);
    expect(labels).toEqual(gallery.stations.map((s, i) => `${i + 1}/${n}  ${s.toUpperCase()}`));
    expect(Object.isFrozen(gallery.stations)).toBe(true);
    expect(gallery.frame.hud.strings.slice(0, 2)).toEqual(['FX GALLERY', '?SCENE=FX-GALLERY']);
  });

  it('covers the playfield with the starfield for any tile size', () => {
    for (const starTileSize of [64, 100, 128, 500]) {
      const gallery = createFxGallery(fakeFx(0), { starTileSize });
      const [far, mid] = gallery.world.batches;
      const columns = Math.ceil(PLAYFIELD_W / starTileSize);
      const rows = Math.ceil(PLAYFIELD_H / starTileSize);
      expect(far.count, String(starTileSize)).toBe(columns * rows);
      expect(mid.count).toBe(columns * rows);
      expect(columns * starTileSize).toBeGreaterThanOrEqual(PLAYFIELD_W);
      expect(rows * starTileSize).toBeGreaterThanOrEqual(PLAYFIELD_H);
    }
  });

  it('spawns particles at every preset station with the shipped presets', () => {
    const { manifest } = buildAtlas();
    const atlas = createAtlas(
      manifest,
      manifest.pages.map((page) => ({ width: page.w, height: page.h }) as HTMLImageElement),
    );
    const { content } = loadFxContent(
      readContentFiles().filter((file) => file.path.startsWith('fx/')),
    );
    const particles = createParticleSystem({ atlas, content });
    const gallery = createFxGallery({ particles, effects: createScreenEffects(), popups: null });
    expect(gallery.stations.slice(0, content.presets.length)).toEqual(
      content.presets.map((preset) => preset.id),
    );
    for (let i = 0; i < content.presets.length; i++) {
      particles.clear();
      gallery.update(source(i * FX_GALLERY_STATION_TICKS));
      expect(particles.liveCount, content.presets[i].id).toBe(content.presets[i].count);
    }
    // The popup station without popups does nothing (and does not throw).
    expect(() =>
      gallery.update(source(gallery.stations.indexOf('popups') * FX_GALLERY_STATION_TICKS)),
    ).not.toThrow();
  });
});
