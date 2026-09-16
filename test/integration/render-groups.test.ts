/**
 * The layer render groups against the **shipped content and the real simulation** (plan M3-02e,
 * the render review's **F1**). `packages/render-pixi/test/layers/` pins the membership list
 * against itself; what nothing there can see is whether the list still covers what the game
 * actually draws.
 *
 * A layer that toggles `visible` while the game runs and is *not* its own render group puts its
 * churn back on the scene's root group — the whole of F1, silently, with every counted quantity
 * in the repo still green (the bench's `structureRebuilds` would rise again, but only if a bench
 * scenario happened to play that stage). So:
 *
 * - every layer the shipped stages really put a **sprite batch** on is a render group, measured
 *   by playing four of them through the real sim;
 * - every `createSpriteBatch(LayerId.…)` in `@shmup/core` names a grouped layer, which covers the
 *   batches no test stage happens to reach;
 * - the renderer's **fixed** binding destinations (terrain, lasers, bending lasers, hitboxes,
 *   particles, the HUD and UI quad pools) are grouped too, and the only layers a parallax band
 *   may use are exactly the two that are deliberately left plain;
 * - the `DRAW_CALL_BUDGET` figures M3-02e raised agree with each other and with what the bench's
 *   gates say about them — the drift review round 1 found twice.
 */
import { LAYER_NAMES, LayerId, createGame, createHeadlessPlatform, type Game } from '@shmup/core';
import { RENDER_GROUP_LAYERS } from '@shmup/render-pixi';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { shippedContent } from '../playtest/harness.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Reads a repository file.
 *
 * @param file - Path from the repository root.
 * @returns Its text.
 */
const read = (file: string): string => readFileSync(join(repo, file), 'utf8');

/**
 * A source file with its comments removed, so a guard matches code rather than prose (the
 * docblocks quote `renderGroups: false` while explaining why nothing uses it).
 *
 * @param file - Path from the repository root.
 * @returns The code.
 */
const code = (file: string): string =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** The shipped content, loaded once. */
const DB = shippedContent();

/** Stages played here: the bench's default, the two effect stages and a boss. */
const STAGES = ['zone-a', 'raster-range', 'dimension', 'test-boss'];

/** Ticks played per stage (enough for the camera to reach the effect ranges). */
const TICKS = 400;

/**
 * Names a layer for an assertion message.
 *
 * @param id - The layer code.
 * @returns `'4 (AIR_ENEMIES)'`.
 */
const name = (id: number): string => `${id} (${LAYER_NAMES[id] ?? '?'})`;

/**
 * A game set up the way the render bench sets one up.
 *
 * @param stage - Stage id.
 * @returns The game.
 */
function play(stage: string): Game {
  const game = createGame(
    createHeadlessPlatform({ cssWidth: 960, cssHeight: 540 }),
    { seed: 1, stage, loadout: 'full', autofire: true },
    DB,
  );
  game.world.debugFlags.godMode = true;
  return game;
}

