/**
 * The bench's own cull walk (plan R-SVG WO-2, the owner-folded arm B of `v20x-SPIKE-report.md`):
 * `../../src/bench/cull.ts` over a synthetic scene graph — the tag's tight anchor- and scale-aware
 * bound, the Culler-mirrored prune rules, the four-corner transform test, and what the record's
 * per-pass `cull` figures mean.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';
import {
  createBenchCull,
  type CullMatrix,
  type CullNode,
  type CullRect,
} from '../../src/bench/cull.js';

/** A fake node's parts, all optional but the shape ({@link node} fills the rest). */
type FakeNode = Partial<CullNode> & { children?: CullNode[] };

/**
 * A whole-number transform matrix at a translation (the identity unless `over` turns it).
 *
 * @param tx - The translation x.
 * @param ty - The translation y.
 * @param over - What differs (a scale or a rotation).
 * @returns The matrix.
 */
function matrix(tx: number, ty: number, over: Partial<CullMatrix> = {}): CullMatrix {
  return { a: over.a ?? 1, b: over.b ?? 0, c: over.c ?? 0, d: over.d ?? 1, tx, ty };
}

/**
 * A sprite texture: an atlas frame that clones like Pixi's `Rectangle` does (a new mutable object per
 * call, which is what lets two sprites of one frame keep their own bound).
 *
 * @param width - The frame's width in pixels.
 * @param height - The frame's height in pixels.
 * @returns The `texture` field's value.
 */
function texture(width: number, height: number): { frame: CullRect } {
  const rect: CullRect = { x: 0, y: 0, width, height };
  return {
    frame: {
      ...rect,
      clone: () => ({ ...rect }),
    } as unknown as CullRect,
  };
}

/**
 * One node of the synthetic graph.
 *
 * @param over - What differs from a plain, untagged, on-view container.
 * @returns The node.
 */
function node(over: FakeNode = {}): CullNode {
  return {
    children: over.children ?? [],
    worldTransform: over.worldTransform ?? matrix(0, 0),
    scale: over.scale ?? { x: 1, y: 1 },
    cullable: over.cullable ?? false,
    cullableChildren: over.cullableChildren ?? true,
    culled: over.culled ?? false,
    renderable: over.renderable ?? true,
    measurable: over.measurable ?? true,
    includeInBuild: over.includeInBuild ?? true,
    boundsArea: over.boundsArea ?? null,
    texture: over.texture ?? null,
    anchor: over.anchor ?? { x: 0, y: 0 },
  };
}

/**
 * A textured leaf — a sprite — at a position.
 *
 * @param tx - Its world x.
 * @param ty - Its world y.
 * @param width - Its frame's width.
 * @param height - Its frame's height.
 * @param over - What differs (an anchor, a scale, a turned matrix).
 * @returns The node.
 */
function sprite(
  tx: number,
  ty: number,
  width: number,
  height: number,
  over: FakeNode = {},
): CullNode {
  return node({
    ...over,
    worldTransform: over.worldTransform ?? matrix(tx, ty),
    texture: texture(width, height),
  });
}

describe('bench cull: the tag walk (arm B’s every-sprite-cullable posture)', () => {
  it('tags every textured leaf, tight and anchor- and scale-aware', () => {
    const deep = sprite(0, 0, 8, 8);
    const wide = sprite(0, 0, 16, 16, { scale: { x: 2, y: 2 }, anchor: { x: 0.5, y: 0.5 } });
    const bare = node();
    const root = node({
      children: [deep, node({ children: [wide, bare] })],
      texture: texture(4, 4),
    });
    const cull = createBenchCull(root, 640, 360);
    // Only leaves are tagged: what has children is descended into and passed over, because a
    // container's bound is the union of the sprites already measured inside it (arm B's 7,386 were
    // sprites, and so is everything render-pixi's sync writes a texture onto).
    expect(cull.tag()).toBe(2);
    expect(cull.tagged).toBe(2);
    expect(deep.cullable).toBe(true);
    expect(deep.boundsArea).toEqual({ x: 0, y: 0, width: 8, height: 8 });
    // ×2 on a 16-px frame is a 32-px bound, the anchor pushing its local origin to (-16, -16).
    expect(wide.boundsArea).toEqual({ x: -16, y: -16, width: 32, height: 32 });
    expect(root.boundsArea).toBeNull();
    expect(root.cullable).toBe(false);
    // What has no texture is never tagged: a plain container keeps the culler's default.
    expect(bare.cullable).toBe(false);
    expect(bare.boundsArea).toBeNull();
  });

  it('leaves the frame’s own pixels out of the bound', () => {
    const a = sprite(0, 0, 32, 32);
    const b = sprite(0, 0, 32, 32);
    const cull = createBenchCull(node({ children: [a, b] }), 100, 100);
    cull.tag();
    const bound = a.boundsArea as { x: number } | null;
    expect(bound).not.toBeNull();
    if (bound === null) return;
    bound.x = 999;
    // Two sprites of one atlas frame must not share the object the walk writes into: the frame itself
    // is untouched, and so is the sibling's bound.
    expect(b.boundsArea?.x).toBe(0);
    expect(a.texture?.frame.x).toBe(0);
  });
});

