/**
 * Edge cases of connectFxEvents() (plan M1-14) beyond `dispatch-fx.test.ts`, against the real
 * render-pixi effects (and fakes where a call log is clearer):
 *
 * - the flash limiter applies to event floods (five `Flash` events in one drain: three start);
 *   a weaker `Shake` event does not cut a stronger one; a `Dim` level is `id / 100`, clamped;
 * - particle intensity (`param`) is passed through as is, positions are floored (negative,
 *   large, fractional), an SFX burst ignores `param`;
 * - popups: a 0-point `Score` shows nothing; a player 2 score is white like player 1's;
 * - two connections double the handlers and unplug independently; disconnecting while a drain
 *   runs lets the siblings of the current event run and stops the next events; handlers never
 *   keep the reused event record;
 * - the World's own events through a real queue: an enemy kill's `Particles` / `Sfx` / `Score`
 *   reach the shipped presets and a popup.
 */
import {
  FX_CUES,
  FlashKind,
  SFX_CUES,
  SimEventKind,
  createEventQueue,
  type SimEvent,
} from '@shmup/core';
import {
  FLASH_LIMIT,
  FLASH_LOOKS,
  SCORE_POPUP_COLOR,
  createAtlas,
  createBitmapFont,
  createParticleSystem,
  createScorePopups,
  createScreenEffects,
  loadFxContent,
  type ParticleSystem,
  type ScorePopups,
} from '@shmup/render-pixi';
import { describe, expect, it } from 'vitest';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import { readContentFiles } from '../../../../vite.shared.js';
import { connectFxEvents, createEventDispatcher } from '../../src/dispatch/index.js';

/** Records the calls a fake particle system and fake popups receive. */
function fakes() {
  const calls: unknown[][] = [];
  const records: unknown[] = [];
  const particles = {
    emitFxCue: (...args: unknown[]) => calls.push(['fx', ...args]),
    emitSfxCue: (...args: unknown[]) => calls.push(['sfx', ...args]),
  } as unknown as ParticleSystem;
  const popups = {
    show: (...args: unknown[]) => calls.push(['popup', ...args]),
  } as unknown as ScorePopups;
  return { calls, records, particles, popups, effects: createScreenEffects() };
}

/**
 * The shipped fx content over the pipeline atlas.
 *
 * @returns Particles and popups on the real atlas.
 */
function shippedParts(): { particles: ParticleSystem; popups: ScorePopups } {
  const { manifest } = buildAtlas();
  const atlas = createAtlas(
    manifest,
    manifest.pages.map((page) => ({ width: page.w, height: page.h }) as HTMLImageElement),
  );
  const { content, issues } = loadFxContent(
    readContentFiles().filter((file) => file.path.startsWith('fx/')),
  );
  expect(issues).toEqual([]);
  return {
    particles: createParticleSystem({ atlas, content }),
    popups: createScorePopups({ atlas, font: createBitmapFont(atlas) }),
  };
}

