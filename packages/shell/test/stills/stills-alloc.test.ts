/**
 * Allocation guard of the stills director's idle frame (plan v20x A4, zero allocation per frame
 * — conventions § Performance): the director runs on EVERY drawn frame of a scene-flow boot, and
 * in the state of almost all frames — no ending scene, nothing resident — its `update` is a
 * field read, one interned-string comparison and a `null === null` early return. Kept in its own
 * file away from suites that create many objects (docs/dev/conventions.md).
 */
import { describe, expect, it } from 'vitest';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';
import {
  createStillsDirector,
  type StillsFlow,
  type StillsImageLike,
  type StillsSurfaceLike,
} from '../../src/stills/index.js';

/** A surface that is never touched while no still shows (any call would allocate into `urls`). */
class SilentSurface implements StillsSurfaceLike {
  readonly urls: string[] = [];
  shown = false;
  show(_image: StillsImageLike): void {
    this.urls.push('show');
    this.shown = true;
  }
  hide(): void {
    this.urls.push('hide');
    this.shown = false;
  }
  setBand(_band: 'world' | 'screen'): void {
    this.urls.push('band');
  }
}

/** The flow: game scene, no campaign ending selected (class instance: stable hidden class). */
class IdleFlow implements StillsFlow {
  readonly stack = { top: { id: 'game' } };
  readonly run = { ending: null };
}

describe('stills — the idle update allocates nothing (guard)', () => {
  it('twenty thousand idle frames of the director fit the house budget', () => {
    const flow = new IdleFlow();
    const surface = new SilentSurface();
    const director = createStillsDirector({
      flow,
      enabled: true,
      surface,
      loadImage: () => Promise.reject(new Error('the idle watch must never load')),
      closeImage: () => {},
    });
    director.update();
    const iterations = 10_000;
    const growth = measureHeapGrowth(
      () => {
        // The scene id is the same interned string every frame; `run.ending` stays the same
        // `null` — the whole pass is compares, exactly the state of every non-ending frame.
        director.update();
      },
      iterations,
      2 * iterations,
    );
    expect(surface.urls).toEqual([]); // nothing ever shown, hidden or moved
    expect(director.showing).toBe(false);
    expect(growth.bytes).toBeLessThan(16 * 1024);
    director.destroy();
  });
});
