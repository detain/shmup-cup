/**
 * Allocation guard of the cutscene director's idle frame (v2 R7-VID, zero allocation per frame —
 * plan §1.3): the director runs on EVERY drawn frame of a scene-flow boot, and in the state of
 * almost all frames — no clip showing, scene unchanged, escape flag unchanged — its `update` is
 * a handful of field reads, one interned-string comparison and the latch consume. Kept in its
 * own file away from suites that create many objects (docs/dev/conventions.md).
 */
import { describe, expect, it } from 'vitest';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';
import {
  createCutsceneDirector,
  type CutsceneFlow,
  type CutsceneSurface,
} from '../../src/cutscene/index.js';

/** A surface that is never touched while no clip runs (any call would allocate into `urls`). */
class SilentSurface implements CutsceneSurface {
  readonly urls: string[] = [];
  playing = false;
  play(url: string, _loop: boolean): Promise<boolean> {
    this.urls.push(url);
    this.playing = true;
    return Promise.resolve(true);
  }
  stop(): void {}
}

/** The flow: game scene, zone A stage, never escaping (class instance: stable hidden class). */
class IdleFlow implements CutsceneFlow {
  readonly stack = { top: { id: 'game' } };
  readonly run = { stage: 'zone-a', inEscape: false };
}

/** A latch holder in a class field (a boxed closure double would be the bug this guards). */
class Latch {
  value = 0;
}

describe('cutscene — the idle update allocates nothing (guard)', () => {
  it('twenty thousand idle frames of the director fit the house budget', () => {
    const flow = new IdleFlow();
    const surface = new SilentSurface();
    const latch = new Latch();
    const director = createCutsceneDirector({
      flow,
      enabled: true,
      surface,
      anyPressed: () => {
        const pressed = latch.value !== 0;
        latch.value = 0;
        return pressed;
      },
    });
    director.update(0);
    const iterations = 10_000;
    const growth = measureHeapGrowth(
      (step) => {
        // The scene id is the same interned string every frame; a rare real press (every
        // 7th frame the latch holds a number, never pressed) exercises the consume.
        latch.value = step % 7 === 0 ? 2 : 0;
        director.update(step + 1);
      },
      iterations,
      2 * iterations,
    );
    expect(surface.urls).toEqual([]); // nothing ever played
    expect(director.clip).toBeNull();
    expect(growth.bytes).toBeLessThan(16 * 1024);
    director.destroy();
  });
});
