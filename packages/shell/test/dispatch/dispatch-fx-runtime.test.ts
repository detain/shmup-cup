/**
 * The game feel end to end (plan M1-14): headless games on the shipped content and stages, their
 * events drained every tick through `connectFxEvents` into the real render-pixi particles
 * (shipped `content/fx/` presets on the pipeline atlas), screen effects and score popups, stepped
 * one tick per frame the way the renderer steps them:
 *
 * - the test range with autofire: kills burst into particles and pop their points (every
 *   `Score` event credited to player 1 at whole pixels, never more points than the board holds),
 *   the pool never exceeds its 256 particles, and the presentation RNG leaves the sim alone (a
 *   session with the effects connected hashes like one without);
 * - the shipped test boss fought down: the drawn shake equals the sim's `shakeAmount` on every
 *   tick (explosions, the final blast, hit-stop included), the flash shows exactly while the
 *   sim's flash timer runs (the WARNING pulses and the blast — none dropped by the limiter),
 *   the playfield dims during the WARNING, the boss parts and the tally pop up (the tally gold).
 */
import {
  BossState,
  KNOWN_SCRIPT_IDS,
  SimEventKind,
  checkEnemyBehaviors,
  createGame,
  createHeadlessPlatform,
  hashWorld,
  loadContent,
  shakeAmount,
  type ContentDb,
  type Game,
} from '@shmup/core';
import {
  BONUS_POPUP_COLOR,
  PARTICLE_CAPACITY,
  SCORE_POPUP_COLOR,
  createAtlas,
  createBitmapFont,
  createParticleSystem,
  createScorePopups,
  createScreenEffects,
  loadFxContent,
  type ParticleSystem,
  type ScorePopups,
  type ScreenEffects,
} from '@shmup/render-pixi';
import { describe, expect, it } from 'vitest';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import { readContentFiles } from '../../../../vite.shared.js';
import {
  connectFxEvents,
  createEventDispatcher,
  type EventDispatcher,
} from '../../src/dispatch/index.js';

/** The shipped content DB (asserted issue-free). */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(readContentFiles(), { knownScripts: KNOWN_SCRIPT_IDS });
  expect(issues).toEqual([]);
  expect(checkEnemyBehaviors(db)).toEqual([]);
  return db;
})();

/** The pipeline atlas (fake page images: Node has no decoder). */
const ATLAS = (() => {
  const { manifest } = buildAtlas();
  return createAtlas(
    manifest,
    manifest.pages.map((page) => ({ width: page.w, height: page.h }) as HTMLImageElement),
  );
})();

/** The shipped fx content. */
const FX = (() => {
  const { content, issues } = loadFxContent(
    readContentFiles().filter((file) => file.path.startsWith('fx/')),
  );
  expect(issues).toEqual([]);
  return content;
})();

/** What a host wires for one session. */
interface Presentation {
  /** The dispatcher, with the fx handlers connected. */
  readonly dispatcher: EventDispatcher;
  /** Particles. */
  readonly particles: ParticleSystem;
  /** Shake, flash and dim. */
  readonly effects: ScreenEffects;
  /** Score popups. */
  readonly popups: ScorePopups;
  /** Popups requested, `[points, colour]`. */
  readonly shown: Array<[number, number]>;
  /** Score events, `[player, x, y, points]`. */
  readonly scores: number[][];
}

/**
 * A host's presentation for a session.
 *
 * @param seed - Seed of the particles' RNG.
 * @returns The wiring.
 */
function presentation(seed: number): Presentation {
  const particles = createParticleSystem({ atlas: ATLAS, content: FX, seed });
  const realPopups = createScorePopups({ atlas: ATLAS, font: createBitmapFont(ATLAS) });
  const shown: Array<[number, number]> = [];
  const popups = {
    ...realPopups,
    get liveCount() {
      return realPopups.liveCount;
    },
    show(points: number, x: number, y: number, color: number) {
      if (points >= 1) shown.push([points, color]);
      return realPopups.show(points, x, y, color);
    },
  } as ScorePopups;
  const effects = createScreenEffects();
  const dispatcher = createEventDispatcher();
  connectFxEvents(dispatcher, { particles, effects, popups });
  const scores: number[][] = [];
  dispatcher.on(SimEventKind.Score, (event) =>
    scores.push([event.id, event.x, event.y, event.param]),
  );
  return { dispatcher, particles, effects, popups, shown, scores };
}

/**
 * One frame of one tick: the game steps, the events are drained, the effects advance.
 *
 * @param g - The game.
 * @param p - The presentation.
 */
function frame(g: Game, p: Presentation): void {
  g.step();
  g.events.drain(p.dispatcher.visit);
  p.effects.step(1);
  p.particles.step(1);
  p.popups.step(1);
  p.particles.sync(g.world.camera);
}

/** What one session on the shipped test range showed ({@link rangeRun}). */
interface RangeRun {
  /** The game with the effects connected, after the run. */
  readonly game: Game;
  /** Its presentation. */
  readonly p: Presentation;
  /** `[tick, hash with the effects, hash of the twin without]`, every 500 ticks and at the end. */
  readonly hashes: Array<readonly [number, number, number]>;
  /** The most particles live at once. */
  readonly most: number;
  /** Kill bursts (`Particles` events). */
  readonly bursts: number;
  /** Formation bonus points. */
  readonly bonuses: number;
  /** Formation bonus events worth a point or more. */
  readonly bonusEvents: number;
}