describe('shell/dispatch connectFxEvents (edges)', () => {
  it('lets the flash limiter drop a flood of Flash events (three start in one drain)', () => {
    const { particles, popups, effects } = fakes();
    const dispatcher = createEventDispatcher();
    connectFxEvents(dispatcher, { particles, effects, popups });
    const queue = createEventQueue();
    for (let i = 0; i < 5; i++) queue.push(SimEventKind.Flash, FlashKind.MegaCrash, 0, 0, 12);
    dispatcher.drain(queue);
    expect(effects.flashesSuppressed).toBe(5 - FLASH_LIMIT);
    effects.step(1);
    expect(effects.flashAlpha).toBeCloseTo(FLASH_LOOKS[FlashKind.MegaCrash].alpha);
    expect(effects.flashAdditive).toBe(true);
  });

  it('keeps a stronger shake against a weaker Shake event, and reads Dim as a percentage', () => {
    const { particles, popups, effects } = fakes();
    const dispatcher = createEventDispatcher();
    connectFxEvents(dispatcher, { particles, effects, popups });
    const queue = createEventQueue();
    queue.push(SimEventKind.Shake, 40, 0, 0, 4);
    queue.push(SimEventKind.Shake, 40, 0, 0, 1);
    queue.push(SimEventKind.Dim, 35, 0, 0, 100);
    dispatcher.drain(queue);
    effects.step(8);
    expect(effects.shakeAmount).toBe(4);
    expect(effects.dimAlpha).toBeCloseTo(0.35, 12);
    queue.push(SimEventKind.Dim, 250, 0, 0, 100);
    dispatcher.drain(queue);
    effects.step(8);
    expect(effects.dimAlpha).toBe(1);
  });

  it('passes the intensity through, floors every position and ignores param for SFX bursts', () => {
    const { calls, particles, popups, effects } = fakes();
    const dispatcher = createEventDispatcher();
    connectFxEvents(dispatcher, { particles, effects, popups });
    const queue = createEventQueue();
    queue.push(SimEventKind.Particles, FX_CUES.Debris, -0.5, -100.25, 3);
    queue.push(SimEventKind.Particles, FX_CUES.Debris, 123_456.9, 0.999, 0);
    queue.push(SimEventKind.Sfx, SFX_CUES.Clink, 5.5, 6.5, 7);
    dispatcher.drain(queue);
    expect(calls).toEqual([
      ['fx', FX_CUES.Debris, -1, -101, 3],
      ['fx', FX_CUES.Debris, 123_456, 0, 0],
      ['sfx', SFX_CUES.Clink, 5, 6],
    ]);
    for (const call of calls) {
      for (const value of call.slice(2, 4)) expect(Object.is(value, -0)).toBe(false);
    }
  });

  it('shows no popup for 0 points, and player 2 scores in the same white', () => {
    const { particles, popups } = shippedParts();
    const effects = createScreenEffects();
    const dispatcher = createEventDispatcher();
    connectFxEvents(dispatcher, { particles, effects, popups });
    const queue = createEventQueue();
    queue.push(SimEventKind.Score, 0, 10, 20, 0);
    queue.push(SimEventKind.BossDefeated, 3, 10, 20, 0);
    dispatcher.drain(queue);
    expect(popups.liveCount).toBe(0);
    const log = fakes();
    const other = createEventDispatcher();
    connectFxEvents(other, log);
    queue.push(SimEventKind.Score, 1, 10, 20, 500);
    other.drain(queue);
    expect(log.calls).toEqual([['popup', 500, 10, 20, SCORE_POPUP_COLOR]]);
  });

  it('doubles the handlers for two connections and unplugs each on its own', () => {
    const first = fakes();
    const second = fakes();
    const dispatcher = createEventDispatcher();
    const offFirst = connectFxEvents(dispatcher, first);
    const offSecond = connectFxEvents(dispatcher, second);
    for (const kind of [
      SimEventKind.Particles,
      SimEventKind.Sfx,
      SimEventKind.Shake,
      SimEventKind.Flash,
      SimEventKind.Dim,
      SimEventKind.Score,
      SimEventKind.FormationBonus,
      SimEventKind.BossDefeated,
    ]) {
      expect(dispatcher.handlerCount(kind)).toBe(2);
    }
    offFirst();
    const queue = createEventQueue();
    queue.push(SimEventKind.Particles, FX_CUES.Debris, 1, 2, 1);
    dispatcher.drain(queue);
    expect([first.calls.length, second.calls.length]).toEqual([0, 1]);
    offSecond();
    expect(dispatcher.handlerCount(SimEventKind.Particles)).toBe(0);
  });

  it('stops at once when disconnected during a drain, never keeping the event record', () => {
    const { calls, particles, popups, effects } = fakes();
    const dispatcher = createEventDispatcher();
    const seenRecords = new Set<Readonly<SimEvent>>();
    dispatcher.on(SimEventKind.Particles, (event) => seenRecords.add(event));
    let disconnect: () => void = () => {};
    dispatcher.on(SimEventKind.Score, () => disconnect());
    disconnect = connectFxEvents(dispatcher, { particles, effects, popups });
    const queue = createEventQueue();
    queue.push(SimEventKind.Particles, FX_CUES.Debris, 1, 1, 1);
    queue.push(SimEventKind.Score, 0, 2, 2, 100); // unplugs; its own popup handler still runs
    queue.push(SimEventKind.Particles, FX_CUES.Debris, 3, 3, 1);
    queue.push(SimEventKind.Score, 0, 4, 4, 100);
    dispatcher.drain(queue);
    expect(calls).toEqual([
      ['fx', FX_CUES.Debris, 1, 1, 1],
      ['popup', 100, 2, 2, SCORE_POPUP_COLOR],
    ]);
    // The queue hands out one reused record.
    expect(seenRecords.size).toBe(1);
  });

  it('feeds a World-style kill (explosion, hit spark, score) to the shipped presets and a popup', () => {
    const { particles, popups } = shippedParts();
    const effects = createScreenEffects();
    const dispatcher = createEventDispatcher();
    connectFxEvents(dispatcher, { particles, effects, popups });
    const queue = createEventQueue();
    // What core/enemies and core/scoring push for a small enemy's death, in their order.
    queue.push(SimEventKind.Sfx, SFX_CUES.EnemyHit, 200, 90, 0);
    queue.push(SimEventKind.Sfx, SFX_CUES.EnemyExplodeSmall, 200, 90, 0);
    queue.push(SimEventKind.Particles, FX_CUES.ExplosionSmall, 200, 90, 1);
    queue.push(SimEventKind.Score, 0, 200, 90, 100);
    dispatcher.drain(queue);
    const count = (id: string): number =>
      particles.content.presets[particles.presetIndex(id)].count;
    // Hit spark + (explosion + spark); the explosion sound itself has no preset.
    expect(particles.liveCount).toBe(count('spark') + count('explosion.small') + count('spark'));
    expect(popups.liveCount).toBe(1);
    expect(dispatcher.unhandled).toBe(0);
  });
});
