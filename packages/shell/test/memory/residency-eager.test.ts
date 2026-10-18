/**
 * The atlas residency's eager upload (plan R1-05): with an `upload` hook, `prepare` unloads the
 * pages the next stage does not need, **then** uploads every needed page without a GPU copy —
 * at the stage change, so no page uploads on its first draw mid-play —, reports what is resident
 * through `onChange` with the prepare's time, and is idempotent; a throwing upload is skipped and
 * retried; without options it behaves as before (unload only). It is self-healing: `unload` reaches
 * every page the stage does not need, resident or not, so a page drawn behind its back (the weapon
 * select's preview draws zone A's terrain page) leaves the GPU at the next prepare — checked on a
 * fake GPU that also uploads on first draw, as Pixi does. And the shell's World-change trigger
 * (W3-9): `worldOfView` finds the World behind a frame — the game's, or one a scene plays itself
 * (the attract demo, a replay; never the weapon select's preview, a dev range outside the
 * campaign) —, `stageIndexOfWorld` maps it to its stage and `prepareShownWorld` prepares it,
 * leaving the residency alone for a World it cannot place.
 *
 * Over the shipped content and atlas (zone-split since R1-05), written so it also holds on any
 * atlas whose zones need different page sets.
 */
import type { AtlasManifest } from '@shmup/render-pixi';
import { describe, expect, it } from 'vitest';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import { readContentFiles } from '../../../../vite.shared.js';
import { loadGameContent } from '../../src/loader/index.js';
import {
  atlasPageNeeds,
  createAtlasResidency,
  prepareShownWorld,
  stageIndexOfWorld,
  stagePages,
  stageSpriteSets,
  worldOfView,
  type ResidencyGameLike,
  type ResidencyWorldLike,
} from '../../src/memory/index.js';

const { db } = loadGameContent(readContentFiles());
const manifest = buildAtlas().manifest as unknown as AtlasManifest;
const needs = atlasPageNeeds(manifest, db.sprites.names, stageSpriteSets(db));
const pageCount = manifest.pages.length;

/**
 * A stage's index in the content.
 *
 * @param id - The stage id.
 * @returns The index.
 */
const stage = (id: string): number => {
  const index = db.stageIndex.get(id);
  if (index === undefined) throw new Error(`no stage ${id}`);
  return index;
};

const ZONE_A = stage('zone-a');
const ZONE_B = stage('zone-b');
const ZONE_C = stage('zone-c');
const ZONE_D = stage('zone-d');

/** What the hooks saw, in order: `unload:<p>`, `upload:<p>`, `change:<pages>|<unloads>|<ms>`. */
interface Log {
  readonly calls: string[];
}

/**
 * A residency over fake pages whose hooks log in order.
 *
 * @param options - `failUploads`: pages whose upload throws (once each); `clock`: a fake clock.
 * @returns The residency and its log.
 */
function eager(options: { failUploads?: Set<number>; clock?: () => number } = {}) {
  const log: Log = { calls: [] };
  const pages = manifest.pages.map((_, p) => ({ unload: () => log.calls.push(`unload:${p}`) }));
  const residency = createAtlasResidency(pages, needs, {
    upload: (p) => {
      if (options.failUploads?.delete(p) === true) throw new Error('context lost');
      log.calls.push(`upload:${p}`);
    },
    onChange: (resident, unloads, ms) =>
      log.calls.push(`change:${resident.join(',')}|${unloads}|${ms}`),
    now: options.clock,
  });
  return { residency, log };
}

/**
 * The pages a stage needs that another does not.
 *
 * @param a - The stage.
 * @param b - The other stage.
 * @returns Page indices.
 */
const only = (a: number, b: number): number[] =>
  stagePages(needs, a).filter((p) => stagePages(needs, b).indexOf(p) < 0);

/**
 * The pages a stage does not need, ascending (every one of them is unloaded by its prepare).
 *
 * @param a - The stage.
 * @returns Page indices.
 */
const unneeded = (a: number): number[] => only(-1, a);