describe('bench cull: the pass (the Culler walk, mirrored)', () => {
  /** The 640×360 view's scene space: the internal frame, the pass-1 render target. */
  const VIEW = 640;

  it('keeps what is on view and marks what is off it', () => {
    const on = sprite(100, 100, 32, 32);
    const edge = sprite(VIEW - 32, 360 - 32, 32, 32);
    const touching = sprite(VIEW, 10, 32, 32);
    const behind = sprite(-64, -64, 32, 32);
    const left = sprite(-32, 0, 32, 32);
    const root = node({ children: [on, edge, touching, behind, left] });
    const cull = createBenchCull(root, VIEW, 360);
    cull.tag();
    expect(cull.cull()).toBe(3);
    expect([on.culled, edge.culled]).toEqual([false, false]);
    // An edge touch is not a sighting: the spike's own rect test is `maxX <= 0 || minX >= right`.
    expect([touching.culled, left.culled, behind.culled]).toEqual([true, true, true]);
    expect(cull.visits).toBe(6);
    expect(cull.flips).toBe(3);
    // A second pass over the same frame changes no bit — the churn is the first pass's alone, and the
    // record's figures are per pass (the row's cost is what one frame of it buys).
    expect(cull.cull()).toBe(3);
    expect(cull.flips).toBe(3);
    expect(cull.passes).toBe(2);
    expect(cull.facts()).toEqual({ tagged: 5, passes: 2, visits: 6, culled: 3, flips: 1 });
  });

  it('tests the corners, not the origin: a turned bound leaves the view', () => {
    // A 400×100 sprite at (200, 100) is wholly inside a 640×360 view read as a translation; turned a
    // quarter turn it spans y 100…500, past the bottom — which is why the walk transforms all four.
    // A 400×20 bound whose origin sits just off the left edge: read as an axis-aligned box from the
    // origin it reaches to x = 300 and stays in view; turned a quarter turn its long axis runs up the
    // y column and its whole width lies left of the frame (max x' = -80) — out.
    const turned = { a: 0, b: 1, c: 1, d: 0 };
    const flat = sprite(-100, 100, 400, 20);
    const spun = sprite(-100, 100, 400, 20, { worldTransform: matrix(-100, 100, turned) });
    const cull = createBenchCull(node({ children: [flat, spun] }), VIEW, 360);
    cull.tag();
    expect(cull.cull()).toBe(1);
    expect([flat.culled, spun.culled]).toEqual([false, true]);
  });

  it('does not descend what the renderer will not draw', () => {
    const inside = sprite(10, 10, 8, 8);
    const hidden = node({ children: [inside], renderable: false });
    const unmeasurable = sprite(20, 20, 8, 8, { measurable: false });
    const unbuilt = sprite(30, 30, 8, 8, { includeInBuild: false });
    const noChildren = node({
      children: [sprite(40, 40, 8, 8), sprite(50, 50, 8, 8)],
      cullableChildren: false,
    });
    // What the walk does not measure it does not write: a branch already marked by an earlier pass
    // (or by the group above it) keeps its bit and is pruned.
    const alreadyCulled = node({ children: [sprite(60, 60, 8, 8)], culled: true });
    const live = sprite(70, 70, 8, 8);
    const root = node({
      children: [hidden, unmeasurable, unbuilt, noChildren, alreadyCulled, live],
    });
    const cull = createBenchCull(root, VIEW, 360);
    cull.tag();
    cull.cull();
    // root + the six children = 7: `hidden`'s sprite, `noChildren`'s two and `alreadyCulled`'s one
    // are never visited — the guard the mirrored walk keeps, in Pixi's own order.
    expect(cull.visits).toBe(7);
    expect(inside.culled).toBe(false);
    expect(live.culled).toBe(false);
  });

  it('reads world transforms, as Pixi leaves them after the render', () => {
    // A panned band carries its sprites' composed transforms with it (Pixi updates the world matrix
    // during the render the pass follows): the walk composes nothing itself, it only tests corners.
    const panned = matrix(-990, -990);
    const band = node({
      worldTransform: matrix(-1000, 0),
      children: [
        sprite(0, 0, 32, 32, { worldTransform: panned }),
        sprite(0, 0, 32, 32, { worldTransform: matrix(-980, 20) }),
      ],
    });
    const root = node({ children: [band] });
    const cull = createBenchCull(root, VIEW, 360);
    cull.tag();
    expect(cull.cull()).toBe(2);
    // The band itself has no texture and so no bound: the culler never marks a container it cannot
    // measure, it only stops descending a branch that is already culled.
    expect(band.culled).toBe(false);
    expect(cull.facts().culled).toBe(2);
  });
});

describe('bench cull: the window and its limits', () => {
  it('starts the figures from zero when the measured phase begins', () => {
    const off = sprite(900, 900, 16, 16);
    const cull = createBenchCull(node({ children: [off] }), 100, 100);
    cull.tag();
    for (let pass = 0; pass < 4; pass++) cull.cull();
    expect(cull.facts().passes).toBe(4);
    cull.reset();
    expect(cull.facts()).toEqual({ tagged: 1, passes: 0, visits: 0, culled: 0, flips: 0 });
    expect(cull.tagged).toBe(1);
    cull.cull();
    expect(cull.facts().passes).toBe(1);
  });

  it('refuses a view with nothing in it', () => {
    const root = node();
    expect(() => createBenchCull(root, 0, 360)).toThrow(RangeError);
    expect(() => createBenchCull(root, 640, 0)).toThrow(RangeError);
    expect(() => createBenchCull(root, 640, 360)).not.toThrow();
  });
});
