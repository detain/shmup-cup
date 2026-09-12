/**
 * Tests for the particles module (plan M1-14): the `fx` content owner (`loadFxContent` — schema,
 * cross-checks, the shipped `content/fx/` file), the event → preset mapping (`emitFxCue`,
 * `emitSfxCue`), the pool (reveal on the next step, movement, gravity, drag, delay, lifetime,
 * frames over the lifetime, camera conversion, blend groups, recycling the oldest when full,
 * seeded determinism) and pool reuse without allocation.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FX_CUES, FX_CUE_NAMES, PLAYFIELD_Y, SFX_CUES } from '@shmup/core';
import type { Sprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import {
  EMPTY_FX_CONTENT,
  FX_CONTENT_KIND,
  MAX_TRIGGERS_PER_CUE,
  PARTICLE_CAPACITY,
  createParticleSystem,
  fxSpriteNames,
  loadFxContent,
  moduleInfo,
  parseFxContent,
  type FxContent,
} from '../../src/particles/index.js';
import { measureAllocation, pageImages, testManifest } from '../helpers.js';

const contentRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'content',
);

/**
 * Reads a content file.
 *
 * @param path - Path below `content/`.
 * @returns The content file.
 */
const contentFile = (path: string) => ({
  path,
  data: JSON.parse(readFileSync(join(contentRoot, path), 'utf8')) as unknown,
});

/** @returns The small test atlas (sprite `ships/a`: 3 frames 16×9, anchor 8, 4). */
function testAtlas(): Atlas {
  const manifest = testManifest();
  return createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
}

/**
 * An `fx` document over the test atlas.
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

/** A still, single-particle preset of `ships/a` living `life` ticks. */
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
 * The visible sprites of a system, in container order (normal group, then additive).
 *
 * @param container - The system's container.
 * @returns `[x, y, blendMode]` of every visible sprite.
 */
function drawn(container: { children: readonly { children: readonly unknown[] }[] }) {
  const out: Array<[number, number, string]> = [];
  for (const group of container.children) {
    for (const child of group.children as Sprite[]) {
      if (child.visible) out.push([child.x, child.y, child.blendMode]);
    }
  }
  return out;
}