describe('shell/memory createAtlasResidency — eager upload (R1-05)', () => {
  it('the shipped atlas gives zones different page sets (the premise of the tests below)', () => {
    expect(pageCount).toBeGreaterThan(1);
    expect(only(ZONE_A, ZONE_B).length).toBeGreaterThan(0);
    expect(only(ZONE_B, ZONE_A).length).toBeGreaterThan(0);
    expect(stagePages(needs, -1)).toHaveLength(pageCount);
  });

  it('uploads every page the first stage needs, and reports it', () => {
    const { residency, log } = eager();
    const pagesA = stagePages(needs, ZONE_A);
    const unloaded = residency.prepare(ZONE_A);
    expect(unloaded).toBe(pageCount - pagesA.length);
    expect(log.calls).toEqual([
      ...manifest.pages.flatMap((_, p) => (pagesA.indexOf(p) < 0 ? [`unload:${p}`] : [])),
      ...pagesA.map((p) => `upload:${p}`),
      `change:${pagesA.join(',')}|${unloaded}|0`,
    ]);
    expect(residency.resident).toEqual(manifest.pages.map((_, p) => pagesA.indexOf(p) >= 0));
    expect(residency.uploads).toBe(pagesA.length);
    expect(residency.unloads).toBe(unloaded);
  });

  it('unloads the old zone’s own pages before it uploads the new zone’s', () => {
    const { residency, log } = eager();
    residency.prepare(ZONE_A);
    log.calls.length = 0;
    const unloaded = residency.prepare(ZONE_B);
    const gone = only(ZONE_A, ZONE_B);
    const fresh = only(ZONE_B, ZONE_A);
    // Only zone A's own pages were resident; `unload` reaches every page zone B does not need
    // (self-healing — a no-op on a page off the GPU), but only the resident ones count.
    expect(unloaded).toBe(gone.length);
    expect(log.calls).toEqual([
      ...unneeded(ZONE_B).map((p) => `unload:${p}`),
      ...fresh.map((p) => `upload:${p}`),
      `change:${stagePages(needs, ZONE_B).join(',')}|${residency.unloads}|0`,
    ]);
    expect(gone.every((p) => unneeded(ZONE_B).indexOf(p) >= 0)).toBe(true);
  });

  it('is idempotent: the same stage again uploads nothing, counts nothing and reports nothing', () => {
    const { residency, log } = eager();
    residency.prepare(ZONE_B);
    const calls = log.calls.length;
    const uploads = residency.uploads;
    const unloads = residency.unloads;
    expect(residency.prepare(ZONE_B)).toBe(0);
    // Only the self-healing unloads of the pages zone B does not need (no-ops on the GPU).
    expect(log.calls.slice(calls)).toEqual(unneeded(ZONE_B).map((p) => `unload:${p}`));
    expect(residency.uploads).toBe(uploads);
    expect(residency.unloads).toBe(unloads);
  });

  it('a stage outside the campaign (and "no stage") uploads every page', () => {
    const { residency, log } = eager();
    residency.prepare(ZONE_A);
    log.calls.length = 0;
    expect(residency.prepare(stage('test-range'))).toBe(0);
    expect(log.calls.filter((call) => call.startsWith('upload:'))).toEqual(
      only(-1, ZONE_A).map((p) => `upload:${p}`),
    );
    expect(residency.resident.every(Boolean)).toBe(true);
    log.calls.length = 0;
    expect(residency.prepare(-1)).toBe(0);
    expect(log.calls).toEqual([]);
  });

  it('times each prepare that moves a page with the given clock', () => {
    let ms = 100;
    const { residency, log } = eager({ clock: () => (ms += 3) });
    residency.prepare(ZONE_A);
    expect(residency.lastPrepareMs).toBe(3);
    expect(log.calls[log.calls.length - 1]).toMatch(/\|3$/);
    residency.prepare(ZONE_A); // nothing moves: the last time stays
    expect(residency.lastPrepareMs).toBe(3);
  });

  it('skips an upload that throws and retries it at the next prepare', () => {
    const failing = stagePages(needs, ZONE_C)[0];
    const { residency, log } = eager({ failUploads: new Set([failing]) });
    residency.prepare(ZONE_C);
    expect(log.calls).not.toContain(`upload:${failing}`);
    expect(residency.resident[failing]).toBe(true); // Pixi uploads it on its first draw instead
    expect(residency.uploads).toBe(stagePages(needs, ZONE_C).length - 1);
    log.calls.length = 0;
    residency.prepare(ZONE_C);
    expect(log.calls).toEqual([
      ...unneeded(ZONE_C).map((p) => `unload:${p}`),
      `upload:${failing}`,
      `change:${stagePages(needs, ZONE_C).join(',')}|${residency.unloads}|0`,
    ]);
  });

  it('heals a page drawn behind its back: the weapon preview’s page leaves at the next prepare', () => {
    // The page the weapon select's preview draws outside `common`: its range's tileset's.
    const range = db.stages[stage('weapon-range')];
    const tilemap = range.tilemap;
    if (tilemap === null) throw new Error('weapon-range has no tilemap');
    const tileset = db.tilesets[tilemap.tilesetId];
    const sprite = manifest.sprites[db.sprites.names[tileset.spriteId]];
    const previewPage = manifest.frames[sprite.frames[0]].p;
    // The premise: zone A's page, needed by neither zone C nor zone D.
    expect(stagePages(needs, ZONE_A)).toContain(previewPage);
    expect(stagePages(needs, ZONE_C)).not.toContain(previewPage);
    expect(stagePages(needs, ZONE_D)).not.toContain(previewPage);
    // A fake GPU: the residency's upload and unload, plus Pixi's upload on a page's first draw.
    const gpu = new Set<number>();
    const residency = createAtlasResidency(
      manifest.pages.map((_, p) => ({ unload: () => gpu.delete(p) })),
      needs,
      { upload: (p) => gpu.add(p) },
    );
    /**
     * The pages on the fake GPU.
     *
     * @returns Ascending page indices.
     */
    const onGpu = (): number[] => [...gpu].sort((a, b) => a - b);
    residency.prepare(ZONE_C); // as after a zone C attract demo
    expect(onGpu()).toEqual(stagePages(needs, ZONE_C));
    gpu.add(previewPage); // the weapon select: the preview draws zone A's terrain page
    const unloads = residency.unloads;
    // A practice start on zone D: exactly common + zone D stay, the stray page included in the
    // unloads but not in the counters (it was never believed resident).
    expect(residency.prepare(ZONE_D)).toBe(only(ZONE_C, ZONE_D).length);
    expect(onGpu()).toEqual(stagePages(needs, ZONE_D));
    expect(residency.unloads).toBe(unloads + only(ZONE_C, ZONE_D).length);
    expect(residency.resident).toEqual(
      manifest.pages.map((_, p) => stagePages(needs, ZONE_D).indexOf(p) >= 0),
    );
    // Even a prepare of the stage already prepared clears a stray page.
    gpu.add(previewPage);
    expect(residency.prepare(ZONE_D)).toBe(0);
    expect(onGpu()).toEqual(stagePages(needs, ZONE_D));
  });

  it('without options it only unloads, as before R1-05 (and reports nothing)', () => {
    const unloaded: number[] = [];
    const residency = createAtlasResidency(
      manifest.pages.map((_, p) => ({ unload: () => unloaded.push(p) })),
      needs,
    );
    expect(residency.prepare(ZONE_A)).toBe(pageCount - stagePages(needs, ZONE_A).length);
    expect(residency.uploads).toBe(0);
    expect(residency.lastPrepareMs).toBe(0);
    expect(unloaded).toEqual(only(-1, ZONE_A));
  });

  it('reports the first prepare even when it moves nothing', () => {
    const changes: string[] = [];
    const residency = createAtlasResidency(
      manifest.pages.map(() => ({ unload: () => {} })),
      needs,
      { onChange: (resident, unloads) => changes.push(`${resident.length}|${unloads}`) },
    );
    residency.prepare(-1); // every page, all of them already resident
    residency.prepare(-1);
    expect(changes).toEqual([`${pageCount}|0`]);
  });
});

