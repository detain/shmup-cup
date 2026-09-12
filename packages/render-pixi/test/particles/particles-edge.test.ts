/**
 * Edge cases of the particles module (plan M1-14) beyond `particles.test.ts`:
 *
 * - `loadFxContent` / `parseFxContent`: every schema bound (count, ranges, frames, angles, ids,
 *   sprite names, trigger offsets, file-level caps) drops the file with a precise issue path;
 *   several inverted ranges on one preset; duplicates inside one file; triggers naming a dropped
 *   preset; triggers resolved across files; the files of a broken file dropped with it; the
 *   result independent of the host's file order (and the input array untouched); the four-a-cue
 *   cap counted per event kind; frozen, copied results; `fxSpriteNames` dedupe;
 * - the shipped presets: every burst of one event fits the pool, every SFX trigger names a sound
 *   that implies a visual (plan M1-14 "As built");
 * - the pool: capacity checks, intensity (0, negative, fractions, infinity) and the 64-a-burst
 *   cap, odd preset indices, `step` clamping (0, negative, NaN, fractions, the 60-tick cut),
 *   lifetime and delay ranges drawn inside their bounds, lifetime 1, launch speed / direction /
 *   cone / radius / negative gravity, recycling by age (not by slot) after removals shuffled the
 *   pool, a recycled particle waiting for the next step, a missing sprite drawn as `ui/missing`,
 *   whole-pixel sprite positions without `-0`, hand-built content (a fifth trigger for one cue,
 *   an out-of-range cue, duplicate preset ids), seeds (default = 1, 0 and 2³²−1 work), the
 *   presentation RNG never touching `Math.random`, and `destroy`.
 *
 * Regression (found by these tests): `emit` with a fractional preset index (`0.5`) returned
 * `NaN` instead of 0 — it read `pCount[0.5]` (undefined) and multiplied it.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FX_CUES, FX_CUE_NAMES, SFX_CUES, SFX_CUE_NAMES } from '@shmup/core';
import type { Sprite } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import {
  MAX_PARTICLE_STEP,
  MAX_TRIGGERS_PER_CUE,
  PARTICLE_CAPACITY,
  createParticleSystem,
  fxSpriteNames,
  loadFxContent,
  parseFxContent,
  type FxContent,
  type FxTriggerDef,
  type ParticleSystem,
} from '../../src/particles/index.js';
import { pageImages, testManifest } from '../helpers.js';

const contentRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'content',
);

/** @returns The small test atlas (sprite `ships/a`: 3 frames 16×9, anchor 8, 4; `bg/tile` anchor 0). */
function testAtlas(): Atlas {
  const manifest = testManifest();
  return createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
}

/**
 * An `fx` document.
 *
 * @param presets - Preset entries.
 * @param triggers - Trigger entries.
 * @returns The document.
 */
const doc = (presets: unknown[], triggers: unknown[] = []) => ({
  formatVersion: 1,
  kind: 'fx',
  presets,
  triggers,
});

/**
 * A still, single-particle preset.
 *
 * @param id - Preset id.
 * @param life - Lifetime in ticks.
 * @param extra - Fields to add or override.
 * @returns The preset entry.
 */
const still = (id: string, life = 9, extra: Record<string, unknown> = {}) => ({
  id,
  sprite: 'ships/a',
  count: 1,
  speed: { min: 0, max: 0 },
  lifetime: { min: life, max: life },
  ...extra,
});

/**
 * Parses a document that must be valid.
 *
 * @param data - The document.
 * @returns Its content.
 */
function valid(data: unknown): FxContent {
  const { content, issues } = parseFxContent(data, 'fx/test.fx.json');
  expect(issues).toEqual([]);
  return content;
}

/**
 * A system over the test atlas.
 *
 * @param content - Its content.
 * @param extra - Other options (capacity, seed …).
 * @returns The system.
 */
function system(
  content: FxContent,
  extra: { capacity?: number; seed?: number; offsetY?: number } = {},
): ParticleSystem {
  return createParticleSystem({ atlas: testAtlas(), content, offsetY: 0, ...extra });
}

/**
 * The visible sprites of a system (normal group, then additive).
 *
 * @param particles - The system.
 * @returns The visible sprites.
 */
function visibleSprites(particles: ParticleSystem): Sprite[] {
  const out: Sprite[] = [];
  for (const group of particles.container.children) {
    for (const child of group.children as Sprite[]) if (child.visible) out.push(child);
  }
  return out;
}