/** The test range's run, played once per file ({@link rangeRun}). */
let rangeRunMemo: RangeRun | null = null;

/**
 * The shipped test range played for 4000 ticks with autofire in god mode, its events drained into
 * the real effects, next to a twin game with nothing connected. Played once and shared by the
 * tests that read it: whichever runs first plays it.
 *
 * @returns The run.
 */
function rangeRun(): RangeRun {
  if (rangeRunMemo) return rangeRunMemo;
  const game = createGame(createHeadlessPlatform(), { seed: 21, stage: 'test-range' }, DB);
  game.world.debugFlags.godMode = true;
  const twin = createGame(createHeadlessPlatform(), { seed: 21, stage: 'test-range' }, DB);
  twin.world.debugFlags.godMode = true;
  const p = presentation(5);
  const hashes: Array<readonly [number, number, number]> = [];
  let most = 0;
  let bursts = 0;
  let bonuses = 0;
  let bonusEvents = 0;
  p.dispatcher.on(SimEventKind.Particles, () => bursts++);
  p.dispatcher.on(SimEventKind.FormationBonus, (event) => {
    bonuses += event.param;
    if (event.param >= 1) bonusEvents++;
  });
  for (let t = 0; t < 4000; t++) {
    frame(game, p);
    twin.step();
    twin.events.clear();
    if (p.particles.liveCount > most) most = p.particles.liveCount;
    if (t % 500 === 0) hashes.push([t, hashWorld(game.world), hashWorld(twin.world)]);
  }
  hashes.push([4000, hashWorld(game.world), hashWorld(twin.world)]);
  rangeRunMemo = { game, p, hashes, most, bursts, bonuses, bonusEvents };
  return rangeRunMemo;
}

describe('shell/dispatch game feel end to end (shipped content)', () => {
  it('bursts and pops the kills of the test range; the sim does not notice', () => {
    const { game, p, hashes, most, bursts, bonuses, bonusEvents } = rangeRun();
    for (const [t, connected, bare] of hashes) expect(connected, `tick ${t}`).toBe(bare);
    expect(bursts).toBeGreaterThan(0);
    expect(most).toBeGreaterThan(0);
    expect(most).toBeLessThanOrEqual(PARTICLE_CAPACITY);
    expect(p.scores.length).toBeGreaterThan(0);
    for (const [player, x, y, points] of p.scores) {
      expect(player).toBe(0);
      expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
      expect(Number.isInteger(points) && points >= 1).toBe(true);
    }
    const popped = p.scores.reduce((sum, [, , , points]) => sum + points, 0);
    expect(popped + bonuses).toBeLessThanOrEqual(game.world.scoring.board.scores[0].score);
    // One white popup per kill, one gold one per completed formation.
    const colours = (color: number): number => p.shown.filter(([, c]) => c === color).length;
    expect(colours(SCORE_POPUP_COLOR)).toBe(p.scores.length);
    expect(colours(BONUS_POPUP_COLOR)).toBe(bonusEvents);
  });

  // How many it kills comes from the shipped test range's v1-scale placements (R2-01: at 640×360
  // the unported range gives 4 kill bursts and 4 score events, under the 5 asked for) — only these
  // two counts are gated, until R2-02 ports the content.
  it('kills more than five of the test range in 4000 ticks', () => {
    const { p, bursts } = rangeRun();
    expect(bursts).toBeGreaterThan(5);
    expect(p.scores.length).toBeGreaterThan(5);
  });

  it('mirrors the sim shake, flash and dim tick for tick through the test boss fight', () => {
    const g = createGame(
      createHeadlessPlatform(),
      { seed: 4, stage: 'test-boss', loadout: 'full' },
      DB,
    );
    g.world.debugFlags.godMode = true;
    const p = presentation(9);
    const boss = g.world.bosses.boss;
    let shakes = 0;
    let flashes = 0;
    let dimmed = 0;
    let most = 0;
    for (let t = 0; t < 12_000 && boss.state !== BossState.Dead; t++) {
      frame(g, p);
      const fx = g.world.fx;
      expect(p.effects.shakeAmount, `shake at tick ${t}`).toBe(shakeAmount(fx));
      expect(p.effects.flashAlpha > 0, `flash at tick ${t}`).toBe(fx.flashTicks > 0);
      if (shakeAmount(fx) > 0) shakes++;
      if (fx.flashTicks > 0) flashes++;
      if (p.effects.dimAlpha > 0) dimmed++;
      if (p.particles.liveCount > most) most = p.particles.liveCount;
    }
    expect(boss.state).toBe(BossState.Dead);
    // Let the last shake and flash run out, still in step.
    for (let t = 0; t < 120; t++) {
      frame(g, p);
      expect(p.effects.shakeAmount).toBe(shakeAmount(g.world.fx));
      expect(p.effects.flashAlpha > 0).toBe(g.world.fx.flashTicks > 0);
    }
    expect(shakes).toBeGreaterThan(0);
    expect(flashes).toBeGreaterThan(0);
    expect(dimmed).toBeGreaterThan(0);
    expect(p.effects.flashesSuppressed).toBe(0);
    expect(most).toBeLessThanOrEqual(PARTICLE_CAPACITY);
    // Boss parts pop white; the tally pops gold.
    expect(p.scores.length).toBeGreaterThan(0);
    expect(p.shown.filter(([, color]) => color === BONUS_POPUP_COLOR).length).toBeGreaterThan(0);
  });
});