/** A fake World on a stage (or in open space). */
function world(stageId: string | null): ResidencyWorldLike & { readonly view: object } {
  return { view: {}, stage: stageId === null ? null : { stage: { id: stageId } } };
}

/**
 * A fake game: its World, and the scene stack (bottom first).
 *
 * @param own - The game scene's World.
 * @param scenes - The scenes on the stack.
 * @returns The game.
 */
function game(own: ResidencyWorldLike, scenes: readonly object[] | null): ResidencyGameLike {
  return {
    world: own,
    scenes:
      scenes === null
        ? null
        : { stack: { depth: scenes.length, sceneAt: (i: number) => scenes[i] ?? null } },
  };
}

describe('shell/memory the World-change trigger (R1-05, W3-9)', () => {
  it('finds the World behind a view: the game’s, a demo’s, a replay’s — not the weapon preview', () => {
    const own = world('zone-a');
    const demo = world('zone-b');
    const replay = world('zone-c');
    const preview = world('weapon-range');
    // Scenes expose their Worlds under `world` (demo, replay); the weapon select's `preview` flies
    // a dev range outside the campaign, which the trigger leaves alone (placing it would put
    // every page on the GPU for a menu; the page it draws is healed by the next prepare).
    const scenes = [
      { id: 'title' },
      { world: demo },
      { world: null },
      { world: replay },
      { preview },
    ];
    const g = game(own, scenes);
    expect(worldOfView(g, own.view)).toBe(own);
    expect(worldOfView(g, demo.view)).toBe(demo);
    expect(worldOfView(g, replay.view)).toBe(replay);
    expect(worldOfView(g, preview.view)).toBeNull();
    expect(worldOfView(g, {})).toBeNull();
    expect(worldOfView(g, null)).toBeNull();
    // Bare gameplay: only the game's World.
    expect(worldOfView(game(own, null), demo.view)).toBeNull();
  });

  it('maps a World to its stage index; open space and unknown stages are -1', () => {
    expect(stageIndexOfWorld(db, world('zone-b'))).toBe(ZONE_B);
    expect(stageIndexOfWorld(db, world(null))).toBe(-1);
    expect(stageIndexOfWorld(db, world('no-such-stage'))).toBe(-1);
    expect(stageIndexOfWorld(db, null)).toBe(-1);
  });

  it('prepares the attract demo’s zone, then the game’s again (the demo never emits PrepareStage)', () => {
    const { residency, log } = eager();
    const own = world('zone-a');
    const demo = world('zone-c');
    const g = game(own, [{ id: 'title' }, { world: demo }]);
    residency.prepare(ZONE_A); // boot
    log.calls.length = 0;
    expect(prepareShownWorld(residency, db, g, demo.view)).toBe(only(ZONE_A, ZONE_C).length);
    expect(residency.resident).toEqual(
      manifest.pages.map((_, p) => stagePages(needs, ZONE_C).indexOf(p) >= 0),
    );
    expect(log.calls.filter((c) => c.startsWith('upload:'))).toEqual(
      only(ZONE_C, ZONE_A).map((p) => `upload:${p}`),
    );
    // Back to a game on zone A.
    prepareShownWorld(residency, db, g, own.view);
    expect(residency.resident).toEqual(
      manifest.pages.map((_, p) => stagePages(needs, ZONE_A).indexOf(p) >= 0),
    );
    // A World the trigger cannot place (the weapon preview) leaves the residency as it is.
    log.calls.length = 0;
    const before = [...residency.resident];
    expect(prepareShownWorld(residency, db, g, {})).toBe(0);
    expect(
      prepareShownWorld(residency, db, game(own, [{ preview: world('weapon-range') }]), {}),
    ).toBe(0);
    expect(residency.resident).toEqual(before);
    expect(log.calls).toEqual([]);
  });
});