describe('M3-02e render groups cover what the shipped game draws', () => {
  it('groups every layer the shipped stages put a sprite batch on', () => {
    const batchLayers = new Set<number>();
    const parallaxLayers = new Set<number>();
    let sawTerrain = false;
    let sawLasers = false;
    let sawHitboxes = false;
    for (const stage of STAGES) {
      const game = play(stage);
      for (let tick = 0; tick < TICKS; tick++) {
        game.step();
        const world = game.renderFrame().world;
        if (world === null) continue;
        for (const batch of world.batches) batchLayers.add(batch.layer);
        if (world.terrain !== null) sawTerrain = true;
        if ((world.lasers ?? null) !== null || (world.bendingLasers ?? null) !== null) {
          sawLasers = true;
        }
        if ((world.hitboxes ?? null) !== null) sawHitboxes = true;
        const bands = world.parallax;
        if (bands !== null)
          for (let i = 0; i < bands.count; i++) parallaxLayers.add(bands.layer[i]);
      }
    }
    // The run really did see the whole render contract, so the assertions below are not vacuous.
    expect(batchLayers.size).toBeGreaterThanOrEqual(6);
    expect([sawTerrain, sawLasers, sawHitboxes]).toEqual([true, true, true]);
    // A sprite batch is drawn by a `SpriteLayerBinding`, whose `sync` hides every slot it did not
    // use this frame — the exact churn F1 is about.
    for (const layer of [...batchLayers].sort((a, b) => a - b)) {
      expect(RENDER_GROUP_LAYERS.indexOf(layer) >= 0, `batch layer ${name(layer)}`).toBe(true);
    }
    // And the two layers deliberately left plain are only ever used by the parallax bands, which
    // are placed once when they are bound (their containers move, their sprites do not toggle).
    expect([...parallaxLayers].sort((a, b) => a - b)).toEqual([LayerId.BgFar, LayerId.BgMid]);
    for (const layer of parallaxLayers) {
      expect(RENDER_GROUP_LAYERS.indexOf(layer) < 0, `parallax layer ${name(layer)}`).toBe(true);
    }
  });

  it('groups every layer @shmup/core creates a sprite batch on, played or not', () => {
    const sources = [
      'packages/core/src/blackhole/index.ts',
      'packages/core/src/bosses/index.ts',
      'packages/core/src/bullets/index.ts',
      'packages/core/src/enemies/index.ts',
      'packages/core/src/powerups/index.ts',
      'packages/core/src/stage/systems.ts',
      'packages/core/src/weapons/index.ts',
      'packages/core/src/world/index.ts',
    ];
    const named = new Set<string>();
    for (const file of sources) {
      for (const match of read(file).matchAll(/createSpriteBatch\(\s*LayerId\.(\w+)/g)) {
        named.add(match[1]);
      }
    }
    // Every module that makes one is in the list above (a new one would have to be added here).
    expect(named.size).toBeGreaterThanOrEqual(7);
    for (const key of [...named].sort()) {
      const id = (LayerId as Record<string, number>)[key];
      expect(id, `LayerId.${key}`).toBeTypeOf('number');
      expect(RENDER_GROUP_LAYERS.indexOf(id) >= 0, `createSpriteBatch on ${name(id)}`).toBe(true);
    }
  });

  it('groups the renderer’s fixed binding destinations', () => {
    // The bindings the renderer places itself rather than from the view's batch list: the terrain
    // grid, the lasers and bending lasers, the hitbox markers, the particle pools and the HUD / UI
    // quad pools. Every one of them hides slots it did not use this frame.
    const renderer = read('packages/render-pixi/src/renderer/index.ts');
    const fixed = new Set<string>();
    for (const match of renderer.matchAll(
      /layers\.layers\[LayerId\.(\w+)\](?:\.addChild|\s*;)|const (?:fxLayer|hitboxLayer|uiLayer) = layers\.layers\[LayerId\.(\w+)\]/g,
    )) {
      fixed.add(match[1] ?? match[2]);
    }
    expect([...fixed].sort()).toEqual(['EnemyBullets', 'Fx', 'Hitbox', 'Hud', 'Terrain', 'Ui']);
    for (const key of fixed) {
      const id = (LayerId as Record<string, number>)[key];
      expect(RENDER_GROUP_LAYERS.indexOf(id) >= 0, `binding on ${name(id)}`).toBe(true);
    }
    // The two quad pools of the draw lists, named rather than counted: the HUD bars and the menus
    // redraw every frame and hide the quads they did not use.
    expect(renderer).toContain('layers.layers[LayerId.Hud].addChild(hudView.container)');
    expect(renderer).toContain('const uiLayer = layers.layers[LayerId.Ui]');
    for (const id of [LayerId.Hud, LayerId.Ui]) {
      expect(RENDER_GROUP_LAYERS.indexOf(id) >= 0, `quad pool on ${name(id)}`).toBe(true);
    }
  });
});

describe('M3-02e: nothing shipped turns the render groups off', () => {
  /** Every source file of the shipped apps and the non-render packages. */
  const shipped = [
    'apps/web/src',
    'apps/tizen/src',
    'apps/electron/src',
    'packages/shell/src',
    'packages/core/src',
  ];

  it('never passes renderGroups from an app or the shell', () => {
    // The switch exists for the bench's A/B (`pnpm bench`'s "one render group" scenario) and for
    // nothing else. A build that turned it off would quietly reinstate F1 while every counter in
    // this repo kept reporting the patched figure.
    const hits: string[] = [];
    let scanned = 0;
    for (const dir of shipped) {
      const listed = execFileSync('git', ['ls-files', dir], { cwd: repo, encoding: 'utf8' })
        .split('\n')
        .filter((file) => file.endsWith('.ts'));
      expect(listed.length, dir).toBeGreaterThan(0);
      scanned += listed.length;
      for (const file of listed) {
        if (/\brenderGroups\b/.test(code(file))) hits.push(file);
      }
    }
    // The scan really covered the shipped sources (a mistyped path would find nothing and pass).
    expect(scanned).toBeGreaterThan(40);
    expect(hits).toEqual([]);
  });

  it('keeps the option out of render-pixi’s own defaults', () => {
    // `render-pixi` declares the option and defaults it to on; it must never *use* the off value.
    for (const file of [
      'packages/render-pixi/src/layers/index.ts',
      'packages/render-pixi/src/renderer/index.ts',
    ]) {
      expect(code(file), file).not.toContain('renderGroups: false');
    }
    // Both places spell the default the same way, so `undefined` groups and only `false` does not.
    expect(code('packages/render-pixi/src/layers/index.ts')).toContain(
      'const renderGroups = options.renderGroups !== false',
    );
    expect(code('packages/render-pixi/src/renderer/index.ts')).toContain(
      'createLayerStack({ renderGroups: options.renderGroups !== false })',
    );
  });

  it('counts the group rebuilds only behind countStructureRebuilds', () => {
    const renderer = read('packages/render-pixi/src/renderer/index.ts');
    // The second counter shares the first one's switch — one option, both figures, and a release
    // build walks no render groups at all.
    expect(renderer).toContain('let groupRebuilds = countRebuilds ? 0 : -1;');
    expect(renderer).toContain('groupRebuilds += countGroupRebuilds(group);');
    // …and the walk is inside the `countRebuilds` branch, before pass 1 (Pixi clears the flag
    // while rendering).
    const guard = renderer.indexOf('if (countRebuilds) {');
    const walk = renderer.indexOf('groupRebuilds += countGroupRebuilds(group);');
    const pass1 = renderer.indexOf(
      'renderer.render(resetPass(scenePass, frameTexture, true));',
      guard,
    );
    expect(guard).toBeGreaterThan(0);
    expect(walk).toBeGreaterThan(guard);
    expect(pass1).toBeGreaterThan(walk);
  });
});

describe('M3-02e draw-call budgets agree with each other', () => {
  /**
   * The `DRAW_CALL_BUDGET` a file declares.
   *
   * @param file - Path from the repository root.
   * @returns The number.
   */
  const budget = (file: string): number => {
    const match = /const DRAW_CALL_BUDGET = (\d+);/.exec(read(file));
    expect(match, file).not.toBeNull();
    return Number(match?.[1]);
  };

  it('pins the same e2e budget in both specs and keeps the bench’s above it', () => {
    const mode7 = budget('test/e2e/mode7.spec.ts');
    const raster = budget('test/e2e/raster.spec.ts');
    const gates = budget('test/bench/render-harness/gates.ts');
    // M3-02e raised the two e2e budgets from 12 to 16, deliberately: every render group is a batch
    // boundary (`shmup_feat.md` §22, which allows 20–50).
    expect([mode7, raster]).toEqual([16, 16]);
    // The bench stacks the busiest frame, an effect *and* the CRT pass, so its ceiling is above
    // the e2e one on purpose.
    expect(gates).toBeGreaterThanOrEqual(mode7);
  });

  it('quotes the live e2e figure in the bench gates’ own docs', () => {
    // Review round 1 of M3-02e found this docblock still saying 12 after the specs had moved to
    // 16 — twice over the step's history. So the sentence is machine-checked from now on.
    const gates = read('test/bench/render-harness/gates.ts').replace(/\s*\n\s*\*\s*/g, ' ');
    const e2e = budget('test/e2e/mode7.spec.ts');
    expect(gates).toContain(`the two e2e specs pin the plain frame at ${e2e}.`);
  });
});