describe('render-pixi/particles content (kind fx)', () => {
  it('describes itself as implemented and owns the fx kind', () => {
    expect(moduleInfo.name).toBe('particles');
    expect(moduleInfo.status).toBe('implemented');
    expect(FX_CONTENT_KIND).toBe('fx');
    expect(PARTICLE_CAPACITY).toBe(256);
  });

  it('loads the shipped presets of plan M1-14 and binds every FX cue', () => {
    const { content, issues } = loadFxContent([contentFile('fx/particles.fx.json')]);
    expect(issues).toEqual([]);
    const ids = content.presets.map((preset) => preset.id);
    for (const id of [
      'explosion.small',
      'explosion.medium',
      'explosion.large',
      'boss.chain',
      'debris',
      'spark',
      'clink',
      'bullet.cancel',
      'pickup',
      'muzzle',
    ]) {
      expect(ids, id).toContain(id);
    }
    const bound = new Set(content.triggers.filter((t) => t.event === 'fx').map((t) => t.cue));
    expect([...bound].sort()).toEqual([...FX_CUE_NAMES].sort());
    expect(content.triggers.find((t) => t.cue === 'Clink')?.preset).toBe('clink');
    expect(content.triggers.find((t) => t.cue === 'PlayerShot')?.dx).toBe(9);
    // Defaults are applied.
    const spark = content.presets[ids.indexOf('spark')];
    expect([spark.direction, spark.spread, spark.gravity, spark.blend, spark.frames]).toEqual([
      0,
      360,
      0,
      'add',
      null,
    ]);
    expect(content.presets[ids.indexOf('debris')].blend).toBe('normal');
  });

  it('loads the example and lists the sprites it uses', () => {
    const { content, issues } = loadFxContent([contentFile('fx/example.fx.json')]);
    expect(issues).toEqual([]);
    expect(fxSpriteNames(content)).toEqual(['fx/explosion-small', 'fx/spark', 'fx/debris']);
  });

  it('uses sprites that all exist in the pipeline atlas, with the frames the presets name', () => {
    const { manifest } = buildAtlas();
    const { content } = loadFxContent([contentFile('fx/particles.fx.json')]);
    for (const preset of content.presets) {
      const sprite = manifest.sprites[preset.sprite];
      expect(sprite, preset.sprite).toBeDefined();
      for (const frame of preset.frames ?? []) {
        expect(frame, `${preset.id} frame`).toBeLessThan(sprite.frames.length);
      }
    }
  });

  it('reports schema problems with file-prefixed paths and keeps the good entries', () => {
    const { content, issues } = parseFxContent(
      doc([
        still('good'),
        { ...still('bad-blend'), blend: 'screen' },
        { ...still('no-life'), lifetime: undefined },
      ]),
      'fx/a.fx.json',
    );
    // A schema failure anywhere drops the whole file (like every content kind).
    expect(content.presets).toEqual([]);
    expect(issues.map((issue) => issue.path)).toEqual([
      'fx/a.fx.json:presets[1].blend',
      'fx/a.fx.json:presets[2].lifetime',
    ]);
  });

  it('drops presets with an inverted range or a duplicate id (first file in path order wins)', () => {
    const { content, issues } = loadFxContent([
      { path: 'fx/b.fx.json', data: doc([still('dup', 3), still('other')]) },
      {
        path: 'fx/a.fx.json',
        data: doc([still('dup', 5), { ...still('inverted'), speed: { min: 2, max: 1 } }]),
      },
    ]);
    expect(content.presets.map((p) => [p.id, p.lifetime.min])).toEqual([
      ['dup', 5],
      ['other', 9],
    ]);
    expect(issues).toEqual([
      { path: 'fx/a.fx.json:presets[1].speed', message: 'min must not be greater than max' },
      { path: 'fx/b.fx.json:presets[0].id', message: 'duplicate preset id "dup"' },
    ]);
  });

  it('checks triggers: known cues, known presets, at most four presets per cue', () => {
    const { content, issues } = parseFxContent(
      doc(
        [still('a')],
        [
          { event: 'fx', cue: 'ExplosionSmall', preset: 'a' },
          { event: 'fx', cue: 'EnemyHit', preset: 'a' },
          { event: 'sfx', cue: 'EnemyHit', preset: 'missing' },
          ...Array.from({ length: MAX_TRIGGERS_PER_CUE + 1 }, () => ({
            event: 'sfx',
            cue: 'Clink',
            preset: 'a',
            dy: -2,
          })),
        ],
      ),
    );
    expect(issues).toEqual([
      { path: 'triggers[1].cue', message: 'unknown FX cue "EnemyHit"' },
      { path: 'triggers[2].preset', message: 'unknown preset "missing"' },
      { path: 'triggers[7]', message: 'cue "Clink" already has 4 presets' },
    ]);
    expect(content.triggers.map((t) => [t.event, t.cueId, t.presetIndex, t.dy])).toEqual([
      ['fx', FX_CUES.ExplosionSmall, 0, 0],
      ['sfx', SFX_CUES.Clink, 0, -2],
      ['sfx', SFX_CUES.Clink, 0, -2],
      ['sfx', SFX_CUES.Clink, 0, -2],
      ['sfx', SFX_CUES.Clink, 0, -2],
    ]);
  });

  it('rejects another kind or version and never throws for junk', () => {
    expect(parseFxContent({ ...doc([]), kind: 'sfx' }).issues[0]?.path).toBe('kind');
    expect(parseFxContent({ ...doc([]), formatVersion: 2 }).issues[0]?.path).toBe('formatVersion');
    expect(parseFxContent(null).issues).toEqual([{ path: '', message: 'must be an object' }]);
    expect(EMPTY_FX_CONTENT.presets).toEqual([]);
  });
});

