/**
 * Allocation guard of the game-feel event path (plan M1-14, zero allocation per frame — plan
 * §1.3): draining a frame's worth of World-like events (particle cues, hit / clink / shot sounds,
 * score popups, shake, flash, dim — at whole-pixel positions, as the sim pushes them) through
 * `connectFxEvents` into the real render-pixi particle system (shipped presets, pipeline atlas),
 * screen effects and score popups, then stepping and syncing them like the renderer does,
 * allocates nothing. Kept in its own file, away from suites that build many objects (see
 * docs/dev/conventions.md). Gold bonus popups are left out here: a slot switching colour re-tints
 * its quads once, at `show` time, and Pixi's tint setter allocates — `effects-edge.test.ts` checks
 * that no quad is re-tinted on the frames in between.
 */
import { FX_CUES, FlashKind, SFX_CUES, SimEventKind, createEventQueue } from '@shmup/core';
import {
  createAtlas,
  createBitmapFont,
  createParticleSystem,
  createScorePopups,
  createScreenEffects,
  loadFxContent,
} from '@shmup/render-pixi';
import { describe, expect, it } from 'vitest';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import { readContentFiles } from '../../../../vite.shared.js';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';
import { connectFxEvents, createEventDispatcher } from '../../src/dispatch/index.js';

/** A camera with its own hidden class (a shared `{ x, y }` literal shape can box its doubles). */
class Camera {
  x = 0.5;
  y = 0;
}

describe('shell/dispatch connectFxEvents allocation', () => {
  it('drains, emits, steps and syncs the game feel without allocating', () => {
    const { manifest } = buildAtlas();
    const atlas = createAtlas(
      manifest,
      manifest.pages.map((page) => ({ width: page.w, height: page.h }) as HTMLImageElement),
    );
    const { content } = loadFxContent(
      readContentFiles().filter((file) => file.path.startsWith('fx/')),
    );
    const particles = createParticleSystem({ atlas, content, seed: 5 });
    const popups = createScorePopups({ atlas, font: createBitmapFont(atlas) });
    const effects = createScreenEffects();
    const dispatcher = createEventDispatcher();
    connectFxEvents(dispatcher, { particles, effects, popups });
    const queue = createEventQueue();
    const camera = new Camera();
    const growth = measureHeapGrowth(
      (tick) => {
        // The camera scrolls on (a new position every frame, as in play); the events land on
        // screen, at whole pixels.
        camera.x = 0.5 + tick * 0.25;
        const x = Math.floor(camera.x) + 120 + (tick % 97);
        const y = 40 + (tick % 61);
        queue.push(SimEventKind.Sfx, SFX_CUES.PlayerShot, x, y, 0);
        if (tick % 3 === 0) queue.push(SimEventKind.Sfx, SFX_CUES.EnemyHit, x, y, 0);
        if (tick % 7 === 0) queue.push(SimEventKind.Sfx, SFX_CUES.Clink, x, y, 0);
        if (tick % 11 === 0) {
          queue.push(SimEventKind.Particles, FX_CUES.ExplosionSmall, x, y, 1);
          queue.push(SimEventKind.Score, 0, x, y, 100);
        }
        if (tick % 29 === 0) queue.push(SimEventKind.Particles, FX_CUES.ExplosionLarge, x, y, 1);
        if (tick % 13 === 0) queue.push(SimEventKind.Particles, FX_CUES.BulletCancel, x, y, 1);
        if (tick % 40 === 0) queue.push(SimEventKind.Shake, 20, 0, 0, 2);
        if (tick % 45 === 0) queue.push(SimEventKind.Flash, FlashKind.Warning, 0, 0, 8);
        if (tick % 300 === 0) queue.push(SimEventKind.Dim, 50, 0, 0, 60);
        dispatcher.drain(queue);
        effects.step(1);
        particles.step(1);
        popups.step(1);
        particles.sync(camera);
        popups.sync(camera);
      },
      10_000,
      20_000,
    );
    expect(dispatcher.dispatched).toBeGreaterThan(30_000);
    expect(popups.liveCount).toBeGreaterThan(0);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });
});
