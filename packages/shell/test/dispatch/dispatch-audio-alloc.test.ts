/**
 * Allocation guard of the audio event path (plan M1-15, zero allocation per frame — plan §1.3):
 * draining a frame's worth of `Sfx` / `Music` / `MusicDuck` events (at whole-pixel world
 * positions, as the sim pushes them, with a scrolling fractional camera) through
 * `connectAudioEvents` into a numbers-only target allocates nothing. (Starting a real sound
 * creates a Web Audio source node — the one allocation the audio engine cannot avoid.) Kept in
 * its own file, away from suites that build many objects (see docs/dev/conventions.md).
 */
import { MUSIC_CUES, SFX_CUES, SimEventKind, createEventQueue } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';
import {
  connectAudioEvents,
  createEventDispatcher,
  type AudioEventTarget,
} from '../../src/dispatch/index.js';

/** Sums what it receives (so nothing is optimised away). */
class SumTarget implements AudioEventTarget {
  total = 0;
  playSfx(cue: number, screenX: number, priority: number): number {
    this.total += cue + screenX + priority;
    return 0;
  }
  playMusic(cue: number, fadeTicks: number): void {
    this.total += cue + fadeTicks;
  }
  duckMusic(ticks: number): void {
    this.total += ticks;
  }
}

/** A camera with its own hidden class (a shared `{ x, y }` literal shape can box its doubles). */
class Camera {
  x = 0.5;
  y = 0;
}

describe('shell/dispatch connectAudioEvents allocation', () => {
  it('drains a frame of audio events without allocating', () => {
    const target = new SumTarget();
    const dispatcher = createEventDispatcher();
    const camera = new Camera();
    connectAudioEvents(dispatcher, target, camera);
    const queue = createEventQueue();
    const growth = measureHeapGrowth(
      (tick) => {
        camera.x = 0.5 + tick * 0.25;
        const x = Math.floor(camera.x) + (tick % 97);
        queue.push(SimEventKind.Sfx, SFX_CUES.PlayerShot, x, 40, 0);
        if (tick % 3 === 0) queue.push(SimEventKind.Sfx, SFX_CUES.EnemyHit, x, 40, 0);
        if (tick % 120 === 0) queue.push(SimEventKind.Music, MUSIC_CUES.Stage, 0, 0, 0);
        if (tick % 300 === 0) queue.push(SimEventKind.MusicDuck, 0, 0, 0, 120);
        dispatcher.drain(queue);
      },
      10_000,
      20_000,
    );
    expect(dispatcher.dispatched).toBeGreaterThan(13_000);
    expect(target.total).toBeGreaterThan(0);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });
});