describe('render-pixi/particles system', () => {
  it('maps event cues to their presets (FX and SFX), with offsets', () => {
    const content = valid(
      doc(
        [still('one'), { ...still('three'), count: 3 }],
        [
          { event: 'fx', cue: 'ExplosionSmall', preset: 'one' },
          { event: 'fx', cue: 'ExplosionSmall', preset: 'three' },
          { event: 'sfx', cue: 'PlayerShot', preset: 'one', dx: 9, dy: -1 },
        ],
      ),
    );
    const system = createParticleSystem({ atlas: testAtlas(), content });
    expect(system.emitFxCue(FX_CUES.ExplosionSmall, 100, 50, 1)).toBe(4);
    expect(system.emitFxCue(FX_CUES.ExplosionMedium, 100, 50, 1)).toBe(0);
    expect(system.emitFxCue(99, 0, 0, 1)).toBe(0);
    expect(system.emitFxCue(-1, 0, 0, 1)).toBe(0);
    expect(system.emitFxCue(0.5, 0, 0, 1)).toBe(0);
    expect(system.emitSfxCue(SFX_CUES.EnemyHit, 0, 0)).toBe(0);
    expect(system.liveCount).toBe(4);
    // Intensity multiplies the burst (clamped 1…4).
    expect(system.emitFxCue(FX_CUES.ExplosionSmall, 0, 0, 2)).toBe(8);
    expect(system.emitFxCue(FX_CUES.ExplosionSmall, 0, 0, 99)).toBe(16);
    expect(system.emitFxCue(FX_CUES.ExplosionSmall, 0, 0, Number.NaN)).toBe(4);
    system.clear();
    expect(system.emitSfxCue(SFX_CUES.PlayerShot, 100, 50)).toBe(1);
    system.step(1);
    system.sync({ x: 0, y: 0 });
    // Anchor (8, 4) of ships/a, offset (9, -1), PLAYFIELD_Y.
    expect(drawn(system.container)).toEqual([[109 - 8, 49 + PLAYFIELD_Y - 4, 'add']]);
    expect(system.presetIndex('three')).toBe(1);
    expect(system.presetIndex('nope')).toBe(-1);
  });

  it('reveals a particle on the next step, then moves it per tick with gravity and drag', () => {
    const content = valid(
      doc([
        {
          ...still('fall', 20),
          speed: { min: 2, max: 2 },
          direction: 0,
          spread: 0,
          gravity: 0.5,
          drag: 0.5,
        },
      ]),
    );
    const system = createParticleSystem({ atlas: testAtlas(), content });
    system.emit(0, 10, 20, 1);
    system.sync({ x: 0, y: 0 });
    expect(system.visibleCount).toBe(0);
    system.step(1);
    system.sync({ x: 0, y: 0 });
    expect(drawn(system.container)).toEqual([[10 - 8, 20 + PLAYFIELD_Y - 4, 'add']]);
    // Tick 2: x += 2 → vx 1; vy = (0 + 0.5) × 0.5 = 0.25.
    system.step(1);
    system.sync({ x: 0, y: 0 });
    expect(drawn(system.container)[0]).toEqual([12 - 8, 20 + PLAYFIELD_Y - 4, 'add']);
    // Tick 3: x 13, y 20.25 → drawn at round(y) 20; tick 4: x 13.5, y 20.625 → 14 / 21.
    system.step(2);
    system.sync({ x: 0, y: 0 });
    expect(drawn(system.container)[0]).toEqual([14 - 8, 21 + PLAYFIELD_Y - 4, 'add']);
  });

  it('converts world positions with the camera at draw time', () => {
    const content = valid(doc([still('p')]));
    const system = createParticleSystem({ atlas: testAtlas(), content, offsetY: 0 });
    system.emit(0, 500.4, 90, 1);
    system.step(1);
    system.sync({ x: 300, y: 10 });
    expect(drawn(system.container)).toEqual([[200 - 8, 80 - 4, 'add']]);
    system.sync({ x: 310.5, y: 10 });
    expect(drawn(system.container)).toEqual([[190 - 8, 80 - 4, 'add']]);
  });

  it('plays the frames evenly over the lifetime and removes the particle at its end', () => {
    const atlas = testAtlas();
    const content = valid(doc([still('anim', 6), { ...still('picked', 4), frames: [2, 0, 7] }]));
    const system = createParticleSystem({ atlas, content });
    const base = atlas.spriteBase('ships/a');
    const texture = (): unknown =>
      (system.container.children[1].children as Sprite[]).find((s) => s.visible)?.texture;
    system.emit(0, 0, 0, 1);
    const seen: unknown[] = [];
    for (let tick = 0; tick < 6; tick++) {
      system.step(1);
      system.sync({ x: 0, y: 0 });
      seen.push(texture());
    }
    const frames = [0, 0, 1, 1, 2, 2].map((k) => atlas.textures[base + k]);
    expect(seen).toEqual(frames);
    system.step(1);
    expect(system.liveCount).toBe(0);
    system.sync({ x: 0, y: 0 });
    expect(system.visibleCount).toBe(0);
    // Listed frames over 4 ticks: k = floor(age · 3 / 4) → 2, 2, 0, then 7 (the sprite lacks it:
    // ui/missing).
    system.emit(1, 0, 0, 1);
    const picked: unknown[] = [];
    for (let tick = 0; tick < 4; tick++) {
      system.step(1);
      system.sync({ x: 0, y: 0 });
      picked.push(texture());
    }
    expect(picked).toEqual([
      atlas.textures[base + 2],
      atlas.textures[base + 2],
      atlas.textures[base],
      atlas.textures[atlas.missingFrame],
    ]);
  });

  it('keeps delayed particles hidden until their delay ran out', () => {
    const content = valid(doc([{ ...still('late', 3), delay: { min: 2, max: 2 } }]));
    const system = createParticleSystem({ atlas: testAtlas(), content });
    system.emit(0, 0, 0, 1);
    const visible: number[] = [];
    for (let tick = 0; tick < 7; tick++) {
      system.step(1);
      system.sync({ x: 0, y: 0 });
      visible.push(system.visibleCount);
    }
    expect(visible).toEqual([0, 0, 1, 1, 1, 0, 0]);
  });

  it('draws normal and additive presets in their own groups (normal first)', () => {
    const content = valid(doc([still('glow'), { ...still('solid'), blend: 'normal' }]));
    const system = createParticleSystem({ atlas: testAtlas(), content, capacity: 4 });
    const [normal, add] = system.container.children;
    expect(normal.children).toHaveLength(4);
    expect(add.children).toHaveLength(4);
    expect((add.children as Sprite[]).every((s) => s.blendMode === 'add')).toBe(true);
    system.emit(0, 0, 0, 1);
    system.emit(1, 0, 0, 1);
    system.step(1);
    system.sync({ x: 0, y: 0 });
    // The normal group keeps Pixi's default ('inherit' = normal blending).
    expect(drawn(system.container).map(([, , blend]) => blend)).toEqual(['inherit', 'add']);
  });

  it('recycles the oldest particles when the pool is full', () => {
    const content = valid(doc([still('p', 100)]));
    const system = createParticleSystem({ atlas: testAtlas(), content, capacity: 4, offsetY: 0 });
    for (let i = 0; i < 6; i++) system.emit(0, 100 + 10 * i, 50, 1);
    expect(system.liveCount).toBe(4);
    expect(system.recycled).toBe(2);
    system.step(1);
    system.sync({ x: 0, y: 0 });
    const xs = drawn(system.container)
      .map(([x]) => x + 8)
      .sort((a, b) => a - b);
    expect(xs).toEqual([120, 130, 140, 150]);
    system.clear();
    expect([system.liveCount, system.recycled]).toEqual([0, 0]);
  });

  it('draws the same particles for the same seed and events (presentation RNG only)', () => {
    const content = valid(
      doc([{ ...still('burst', 30), count: 8, speed: { min: 0.5, max: 2 }, radius: 6 }]),
    );
    const run = (seed: number) => {
      const system = createParticleSystem({ atlas: testAtlas(), content, seed });
      system.emit(0, 190, 100, 1);
      system.step(10);
      system.sync({ x: 0, y: 0 });
      return drawn(system.container);
    };
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
    expect(new Set(run(7).map(([x, y]) => `${x},${y}`)).size).toBeGreaterThan(1);
  });

  it('setContent replaces the presets and clears the pool; empty content emits nothing', () => {
    const system = createParticleSystem({ atlas: testAtlas() });
    expect(system.content).toBe(EMPTY_FX_CONTENT);
    expect(system.emit(0, 0, 0, 1)).toBe(0);
    const content = valid(doc([still('p')], [{ event: 'fx', cue: 'Debris', preset: 'p' }]));
    system.setContent(content);
    expect(system.emitFxCue(FX_CUES.Debris, 0, 0, 1)).toBe(1);
    system.setContent(EMPTY_FX_CONTENT);
    expect(system.liveCount).toBe(0);
    expect(system.emitFxCue(FX_CUES.Debris, 0, 0, 1)).toBe(0);
    expect(() => createParticleSystem({ atlas: testAtlas(), capacity: 0 })).toThrow(RangeError);
  });

  it('reuses the pool without allocating (emit, step and sync at full capacity)', () => {
    const content = valid(
      doc([
        { ...still('burst', 20), count: 12, speed: { min: 0.5, max: 2 }, gravity: 0.05 },
        { ...still('solid', 8), blend: 'normal', count: 4, radius: 5 },
      ]),
    );
    const system = createParticleSystem({ atlas: testAtlas(), content, capacity: 64 });
    const camera = { x: 0, y: 0 };
    const simBytes = measureAllocation(
      (tick) => {
        system.emit(tick & 1, 100 + (tick % 50), 80, 1);
        system.step(1);
      },
      10_000,
      20_000,
    );
    expect(system.recycled).toBeGreaterThan(0);
    expect(simBytes).toBeLessThan(64 * 1024);
    const frameBytes = measureAllocation(
      (tick) => {
        system.emit(tick & 1, 100 + (tick % 50), 80, 1);
        system.step(1);
        camera.x = tick % 17;
        system.sync(camera);
      },
      10_000,
      20_000,
    );
    // A branch on the burst radius merging a small-integer x with a fractional one was ~1.3 MB.
    expect(frameBytes).toBeLessThan(128 * 1024);
  });
});
