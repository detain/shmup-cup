/**
 * Tests for connectFxEvents() (plan M1-14): every game-feel event kind reaches the right
 * handler with whole-pixel world positions — particle cues and the SFX cues that imply a visual
 * to the particles, shake / flash / dim to the screen effects, kill scores and bonuses to the
 * score popups — and disconnecting removes exactly those handlers. The event → preset mapping
 * itself is checked end to end with the shipped `content/fx/` presets.
 */
import {
  FX_CUES,
  FlashKind,
  SFX_CUES,
  SimEventKind,
  createEventQueue,
  type SimEventKind as SimEventKindCode,
} from '@shmup/core';
import {
  BONUS_POPUP_COLOR,
  SCORE_POPUP_COLOR,
  createAtlas,
  createParticleSystem,
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
  const particles = {
    emitFxCue: (...args: unknown[]) => calls.push(['fx', ...args]),
    emitSfxCue: (...args: unknown[]) => calls.push(['sfx', ...args]),
  } as unknown as ParticleSystem;
  const popups = {
    show: (...args: unknown[]) => calls.push(['popup', ...args]),
  } as unknown as ScorePopups;
  return { calls, particles, popups, effects: createScreenEffects() };
}

describe('shell/dispatch connectFxEvents', () => {
  it('routes every game-feel event with whole-pixel positions', () => {
    const { calls, particles, popups, effects } = fakes();
    const dispatcher = createEventDispatcher();
    connectFxEvents(dispatcher, { particles, effects, popups });
    const queue = createEventQueue();
    queue.push(SimEventKind.Particles, FX_CUES.BossChain, 120.6, 40.2, 1);
    queue.push(SimEventKind.Sfx, SFX_CUES.EnemyHit, 77.9, -3.5, 0);
    queue.push(SimEventKind.Score, 0, 10, 20, 300);
    queue.push(SimEventKind.FormationBonus, 2, 30, 40, 1000);
    queue.push(SimEventKind.BossDefeated, 5, 50, 60, 20000);
    queue.push(SimEventKind.Shake, 20, 0, 0, 2);
    queue.push(SimEventKind.Flash, FlashKind.Warning, 0, 0, 8);
    queue.push(SimEventKind.Dim, 50, 0, 0, 180);
    queue.push(SimEventKind.HitStop, 0, 0, 0, 5);
    dispatcher.drain(queue);
    expect(calls).toEqual([
      ['fx', FX_CUES.BossChain, 120, 40, 1],
      ['sfx', SFX_CUES.EnemyHit, 77, -4],
      ['popup', 300, 10, 20, SCORE_POPUP_COLOR],
      ['popup', 1000, 30, 40, BONUS_POPUP_COLOR],
      ['popup', 20000, 50, 60, BONUS_POPUP_COLOR],
    ]);
    effects.step(1);
    expect(effects.shakeAmount).toBe(2);
    expect(effects.flashColor).toBe(0xf85858);
    expect(effects.dimAlpha).toBeGreaterThan(0);
    // Hit-stop has no presentation handler (the World froze itself).
    expect(dispatcher.unhandled).toBe(1);
  });

  it('skips the particle and popup handlers when the renderer has none, and disconnects', () => {
    const effects = createScreenEffects();
    const dispatcher = createEventDispatcher();
    const disconnect = connectFxEvents(dispatcher, { particles: null, effects, popups: null });
    const kinds: SimEventKindCode[] = [
      SimEventKind.Particles,
      SimEventKind.Sfx,
      SimEventKind.Score,
      SimEventKind.FormationBonus,
      SimEventKind.BossDefeated,
    ];
    for (const kind of kinds) expect(dispatcher.handlerCount(kind)).toBe(0);
    for (const kind of [SimEventKind.Shake, SimEventKind.Flash, SimEventKind.Dim]) {
      expect(dispatcher.handlerCount(kind)).toBe(1);
    }
    disconnect();
    disconnect();
    expect(dispatcher.handlerCount(SimEventKind.Shake)).toBe(0);
    const full = fakes();
    const again = connectFxEvents(dispatcher, full);
    expect(dispatcher.handlerCount(SimEventKind.Sfx)).toBe(1);
    again();
    expect(dispatcher.handlerCount(SimEventKind.Sfx)).toBe(0);
  });

  it('maps the sim cues to the shipped presets (content/fx/particles.fx.json)', () => {
    const { manifest } = buildAtlas();
    const atlas = createAtlas(
      manifest,
      manifest.pages.map((page) => ({ width: page.w, height: page.h }) as HTMLImageElement),
    );
    const { content, issues } = loadFxContent(
      readContentFiles().filter((file) => file.path.startsWith('fx/')),
    );
    expect(issues).toEqual([]);
    const particles = createParticleSystem({ atlas, content });
    const dispatcher = createEventDispatcher();
    connectFxEvents(dispatcher, { particles, effects: createScreenEffects(), popups: null });
    const count = (preset: string): number =>
      content.presets[particles.presetIndex(preset)]?.count ?? -1;
    const burst = (kind: SimEventKindCode, id: number): number => {
      particles.clear();
      const queue = createEventQueue();
      queue.push(kind, id, 100, 100, 1);
      dispatcher.drain(queue);
      return particles.liveCount;
    };
    expect(burst(SimEventKind.Particles, FX_CUES.ExplosionSmall)).toBe(
      count('explosion.small') + count('spark'),
    );
    expect(burst(SimEventKind.Particles, FX_CUES.BulletCancel)).toBe(count('bullet.cancel'));
    expect(burst(SimEventKind.Particles, FX_CUES.BossChain)).toBe(count('boss.chain'));
    expect(burst(SimEventKind.Particles, FX_CUES.Debris)).toBe(count('debris'));
    expect(burst(SimEventKind.Sfx, SFX_CUES.EnemyHit)).toBe(count('spark'));
    expect(burst(SimEventKind.Sfx, SFX_CUES.Clink)).toBe(count('clink'));
    expect(burst(SimEventKind.Sfx, SFX_CUES.MeterAdvance)).toBe(count('pickup'));
    expect(burst(SimEventKind.Sfx, SFX_CUES.PlayerShot)).toBe(count('muzzle'));
    expect(burst(SimEventKind.Sfx, SFX_CUES.MenuMove)).toBe(0);
    for (let cue = 0; cue < Object.keys(FX_CUES).length; cue++) {
      expect(burst(SimEventKind.Particles, cue), `FX cue ${cue}`).toBeGreaterThan(0);
    }
  });
});