/**
 * Positions of the visible particles' anchors (sprite position + the test sprite's anchor 8, 4).
 *
 * @param particles - The system (synced).
 * @returns `[x, y]` per visible particle.
 */
function anchors(particles: ParticleSystem): Array<[number, number]> {
  return visibleSprites(particles).map((sprite) => [sprite.x + 8, sprite.y + 4]);
}

/**
 * Steps and syncs.
 *
 * @param particles - The system.
 * @param ticks - Ticks to step.
 */
function advance(particles: ParticleSystem, ticks = 1): void {
  particles.step(ticks);
  particles.sync({ x: 0, y: 0 });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('render-pixi/particles content — schema bounds (edges)', () => {
  const cases: Array<[string, unknown, string]> = [
    ['count 0', still('p', 9, { count: 0 }), 'presets[0].count'],
    ['count above 64', still('p', 9, { count: 65 }), 'presets[0].count'],
    ['fractional count', still('p', 9, { count: 1.5 }), 'presets[0].count'],
    ['lifetime 0', still('p', 0), 'presets[0].lifetime.min'],
    ['lifetime above 600', still('p', 601), 'presets[0].lifetime.min'],
    ['fractional lifetime', still('p', 2.5), 'presets[0].lifetime.min'],
    ['speed above 16', still('p', 9, { speed: { min: 0, max: 17 } }), 'presets[0].speed.max'],
    ['negative speed', still('p', 9, { speed: { min: -1, max: 1 } }), 'presets[0].speed.min'],
    ['delay above 120', still('p', 9, { delay: { min: 0, max: 121 } }), 'presets[0].delay.max'],
    ['drag above 0.5', still('p', 9, { drag: 0.6 }), 'presets[0].drag'],
    ['gravity above 1', still('p', 9, { gravity: 2 }), 'presets[0].gravity'],
    ['radius above 64', still('p', 9, { radius: 65 }), 'presets[0].radius'],
    ['spread above 360', still('p', 9, { spread: 361 }), 'presets[0].spread'],
    ['direction beyond ±360', still('p', 9, { direction: -400 }), 'presets[0].direction'],
    ['empty frames', still('p', 9, { frames: [] }), 'presets[0].frames'],
    ['33 frames', still('p', 9, { frames: new Array(33).fill(0) }), 'presets[0].frames'],
    ['frame 256', still('p', 9, { frames: [256] }), 'presets[0].frames[0]'],
    ['negative frame', still('p', 9, { frames: [-1] }), 'presets[0].frames[0]'],
    ['upper-case id', still('Bad_ID'), 'presets[0].id'],
    ['id with a trailing dot', still('bad.'), 'presets[0].id'],
    ['upper-case sprite', still('p', 9, { sprite: 'Fx/Spark' }), 'presets[0].sprite'],
    ['sprite with a trailing slash', still('p', 9, { sprite: 'fx/' }), 'presets[0].sprite'],
    ['unknown blend', still('p', 9, { blend: 'multiply' }), 'presets[0].blend'],
  ];

  for (const [name, preset, path] of cases) {
    it(`rejects ${name} at ${path} (and drops the file)`, () => {
      const { content, issues } = parseFxContent(doc([preset]), 'fx/x.fx.json');
      expect(content.presets).toEqual([]);
      expect(issues.map((issue) => issue.path)).toContain(`fx/x.fx.json:${path}`);
    });
  }

  it('rejects bad trigger fields: event, cue name, offsets, a missing preset', () => {
    const bad: Array<[unknown, string]> = [
      [{ event: 'music', cue: 'Debris', preset: 'p' }, 'triggers[0].event'],
      [{ event: 'fx', cue: '1Debris', preset: 'p' }, 'triggers[0].cue'],
      [{ event: 'fx', cue: 'Debris', preset: 'p', dx: 65 }, 'triggers[0].dx'],
      [{ event: 'fx', cue: 'Debris', preset: 'p', dy: -65 }, 'triggers[0].dy'],
      [{ event: 'fx', cue: 'Debris' }, 'triggers[0].preset'],
    ];
    for (const [trigger, path] of bad) {
      const { content, issues } = parseFxContent(doc([still('p')], [trigger]));
      expect(content.triggers, path).toEqual([]);
      expect(content.presets, path).toEqual([]);
      expect(
        issues.map((issue) => issue.path),
        path,
      ).toContain(path);
    }
  });

  it('caps a file at 64 presets and 128 triggers', () => {
    const presets = Array.from({ length: 65 }, (_, i) => still(`p${i}`));
    expect(parseFxContent(doc(presets)).issues[0]?.path).toBe('presets');
    const triggers = Array.from({ length: 129 }, () => ({
      event: 'fx',
      cue: 'Debris',
      preset: 'p0',
    }));
    expect(parseFxContent(doc([still('p0')], triggers)).issues[0]?.path).toBe('triggers');
  });

  it('accepts the extremes of every bound', () => {
    const content = valid(
      doc([
        {
          id: 'max',
          sprite: 'ships/a',
          frames: new Array(32).fill(255),
          count: 64,
          speed: { min: 16, max: 16 },
          direction: -360,
          spread: 360,
          gravity: -1,
          drag: 0.5,
          lifetime: { min: 600, max: 600 },
          delay: { min: 120, max: 120 },
          radius: 64,
          blend: 'normal',
        },
        { ...still('min', 1), speed: { min: 0, max: 0 }, direction: 360, spread: 0 },
      ]),
    );
    expect(content.presets.map((preset) => preset.id)).toEqual(['max', 'min']);
  });

  it('accepts a file without triggers, and reports a non-object with the file path alone', () => {
    const { content, issues } = parseFxContent({ formatVersion: 1, kind: 'fx', presets: [] });
    expect([content.presets, content.triggers, issues]).toEqual([[], [], []]);
    expect(parseFxContent(42, 'fx/n.fx.json').issues).toEqual([
      { path: 'fx/n.fx.json', message: 'must be an object' },
    ]);
    expect(parseFxContent([], 'fx/n.fx.json').issues[0]?.path).toBe('fx/n.fx.json');
  });
});

describe('render-pixi/particles content — cross-checks (edges)', () => {
  it('reports every inverted range of one preset and drops it once', () => {
    const { content, issues } = parseFxContent(
      doc([
        {
          ...still('bad'),
          speed: { min: 3, max: 1 },
          lifetime: { min: 9, max: 2 },
          delay: { min: 5, max: 4 },
        },
        still('good'),
      ]),
    );
    expect(issues.map((issue) => issue.path)).toEqual([
      'presets[0].speed',
      'presets[0].lifetime',
      'presets[0].delay',
    ]);
    expect(content.presets.map((preset) => preset.id)).toEqual(['good']);
  });

  it('drops a duplicate id inside one file, and a trigger naming a dropped preset', () => {
    const { content, issues } = parseFxContent(
      doc(
        [still('a', 3), still('a', 7), { ...still('b'), speed: { min: 2, max: 1 } }],
        [
          { event: 'fx', cue: 'Debris', preset: 'a' },
          { event: 'fx', cue: 'Debris', preset: 'b' },
        ],
      ),
    );
    expect(content.presets.map((preset) => [preset.id, preset.lifetime.min])).toEqual([['a', 3]]);
    expect(issues).toEqual([
      { path: 'presets[1].id', message: 'duplicate preset id "a"' },
      { path: 'presets[2].speed', message: 'min must not be greater than max' },
      { path: 'triggers[1].preset', message: 'unknown preset "b"' },
    ]);
    expect(content.triggers.map((trigger) => trigger.preset)).toEqual(['a']);
  });

  it('resolves a trigger against a preset of another file (whatever the order)', () => {
    const presets = { path: 'fx/b.fx.json', data: doc([still('x'), still('y')]) };
    const triggers = {
      path: 'fx/a.fx.json',
      data: doc([], [{ event: 'fx', cue: 'BossChain', preset: 'y', dx: -3 }]),
    };
    for (const files of [
      [presets, triggers],
      [triggers, presets],
    ]) {
      const { content, issues } = loadFxContent(files);
      expect(issues).toEqual([]);
      expect(content.triggers).toEqual([
        {
          event: 'fx',
          cue: 'BossChain',
          cueId: FX_CUES.BossChain,
          preset: 'y',
          presetIndex: 1,
          dx: -3,
          dy: 0,
        },
      ]);
    }
  });

  it('drops the triggers of a file that fails the schema along with its presets', () => {
    const { content, issues } = loadFxContent([
      {
        path: 'fx/a.fx.json',
        data: { ...doc([still('p')], [{ event: 'fx', cue: 'Debris', preset: 'p' }]), extra: 1 },
      },
      { path: 'fx/b.fx.json', data: doc([still('q')]) },
    ]);
    expect(content.presets.map((preset) => preset.id)).toEqual(['q']);
    expect(content.triggers).toEqual([]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path.startsWith('fx/a.fx.json')).toBe(true);
  });

  it('gives the same result for any file order and leaves the host array untouched', () => {
    const files = [
      { path: 'fx/c.fx.json', data: doc([still('c')]) },
      { path: 'fx/a.fx.json', data: doc([still('a'), still('c', 2)]) },
      {
        path: 'fx/b.fx.json',
        data: doc([still('b')], [{ event: 'sfx', cue: 'Clink', preset: 'c' }]),
      },
    ];
    const paths = files.map((file) => file.path);
    const forward = loadFxContent(files);
    const backward = loadFxContent(files.slice().reverse());
    expect(files.map((file) => file.path)).toEqual(paths);
    expect(backward).toEqual(forward);
    // Path order: a (a, c), b (b), c (a duplicate "c", dropped).
    expect(forward.content.presets.map((preset) => preset.id)).toEqual(['a', 'c', 'b']);
    expect(forward.content.triggers[0]?.presetIndex).toBe(1);
    expect(forward.issues).toEqual([
      { path: 'fx/c.fx.json:presets[0].id', message: 'duplicate preset id "c"' },
    ]);
  });

  it('counts the four-presets-a-cue cap per event kind (FX cue 0 ≠ SFX cue 0)', () => {
    const four = (event: string, cue: string) =>
      Array.from({ length: MAX_TRIGGERS_PER_CUE }, () => ({ event, cue, preset: 'p' }));
    const content = valid(
      doc([still('p')], [...four('fx', FX_CUE_NAMES[0]), ...four('sfx', SFX_CUE_NAMES[0])]),
    );
    expect(content.triggers).toHaveLength(2 * MAX_TRIGGERS_PER_CUE);
  });

  it('freezes the content and copies the frame list', () => {
    const frames = [0, 1];
    const content = valid(
      doc([{ ...still('p'), frames }], [{ event: 'fx', cue: 'Debris', preset: 'p' }]),
    );
    frames.push(2);
    const [preset] = content.presets;
    expect(preset.frames).toEqual([0, 1]);
    for (const value of [
      content,
      content.presets,
      content.triggers,
      preset,
      preset.frames,
      preset.speed,
      preset.lifetime,
      preset.delay,
      content.triggers[0],
    ]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });

  it('applies the documented defaults', () => {
    const [preset] = valid(doc([still('p')])).presets;
    expect(preset).toEqual({
      id: 'p',
      sprite: 'ships/a',
      frames: null,
      count: 1,
      speed: { min: 0, max: 0 },
      direction: 0,
      spread: 360,
      gravity: 0,
      drag: 0,
      lifetime: { min: 9, max: 9 },
      delay: { min: 0, max: 0 },
      radius: 0,
      blend: 'add',
    });
  });

  it('lists each sprite once, in preset order; none for empty content', () => {
    const content = valid(
      doc([
        still('a', 9, { sprite: 'fx/b' }),
        still('b', 9, { sprite: 'fx/a' }),
        still('c', 9, { sprite: 'fx/b' }),
      ]),
    );
    expect(fxSpriteNames(content)).toEqual(['fx/b', 'fx/a']);
    expect(fxSpriteNames(valid(doc([])))).toEqual([]);
  });
});

describe('render-pixi/particles shipped presets (content/fx/particles.fx.json)', () => {
  const shipped = loadFxContent([
    {
      path: 'fx/particles.fx.json',
      data: JSON.parse(readFileSync(join(contentRoot, 'fx/particles.fx.json'), 'utf8')) as unknown,
    },
  ]);

  it('fits every event burst in the pool, even at the largest intensity', () => {
    expect(shipped.issues).toEqual([]);
    const { presets, triggers } = shipped.content;
    const perCue = new Map<string, number>();
    for (const trigger of triggers) {
      const key = `${trigger.event}:${trigger.cue}`;
      const burst = Math.min(64, presets[trigger.presetIndex].count * 4);
      perCue.set(key, (perCue.get(key) ?? 0) + burst);
    }
    for (const [cue, total] of perCue) expect(total, cue).toBeLessThanOrEqual(PARTICLE_CAPACITY);
  });

  it('binds only the sounds that imply a visual (hit, clink, pickups, shot)', () => {
    const sfx = shipped.content.triggers
      .filter((trigger) => trigger.event === 'sfx')
      .map((trigger) => [trigger.cue, trigger.preset]);
    expect(sfx).toEqual([
      ['EnemyHit', 'spark'],
      ['Clink', 'clink'],
      ['MeterAdvance', 'pickup'],
      ['CapsulePickup', 'pickup'],
      ['PlayerShot', 'muzzle'],
    ]);
    const shield = shipped.content.triggers.find((trigger) => trigger.cue === 'ShieldBreak');
    expect(shield?.preset).toBe('shield.break');
  });

  it('keeps every particle short-lived (≤ 1 s) so the pool drains between waves', () => {
    for (const preset of shipped.content.presets) {
      expect(preset.lifetime.max + preset.delay.max, preset.id).toBeLessThanOrEqual(60);
    }
  });
});

describe('render-pixi/particles pool (edges)', () => {
  it('rejects a capacity that is not a positive integer; capacity 1 works', () => {
    const atlas = testAtlas();
    for (const capacity of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createParticleSystem({ atlas, capacity }), String(capacity)).toThrow(RangeError);
    }
    const one = system(valid(doc([still('p')])), { capacity: 1 });
    expect(one.capacity).toBe(1);
    expect(one.container.children.map((group) => group.children.length)).toEqual([1, 1]);
    expect(one.emit(0, 0, 0, 3)).toBe(3);
    expect([one.liveCount, one.recycled]).toEqual([1, 2]);
  });

  it('clamps the intensity (0 / negative / NaN → 1, fractions floored, ≥ 4 → 4) and caps a burst at 64', () => {
    const particles = system(
      valid(
        doc([
          { ...still('few'), count: 3 },
          { ...still('many'), count: 20 },
        ]),
      ),
    );
    const burst = (preset: number, intensity: number): number => {
      particles.clear();
      return particles.emit(preset, 0, 0, intensity);
    };
    expect(burst(0, 0)).toBe(3);
    expect(burst(0, -2)).toBe(3);
    expect(burst(0, Number.NaN)).toBe(3);
    expect(burst(0, 1.99)).toBe(3);
    expect(burst(0, 2.5)).toBe(6);
    expect(burst(0, 3.999)).toBe(9);
    expect(burst(0, Number.POSITIVE_INFINITY)).toBe(12);
    expect(burst(0, Number.NEGATIVE_INFINITY)).toBe(3);
    expect(burst(1, 3)).toBe(60);
    expect(burst(1, 4)).toBe(64);
    expect(particles.liveCount).toBe(64);
  });

  it('spawns nothing (0) for an unknown or fractional preset index (regression: NaN)', () => {
    const particles = system(valid(doc([still('a'), still('b')])));
    for (const preset of [-1, 2, 99, 0.5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(particles.emit(preset, 0, 0, 1), String(preset)).toBe(0);
    }
    expect(particles.liveCount).toBe(0);
    expect(particles.emit(1, 0, 0, 1)).toBe(1);
  });

  it('ignores steps of 0, negative, NaN or less than one tick, floors fractions, cuts at 60', () => {
    const particles = system(valid(doc([still('p', 100)])));
    particles.emit(0, 0, 0, 1);
    for (const ticks of [0, -3, Number.NaN, 0.99, Number.NEGATIVE_INFINITY]) {
      particles.step(ticks);
    }
    particles.sync({ x: 0, y: 0 });
    expect(particles.visibleCount).toBe(0); // still waiting: no step happened
    particles.step(1.9); // one tick: revealed at age 0
    particles.sync({ x: 0, y: 0 });
    expect(particles.visibleCount).toBe(1);
    // 1 + 60 (cut from 1000) = 61 ticks of a 100-tick life: alive.
    particles.step(1000);
    expect(particles.liveCount).toBe(1);
    expect(MAX_PARTICLE_STEP).toBe(60);
    particles.step(Number.POSITIVE_INFINITY); // another 60: 121 > 100 → gone
    expect(particles.liveCount).toBe(0);
  });

  it('draws each particle for exactly `lifetime` steps (lifetime 1 = one frame)', () => {
    const particles = system(valid(doc([still('flash', 1), still('three', 3)])));
    particles.emit(0, 0, 0, 1);
    particles.emit(1, 50, 0, 1);
    const counts: number[] = [];
    for (let i = 0; i < 5; i++) {
      advance(particles);
      counts.push(particles.visibleCount);
    }
    expect(counts).toEqual([2, 1, 1, 0, 0]);
  });

  it('draws lifetimes and delays inside their ranges, spread over them', () => {
    const particles = system(
      valid(
        doc([
          {
            ...still('life'),
            count: 64,
            lifetime: { min: 3, max: 6 },
          },
          {
            ...still('late'),
            count: 64,
            lifetime: { min: 50, max: 50 },
            delay: { min: 0, max: 4 },
          },
        ]),
      ),
      { capacity: 128 },
    );
    particles.emit(0, 0, 0, 1);
    const alive: number[] = [];
    for (let i = 0; i < 8; i++) {
      particles.step(1);
      alive.push(particles.liveCount);
    }
    // Every life is 3…6: all alive through step 3, all gone by step 7, some dying on the way.
    expect(alive[2]).toBe(64);
    expect(alive[6]).toBe(0);
    for (let i = 1; i < alive.length; i++) expect(alive[i]).toBeLessThanOrEqual(alive[i - 1]);
    expect(alive[3]).toBeLessThan(64);
    expect(alive[5]).toBeGreaterThan(0);

    particles.clear();
    particles.emit(1, 0, 0, 1);
    const shown: number[] = [];
    for (let i = 0; i < 7; i++) {
      advance(particles);
      shown.push(particles.visibleCount);
    }
    // Delays 0…4: some show on the first step, all by the fifth.
    expect(shown[0]).toBeGreaterThan(0);
    expect(shown[0]).toBeLessThan(64);
    expect(shown[4]).toBe(64);
    for (let i = 1; i < shown.length; i++) expect(shown[i]).toBeGreaterThanOrEqual(shown[i - 1]);
  });

  it('launches along the direction: 90° = straight down, −90° = up, 180° = left', () => {
    for (const [direction, dx, dy] of [
      [90, 0, 3],
      [-90, 0, -3],
      [180, -3, 0],
      [0, 3, 0],
    ] as const) {
      const particles = system(
        valid(doc([{ ...still('p', 20), speed: { min: 3, max: 3 }, direction, spread: 0 }])),
      );
      particles.emit(0, 100, 100, 1);
      advance(particles); // revealed at the spawn point
      expect(anchors(particles)).toEqual([[100, 100]]);
      advance(particles, 2);
      expect(anchors(particles), `direction ${direction}`).toEqual([[100 + 2 * dx, 100 + 2 * dy]]);
    }
  });

  it('keeps launches inside the cone and the speed range', () => {
    const particles = system(
      valid(
        doc([
          {
            ...still('cone', 20),
            count: 64,
            speed: { min: 10, max: 10 },
            direction: 0,
            spread: 90,
          },
          {
            ...still('ring', 20),
            count: 64,
            speed: { min: 4, max: 12 },
          },
        ]),
      ),
      { capacity: 64 },
    );
    particles.emit(0, 200, 100, 1);
    advance(particles, 2); // one tick of movement
    for (const [x, y] of anchors(particles)) {
      const dx = x - 200;
      const dy = y - 100;
      // ±45° around 0°: dx ≥ 10·cos 45° (rounded), |dy| ≤ dx.
      expect(dx).toBeGreaterThanOrEqual(7 - 1);
      expect(Math.abs(dy)).toBeLessThanOrEqual(dx + 1);
    }
    particles.clear();
    particles.emit(1, 200, 100, 1);
    advance(particles, 2);
    const speeds = anchors(particles).map(([x, y]) => Math.hypot(x - 200, y - 100));
    for (const speed of speeds) {
      expect(speed).toBeGreaterThanOrEqual(4 - 1);
      expect(speed).toBeLessThanOrEqual(12 + 1);
    }
    expect(Math.min(...speeds)).toBeLessThan(7);
    expect(Math.max(...speeds)).toBeGreaterThan(9);
    // A full-circle burst goes every way.
    const quadrants = new Set(
      anchors(particles).map(([x, y]) => `${Math.sign(x - 200)},${Math.sign(y - 100)}`),
    );
    expect(quadrants.size).toBeGreaterThanOrEqual(4);
  });

  it('scatters the start over the radius, and negative gravity lifts', () => {
    const particles = system(
      valid(
        doc([
          { ...still('scatter', 20), count: 32, radius: 10 },
          { ...still('rise', 20), gravity: -0.5 },
        ]),
      ),
    );
    particles.emit(0, 100, 100, 1);
    advance(particles);
    const points = anchors(particles);
    for (const [x, y] of points) expect(Math.hypot(x - 100, y - 100)).toBeLessThanOrEqual(11);
    expect(new Set(points.map(([x, y]) => `${x},${y}`)).size).toBeGreaterThan(8);
    particles.clear();
    particles.emit(1, 100, 100, 1);
    advance(particles); // revealed
    advance(particles, 4); // vy −0.5, −1, −1.5, −2 → y 100 − 0 − 0.5 − 1 − 1.5 = 97
    expect(anchors(particles)).toEqual([[100, 97]]);
  });

  it('recycles the oldest particle by age, not by slot, after removals shuffled the pool', () => {
    const particles = system(valid(doc([still('short', 2), still('long', 100)])), { capacity: 3 });
    particles.emit(0, 10, 0, 1); // A (dies after 2 ticks)
    particles.emit(1, 20, 0, 1); // B
    particles.emit(1, 30, 0, 1); // C
    particles.step(3); // A dies: C moves into its slot
    expect(particles.liveCount).toBe(2);
    particles.emit(1, 40, 0, 1); // D takes the free slot
    expect(particles.recycled).toBe(0);
    particles.emit(1, 50, 0, 1); // E replaces the oldest: B (not slot 0's C)
    expect(particles.recycled).toBe(1);
    advance(particles);
    expect(
      anchors(particles)
        .map(([x]) => x)
        .sort((a, b) => a - b),
    ).toEqual([30, 40, 50]);
  });

  it('a recycled particle starts over: hidden until the next step, at its new place', () => {
    const particles = system(valid(doc([still('p', 50)])), { capacity: 1 });
    particles.emit(0, 10, 10, 1);
    advance(particles);
    expect(anchors(particles)).toEqual([[10, 10]]);
    particles.emit(0, 70, 30, 1);
    particles.sync({ x: 0, y: 0 });
    expect(particles.visibleCount).toBe(0);
    advance(particles);
    expect(anchors(particles)).toEqual([[70, 30]]);
  });

  it('hides the sprites of particles that died or were cleared', () => {
    const particles = system(valid(doc([still('p', 2), { ...still('q', 2), blend: 'normal' }])), {
      capacity: 8,
    });
    for (let i = 0; i < 4; i++) particles.emit(i & 1, 10 * i, 0, 1);
    advance(particles);
    expect(visibleSprites(particles)).toHaveLength(4);
    particles.clear();
    particles.sync({ x: 0, y: 0 });
    expect(visibleSprites(particles)).toHaveLength(0);
    expect(particles.visibleCount).toBe(0);
    for (let i = 0; i < 4; i++) particles.emit(i & 1, 10 * i, 0, 1);
    advance(particles, 3);
    expect(visibleSprites(particles)).toHaveLength(0);
  });

  it('draws a sprite the atlas lacks as ui/missing (every listed frame too)', () => {
    const atlas = testAtlas();
    const content = valid(
      doc([
        still('gone', 4, { sprite: 'fx/nope' }),
        still('gone2', 4, { sprite: 'fx/nope', frames: [0, 3] }),
      ]),
    );
    const particles = createParticleSystem({ atlas, content });
    particles.emit(0, 0, 0, 1);
    particles.emit(1, 0, 0, 1);
    for (let i = 0; i < 4; i++) {
      advance(particles);
      for (const sprite of visibleSprites(particles)) {
        expect(sprite.texture).toBe(atlas.textures[atlas.missingFrame]);
      }
      expect(particles.visibleCount).toBe(2);
    }
  });

  it('places sprites on whole pixels and never at -0', () => {
    const content = valid(doc([still('p', 5, { sprite: 'bg/tile' })]));
    const particles = createParticleSystem({ atlas: testAtlas(), content, offsetY: 0 });
    particles.emit(0, -0.3, -0.4, 1);
    particles.step(1);
    particles.sync({ x: 0, y: 0 });
    const [sprite] = visibleSprites(particles);
    expect(Object.is(sprite.x, -0)).toBe(false);
    expect(Object.is(sprite.y, -0)).toBe(false);
    expect([sprite.x, sprite.y]).toEqual([0, 0]);
    particles.sync({ x: 0.6, y: -1.6 });
    expect([sprite.x, sprite.y]).toEqual([-1, 1]);
    expect(Number.isInteger(sprite.x) && Number.isInteger(sprite.y)).toBe(true);
  });

  it('uses hand-built content defensively: four presets a cue, cues out of range ignored, first id wins', () => {
    const base = valid(doc([still('a'), { ...still('b'), count: 2 }, still('a2')]));
    const trigger = (cueId: number, presetIndex: number): FxTriggerDef => ({
      event: 'fx',
      cue: FX_CUE_NAMES[cueId] ?? 'Nope',
      cueId,
      preset: base.presets[presetIndex].id,
      presetIndex,
      dx: 0,
      dy: 0,
    });
    const content: FxContent = {
      presets: [base.presets[0], base.presets[1], { ...base.presets[2], id: 'a' }],
      triggers: [
        trigger(FX_CUES.Debris, 1),
        trigger(FX_CUES.Debris, 1),
        trigger(FX_CUES.Debris, 1),
        trigger(FX_CUES.Debris, 1),
        trigger(FX_CUES.Debris, 0), // a fifth: no room
        trigger(99, 0),
        trigger(-1, 0),
      ],
    };
    const particles = system(content, { capacity: 64 });
    expect(particles.emitFxCue(FX_CUES.Debris, 0, 0, 1)).toBe(8);
    expect(particles.emitFxCue(99, 0, 0, 1)).toBe(0);
    expect(particles.presetIndex('a')).toBe(0);
    expect(particles.content).toBe(content);
  });

  it('fires SFX triggers at intensity 1 whatever the cue, and rejects odd cue ids', () => {
    const particles = system(
      valid(doc([{ ...still('p'), count: 2 }], [{ event: 'sfx', cue: 'Clink', preset: 'p' }])),
    );
    expect(particles.emitSfxCue(SFX_CUES.Clink, 0, 0)).toBe(2);
    for (const cue of [Number.NaN, -1, SFX_CUES.Clink + 0.5, 1e9]) {
      expect(particles.emitSfxCue(cue, 0, 0), String(cue)).toBe(0);
      expect(particles.emitFxCue(cue, 0, 0, 1), String(cue)).toBe(0);
    }
  });

  it('setContent resets the recycled count and re-resolves the frames', () => {
    const particles = system(valid(doc([still('p', 50)])), { capacity: 2 });
    for (let i = 0; i < 5; i++) particles.emit(0, 0, 0, 1);
    expect(particles.recycled).toBe(3);
    const next = valid(doc([still('q', 5), still('p', 5)]));
    particles.setContent(next);
    expect([particles.liveCount, particles.recycled, particles.presetIndex('p')]).toEqual([
      0, 0, 1,
    ]);
    expect(particles.content).toBe(next);
  });

  it('is seeded: no seed = seed 1; 0 and 2³²−1 are fine and differ from 1', () => {
    const content = valid(
      doc([{ ...still('burst', 30), count: 16, speed: { min: 0.5, max: 3 }, radius: 4 }]),
    );
    const run = (seed?: number): Array<[number, number]> => {
      const particles = createParticleSystem({
        atlas: testAtlas(),
        content,
        offsetY: 0,
        ...(seed === undefined ? {} : { seed }),
      });
      particles.emit(0, 190, 100, 1);
      advance(particles, 6);
      return anchors(particles);
    };
    expect(run()).toEqual(run(1));
    expect(run(0)).toEqual(run(0));
    expect(run(0)).not.toEqual(run(1));
    expect(run(0xffffffff)).not.toEqual(run(1));
  });

  it('never calls Math.random (presentation RNG only) and destroys its sprites', () => {
    const random = vi.spyOn(Math, 'random');
    const particles = system(
      valid(
        doc([
          {
            ...still('burst', 30),
            count: 32,
            speed: { min: 0.5, max: 3 },
            radius: 4,
            delay: { min: 0, max: 3 },
            lifetime: { min: 10, max: 30 },
          },
        ]),
      ),
    );
    for (let i = 0; i < 20; i++) {
      particles.emit(0, 100, 100, 2);
      advance(particles);
    }
    expect(random).not.toHaveBeenCalled();
    const sprite = visibleSprites(particles)[0];
    particles.destroy();
    expect(particles.container.destroyed).toBe(true);
    expect(sprite.destroyed).toBe(true);
  });
});
